// ============================================================================
// Social Queue Service — Fila de processamento assíncrono com persistência
// ============================================================================
// Implementa uma fila in-process com:
//  - Persistência em JSON (sobrevive a restarts)
//  - Prioridade (high > normal > low)
//  - Agendamento (scheduledAt)
//  - Retry com backoff exponencial
//  - Dead-letter queue para falhas permanentes
//
// Caminho de evolução:
//   Fase atual: In-process + JSON
//   Fase futura: Azure Queue Storage ou Redis
// ============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { RateLimiterService } from './rate-limiter.service.js';
import type { QueueJob, QueueJobType, QueueJobPriority, QueueJobStatus, SocialProvider } from '../types/social.types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const QUEUE_FILE = path.join(DATA_DIR, 'social-queue.json');

// ── Tipos de handler ───────────────────────────────────────────────────────

export type JobHandler = (job: QueueJob) => Promise<void>;

// ── Classe SocialQueueService ──────────────────────────────────────────────

export class SocialQueueService {
    private queue: QueueJob[] = [];
    private processing = false;
    private pollIntervalId?: ReturnType<typeof setInterval>;
    private handlers: Map<QueueJobType, JobHandler> = new Map();
    private static instance: SocialQueueService;

    private readonly POLL_INTERVAL_MS = 10_000;  // Verifica fila a cada 10s
    private readonly MAX_CONCURRENT = 2;         // Max jobs simultâneos
    private activeJobs = 0;

    private constructor() {
        this.restore();
    }

