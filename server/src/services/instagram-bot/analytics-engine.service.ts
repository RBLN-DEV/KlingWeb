// ============================================================================
// Analytics Engine — Motor de análise de dados Instagram
// ============================================================================
// Tradução TS de docs/referencia/analytics_engine.py
// ============================================================================

import { InstagramWebAPI } from '../instagram-web-api.service.js';
import type { AnalyticsData, BotConfig } from './types.js';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, ensureDataDir } from '../data-dir.js';

const ANALYTICS_FILE = path.join(DATA_DIR, 'bot_analytics_data.json');

export class AnalyticsEngine {
    private data: AnalyticsData;

    constructor(
        private api: InstagramWebAPI,
        private config: BotConfig,
    ) {
        this.data = this.loadData();
    }

    private loadData(): AnalyticsData {
        const defaults: AnalyticsData = {
            followerActivity: {},
            postPerformance: { totalAnalyzed: 0, avgEngagement: 0, posts: [] },
            bestTimes: { top5: [], allHours: [] },
        };

        try {
            if (fs.existsSync(ANALYTICS_FILE)) {
                return { ...defaults, ...JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8')) };
            }
        } catch { /* */ }

        return defaults;
    }

    saveData(): void {
        this.data.lastUpdated = new Date().toISOString();
        ensureDataDir();
        try {
            const tmp = ANALYTICS_FILE + '.tmp';
            fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf-8');
            fs.renameSync(tmp, ANALYTICS_FILE);
        } catch (e) {
            console.error('[AnalyticsEngine] Erro ao salvar:', e);
        }
    }

    // ── Atividade de seguidores (estimativa Brasil) ────────────────────────

    analyzeFollowerActivity(): Record<number, number> {
        // Estimativa baseada em dados gerais do Instagram Brasil
        const activity: Record<number, number> = {
            0: 20, 1: 10, 2: 5, 3: 5, 4: 8, 5: 12,
            6: 15, 7: 25, 8: 45, 9: 60, 10: 55, 11: 50,
            12: 70, 13: 75, 14: 60, 15: 50, 16: 45, 17: 55,
            18: 70, 19: 80, 20: 85, 21: 75, 22: 60, 23: 40,
        };

        this.data.followerActivity = activity;
        this.saveData();
        return activity;
    }

    // ── Melhores horários ──────────────────────────────────────────────────

    calculateBestPostingTimes(): Array<[number, number, string]> {
        const activity = Object.keys(this.data.followerActivity).length > 0
            ? this.data.followerActivity
            : this.analyzeFollowerActivity();

        const dayMultipliers: Record<number, number> = {
            0: 0.9,  // Segunda
            1: 1.0,  // Terça
            2: 1.1,  // Quarta (melhor)
            3: 1.0,  // Quinta
            4: 0.95, // Sexta
            5: 0.7,  // Sábado
            6: 0.6,  // Domingo
        };

        const today = new Date().getDay();
        // JS: 0=Dom, 1=Seg... Python: 0=Seg, 1=Ter...
        const pyDay = today === 0 ? 6 : today - 1;

        const scores: Array<[number, number, string]> = [];

        for (const [hourStr, baseActivity] of Object.entries(activity)) {
            const hour = parseInt(hourStr, 10);
            const score = Math.round(baseActivity * (dayMultipliers[pyDay] || 1.0));

            let recommendation: string;
            if (score >= 70) recommendation = '🟢 EXCELENTE';
            else if (score >= 50) recommendation = '🟡 BOM';
            else if (score >= 30) recommendation = '🟠 REGULAR';
            else recommendation = '🔴 EVITAR';

            scores.push([hour, score, recommendation]);
        }

        scores.sort((a, b) => b[1] - a[1]);

        this.data.bestTimes = {
            top5: scores.slice(0, 5),
            allHours: scores,
            updatedAt: new Date().toISOString(),
        };
        this.saveData();

        return scores;
    }

    getOptimalSchedule(postsPerDay = 2): string[] {
        const bestTimes = this.calculateBestPostingTimes();
        const topHours = bestTimes.slice(0, postsPerDay).map(t => t[0]);

        const now = new Date();
        const schedule: string[] = [];

        for (const hour of topHours.sort((a, b) => a - b)) {
            const postTime = new Date(now);
            postTime.setHours(hour, Math.floor(Math.random() * 30), 0, 0);

            if (postTime < now) {
                postTime.setDate(postTime.getDate() + 1);
            }

            schedule.push(postTime.toISOString());
        }

        return schedule;
    }

    // ── Performance de posts ───────────────────────────────────────────────

    async analyzePostPerformance(numPosts = 9): Promise<any> {
        console.log(`[AnalyticsEngine] 📈 Analisando ${numPosts} posts recentes...`);

        try {
            const myInfo = await this.api.getAccountInfo();
            if (!myInfo) {
                console.error('[AnalyticsEngine] Não autenticado');
                return {};
            }

            const medias = await this.api.getUserMedias(myInfo.username, numPosts);
            const performanceData: any[] = [];

            for (const media of medias) {
                performanceData.push({
                    likes: media.likeCount || 0,
                    comments: media.commentCount || 0,
                    engagement: (media.likeCount || 0) + ((media.commentCount || 0) * 2),
                    postedAt: media.takenAt?.toISOString?.() || null,
                    mediaType: media.mediaType,
                    caption: (media.captionText || '').slice(0, 100),
                    url: `https://www.instagram.com/p/${media.code}/`,
                });
            }

            if (performanceData.length > 0) {
                const avgEngagement = performanceData.reduce((s, p) => s + p.engagement, 0) / performanceData.length;
                const bestPost = performanceData.reduce((a, b) => a.engagement > b.engagement ? a : b);

                const analysis = {
                    totalAnalyzed: performanceData.length,
                    avgEngagement,
                    bestPost,
                    posts: performanceData,
                    analyzedAt: new Date().toISOString(),
                };

                this.data.postPerformance = analysis;
                this.saveData();

                console.log(`[AnalyticsEngine] ✅ ${performanceData.length} posts analisados`);
                return analysis;
            }
        } catch (e: any) {
            console.error('[AnalyticsEngine] Erro:', e.message);
        }

        return {};
    }

    // ── Relatório ──────────────────────────────────────────────────────────

    generateReport(): Record<string, any> {
        const bestTimes = this.calculateBestPostingTimes();
        const perf = this.data.postPerformance;

        return {
            bestPostingTimes: bestTimes.slice(0, 5).map(([hour, score, rec]) => ({
                hour: `${String(hour).padStart(2, '0')}:00`,
                score,
                recommendation: rec,
            })),
            postPerformance: {
                totalAnalyzed: perf.totalAnalyzed,
                avgEngagement: Math.round(perf.avgEngagement),
                bestPostEngagement: perf.bestPost?.engagement || 0,
            },
            recommendations: [
                `Poste entre ${String(bestTimes[0]?.[0] || 20).padStart(2, '0')}:00 e ${String(bestTimes[1]?.[0] || 19).padStart(2, '0')}:00 para máximo alcance`,
                'Evite postar antes das 07:00 e após 23:00',
                'Quarta-feira é o melhor dia da semana',
            ],
            weeklyGrowthProjection: {
                melhoresHorarios: bestTimes.slice(0, 3).map(t => t[0]),
                postsRecomendadosSemana: this.config.postsPerDay * 7,
            },
            lastUpdated: this.data.lastUpdated,
        };
    }

    exportBestTimes(): Record<string, any> {
        const bestTimes = this.calculateBestPostingTimes();
        return {
            primeiroPost: bestTimes[0]?.[0] || 9,
            segundoPost: bestTimes[1]?.[0] || 19,
            terceiroPost: bestTimes[2]?.[0] || 13,
            evitar: bestTimes.slice(-5).map(t => t[0]),
        };
    }

    getRawData(): AnalyticsData {
        return { ...this.data };
    }
}
