// ============================================================================
// Growth Engine — Motor de crescimento orgânico Instagram
// ============================================================================
// Tradução TS de docs/referencia/growth_engine.py
// 4 Estratégias: Follow em curtidores, Story engagement,
//                Comentários estratégicos, Like em hashtags
// ============================================================================

import { InstagramWebAPI } from '../instagram-web-api.service.js';
import { BotRateLimiter } from './bot-rate-limiter.js';
import { FollowersManager } from './followers-manager.service.js';
import type {
    BotConfig, GrowthStats, GrowthSessionType,
    GrowthSessionConfig, GROWTH_SESSION_CONFIGS, BotActionResult,
} from './types.js';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, ensureDataDir } from '../data-dir.js';

const STATS_FILE = path.join(DATA_DIR, 'bot_growth_stats.json');
const TARGETS_FILE = path.join(DATA_DIR, 'bot_growth_targets.json');

function humanDelay(minMs = 2000, maxMs = 5000): Promise<void> {
    const ms = minMs + Math.random() * (maxMs - minMs);
    return new Promise(r => setTimeout(r, ms));
}

export interface GrowthTargets {
    influencers: Array<{ username: string; niche: string; addedAt: string }>;
    competitors: string[];
    popularHashtags: string[];
    commentTemplates: string[];
}

export class GrowthEngine {
    private dailyStats: Record<string, GrowthStats> = {};
    private targets: GrowthTargets;
    private abortController: AbortController | null = null;

    constructor(
        private api: InstagramWebAPI,
        private rateLimiter: BotRateLimiter,
        private followersManager: FollowersManager,
        private config: BotConfig,
    ) {
        this.loadStats();
        this.targets = this.loadTargets();
    }

    // ── Persistência ───────────────────────────────────────────────────────

    private loadStats(): void {
        try {
            if (fs.existsSync(STATS_FILE)) {
                this.dailyStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
            }
        } catch { this.dailyStats = {}; }
    }

