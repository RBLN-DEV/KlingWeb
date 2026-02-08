// ============================================================================
// Instagram Bot Service — Orquestrador principal
// ============================================================================
// Tradução TS de docs/referencia/bot.py
// Singleton que gerencia login, módulos e sessão do bot
// ============================================================================

import { InstagramWebAPI } from '../instagram-web-api.service.js';
import { BotRateLimiter } from './bot-rate-limiter.js';
import { FollowersManager } from './followers-manager.service.js';
import { GrowthEngine } from './growth-engine.service.js';
import { ContentScheduler } from './content-scheduler.service.js';
import { AnalyticsEngine } from './analytics-engine.service.js';
import type {
    BotConfig, BotStatusInfo, BotActionResult,
    GrowthSessionType, DEFAULT_BOT_CONFIG,
} from './types.js';
import { decrypt } from '../crypto.service.js';
import { getUserTokensFull } from '../social-token.store.js';
import type { SocialToken } from '../../types/social.types.js';

export class InstagramBotService {
    private api: InstagramWebAPI;
    private rateLimiter: BotRateLimiter;
    private config: BotConfig;
    private isLoggedIn = false;
    private username: string | null = null;
    private userId: string | null = null;

    // Módulos (lazy init)
    private _followersManager: FollowersManager | null = null;
    private _growthEngine: GrowthEngine | null = null;
    private _contentScheduler: ContentScheduler | null = null;
    private _analyticsEngine: AnalyticsEngine | null = null;

    // Singleton por userId
    private static instances: Map<string, InstagramBotService> = new Map();

    private constructor(config?: Partial<BotConfig>) {
        const defaults: BotConfig = {
            minDelay: 2000,
            maxDelay: 5000,
            longMinDelay: 10000,
            longMaxDelay: 20000,
            maxLikesPerHour: 30,
            maxFollowsPerHour: 20,
            maxUnfollowsPerHour: 25,
            maxCommentsPerHour: 8,
            maxActionsPerDay: 400,
            postsPerDay: 2,
            defaultPostHours: [9, 19],
            targetHashtags: ['tecnologia', 'programacao', 'developer', 'coding'],
            targetInfluencers: [],
            targetCompetitors: [],
            commentTemplates: [
                'Conteúdo incrível! 🔥',
                'Muito bom mesmo! 👏',
                'Adorei isso! ❤️',
                'Que post fantástico! ✨',
                'Valeu pela dica! 🙌',
                'Salvando aqui! 💾',
                'Muito útil, obrigado! 🙏',
            ],
        };

        this.config = { ...defaults, ...config };
        this.api = new InstagramWebAPI();
        this.rateLimiter = new BotRateLimiter();
    }

    static getInstance(appUserId: string, config?: Partial<BotConfig>): InstagramBotService {
        if (!InstagramBotService.instances.has(appUserId)) {
            InstagramBotService.instances.set(appUserId, new InstagramBotService(config));
        }
        return InstagramBotService.instances.get(appUserId)!;
    }

    static removeInstance(appUserId: string): void {
        const inst = InstagramBotService.instances.get(appUserId);
        if (inst) {
            inst.cleanup();
            InstagramBotService.instances.delete(appUserId);
        }
    }

    // ── Módulos (lazy) ─────────────────────────────────────────────────────

    get followersManager(): FollowersManager {
        if (!this._followersManager) {
            this._followersManager = new FollowersManager(this.api, this.rateLimiter, this.config);
        }
        return this._followersManager;
    }

    get growthEngine(): GrowthEngine {
        if (!this._growthEngine) {
            this._growthEngine = new GrowthEngine(this.api, this.rateLimiter, this.followersManager, this.config);
        }
        return this._growthEngine;
    }

    get contentScheduler(): ContentScheduler {
        if (!this._contentScheduler) {
            this._contentScheduler = new ContentScheduler(this.api, this.config);
        }
        return this._contentScheduler;
    }

    get analyticsEngine(): AnalyticsEngine {
        if (!this._analyticsEngine) {
            this._analyticsEngine = new AnalyticsEngine(this.api, this.config);
        }
        return this._analyticsEngine;
    }

