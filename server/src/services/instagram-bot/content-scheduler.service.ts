// ============================================================================
// Content Scheduler — Agendamento e auto-postagem
// ============================================================================
// Tradução TS de docs/referencia/content_scheduler.py
// ============================================================================

import { InstagramWebAPI } from '../instagram-web-api.service.js';
import type { ScheduledPost, BotConfig } from './types.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, ensureDataDir } from '../data-dir.js';

const SCHEDULE_FILE = path.join(DATA_DIR, 'bot_content_schedule.json');
const TEMPLATES_FILE = path.join(DATA_DIR, 'bot_caption_templates.json');

interface CaptionTemplates {
    styles: Record<string, string[]>;
    messages: Record<string, string[]>;
}

const DEFAULT_TEMPLATES: CaptionTemplates = {
    styles: {
        motivational: ['💪 {message}\n\n{hashtags}', '🔥 {message}\n\n{hashtags}', '✨ {message}\n\n{hashtags}'],
        educational: ['📚 {message}\n\n{hashtags}', '💡 {message}\n\n{hashtags}', '🎯 {message}\n\n{hashtags}'],
        engagement: ['👇 {message}\n\n{hashtags}', '🤔 {message}\n\n{hashtags}', '💬 {message}\n\n{hashtags}'],
        questions: ['Qual sua opinião? {message}\n\n{hashtags}', 'Concorda? {message}\n\n{hashtags}', 'Comenta! {message}\n\n{hashtags}'],
    },
    messages: {
        crescimento: [
            'Qual sua meta de seguidores para este mês?',
            'O que está te impedindo de crescer?',
            'Consistência é a chave do sucesso!',
        ],
        conteudo: [
            'Que tipo de conteúdo você mais gosta?',
            'Salva esse post para ver depois!',
            'Marca alguém que precisa ver isso!',
        ],
        engajamento: [
            'Dê dois toques se concorda!',
            'Comenta sua opinião!',
            'Compartilha nos stories!',
        ],
    },
};

export class ContentScheduler {
    private postsQueue: ScheduledPost[] = [];
    private templates: CaptionTemplates;
    private daemonInterval?: ReturnType<typeof setInterval>;

    constructor(
        private api: InstagramWebAPI,
        private config: BotConfig,
    ) {
        this.loadData();
        this.templates = this.loadTemplates();
    }

    // ── Persistência ───────────────────────────────────────────────────────

    private loadData(): void {
        ensureDataDir();
        try {
            if (fs.existsSync(SCHEDULE_FILE)) {
                this.postsQueue = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
                console.log(`[ContentScheduler] ${this.postsQueue.length} posts carregados`);
            }
        } catch { this.postsQueue = []; }
    }