    static getInstance(): SocialQueueService {
        if (!SocialQueueService.instance) {
            SocialQueueService.instance = new SocialQueueService();
        }
        return SocialQueueService.instance;
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Inicia o processamento da fila
     */
    start(): void {
        if (this.pollIntervalId) return;

        console.log('[SocialQueue] Iniciando processamento da fila...');

        // Reprocessar jobs que estavam 'processing' quando o servidor caiu
        this.recoverStuckJobs();

        this.pollIntervalId = setInterval(() => {
            this.processNext().catch(err =>
                console.error('[SocialQueue] Erro no processamento:', err)
            );
        }, this.POLL_INTERVAL_MS);

        // Processar imediatamente na inicialização
        this.processNext().catch(() => {});

        console.log(`[SocialQueue] Fila iniciada. ${this.getPendingCount()} jobs pendentes.`);
    }

    /**
     * Para o processamento da fila
     */
    stop(): void {
        if (this.pollIntervalId) {
            clearInterval(this.pollIntervalId);
            this.pollIntervalId = undefined;
            console.log('[SocialQueue] Fila parada.');
        }
    }

    /**
     * Registra um handler para um tipo de job
     */
    registerHandler(type: QueueJobType, handler: JobHandler): void {
        this.handlers.set(type, handler);
        console.log(`[SocialQueue] Handler registrado: ${type}`);
    }

    // ── Enqueue ────────────────────────────────────────────────────────────

    /**
     * Adiciona um job à fila
     * @returns ID do job
     */
    enqueue(options: {
        type: QueueJobType;
        provider: SocialProvider;
        publicationId?: string;
        tokenId?: string;
        priority?: QueueJobPriority;
        scheduledAt?: string;
        maxAttempts?: number;
        data?: Record<string, unknown>;
    }): string {
        const job: QueueJob = {
            id: crypto.randomUUID(),
            type: options.type,
            provider: options.provider,
            publicationId: options.publicationId,
            tokenId: options.tokenId,
            priority: options.priority || 'normal',
            scheduledAt: options.scheduledAt || new Date().toISOString(),
            attempts: 0,
            maxAttempts: options.maxAttempts || 3,
            status: 'pending',
            data: options.data,
            createdAt: new Date().toISOString(),
        };

        this.queue.push(job);
        this.persist();

        console.log(`[SocialQueue] Job enqueued: ${job.id} (${job.type}/${job.provider}) priority=${job.priority}`);

        // Trigger imediato de processamento
        if (this.pollIntervalId) {
            this.processNext().catch(() => {});
        }

        return job.id;
    }

    /**
     * Cancela um job pendente
     */
    cancel(jobId: string): boolean {
        const idx = this.queue.findIndex(j => j.id === jobId && j.status === 'pending');
        if (idx === -1) return false;

        this.queue[idx].status = 'dead';
        this.queue[idx].error = 'Cancelado pelo usuário';
        this.persist();

        console.log(`[SocialQueue] Job cancelado: ${jobId}`);
        return true;
    }

    // ── Processamento ──────────────────────────────────────────────────────

    /**
     * Processa o próximo job na fila
     */
    private async processNext(): Promise<void> {
        if (this.processing || this.activeJobs >= this.MAX_CONCURRENT) return;
        this.processing = true;

        try {
            const job = this.getNextJob();
            if (!job) {
                this.processing = false;
                return;
            }

            const handler = this.handlers.get(job.type);
            if (!handler) {
                console.warn(`[SocialQueue] Nenhum handler para tipo: ${job.type}. Ignorando job ${job.id}`);
                job.status = 'failed';
                job.error = `Handler não registrado: ${job.type}`;
                this.persist();
                this.processing = false;
                return;
            }

            // Marcar como processing
            job.status = 'processing';
            job.attempts++;
            job.processedAt = new Date().toISOString();
            this.persist();
            this.activeJobs++;

            console.log(`[SocialQueue] Processando job ${job.id} (${job.type}/${job.provider}) attempt=${job.attempts}/${job.maxAttempts}`);

            try {
                await handler(job);

                // Sucesso
                job.status = 'completed';
                job.completedAt = new Date().toISOString();
                this.persist();

                console.log(`[SocialQueue] Job concluído: ${job.id}`);
            } catch (error) {
                await this.handleFailure(job, error instanceof Error ? error : new Error(String(error)));
            }
        } finally {
            this.activeJobs = Math.max(0, this.activeJobs - 1);
            this.processing = false;

            // Tentar processar próximo job imediatamente
            if (this.getPendingCount() > 0 && this.activeJobs < this.MAX_CONCURRENT) {
                setTimeout(() => this.processNext().catch(() => {}), 100);
            }
        }
    }

    /**
     * Seleciona o próximo job elegível (respeita prioridade e scheduling)
     */
    private getNextJob(): QueueJob | undefined {
        const now = new Date();
        const priorityOrder: QueueJobPriority[] = ['high', 'normal', 'low'];

        for (const priority of priorityOrder) {
            const job = this.queue.find(j =>
                j.status === 'pending'
                && j.priority === priority
                && new Date(j.scheduledAt) <= now
            );
            if (job) return job;
        }

        return undefined;
    }

    /**
     * Handler de falha com retry
     */
    private async handleFailure(job: QueueJob, error: Error): Promise<void> {
        console.error(`[SocialQueue] Job ${job.id} falhou (attempt ${job.attempts}/${job.maxAttempts}):`, error.message);

        job.error = error.message;

        if (job.attempts >= job.maxAttempts) {
            // Dead letter — falha permanente
            job.status = 'dead';
            console.error(`[SocialQueue] Job ${job.id} movido para dead-letter após ${job.attempts} tentativas`);
        } else {
            // Retry com backoff
            const delay = RateLimiterService.getBackoffDelay(job.attempts);
            const nextRetry = new Date(Date.now() + delay);
            job.status = 'pending';
            job.scheduledAt = nextRetry.toISOString();
            console.log(`[SocialQueue] Job ${job.id} reagendado para retry em ${Math.round(delay / 1000)}s`);
        }

        this.persist();
    }

    /**
     * Recupera jobs que estavam 'processing' quando o servidor reiniciou
     */
    private recoverStuckJobs(): void {
        let recovered = 0;
        for (const job of this.queue) {
            if (job.status === 'processing') {
                job.status = 'pending';
                job.scheduledAt = new Date().toISOString();
                recovered++;
            }
        }
        if (recovered > 0) {
            this.persist();
            console.log(`[SocialQueue] Recuperou ${recovered} jobs stuck`);
        }
    }

    // ── Persistência ───────────────────────────────────────────────────────

    /**
     * Persiste fila em disco (escrita atômica)
     */
    private persist(): void {
        try {
            if (!fs.existsSync(DATA_DIR)) {
                fs.mkdirSync(DATA_DIR, { recursive: true });
            }
            const tempFile = QUEUE_FILE + '.tmp';
            fs.writeFileSync(tempFile, JSON.stringify(this.queue, null, 2), 'utf-8');
            fs.renameSync(tempFile, QUEUE_FILE);
        } catch (error) {
            console.error('[SocialQueue] Erro ao persistir fila:', error);
        }
    }

    /**
     * Restaura fila do disco
     */
    private restore(): void {
        try {
            if (fs.existsSync(QUEUE_FILE)) {
                const data = fs.readFileSync(QUEUE_FILE, 'utf-8');
                this.queue = JSON.parse(data);

                // Limpar jobs completados antigos (>7 dias)
                const cutoff = new Date();
                cutoff.setDate(cutoff.getDate() - 7);

                const before = this.queue.length;
                this.queue = this.queue.filter(j => {
                    if (j.status === 'completed' || j.status === 'dead') {
                        const completedAt = j.completedAt || j.processedAt || j.createdAt;
                        return new Date(completedAt) > cutoff;
                    }
                    return true;
                });

                if (this.queue.length !== before) {
                    this.persist();
                }

                console.log(`[SocialQueue] Restaurou ${this.queue.length} jobs do disco (${before - this.queue.length} antigos removidos)`);
            }
        } catch {
            console.error('[SocialQueue] Erro ao restaurar fila, iniciando vazia');
            this.queue = [];
        }
    }

    // ── Consultas ──────────────────────────────────────────────────────────

    /**
     * Obtém um job pelo ID
     */
    getJob(jobId: string): QueueJob | undefined {
        return this.queue.find(j => j.id === jobId);
    }

    /**
     * Obtém jobs de uma publicação
     */
    getJobsByPublication(publicationId: string): QueueJob[] {
        return this.queue.filter(j => j.publicationId === publicationId);
    }

    /**
     * Contagem de jobs pendentes
     */
    getPendingCount(): number {
        return this.queue.filter(j => j.status === 'pending').length;
    }

    /**
     * Estatísticas da fila
     */
    getStats(): {
        total: number;
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        dead: number;
    } {
        const stats = { total: 0, pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
        for (const job of this.queue) {
            stats.total++;
            stats[job.status]++;
        }
        return stats;
    }

    /**
     * Lista jobs com filtros (para admin/debug)
     */
    listJobs(filters?: {
        status?: QueueJobStatus;
        type?: QueueJobType;
        provider?: SocialProvider;
        limit?: number;
    }): QueueJob[] {
        let result = [...this.queue];

        if (filters?.status) result = result.filter(j => j.status === filters.status);
        if (filters?.type) result = result.filter(j => j.type === filters.type);
        if (filters?.provider) result = result.filter(j => j.provider === filters.provider);

        // Ordenar: pending primeiro (por prioridade), depois por data
        result.sort((a, b) => {
            const priorityOrder: Record<QueueJobPriority, number> = { high: 0, normal: 1, low: 2 };
            if (a.status === 'pending' && b.status === 'pending') {
                const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                if (priDiff !== 0) return priDiff;
            }
            return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        if (filters?.limit) result = result.slice(0, filters.limit);

        return result;
    }

    /**
     * Retry manual de um job (admin)
     */
    retryJob(jobId: string): boolean {
        const job = this.queue.find(j => j.id === jobId && (j.status === 'failed' || j.status === 'dead'));
        if (!job) return false;

        job.status = 'pending';
        job.scheduledAt = new Date().toISOString();
        job.attempts = 0;
        job.error = undefined;
        this.persist();

        console.log(`[SocialQueue] Job ${jobId} reagendado manualmente`);

        // Trigger processamento
        if (this.pollIntervalId) {
            this.processNext().catch(() => {});
        }

        return true;
    }
}

// Singleton export
export const socialQueue = SocialQueueService.getInstance();
