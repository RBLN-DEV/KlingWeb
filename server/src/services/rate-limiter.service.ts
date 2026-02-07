// ============================================================================
// Rate Limiter Service — Controle de rate limiting por plataforma
// ============================================================================
// Implementa controle de taxa de requisições para Instagram e Twitter APIs.
// Monitora headers de resposta das APIs para ajustar limites em tempo real.
// ============================================================================

import type { RateLimitConfig, RateLimitState, SocialProvider } from '../types/social.types.js';

// ── Configurações padrão por plataforma ────────────────────────────────────

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
    // Instagram (Meta Graph API)
    'instagram:content_publish': {
        maxRequests: 25,
        windowMs: 24 * 60 * 60 * 1000,    // 24 horas
        provider: 'instagram',
        endpoint: 'content_publish',
    },
    'instagram:api_calls': {
        maxRequests: 200,
        windowMs: 60 * 60 * 1000,          // 1 hora
        provider: 'instagram',
        endpoint: 'api_calls',
    },
    'instagram:graph_api': {
        maxRequests: 4800,
        windowMs: 24 * 60 * 60 * 1000,
        provider: 'instagram',
        endpoint: 'graph_api',
    },
    'instagram:insights': {
        maxRequests: 200,
        windowMs: 60 * 60 * 1000,
        provider: 'instagram',
        endpoint: 'insights',
    },

    // Twitter/X (API v2)
    'twitter:tweets_create': {
        maxRequests: 200,
        windowMs: 15 * 60 * 1000,          // 15 minutos
        provider: 'twitter',
        endpoint: 'tweets_create',
    },
    'twitter:media_upload': {
        maxRequests: 615,
        windowMs: 15 * 60 * 1000,
        provider: 'twitter',
        endpoint: 'media_upload',
    },
    'twitter:tweets_read': {
        maxRequests: 900,
        windowMs: 15 * 60 * 1000,
        provider: 'twitter',
        endpoint: 'tweets_read',
    },
    'twitter:users_read': {
        maxRequests: 900,
        windowMs: 15 * 60 * 1000,
        provider: 'twitter',
        endpoint: 'users_read',
    },
};

// ── Classe RateLimiterService ──────────────────────────────────────────────

export class RateLimiterService {
    private states: Map<string, RateLimitState> = new Map();
    private static instance: RateLimiterService;

    private constructor() {}

    static getInstance(): RateLimiterService {
        if (!RateLimiterService.instance) {
            RateLimiterService.instance = new RateLimiterService();
        }
        return RateLimiterService.instance;
    }

    /**
     * Gera chave única: userId:provider:endpoint
     */
    private getKey(userId: string, config: RateLimitConfig): string {
        return `${userId}:${config.provider}:${config.endpoint}`;
    }

    /**
     * Obtém ou cria o estado de rate limit para uma chave
     */
    private getState(key: string, config: RateLimitConfig): RateLimitState {
        let state = this.states.get(key);
        const now = Date.now();

        if (!state || now >= state.resetAt) {
            // Janela expirou ou primeiro uso → reset
            state = {
                key,
                requests: 0,
                windowStart: now,
                resetAt: now + config.windowMs,
            };
            this.states.set(key, state);
        }

        return state;
    }

    /**
     * Verifica se uma request pode ser feita
     */
    canMakeRequest(
        userId: string,
        configKey: string
    ): { allowed: boolean; retryAfterMs?: number; remainingRequests?: number } {
        const config = RATE_LIMITS[configKey];
        if (!config) {
            // Config não encontrada — permitir (fail-open)
            console.warn(`[RateLimiter] Config não encontrada: ${configKey}`);
            return { allowed: true };
        }

        const key = this.getKey(userId, config);
        const state = this.getState(key, config);
        const now = Date.now();

        // Se há um retryAfter ativo (da API), respeitar
        if (state.retryAfter && now < state.retryAfter) {
            return {
                allowed: false,
                retryAfterMs: state.retryAfter - now,
                remainingRequests: 0,
            };
        }

        const remaining = config.maxRequests - state.requests;

        if (remaining <= 0) {
            return {
                allowed: false,
                retryAfterMs: state.resetAt - now,
                remainingRequests: 0,
            };
        }

        return {
            allowed: true,
            remainingRequests: remaining,
        };
    }

    /**
     * Registra que uma request foi feita
     */
    recordRequest(userId: string, configKey: string): void {
        const config = RATE_LIMITS[configKey];
        if (!config) return;

        const key = this.getKey(userId, config);
        const state = this.getState(key, config);
        state.requests++;
        this.states.set(key, state);
    }

    /**
     * Atualiza estado a partir dos headers de rate limit da API
     * Instagram: x-app-usage, x-business-use-case-usage
     * Twitter: x-rate-limit-limit, x-rate-limit-remaining, x-rate-limit-reset
     */
    updateFromHeaders(
        userId: string,
        provider: SocialProvider,
        endpoint: string,
        headers: Record<string, string>
    ): void {
        const configKey = `${provider}:${endpoint}`;
        const config = RATE_LIMITS[configKey];
        if (!config) return;

        const key = this.getKey(userId, config);

        if (provider === 'twitter') {
            this.updateFromTwitterHeaders(key, config, headers);
        } else if (provider === 'instagram') {
            this.updateFromInstagramHeaders(key, config, headers);
        }
    }