    // ── Login ──────────────────────────────────────────────────────────────

    /**
     * Login usando SocialToken armazenado
     */
    async loginFromToken(token: SocialToken): Promise<boolean> {
        // Configurar proxy
        const proxy = process.env.INSTAGRAM_PROXY || process.env.HTTPS_PROXY;
        if (proxy) this.api.setProxy(proxy);

        // Tentar restaurar sessão de cookies
        if (token.metadata.igCookies) {
            try {
                const cookiesData = decrypt(token.metadata.igCookies as string);
                const cookies = JSON.parse(cookiesData);
                const session = {
                    username: token.providerUsername,
                    userId: token.providerUserId,
                    cookies,
                    csrfToken: cookies.csrftoken || '',
                };

                const restored = await this.api.loadSession(session);
                if (restored) {
                    this.isLoggedIn = true;
                    this.username = token.providerUsername;
                    this.userId = token.providerUserId;
                    console.log(`[InstagramBot] Sessão restaurada: @${this.username}`);
                    return true;
                }
            } catch (e) {
                console.warn('[InstagramBot] Erro ao restaurar cookies:', e);
            }
        }

        // Re-login com password
        if (token.metadata.igPassword) {
            try {
                const password = decrypt(token.metadata.igPassword as string);
                const ok = await this.api.login(token.providerUsername, password);
                if (ok) {
                    this.isLoggedIn = true;
                    this.username = token.providerUsername;
                    this.userId = token.providerUserId;
                    console.log(`[InstagramBot] Login OK: @${this.username}`);
                    return true;
                }
            } catch (e: any) {
                console.error('[InstagramBot] Login falhou:', e.message);
                throw e;
            }
        }

        throw new Error('Não foi possível fazer login. Reconecte a conta Instagram.');
    }

    /**
     * Login direto com username/password
     */
    async loginDirect(username: string, password: string): Promise<boolean> {
        const proxy = process.env.INSTAGRAM_PROXY || process.env.HTTPS_PROXY;
        if (proxy) this.api.setProxy(proxy);

        const ok = await this.api.login(username, password);
        if (ok) {
            this.isLoggedIn = true;
            this.username = username;
            const session = this.api.getSessionData();
            this.userId = session?.userId || null;
            console.log(`[InstagramBot] Login OK: @${username}`);
            return true;
        }

        throw new Error('Login falhou');
    }

    /**
     * Auto-login usando o primeiro token IG do userId da app
     */
    async autoLogin(appUserId: string): Promise<boolean> {
        const tokens = getUserTokensFull(appUserId);
        const igToken = tokens.find((t: SocialToken) =>
            t.provider === 'instagram' && t.isActive && t.metadata.authMode === 'unofficial'
        );

        if (!igToken) {
            throw new Error('Nenhuma conta Instagram conectada. Faça login primeiro em Social Hub.');
        }

        return this.loginFromToken(igToken);
    }

    // ── Ações Básicas ──────────────────────────────────────────────────────

    async likePost(mediaId: string): Promise<boolean> {
        this.ensureLoggedIn();
        if (!this.rateLimiter.canPerform('likes', this.config.maxLikesPerHour)) return false;

        const ok = await this.api.likeMedia(mediaId);
        if (ok) this.rateLimiter.recordAction('likes');
        return ok;
    }

    async commentPost(mediaId: string, text: string): Promise<boolean> {
        this.ensureLoggedIn();
        if (!this.rateLimiter.canPerform('comments', this.config.maxCommentsPerHour)) return false;

        const ok = await this.api.commentMedia(mediaId, text);
        if (ok) this.rateLimiter.recordAction('comments');
        return ok;
    }

    async followUserByUsername(username: string): Promise<boolean> {
        this.ensureLoggedIn();
        return this.followersManager.followUser(username, 'manual');
    }

    async unfollowUserByUsername(username: string): Promise<boolean> {
        this.ensureLoggedIn();
        return this.followersManager.unfollowUser(username);
    }

