// ============================================================================
// Engagement Service — Coleta e consolidação de métricas de engajamento
// ============================================================================
// Implementa polling inteligente com frequência adaptativa:
//  - 0–1h após publicação: a cada 5 min
//  - 1–24h: a cada 30 min
//  - 1–7d: a cada 2h
//  - 7d+: a cada 12h
//
// Consolida métricas de Instagram (insights API) e Twitter (public_metrics)
// em formato normalizado (EngagementSnapshot).
// ============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { getInstagramMediaInsights } from './instagram.service.js';
import { getTwitterTweetMetrics } from './twitter.service.js';
import { getTokenById } from './social-token.store.js';
import { socialQueue } from './social-queue.service.js';
import type {
    Publication,
    EngagementSnapshot,
    EngagementMetrics,
    ProviderSpecificMetrics,
    SocialProvider,
    SocialToken,
} from '../types/social.types.js';

// ── Paths ──────────────────────────────────────────────────────────────────

import { DATA_DIR, ensureDataDir, writeFileAtomic } from './data-dir.js';
import { isTableStorageAvailable } from './database/table-storage.service.js';
import {
    dbGetSnapshotsByPublication, dbGetLatestSnapshot, dbSaveSnapshot,
    dbGetAllSnapshots, dbCleanOldSnapshots,
} from './database/engagement.repository.js';
import {
    dbGetAllPublications, dbGetPublicationById as dbGetPub,
    dbGetPublicationByProviderMediaId,
} from './database/publication.repository.js';

const METRICS_FILE = path.join(DATA_DIR, 'engagement-metrics.json');
const PUBLICATIONS_FILE = path.join(DATA_DIR, 'publications.json');
const useDb = isTableStorageAvailable();

// ── Configuração de Polling ────────────────────────────────────────────────

/**
 * Intervalos de polling adaptativos baseados na idade da publicação
 */
const POLLING_INTERVALS = [
    { maxAgeMs: 1 * 60 * 60 * 1000,        intervalMs: 5 * 60 * 1000 },       // 0-1h  → cada 5 min
    { maxAgeMs: 24 * 60 * 60 * 1000,        intervalMs: 30 * 60 * 1000 },      // 1-24h → cada 30 min
    { maxAgeMs: 7 * 24 * 60 * 60 * 1000,    intervalMs: 2 * 60 * 60 * 1000 },  // 1-7d  → cada 2h
    { maxAgeMs: 30 * 24 * 60 * 60 * 1000,   intervalMs: 12 * 60 * 60 * 1000 }, // 7-30d → cada 12h
];

// Posts mais antigos que 30 dias não são mais polled automaticamente
const MAX_POLLING_AGE_MS = 30 * 24 * 60 * 60 * 1000;

// Intervalo do scheduler principal (verifica a cada 2 minutos)
const SCHEDULER_INTERVAL_MS = 2 * 60 * 1000;

// ── Data Layer ─────────────────────────────────────────────────────────────

