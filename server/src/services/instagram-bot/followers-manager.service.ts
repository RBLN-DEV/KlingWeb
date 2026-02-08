// ============================================================================
// Followers Manager — Gerenciamento avançado de seguidores
// ============================================================================
// Tradução TS do módulo Python docs/referencia/followers_manager.py
// Usa InstagramWebAPI para follow/unfollow/listas
// ============================================================================

import { InstagramWebAPI } from '../instagram-web-api.service.js';
import { BotRateLimiter } from './bot-rate-limiter.js';
import type { UserProfile, BotConfig } from './types.js';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, ensureDataDir } from '../data-dir.js';

const FOLLOWERS_FILE = path.join(DATA_DIR, 'bot_followers_data.json');
const WHITELIST_FILE = path.join(DATA_DIR, 'bot_whitelist.json');

function humanDelay(minMs = 2000, maxMs = 5000): Promise<void> {
    const ms = minMs + Math.random() * (maxMs - minMs);
    return new Promise(r => setTimeout(r, ms));
}

export class FollowersManager {
    public followedUsers: Map<string, UserProfile> = new Map();
    public whitelist: Set<string> = new Set();
    private dailyStats = { followsToday: 0, unfollowsToday: 0 };

    constructor(
        private api: InstagramWebAPI,
        private rateLimiter: BotRateLimiter,
        private config: BotConfig,
    ) {
        this.loadData();
    }

    // ── Persistência ───────────────────────────────────────────────────────

    loadData(): void {
        ensureDataDir();
        try {
            if (fs.existsSync(FOLLOWERS_FILE)) {
                const raw = JSON.parse(fs.readFileSync(FOLLOWERS_FILE, 'utf-8'));
                for (const [k, v] of Object.entries(raw)) {
                    this.followedUsers.set(k, v as UserProfile);
                }
                console.log(`[FollowersManager] ${this.followedUsers.size} usuários carregados`);
            }
        } catch (e) {
            console.error('[FollowersManager] Erro ao carregar dados:', e);
        }

        try {
            if (fs.existsSync(WHITELIST_FILE)) {
                const arr = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf-8'));
                this.whitelist = new Set(arr);
                console.log(`[FollowersManager] ${this.whitelist.size} na whitelist`);
            }
        } catch { /* */ }
    }

    saveData(): void {
        ensureDataDir();
        try {
            const obj: Record<string, UserProfile> = {};
            for (const [k, v] of this.followedUsers) obj[k] = v;
            const tmp = FOLLOWERS_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf-8');
            fs.renameSync(tmp, FOLLOWERS_FILE);

            const tmpW = WHITELIST_FILE + '.tmp';
            fs.writeFileSync(tmpW, JSON.stringify([...this.whitelist]), 'utf-8');
            fs.renameSync(tmpW, WHITELIST_FILE);
        } catch (e) {
            console.error('[FollowersManager] Erro ao salvar:', e);
        }
    }

    // ── Whitelist ──────────────────────────────────────────────────────────

    addToWhitelist(username: string): void {
        this.whitelist.add(username.toLowerCase().trim());
        this.saveData();
    }

    removeFromWhitelist(username: string): void {
        this.whitelist.delete(username.toLowerCase().trim());
        this.saveData();
    }

    isWhitelisted(username: string): boolean {
        return this.whitelist.has(username.toLowerCase().trim());
    }

    // ── Ações ──────────────────────────────────────────────────────────────

    async followUser(username: string, source = ''): Promise<boolean> {
        if (!this.rateLimiter.canPerform('follows', this.config.maxFollowsPerHour)) {
            return false;
        }

        const existing = this.followedUsers.get(username);
        if (existing && !existing.unfollowedAt) {
            console.log(`[FollowersManager] Já segue @${username}`);
            return false;
        }

        try {
            const userInfo = await this.api.getUserInfo(username);
            if (!userInfo) {
                console.log(`[FollowersManager] @${username} não encontrado`);
                return false;
            }

            const ok = await this.api.followUser(userInfo.pk);
            if (!ok) return false;

            this.followedUsers.set(username, {
                username,
                userId: String(userInfo.pk),
                followersCount: userInfo.followerCount,
                followingCount: userInfo.followingCount,
                isPrivate: userInfo.isPrivate,
                isVerified: userInfo.isVerified,
                followedAt: new Date().toISOString(),
                source,
            });

            this.rateLimiter.recordAction('follows');
            this.dailyStats.followsToday++;
            this.saveData();

            console.log(`[FollowersManager] ✅ Seguiu @${username} (source: ${source})`);
            await humanDelay(8000, 15000);
            return true;
        } catch (e: any) {
            console.error(`[FollowersManager] Erro ao seguir @${username}:`, e.message);
            return false;
        }
    }