    /**
     * Follow direto por userId numérico (sem resolver username → evita travamento)
     */
    async followUserById(userId: number): Promise<boolean> {
        this.ensureLoggedIn();
        return this.api.followUser(userId);
    }

    /**
     * Unfollow direto por userId numérico
     */
    async unfollowUserById(userId: number): Promise<boolean> {
        this.ensureLoggedIn();
        return this.api.unfollowUser(userId);
    }

    /**
     * Like direto por mediaId
     */
    async likePostById(mediaId: string): Promise<boolean> {
        this.ensureLoggedIn();
        return this.api.likeMedia(mediaId);
    }

    // ── Uploads ────────────────────────────────────────────────────────────

    async uploadPhoto(imageBuffer: Buffer, caption: string) {
        this.ensureLoggedIn();
        return this.api.publishPhoto(imageBuffer, caption);
    }

    async uploadVideo(videoBuffer: Buffer, caption: string, coverBuffer?: Buffer) {
        this.ensureLoggedIn();
        return this.api.publishVideo(videoBuffer, caption, coverBuffer);
    }

    async uploadStoryPhoto(imageBuffer: Buffer) {
        this.ensureLoggedIn();
        return this.api.publishStoryPhoto(imageBuffer);
    }

    async uploadStoryVideo(videoBuffer: Buffer, coverBuffer?: Buffer) {
        this.ensureLoggedIn();
        return this.api.publishStoryVideo(videoBuffer, coverBuffer);
    }

    async uploadReel(videoBuffer: Buffer, caption: string, coverBuffer?: Buffer) {
        this.ensureLoggedIn();
        return this.api.publishReel(videoBuffer, caption, coverBuffer);
    }

    // ── Publicação Integrada (a partir de URL) ─────────────────────────────

    /**
     * Publica mídia a partir de uma URL (vídeos/imagens gerados na app).
     * Faz download, detecta tipo e publica no destino correto.
     */
    async publishFromUrl(options: {
        mediaUrl: string;
        caption: string;
        destination: 'feed' | 'story' | 'reel';
        mediaType?: 'image' | 'video';
    }): Promise<{ success: boolean; postUrl?: string; mediaId?: string; error?: string }> {
        this.ensureLoggedIn();

        const { mediaUrl, caption, destination, mediaType: explicitType } = options;

        console.log(`[InstagramBot] 📤 Publicando ${destination} a partir de URL: ${mediaUrl}`);

        // 1. Download da mídia (com suporte a paths locais /temp/xxx)
        let buffer: Buffer = Buffer.alloc(0);
        let contentType: string = '';
        try {
            // Tentar ler direto do disco se for path local
            if (mediaUrl && !mediaUrl.startsWith('http') && !mediaUrl.startsWith('data:')) {
                const fs = await import('fs');
                const path = await import('path');
                const filename = path.default.basename(mediaUrl);
                const possibleDirs = [
                    '/home/temp_uploads',
                    '/app/temp_uploads',
                    path.default.join(process.cwd(), 'temp_uploads'),
                ];
                let found = false;
                for (const dir of possibleDirs) {
                    const fullPath = path.default.join(dir, filename);
                    try {
                        if (fs.default.existsSync(fullPath)) {
                            buffer = fs.default.readFileSync(fullPath);
                            // Detectar content-type pelo magic bytes
                            if (buffer[0] === 0xFF && buffer[1] === 0xD8) contentType = 'image/jpeg';
                            else if (buffer[0] === 0x89 && buffer[1] === 0x50) contentType = 'image/png';
                            else if (buffer[0] === 0x47 && buffer[1] === 0x49) contentType = 'image/gif';
                            else contentType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';
                            console.log(`[InstagramBot] Mídia lida do disco: ${fullPath} (${(buffer!.length / 1024).toFixed(0)}KB, ${contentType})`);
                            found = true;
                            break;
                        }
                    } catch { /* ignore */ }
                }
                if (!found) {
                    // Fallback: tentar via self-hosted URL
                    const port = process.env.PORT || 3001;
                    const selfUrl = `http://localhost:${port}${mediaUrl.startsWith('/') ? mediaUrl : '/' + mediaUrl}`;
                    console.log(`[InstagramBot] Path local não encontrado no disco, tentando URL: ${selfUrl}`);
                    const response = await fetch(selfUrl);
                    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    contentType = response.headers.get('content-type') || '';
                    buffer = Buffer.from(await response.arrayBuffer());
                }
            } else {
                const response = await fetch(mediaUrl);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                contentType = response.headers.get('content-type') || '';
                buffer = Buffer.from(await response.arrayBuffer());
            }
            console.log(`[InstagramBot] Download OK: ${(buffer!.length / 1024 / 1024).toFixed(1)}MB, type=${contentType}`);
        } catch (err: any) {
            return { success: false, error: `Falha ao baixar mídia: ${err.message}` };
        }

        // 2. Detectar tipo de mídia
        const isVideo = explicitType === 'video'
            || contentType.startsWith('video/')
            || mediaUrl.match(/\.(mp4|mov|avi|webm|mkv)(\?|$)/i) !== null;
        const isImage = !isVideo;

        // 3. Publicar conforme destino
        try {
            if (destination === 'reel') {
                if (!isVideo) {
                    return { success: false, error: 'Reels requer um vídeo' };
                }
                const result = await this.api.publishReel(buffer, caption);
                return {
                    success: result.success,
                    postUrl: result.postUrl,
                    mediaId: result.mediaId,
                    error: result.error,
                };
            }

            if (destination === 'story') {
                if (isVideo) {
                    const result = await this.api.publishStoryVideo(buffer);
                    return {
                        success: result.success,
                        mediaId: result.mediaId,
                        error: result.error,
                    };
                } else {
                    const result = await this.api.publishStoryPhoto(buffer);
                    return {
                        success: result.success,
                        mediaId: result.mediaId,
                        error: result.error,
                    };
                }
            }

            // feed
            if (isVideo) {
                const result = await this.api.publishVideo(buffer, caption);
                return {
                    success: result.success,
                    postUrl: result.postUrl,
                    mediaId: result.mediaId,
                    error: result.error,
                };
            } else {
                const result = await this.api.publishPhoto(buffer, caption);
                return {
                    success: result.success,
                    postUrl: result.postUrl,
                    mediaId: result.mediaId,
                    error: result.error,
                };
            }
        } catch (err: any) {
            console.error(`[InstagramBot] Erro na publicação ${destination}:`, err.message);
            return { success: false, error: err.message };
        }
    }