    private saveStats(): void {
        ensureDataDir();
        try {
            const tmp = STATS_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.dailyStats, null, 2), 'utf-8');
            fs.renameSync(tmp, STATS_FILE);
        } catch (e) {
            console.error('[GrowthEngine] Erro ao salvar stats:', e);
        }
    }

    private loadTargets(): GrowthTargets {
        const defaults: GrowthTargets = {
            influencers: [],
            competitors: this.config.targetCompetitors,
            popularHashtags: this.config.targetHashtags,
            commentTemplates: this.config.commentTemplates,
        };

        try {
            if (fs.existsSync(TARGETS_FILE)) {
                return { ...defaults, ...JSON.parse(fs.readFileSync(TARGETS_FILE, 'utf-8')) };
            }
        } catch { /* */ }

        return defaults;
    }

    saveTargets(): void {
        ensureDataDir();
        try {
            const tmp = TARGETS_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.targets, null, 2), 'utf-8');
            fs.renameSync(tmp, TARGETS_FILE);
        } catch (e) {
            console.error('[GrowthEngine] Erro ao salvar targets:', e);
        }
    }

    getTargets(): GrowthTargets {
        return { ...this.targets };
    }

    updateTargets(updates: Partial<GrowthTargets>): void {
        this.targets = { ...this.targets, ...updates };
        this.saveTargets();
    }

    addInfluencer(username: string, niche = ''): void {
        const exists = this.targets.influencers.some(i => i.username === username.toLowerCase());
        if (!exists) {
            this.targets.influencers.push({
                username: username.toLowerCase(),
                niche,
                addedAt: new Date().toISOString(),
            });
            this.saveTargets();
        }
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    private getTodayStats(): GrowthStats {
        const today = new Date().toISOString().slice(0, 10);
        if (!this.dailyStats[today]) {
            this.dailyStats[today] = {
                day: today,
                followsPerformed: 0,
                unfollowsPerformed: 0,
                likesSent: 0,
                commentsSent: 0,
                storiesViewed: 0,
            };
        }
        return this.dailyStats[today];
    }

    getTodayReport(): GrowthStats {
        return { ...this.getTodayStats() };
    }

    getWeeklyReport(): Record<string, number> {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);

        const weekly: Record<string, number> = {};

        for (const [dateStr, stats] of Object.entries(this.dailyStats)) {
            const d = new Date(dateStr);
            if (d >= weekAgo) {
                for (const [key, value] of Object.entries(stats)) {
                    if (typeof value === 'number') {
                        weekly[key] = (weekly[key] || 0) + value;
                    }
                }
            }
        }

        return weekly;
    }

    // ── Estratégia 1: Like por Hashtag ─────────────────────────────────────

    async likeByHashtag(hashtag: string, maxLikes = 30): Promise<BotActionResult> {
        console.log(`[GrowthEngine] ❤️ Curtindo posts de #${hashtag}...`);

        let liked = 0;
        hashtag = hashtag.trim().replace(/^#/, '');

        try {
            // A Web API não tem endpoint nativo de hashtag search;
            // usamos o GraphQL endpoint
            const medias = await this.api.hashtagMedias(hashtag, maxLikes);

            for (const media of medias) {
                if (liked >= maxLikes) break;
                if (!this.rateLimiter.canPerform('likes', this.config.maxLikesPerHour)) break;

                try {
                    const ok = await this.api.likeMedia(String(media.pk || media.id));
                    if (ok) {
                        liked++;
                        this.getTodayStats().likesSent++;
                        this.rateLimiter.recordAction('likes');
                        console.log(`[GrowthEngine] ❤️ Curtido ${liked}/${maxLikes}`);
                        await humanDelay(3000, 6000);
                    }
                } catch (e: any) {
                    if (e.message?.includes('429')) {
                        console.warn('[GrowthEngine] ⏳ Rate limit. Pausando 5min...');
                        await humanDelay(300000, 310000);
                        break;
                    }
                }
            }
        } catch (e: any) {
            console.error(`[GrowthEngine] Erro like por hashtag:`, e.message);
        }

        this.saveStats();
        return { success: true, action: 'likeByHashtag', count: liked, details: `#${hashtag}` };
    }

    // ── Estratégia 2: Comentários Estratégicos ─────────────────────────────

    async strategicCommenting(maxComments = 10): Promise<BotActionResult> {
        console.log(`[GrowthEngine] 💬 Comentando estrategicamente...`);

        let commented = 0;
        const templates = this.targets.commentTemplates;

        // Comentar em posts de hashtags alvo
        for (const hashtag of this.targets.popularHashtags.slice(0, 2)) {
            if (commented >= maxComments) break;

            try {
                const medias = await this.api.hashtagMedias(hashtag, 5);

                for (const media of medias) {
                    if (commented >= maxComments) break;
                    if (!this.rateLimiter.canPerform('comments', this.config.maxCommentsPerHour)) break;

                    try {
                        const commentText = templates[Math.floor(Math.random() * templates.length)];
                        const mediaId = String(media.pk || media.id);
                        const ok = await this.api.commentMedia(mediaId, commentText);

                        if (ok) {
                            commented++;
                            this.getTodayStats().commentsSent++;
                            this.rateLimiter.recordAction('comments');
                            console.log(`[GrowthEngine] 💬 "${commentText}" em post`);
                            await humanDelay(30000, 60000);
                        }
                    } catch (e: any) {
                        if (e.message?.includes('429')) {
                            await humanDelay(300000, 310000);
                            break;
                        }
                    }
                }
            } catch { /* */ }
        }

        this.saveStats();
        return { success: true, action: 'strategicCommenting', count: commented };
    }

    // ── Estratégia 3: Follow em curtidores (simulado via hashtags) ──────────

    async followFromHashtags(maxFollows = 20): Promise<BotActionResult> {
        console.log(`[GrowthEngine] ➕ Follow em usuários de hashtags...`);

        let followed = 0;

        for (const hashtag of this.targets.popularHashtags.slice(0, 3)) {
            if (followed >= maxFollows) break;

            try {
                const medias = await this.api.hashtagMedias(hashtag, 10);

                for (const media of medias) {
                    if (followed >= maxFollows) break;
                    if (!this.rateLimiter.canPerform('follows', this.config.maxFollowsPerHour)) break;

                    const userId = media.userId;
                    if (!userId) continue;

                    try {
                        const ok = await this.api.followUser(userId);
                        if (ok) {
                            followed++;
                            this.getTodayStats().followsPerformed++;
                            this.rateLimiter.recordAction('follows');
                            console.log(`[GrowthEngine] ✅ Seguiu user ${userId} (via #${hashtag})`);
                            await humanDelay(8000, 15000);
                        }
                    } catch (e: any) {
                        if (e.message?.includes('429')) {
                            await humanDelay(300000, 310000);
                            break;
                        }
                    }
                }
            } catch { /* */ }
        }

        this.saveStats();
        return { success: true, action: 'followFromHashtags', count: followed };
    }

    // ── Sessão Completa ────────────────────────────────────────────────────

    async runGrowthSession(sessionType: GrowthSessionType = 'balanced'): Promise<BotActionResult[]> {
        const configs: Record<GrowthSessionType, GrowthSessionConfig> = {
            aggressive: { follows: 50, unfollows: 50, likes: 100, comments: 15, stories: 100, likesPerTag: 50 },
            balanced: { follows: 30, unfollows: 30, likes: 60, comments: 8, stories: 50, likesPerTag: 30 },
            safe: { follows: 15, unfollows: 15, likes: 30, comments: 3, stories: 20, likesPerTag: 15 },
        };

        const cfg = configs[sessionType];
        const results: BotActionResult[] = [];

        this.abortController = new AbortController();

        console.log(`[GrowthEngine] 🚀 SESSÃO DE CRESCIMENTO: ${sessionType.toUpperCase()}`);
        console.log(`[GrowthEngine]    Follows=${cfg.follows} Unfollows=${cfg.unfollows} Likes=${cfg.likes} Comments=${cfg.comments}`);

        // 1. UNFOLLOW (limpeza)
        console.log('[GrowthEngine] 📍 Fase 1: Limpando não-seguidores...');
        const unfollowed = await this.followersManager.cleanNonFollowers(cfg.unfollows, 2);
        results.push({ success: true, action: 'cleanNonFollowers', count: unfollowed });

        if (this.abortController.signal.aborted) return results;

        // 2. LIKE EM HASHTAGS
        console.log('[GrowthEngine] 📍 Fase 2: Curtindo posts de hashtags...');
        for (const hashtag of this.targets.popularHashtags.slice(0, 2)) {
            if (this.abortController.signal.aborted) break;
            const res = await this.likeByHashtag(hashtag, Math.floor(cfg.likesPerTag / 2));
            results.push(res);
            await humanDelay(10000, 20000);
        }

        if (this.abortController.signal.aborted) return results;

        // 3. FOLLOW EM HASHTAGS
        console.log('[GrowthEngine] 📍 Fase 3: Follow em usuários de hashtags...');
        const followRes = await this.followFromHashtags(cfg.follows);
        results.push(followRes);

        if (this.abortController.signal.aborted) return results;

        // 4. COMENTÁRIOS ESTRATÉGICOS
        console.log('[GrowthEngine] 📍 Fase 4: Comentários estratégicos...');
        const commentRes = await this.strategicCommenting(cfg.comments);
        results.push(commentRes);

        // RELATÓRIO
        const todayStats = this.getTodayStats();
        console.log(`[GrowthEngine] 📊 RELATÓRIO DA SESSÃO:`);
        console.log(`   Follows: ${todayStats.followsPerformed}`);
        console.log(`   Unfollows: ${todayStats.unfollowsPerformed}`);
        console.log(`   Curtidas: ${todayStats.likesSent}`);
        console.log(`   Comentários: ${todayStats.commentsSent}`);
        console.log(`   Projeção: ~${Math.round(todayStats.followsPerformed * 0.3)} novos seguidores (30% conv.)`);

        return results;
    }

    abortSession(): void {
        if (this.abortController) {
            this.abortController.abort();
            console.log('[GrowthEngine] ⛔ Sessão abortada pelo usuário');
        }
    }
}