function readMetricsFromFile(): EngagementSnapshot[] {
    ensureDataDir();
    if (!fs.existsSync(METRICS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

function writeMetricsToFile(metrics: EngagementSnapshot[]): void {
    ensureDataDir();
    const tempFile = METRICS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(metrics, null, 2), 'utf-8');
    fs.renameSync(tempFile, METRICS_FILE);
}

function readPublicationsFromFile(): Publication[] {
    if (!fs.existsSync(PUBLICATIONS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(PUBLICATIONS_FILE, 'utf-8'));
    } catch {
        return [];
    }
}

// Wrappers com fallback: DB ou JSON
function readMetrics(): EngagementSnapshot[] {
    return readMetricsFromFile();
}

function writeMetrics(metrics: EngagementSnapshot[]): void {
    writeMetricsToFile(metrics);
    // Gravar snapshots no Table Storage (async)
    if (useDb) {
        Promise.all(metrics.slice(-10).map(m => dbSaveSnapshot(m))).catch(err =>
            console.error('[Engagement] Erro ao gravar métricas no Table Storage:', err.message)
        );
    }
}

function readPublications(): Publication[] {
    return readPublicationsFromFile();
}

// Async versions for DB
async function readMetricsAsync(): Promise<EngagementSnapshot[]> {
    if (useDb) {
        try { return await dbGetAllSnapshots(); }
        catch { return readMetricsFromFile(); }
    }
    return readMetricsFromFile();
}

async function readPublicationsAsync(): Promise<Publication[]> {
    if (useDb) {
        try { return await dbGetAllPublications(); }
        catch { return readPublicationsFromFile(); }
    }
    return readPublicationsFromFile();
}

// ── Engagement Service ─────────────────────────────────────────────────────

export class EngagementService {
    private static instance: EngagementService;
    private schedulerIntervalId?: ReturnType<typeof setInterval>;
    private isProcessing = false;

    private constructor() {}

    static getInstance(): EngagementService {
        if (!EngagementService.instance) {
            EngagementService.instance = new EngagementService();
        }
        return EngagementService.instance;
    }

    /**
     * Inicializa métricas: migra JSON → Table Storage se necessário
     */
    async initFromDb(): Promise<void> {
        if (!useDb) return;
        try {
            const dbMetrics = await dbGetAllSnapshots();
            if (dbMetrics.length === 0) {
                const fileMetrics = readMetricsFromFile();
                if (fileMetrics.length > 0) {
                    console.log(`[Engagement] Migrando ${fileMetrics.length} snapshots de JSON → Table Storage...`);
                    for (const m of fileMetrics) await dbSaveSnapshot(m);
                    console.log('[Engagement] Migração de métricas concluída.');
                }
            } else {
                console.log(`[Engagement] ${dbMetrics.length} snapshots no Table Storage.`);
            }
        } catch (err: any) {
            console.error('[Engagement] Fallback JSON:', err.message);
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────────

    /**
     * Inicia o scheduler de coleta de métricas
     */
    start(): void {
        if (this.schedulerIntervalId) return;

        console.log('[Engagement] Iniciando serviço de coleta de métricas...');

        // Registrar handler para collect_metrics na fila
        socialQueue.registerHandler('collect_metrics', this.handleCollectMetricsJob.bind(this));

        this.schedulerIntervalId = setInterval(() => {
            this.scheduleMetricsCollection().catch(err =>
                console.error('[Engagement] Erro no scheduler:', err)
            );
        }, SCHEDULER_INTERVAL_MS);

        // Executar imediatamente na primeira vez
        this.scheduleMetricsCollection().catch(() => {});

        console.log('[Engagement] Serviço de métricas iniciado.');
    }

    /**
     * Para o scheduler
     */
    stop(): void {
        if (this.schedulerIntervalId) {
            clearInterval(this.schedulerIntervalId);
            this.schedulerIntervalId = undefined;
            console.log('[Engagement] Serviço de métricas parado.');
        }
    }

    // ── Scheduler ──────────────────────────────────────────────────────────

    /**
     * Verifica publicações que precisam de coleta de métricas
     * e enfileira jobs para as que estão no intervalo correto
     */
    private async scheduleMetricsCollection(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            const publications = readPublications().filter(p => p.status === 'published' && p.providerPostId);
            const allMetrics = readMetrics();
            const now = Date.now();

            let scheduled = 0;

            for (const pub of publications) {
                const publishedAt = new Date(pub.publishedAt || pub.createdAt).getTime();
                const age = now - publishedAt;

                // Ignorar publicações muito antigas
                if (age > MAX_POLLING_AGE_MS) continue;

                // Determinar intervalo de polling baseado na idade
                const pollingInterval = this.getPollingInterval(age);
                if (!pollingInterval) continue;

                // Verificar quando foi a última coleta
                const lastMetric = allMetrics
                    .filter(m => m.publicationId === pub.id)
                    .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())[0];

                const lastCollectedAt = lastMetric
                    ? new Date(lastMetric.collectedAt).getTime()
                    : 0;

                const timeSinceLastCollection = now - lastCollectedAt;

                // Se já passou o intervalo, agendar coleta
                if (timeSinceLastCollection >= pollingInterval) {
                    // Verificar se já não existe um job pendente para esta publicação
                    const existingJobs = socialQueue.getJobsByPublication(pub.id);
                    const hasPendingMetricsJob = existingJobs.some(
                        j => j.type === 'collect_metrics' && (j.status === 'pending' || j.status === 'processing')
                    );

                    if (!hasPendingMetricsJob) {
                        socialQueue.enqueue({
                            type: 'collect_metrics',
                            provider: pub.provider,
                            publicationId: pub.id,
                            tokenId: pub.socialTokenId,
                            priority: age < 24 * 60 * 60 * 1000 ? 'normal' : 'low',
                        });
                        scheduled++;
                    }
                }
            }

            if (scheduled > 0) {
                console.log(`[Engagement] ${scheduled} coletas de métricas agendadas`);
            }
        } catch (error) {
            console.error('[Engagement] Erro ao agendar coletas:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Retorna o intervalo de polling em ms baseado na idade da publicação
     */
    private getPollingInterval(ageMs: number): number | null {
        for (const interval of POLLING_INTERVALS) {
            if (ageMs <= interval.maxAgeMs) {
                return interval.intervalMs;
            }
        }
        return null; // Publicação muito antiga — não pollar mais
    }

    // ── Job Handler ────────────────────────────────────────────────────────

    /**
     * Handler para jobs de coleta de métricas (executado pela fila)
     */
    private async handleCollectMetricsJob(job: import('../types/social.types.js').QueueJob): Promise<void> {
        const { publicationId, tokenId, provider } = job;

        if (!publicationId || !tokenId) {
            throw new Error('publicationId e tokenId são obrigatórios para coleta de métricas');
        }

        // Obter publicação
        const publications = readPublications();
        const publication = publications.find(p => p.id === publicationId);
        if (!publication) {
            throw new Error(`Publicação não encontrada: ${publicationId}`);
        }

        if (!publication.providerPostId) {
            throw new Error(`Publicação ${publicationId} não tem providerPostId`);
        }

        // Obter token
        const token = getTokenById(tokenId);
        if (!token || !token.isActive) {
            console.warn(`[Engagement] Token ${tokenId} inativo ou não encontrado. Pulando coleta.`);
            return; // Não é um erro retryable
        }

        // Coletar métricas da plataforma
        const snapshot = await this.collectMetrics(provider, token, publication);

        // Salvar snapshot
        const allMetrics = readMetrics();
        allMetrics.push(snapshot);

        // Limpar snapshots antigos (manter no máximo 500 por publicação, últimos 90 dias)
        const cleaned = this.cleanOldMetrics(allMetrics);
        writeMetrics(cleaned);

        console.log(`[Engagement] Métricas coletadas para pub ${publicationId}: likes=${snapshot.metrics.likes}, comments=${snapshot.metrics.comments}, reach=${snapshot.metrics.reach}`);
    }

    // ── Coleta de Métricas ─────────────────────────────────────────────────

    /**
     * Coleta métricas de uma publicação específica
     */
    private async collectMetrics(
        provider: SocialProvider,
        token: SocialToken,
        publication: Publication
    ): Promise<EngagementSnapshot> {
        const postId = publication.providerPostId!;

        if (provider === 'instagram') {
            return this.collectInstagramMetrics(token, publication, postId);
        } else if (provider === 'twitter') {
            return this.collectTwitterMetrics(token, publication, postId);
        } else {
            throw new Error(`Provider não suportado: ${provider}`);
        }
    }

    /**
     * Coleta métricas do Instagram via Graph API
     */
    private async collectInstagramMetrics(
        token: SocialToken,
        publication: Publication,
        mediaId: string
    ): Promise<EngagementSnapshot> {
        const igMetrics = await getInstagramMediaInsights(token, mediaId);

        const totalEngagement = igMetrics.likes + igMetrics.comments + igMetrics.shares;
        const engagementRate = igMetrics.impressions > 0
            ? (totalEngagement / igMetrics.impressions) * 100
            : 0;

        const metrics: EngagementMetrics = {
            likes: igMetrics.likes,
            comments: igMetrics.comments,
            shares: igMetrics.shares,
            saves: igMetrics.saves,
            impressions: igMetrics.impressions,
            reach: igMetrics.reach,
            engagementRate: Math.round(engagementRate * 100) / 100,
        };

        const providerMetrics: ProviderSpecificMetrics = {
            ig_saves: igMetrics.saves,
        };

        return {
            id: crypto.randomUUID(),
            publicationId: publication.id,
            provider: 'instagram',
            providerPostId: mediaId,
            metrics,
            providerMetrics,
            collectedAt: new Date().toISOString(),
            collectionMethod: 'polling',
        };
    }

    /**
     * Coleta métricas do Twitter via API v2
     */
    private async collectTwitterMetrics(
        token: SocialToken,
        publication: Publication,
        tweetId: string
    ): Promise<EngagementSnapshot> {
        const twMetrics = await getTwitterTweetMetrics(token, tweetId);

        // Twitter: shares = retweets + quotes
        const shares = twMetrics.retweets + twMetrics.quotes;
        const totalEngagement = twMetrics.likes + twMetrics.replies + shares;
        const engagementRate = twMetrics.impressions > 0
            ? (totalEngagement / twMetrics.impressions) * 100
            : 0;

        const metrics: EngagementMetrics = {
            likes: twMetrics.likes,
            comments: twMetrics.replies,
            shares,
            saves: twMetrics.bookmarks,
            impressions: twMetrics.impressions,
            reach: twMetrics.impressions, // Twitter não diferencia reach de impressions
            engagementRate: Math.round(engagementRate * 100) / 100,
        };

        const providerMetrics: ProviderSpecificMetrics = {
            tw_retweets: twMetrics.retweets,
            tw_quote_tweets: twMetrics.quotes,
            tw_bookmarks: twMetrics.bookmarks,
        };

        return {
            id: crypto.randomUUID(),
            publicationId: publication.id,
            provider: 'twitter',
            providerPostId: tweetId,
            metrics,
            providerMetrics,
            collectedAt: new Date().toISOString(),
            collectionMethod: 'polling',
        };
    }

    // ── Coleta Manual ──────────────────────────────────────────────────────

    /**
     * Força coleta imediata de métricas para uma publicação específica
     * (chamada pelo endpoint POST /api/social/engagement/refresh/:id)
     */
    async collectNow(publicationId: string): Promise<EngagementSnapshot | null> {
        const publications = readPublications();
        const publication = publications.find(p => p.id === publicationId);
        if (!publication || !publication.providerPostId) return null;

        const token = getTokenById(publication.socialTokenId);
        if (!token || !token.isActive) return null;

        try {
            const snapshot = await this.collectMetrics(publication.provider, token, publication);
            const allMetrics = readMetrics();
            allMetrics.push(snapshot);
            writeMetrics(allMetrics);
            return snapshot;
        } catch (error) {
            console.error(`[Engagement] Erro na coleta manual para ${publicationId}:`, error);
            return null;
        }
    }

    // ── Processamento de Webhooks ──────────────────────────────────────────

    /**
     * Processa evento de novo comentário recebido via webhook do Instagram
     */
    async handleWebhookComment(mediaId: string, commentText: string): Promise<void> {
        const publications = readPublications();
        const publication = publications.find(p => p.providerPostId === mediaId || p.providerMediaId === mediaId);
        if (!publication) {
            console.log(`[Engagement] Webhook: publicação não encontrada para media_id=${mediaId}`);
            return;
        }

        // Atualizar contagem de comentários no último snapshot
        const allMetrics = readMetrics();
        const latestSnapshot = allMetrics
            .filter(m => m.publicationId === publication.id)
            .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())[0];

        if (latestSnapshot) {
            // Incrementar comentários no snapshot mais recente
            latestSnapshot.metrics.comments++;

            // Recalcular engagement rate
            const totalEng = latestSnapshot.metrics.likes + latestSnapshot.metrics.comments + latestSnapshot.metrics.shares;
            latestSnapshot.metrics.engagementRate = latestSnapshot.metrics.impressions > 0
                ? Math.round((totalEng / latestSnapshot.metrics.impressions) * 100 * 100) / 100
                : 0;

            writeMetrics(allMetrics);
            console.log(`[Engagement] Webhook: comentário registrado para pub ${publication.id} (total: ${latestSnapshot.metrics.comments})`);
        } else {
            // Sem snapshot anterior — agendar coleta imediata
            socialQueue.enqueue({
                type: 'collect_metrics',
                provider: publication.provider,
                publicationId: publication.id,
                tokenId: publication.socialTokenId,
                priority: 'high',
            });
            console.log(`[Engagement] Webhook: coleta imediata agendada para pub ${publication.id}`);
        }
    }

    /**
     * Processa evento de menção recebido via webhook do Instagram
     */
    async handleWebhookMention(mediaId: string, commentId: string): Promise<void> {
        console.log(`[Engagement] Webhook: menção recebida media_id=${mediaId}, comment_id=${commentId}`);
        // Por enquanto, apenas log. Futuramente pode criar notificações.
    }

    // ── Consultas ──────────────────────────────────────────────────────────

    /**
     * Obtém o snapshot mais recente de métricas para uma publicação
     */
    getLatestMetrics(publicationId: string): EngagementSnapshot | null {
        const allMetrics = readMetrics();
        const snapshots = allMetrics
            .filter(m => m.publicationId === publicationId)
            .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());

        return snapshots[0] || null;
    }

    /**
     * Obtém histórico de métricas para uma publicação (para gráficos)
     */
    getMetricsHistory(publicationId: string, limit = 100): EngagementSnapshot[] {
        const allMetrics = readMetrics();
        return allMetrics
            .filter(m => m.publicationId === publicationId)
            .sort((a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime())
            .slice(-limit);
    }

    /**
     * Obtém resumo de engajamento de uma publicação
     */
    getEngagementSummary(publicationId: string): {
        currentMetrics: EngagementMetrics | null;
        deltas: { likes: number; comments: number; shares: number; impressions: number };
        history: { timestamp: string; likes: number; comments: number; impressions: number }[];
    } {
        const history = this.getMetricsHistory(publicationId);

        if (history.length === 0) {
            return {
                currentMetrics: null,
                deltas: { likes: 0, comments: 0, shares: 0, impressions: 0 },
                history: [],
            };
        }

        const current = history[history.length - 1];
        const previous = history.length >= 2 ? history[history.length - 2] : null;

        return {
            currentMetrics: current.metrics,
            deltas: {
                likes: previous ? current.metrics.likes - previous.metrics.likes : current.metrics.likes,
                comments: previous ? current.metrics.comments - previous.metrics.comments : current.metrics.comments,
                shares: previous ? current.metrics.shares - previous.metrics.shares : current.metrics.shares,
                impressions: previous ? current.metrics.impressions - previous.metrics.impressions : current.metrics.impressions,
            },
            history: history.map(s => ({
                timestamp: s.collectedAt,
                likes: s.metrics.likes,
                comments: s.metrics.comments,
                impressions: s.metrics.impressions,
            })),
        };
    }

    // ── Manutenção ─────────────────────────────────────────────────────────

    /**
     * Remove métricas antigas para evitar crescimento ilimitado do arquivo
     * Mantém: últimos 90 dias e máximo 500 snapshots por publicação
     */
    private cleanOldMetrics(metrics: EngagementSnapshot[]): EngagementSnapshot[] {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - 90);

        // Filtrar por data
        let filtered = metrics.filter(m => new Date(m.collectedAt) > cutoff);

        // Limitar por publicação (manter os 500 mais recentes)
        const byPublication = new Map<string, EngagementSnapshot[]>();
        for (const m of filtered) {
            const existing = byPublication.get(m.publicationId) || [];
            existing.push(m);
            byPublication.set(m.publicationId, existing);
        }

        const result: EngagementSnapshot[] = [];
        for (const [, snapshots] of byPublication) {
            snapshots.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
            result.push(...snapshots.slice(0, 500));
        }

        return result;
    }
}

// Singleton export
export const engagementService = EngagementService.getInstance();