    /**
     * Processa headers de rate limit do Twitter
     * x-rate-limit-limit: número máximo de requests
     * x-rate-limit-remaining: requests restantes
     * x-rate-limit-reset: timestamp unix de reset
     */
    private updateFromTwitterHeaders(
        key: string,
        config: RateLimitConfig,
        headers: Record<string, string>
    ): void {
        const limit = parseInt(headers['x-rate-limit-limit'] || '', 10);
        const remaining = parseInt(headers['x-rate-limit-remaining'] || '', 10);
        const reset = parseInt(headers['x-rate-limit-reset'] || '', 10);

        if (!isNaN(remaining) && !isNaN(reset)) {
            const state = this.getState(key, config);
            state.requests = (limit || config.maxRequests) - remaining;
            state.resetAt = reset * 1000; // Twitter retorna em segundos
            this.states.set(key, state);
        }
    }

    /**
     * Processa headers de rate limit do Instagram (Meta)
     * x-app-usage: {"call_count":N,"total_cputime":N,"total_time":N}
     * Quando qualquer campo chega a 100%, a app é throttled por ~1h
     */
    private updateFromInstagramHeaders(
        key: string,
        config: RateLimitConfig,
        headers: Record<string, string>
    ): void {
        const appUsage = headers['x-app-usage'];
        if (!appUsage) return;

        try {
            const usage = JSON.parse(appUsage);
            const callCount = usage.call_count || 0;

            if (callCount >= 100) {
                // App throttled — retry after 1 hora
                const state = this.getState(key, config);
                state.retryAfter = Date.now() + 60 * 60 * 1000;
                state.requests = config.maxRequests;
                this.states.set(key, state);
                console.warn(`[RateLimiter] Instagram app throttled (call_count: ${callCount}%)`);
            } else if (callCount >= 80) {
                console.warn(`[RateLimiter] Instagram app usage alto: ${callCount}%`);
            }
        } catch {
            // Headers malformados — ignorar
        }
    }

    /**
     * Marca que a API retornou 429 (Too Many Requests)
     * Aplica retryAfter se disponível nos headers
     */
    handleRateLimitResponse(
        userId: string,
        configKey: string,
        retryAfterSeconds?: number
    ): void {
        const config = RATE_LIMITS[configKey];
        if (!config) return;

        const key = this.getKey(userId, config);
        const state = this.getState(key, config);

        const retryMs = (retryAfterSeconds || 60) * 1000;
        state.retryAfter = Date.now() + retryMs;
        state.requests = config.maxRequests; // Assume estouro
        this.states.set(key, state);

        console.warn(`[RateLimiter] 429 recebido para ${configKey}. Retry after: ${retryAfterSeconds || 60}s`);
    }

    /**
     * Calcula delay com backoff exponencial
     * Base: 1s, multiplicador: 2, max: 5 min, jitter: ±500ms
     */
    static getBackoffDelay(retryCount: number): number {
        const base = 1000;
        const maxDelay = 5 * 60 * 1000;
        const delay = Math.min(base * Math.pow(2, retryCount), maxDelay);
        const jitter = Math.random() * 1000 - 500;
        return Math.max(100, delay + jitter);
    }

    /**
     * Obtém status de rate limit para debug/dashboard
     */
    getStatus(userId: string, provider?: SocialProvider): Record<string, {
        requests: number;
        maxRequests: number;
        remainingRequests: number;
        resetAt: string;
        isThrottled: boolean;
    }> {
        const result: Record<string, any> = {};

        for (const [configKey, config] of Object.entries(RATE_LIMITS)) {
            if (provider && config.provider !== provider) continue;

            const key = this.getKey(userId, config);
            const state = this.states.get(key);
            const now = Date.now();

            if (state && now < state.resetAt) {
                result[configKey] = {
                    requests: state.requests,
                    maxRequests: config.maxRequests,
                    remainingRequests: Math.max(0, config.maxRequests - state.requests),
                    resetAt: new Date(state.resetAt).toISOString(),
                    isThrottled: state.requests >= config.maxRequests || (!!state.retryAfter && now < state.retryAfter),
                };
            } else {
                result[configKey] = {
                    requests: 0,
                    maxRequests: config.maxRequests,
                    remainingRequests: config.maxRequests,
                    resetAt: new Date(now + config.windowMs).toISOString(),
                    isThrottled: false,
                };
            }
        }

        return result;
    }

    /**
     * Limpa estados expirados (GC)
     */
    cleanup(): void {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, state] of this.states.entries()) {
            if (now >= state.resetAt && (!state.retryAfter || now >= state.retryAfter)) {
                this.states.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[RateLimiter] Limpou ${cleaned} estados expirados`);
        }
    }
}

// Singleton export
export const rateLimiter = RateLimiterService.getInstance();

// Cleanup a cada 15 minutos
setInterval(() => rateLimiter.cleanup(), 15 * 60 * 1000);
