// ============================================================================
// Rate Limiter para Bot Instagram — Controle de ações por hora
// ============================================================================

export class BotRateLimiter {
    private actions: Record<string, number[]> = {
        likes: [],
        follows: [],
        unfollows: [],
        comments: [],
        stories: [],
    };

    canPerform(actionType: string, maxPerHour: number): boolean {
        const now = Date.now();
        const hourAgo = now - 3600_000;

        // Limpar ações antigas
        this.actions[actionType] = (this.actions[actionType] || []).filter(ts => ts > hourAgo);

        const can = this.actions[actionType].length < maxPerHour;
        if (!can) {
            console.warn(`[BotRateLimiter] Limite de '${actionType}' atingido (${this.actions[actionType].length}/${maxPerHour})`);
        }
        return can;
    }

    recordAction(actionType: string): void {
        if (!this.actions[actionType]) this.actions[actionType] = [];
        this.actions[actionType].push(Date.now());
    }

    getStats(): Record<string, number> {
        const now = Date.now();
        const hourAgo = now - 3600_000;
        const stats: Record<string, number> = {};

        for (const [action, timestamps] of Object.entries(this.actions)) {
            stats[action] = timestamps.filter(ts => ts > hourAgo).length;
        }
        return stats;
    }

    reset(): void {
        this.actions = { likes: [], follows: [], unfollows: [], comments: [], stories: [] };
    }
}