    private saveData(): void {
        ensureDataDir();
        try {
            const tmp = SCHEDULE_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.postsQueue, null, 2), 'utf-8');
            fs.renameSync(tmp, SCHEDULE_FILE);
        } catch (e) {
            console.error('[ContentScheduler] Erro ao salvar:', e);
        }
    }

    private loadTemplates(): CaptionTemplates {
        try {
            if (fs.existsSync(TEMPLATES_FILE)) {
                return { ...DEFAULT_TEMPLATES, ...JSON.parse(fs.readFileSync(TEMPLATES_FILE, 'utf-8')) };
            }
        } catch { /* */ }
        return DEFAULT_TEMPLATES;
    }

    // ── Geração de Caption ─────────────────────────────────────────────────

    generateCaption(topic = 'engajamento', style = 'engagement'): string {
        const styleTemplates = this.templates.styles[style] || this.templates.styles.engagement;
        const template = styleTemplates[Math.floor(Math.random() * styleTemplates.length)];

        const messages = this.templates.messages[topic] || this.templates.messages.engajamento;
        const message = messages[Math.floor(Math.random() * messages.length)];

        const hashtags = this.config.targetHashtags
            .slice(0, 10)
            .map(t => `#${t}`)
            .join(' ');

        return template.replace('{message}', message).replace('{hashtags}', hashtags);
    }

    // ── Agendamento ────────────────────────────────────────────────────────

    schedulePost(opts: {
        mediaPath: string;
        caption?: string;
        hashtags?: string[];
        scheduledTime?: string;
        contentType?: 'feed' | 'story' | 'reel';
    }): string {
        const id = `post_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

        const scheduledTime = opts.scheduledTime || new Date(Date.now() + 3600_000).toISOString();

        const post: ScheduledPost = {
            id,
            contentType: opts.contentType || 'feed',
            mediaPath: opts.mediaPath,
            caption: opts.caption || this.generateCaption(),
            hashtags: opts.hashtags || [],
            scheduledTime,
            posted: false,
        };

        this.postsQueue.push(post);
        this.saveData();

        console.log(`[ContentScheduler] 📅 Post agendado: ${id} para ${scheduledTime}`);
        return id;
    }

    listScheduled(): ScheduledPost[] {
        return this.postsQueue.filter(p => !p.posted);
    }

    listAll(): ScheduledPost[] {
        return [...this.postsQueue];
    }

    cancelPost(postId: string): boolean {
        const idx = this.postsQueue.findIndex(p => p.id === postId && !p.posted);
        if (idx === -1) return false;

        this.postsQueue.splice(idx, 1);
        this.saveData();
        console.log(`[ContentScheduler] ❌ Post ${postId} cancelado`);
        return true;
    }

    // ── Publicação ─────────────────────────────────────────────────────────

    async checkAndPost(): Promise<boolean> {
        const now = new Date();

        for (const post of this.postsQueue) {
            if (post.posted) continue;

            const scheduled = new Date(post.scheduledTime);
            const diff = (now.getTime() - scheduled.getTime()) / 1000;

            if (diff >= 0 && diff < 300) { // Dentro de 5 min da hora agendada
                console.log(`[ContentScheduler] 🚀 Publicando: ${post.id}`);

                try {
                    let success = false;

                    if (!fs.existsSync(post.mediaPath)) {
                        post.error = `Arquivo não encontrado: ${post.mediaPath}`;
                        this.saveData();
                        continue;
                    }

                    const buffer = fs.readFileSync(post.mediaPath);
                    const ext = path.extname(post.mediaPath).toLowerCase();
                    const isVideo = ['.mp4', '.mov', '.avi', '.mkv'].includes(ext);

                    const fullCaption = post.hashtags.length > 0
                        ? `${post.caption}\n\n${post.hashtags.map(t => `#${t}`).join(' ')}`
                        : post.caption;

                    if (post.contentType === 'reel') {
                        if (!isVideo) {
                            post.error = 'Reels requerem vídeo (.mp4)';
                        } else {
                            const result = await this.api.publishReel(buffer, fullCaption);
                            success = result.success;
                            if (!success) post.error = result.error;
                        }
                    } else if (post.contentType === 'story') {
                        if (isVideo) {
                            // Story vídeo — usamos publishReel como workaround
                            post.error = 'Story de vídeo não suportado via Web API neste momento';
                        } else {
                            const result = await this.api.publishStoryPhoto(buffer);
                            success = result.success;
                            if (!success) post.error = result.error;
                        }
                    } else {
                        // Feed
                        if (isVideo) {
                            const result = await this.api.publishVideo(buffer, fullCaption);
                            success = result.success;
                            if (!success) post.error = result.error;
                        } else {
                            const result = await this.api.publishPhoto(buffer, fullCaption);
                            success = result.success;
                            if (!success) post.error = result.error;
                        }
                    }

                    if (success) {
                        post.posted = true;
                        post.postedAt = new Date().toISOString();
                        console.log(`[ContentScheduler] ✅ Publicado: ${post.id}`);
                    }

                    this.saveData();
                    return success;
                } catch (e: any) {
                    post.error = e.message;
                    this.saveData();
                    console.error(`[ContentScheduler] Erro ao publicar ${post.id}:`, e.message);
                }
            }
        }

        return false;
    }

    // ── Daemon ─────────────────────────────────────────────────────────────

    startDaemon(checkIntervalMs = 300_000): void {
        if (this.daemonInterval) return;

        console.log(`[ContentScheduler] 🤖 Daemon iniciado (verificação a cada ${checkIntervalMs / 1000}s)`);

        this.daemonInterval = setInterval(async () => {
            try {
                await this.checkAndPost();
            } catch (e: any) {
                console.error('[ContentScheduler] Erro no daemon:', e.message);
            }
        }, checkIntervalMs);

        // Verificar imediatamente
        this.checkAndPost().catch(() => {});
    }

    stopDaemon(): void {
        if (this.daemonInterval) {
            clearInterval(this.daemonInterval);
            this.daemonInterval = undefined;
            console.log('[ContentScheduler] 🛑 Daemon parado');
        }
    }

    isDaemonRunning(): boolean {
        return !!this.daemonInterval;
    }

    // ── Auto-agendamento semanal ───────────────────────────────────────────

    autoScheduleFromFolder(
        contentFolder: string,
        postsPerDay = 2,
        optimalHours?: number[],
    ): number {
        const hours = optimalHours || this.config.defaultPostHours;

        // Listar imagens na pasta
        if (!fs.existsSync(contentFolder)) {
            console.error(`[ContentScheduler] Pasta não encontrada: ${contentFolder}`);
            return 0;
        }

        const files = fs.readdirSync(contentFolder).filter(f => {
            const ext = path.extname(f).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.mp4'].includes(ext);
        });

        if (files.length === 0) {
            console.log(`[ContentScheduler] Nenhum arquivo em ${contentFolder}`);
            return 0;
        }

        let scheduled = 0;
        let fileIdx = 0;
        const now = new Date();

        for (let day = 0; day < 7; day++) {
            for (let p = 0; p < postsPerDay; p++) {
                if (fileIdx >= files.length) break;

                const hour = hours[p % hours.length];
                const postTime = new Date(now);
                postTime.setDate(postTime.getDate() + day);
                postTime.setHours(hour, Math.floor(Math.random() * 30), 0, 0);

                if (postTime < now) {
                    postTime.setDate(postTime.getDate() + 1);
                }

                const filePath = path.join(contentFolder, files[fileIdx]);
                const topics = ['crescimento', 'conteudo', 'engajamento'];
                const styles = ['motivational', 'educational', 'engagement', 'questions'];

                this.schedulePost({
                    mediaPath: filePath,
                    caption: this.generateCaption(
                        topics[Math.floor(Math.random() * topics.length)],
                        styles[Math.floor(Math.random() * styles.length)],
                    ),
                    hashtags: this.config.targetHashtags.slice(0, 8),
                    scheduledTime: postTime.toISOString(),
                    contentType: path.extname(files[fileIdx]).toLowerCase() === '.mp4' ? 'reel' : 'feed',
                });

                scheduled++;
                fileIdx++;
            }
        }

        console.log(`[ContentScheduler] ✅ ${scheduled} posts agendados para a semana`);
        return scheduled;
    }
}