    // ── Growth Session ─────────────────────────────────────────────────────

    async runGrowthSession(type: GrowthSessionType = 'balanced'): Promise<BotActionResult[]> {
        this.ensureLoggedIn();
        return this.growthEngine.runGrowthSession(type);
    }

    abortGrowthSession(): void {
        this.growthEngine.abortSession();
    }

    // ── Status / Info ──────────────────────────────────────────────────────

    getStatus(): BotStatusInfo {
        return {
            isLoggedIn: this.isLoggedIn,
            username: this.username || undefined,
            userId: this.userId || undefined,
            sessionActive: this.isLoggedIn,
            config: { ...this.config },
            rateLimiterStats: this.rateLimiter.getStats(),
            growthStatsToday: this._growthEngine?.getTodayReport(),
            followersManagerStats: this._followersManager?.getStats(),
        };
    }

    /**
     * Retorna dados de sessão (cookies) para persistência
     */
    getSessionData() {
        return this.api.getSessionData();
    }

    updateConfig(updates: Partial<BotConfig>): void {
        this.config = { ...this.config, ...updates };
        console.log('[InstagramBot] Config atualizada');
    }

    // ── Utilitários ────────────────────────────────────────────────────────

    private ensureLoggedIn(): void {
        if (!this.isLoggedIn) {
            throw new Error('Bot não autenticado. Faça login primeiro.');
        }
    }

    private cleanup(): void {
        this._contentScheduler?.stopDaemon();
        this._growthEngine?.abortSession();
    }

    async getUserInfo(username: string) {
        this.ensureLoggedIn();
        return this.api.getUserInfo(username);
    }

    async getMyInfo() {
        this.ensureLoggedIn();
        return this.api.getAccountInfo();
    }
}