    async unfollowUser(username: string, checkFollowsBack = true): Promise<boolean> {
        if (this.isWhitelisted(username)) {
            console.log(`[FollowersManager] 🛡️ @${username} na whitelist, mantendo`);
            return false;
        }

        if (!this.rateLimiter.canPerform('unfollows', this.config.maxUnfollowsPerHour)) {
            return false;
        }

        try {
            const userInfo = await this.api.getUserInfo(username);
            if (!userInfo) return false;

            // TODO: verificar se segue de volta (limitado na Web API)
            // Por enquanto, unfollow direto se check desligado

            const ok = await this.api.unfollowUser(userInfo.pk);
            if (!ok) return false;

            const existing = this.followedUsers.get(username);
            if (existing) {
                existing.unfollowedAt = new Date().toISOString();
            }

            this.rateLimiter.recordAction('unfollows');
            this.dailyStats.unfollowsToday++;
            this.saveData();

            console.log(`[FollowersManager] ✅ Unfollow @${username}`);
            await humanDelay(5000, 10000);
            return true;
        } catch (e: any) {
            console.error(`[FollowersManager] Erro ao unfollow @${username}:`, e.message);
            return false;
        }
    }

    async cleanNonFollowers(maxUnfollows = 50, daysBeforeUnfollow = 2): Promise<number> {
        console.log('[FollowersManager] 🧹 Limpando não-seguidores...');

        let unfollowed = 0;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - daysBeforeUnfollow);

        for (const [username, profile] of this.followedUsers) {
            if (unfollowed >= maxUnfollows) break;
            if (profile.unfollowedAt) continue;
            if (this.isWhitelisted(username)) continue;

            // Só limpa se seguiu há mais de X dias
            if (profile.followedAt) {
                const followedDate = new Date(profile.followedAt);
                if (followedDate > cutoff) continue;
            }

            if (await this.unfollowUser(username, true)) {
                unfollowed++;
            }
        }

        console.log(`[FollowersManager] ✅ Limpeza: ${unfollowed} unfollows`);
        return unfollowed;
    }

    // ── Estratégia: Seguir seguidores de alvo ──────────────────────────────

    async followFollowersOfTarget(
        targetUsername: string,
        maxFollows = 20,
    ): Promise<number> {
        console.log(`[FollowersManager] 🎯 Seguindo seguidores de @${targetUsername}...`);

        // A Web API não tem endpoint de listar followers diretamente,
        // mas podemos buscar info do perfil e curtidores de posts recentes
        // como proxy. Para seguidores reais, seria necessário a Private API.

        // Por enquanto, seguimos o próprio perfil alvo como demonstração
        let followed = 0;

        try {
            const targetInfo = await this.api.getUserInfo(targetUsername);
            if (!targetInfo) {
                console.log(`[FollowersManager] @${targetUsername} não encontrado`);
                return 0;
            }

            // Limitação: Web API não permite listar followers de outros.
            // Usamos como fallback a estratégia de likers.
            console.log(`[FollowersManager] ⚠️ Listagem de followers não disponível na Web API. Use a estratégia de likers.`);

        } catch (e: any) {
            console.error(`[FollowersManager] Erro:`, e.message);
        }

        return followed;
    }

    // ── Stats ──────────────────────────────────────────────────────────────

    getStats(): Record<string, any> {
        const total = this.followedUsers.size;
        let active = 0;
        let unfollowed = 0;
        const sources: Record<string, number> = {};

        for (const profile of this.followedUsers.values()) {
            if (profile.unfollowedAt) {
                unfollowed++;
            } else {
                active++;
            }
            const src = profile.source || 'unknown';
            sources[src] = (sources[src] || 0) + 1;
        }

        return {
            totalHistorico: total,
            seguindoAtivamente: active,
            unfollowsRealizados: unfollowed,
            whitelist: this.whitelist.size,
            porFonte: sources,
            hoje: { ...this.dailyStats },
        };
    }
}
