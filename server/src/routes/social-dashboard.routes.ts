// ============================================================================
// Social Dashboard Routes — Métricas e analytics de engajamento
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';
import { getUserTokens } from '../services/social-token.store.js';
import { socialQueue } from '../services/social-queue.service.js';
import { rateLimiter } from '../services/rate-limiter.service.js';
import type {
    Publication,
    EngagementSnapshot,
    DashboardSummary,
    DashboardPeriod,
    DashboardChartData,
    TopPost,
    SocialProvider,
} from '../types/social.types.js';

const router = Router();

// ── Data Layer ─────────────────────────────────────────────────────────────

import { DATA_DIR } from '../services/data-dir.js';

function readPublications(): Publication[] {
    const file = path.join(DATA_DIR, 'publications.json');
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

function readEngagementMetrics(): EngagementSnapshot[] {
    const file = path.join(DATA_DIR, 'engagement-metrics.json');
    if (!fs.existsSync(file)) return [];
    try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch { return []; }
}

// ── Middleware de Autenticação ──────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Token não fornecido' });
        return;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        const user = getUserById(decoded.userId);

        if (!user) {
            res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.', code: 'SESSION_EXPIRED' });
            return;
        }

        if (user.status !== 'approved') {
            res.status(403).json({ success: false, error: 'Conta pendente de aprovação', code: 'NOT_APPROVED' });
            return;
        }

        (req as any).userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }
}

router.use(requireAuth);

// ── Helpers ────────────────────────────────────────────────────────────────

function getPeriodMs(period: DashboardPeriod): number {
    switch (period) {
        case '7d': return 7 * 24 * 60 * 60 * 1000;
        case '30d': return 30 * 24 * 60 * 60 * 1000;
        case '90d': return 90 * 24 * 60 * 60 * 1000;
    }
}

function getLatestMetrics(publicationId: string, metrics: EngagementSnapshot[]): EngagementSnapshot | undefined {
    return metrics
        .filter(m => m.publicationId === publicationId)
        .sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime())[0];
}

// ── Rotas ──────────────────────────────────────────────────────────────────

/**
 * GET /api/social/dashboard/summary
 * Cards de resumo (total posts, likes, reach, engagement rate)
 */
router.get('/summary', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const period = (req.query.period as DashboardPeriod) || '7d';

    const now = Date.now();
    const periodMs = getPeriodMs(period);
    const periodStart = new Date(now - periodMs);
    const prevPeriodStart = new Date(now - periodMs * 2);

    const allPubs = readPublications().filter(p => p.userId === userId && p.status === 'published');
    const allMetrics = readEngagementMetrics();

    // Publicações no período atual
    const currentPubs = allPubs.filter(p => new Date(p.publishedAt || p.createdAt) >= periodStart);
    const prevPubs = allPubs.filter(p => {
        const date = new Date(p.publishedAt || p.createdAt);
        return date >= prevPeriodStart && date < periodStart;
    });

    // Agregar métricas
    let totalLikes = 0, totalReach = 0, totalEngRate = 0, engCount = 0;
    let prevLikes = 0, prevReach = 0;
    const byProvider: DashboardSummary['byProvider'] = {
        instagram: { posts: 0, likes: 0, reach: 0, engagementRate: 0 },
        twitter: { posts: 0, likes: 0, reach: 0, engagementRate: 0 },
    };

    for (const pub of currentPubs) {
        const latest = getLatestMetrics(pub.id, allMetrics);
        if (latest) {
            totalLikes += latest.metrics.likes;
            totalReach += latest.metrics.reach;
            totalEngRate += latest.metrics.engagementRate;
            engCount++;

            byProvider[pub.provider].posts++;
            byProvider[pub.provider].likes += latest.metrics.likes;
            byProvider[pub.provider].reach += latest.metrics.reach;
        } else {
            byProvider[pub.provider].posts++;
        }
    }

    for (const pub of prevPubs) {
        const latest = getLatestMetrics(pub.id, allMetrics);
        if (latest) {
            prevLikes += latest.metrics.likes;
            prevReach += latest.metrics.reach;
        }
    }

    // Calcular engagement rates por provider
    for (const prov of ['instagram', 'twitter'] as SocialProvider[]) {
        const provPubs = currentPubs.filter(p => p.provider === prov);
        let provEngRate = 0, provEngCount = 0;
        for (const pub of provPubs) {
            const latest = getLatestMetrics(pub.id, allMetrics);
            if (latest) { provEngRate += latest.metrics.engagementRate; provEngCount++; }
        }
        byProvider[prov].engagementRate = provEngCount > 0 ? provEngRate / provEngCount : 0;
    }

    const summary: DashboardSummary = {
        period,
        totalPosts: currentPubs.length,
        totalPostsDelta: currentPubs.length - prevPubs.length,
        totalLikes,
        totalLikesDelta: totalLikes - prevLikes,
        totalReach,
        totalReachDelta: totalReach - prevReach,
        avgEngagementRate: engCount > 0 ? totalEngRate / engCount : 0,
        avgEngagementRateDelta: 0, // TODO: calcular delta real
        byProvider,
    };

    res.json({ success: true, data: summary });
}));

/**
 * GET /api/social/dashboard/chart
 * Dados para gráfico de engajamento (time-series)
 */
router.get('/chart', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const period = (req.query.period as DashboardPeriod) || '7d';
    const provider = (req.query.provider as string) || 'all';

    const periodMs = getPeriodMs(period);
    const periodStart = new Date(Date.now() - periodMs);

    const pubs = readPublications().filter(p => {
        if (p.userId !== userId || p.status !== 'published') return false;
        if (provider !== 'all' && p.provider !== provider) return false;
        return new Date(p.publishedAt || p.createdAt) >= periodStart;
    });

    const allMetrics = readEngagementMetrics();

    // Agrupar por dia
    const dailyMap: Record<string, { likes: number; comments: number; shares: number; impressions: number; reach: number }> = {};

    for (const pub of pubs) {
        const latest = getLatestMetrics(pub.id, allMetrics);
        if (!latest) continue;

        const date = (pub.publishedAt || pub.createdAt).split('T')[0];
        if (!dailyMap[date]) {
            dailyMap[date] = { likes: 0, comments: 0, shares: 0, impressions: 0, reach: 0 };
        }

        dailyMap[date].likes += latest.metrics.likes;
        dailyMap[date].comments += latest.metrics.comments;
        dailyMap[date].shares += latest.metrics.shares;
        dailyMap[date].impressions += latest.metrics.impressions;
        dailyMap[date].reach += latest.metrics.reach;
    }

    // Converter para array ordenado
    const dataPoints = Object.entries(dailyMap)
        .map(([date, metrics]) => ({ date, ...metrics }))
        .sort((a, b) => a.date.localeCompare(b.date));

    const chartData: DashboardChartData = {
        period,
        provider: provider as any,
        dataPoints,
    };

    res.json({ success: true, data: chartData });
}));

/**
 * GET /api/social/dashboard/top-posts
 * Top N posts por engajamento
 */
router.get('/top-posts', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const limit = parseInt((req.query.limit as string) || '10', 10);

    const pubs = readPublications().filter(p => p.userId === userId && p.status === 'published');
    const allMetrics = readEngagementMetrics();

    const postsWithMetrics: TopPost[] = [];

    for (const pub of pubs) {
        const latest = getLatestMetrics(pub.id, allMetrics);
        const totalEngagement = latest
            ? latest.metrics.likes + latest.metrics.comments + latest.metrics.shares
            : 0;

        postsWithMetrics.push({
            publicationId: pub.id,
            provider: pub.provider,
            mediaType: pub.mediaType,
            caption: pub.caption.slice(0, 100),
            postUrl: pub.providerPostUrl || '',
            metrics: {
                likes: latest?.metrics.likes || 0,
                comments: latest?.metrics.comments || 0,
                shares: latest?.metrics.shares || 0,
                engagementRate: latest?.metrics.engagementRate || 0,
            },
            publishedAt: pub.publishedAt || pub.createdAt,
        });
    }

    // Ordenar por engagement total (likes + comments + shares)
    postsWithMetrics.sort((a, b) => {
        const engA = a.metrics.likes + a.metrics.comments + a.metrics.shares;
        const engB = b.metrics.likes + b.metrics.comments + b.metrics.shares;
        return engB - engA;
    });

    res.json({ success: true, data: postsWithMetrics.slice(0, limit) });
}));

/**
 * GET /api/social/dashboard/comparison
 * Comparativo entre redes sociais
 */
router.get('/comparison', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const period = (req.query.period as DashboardPeriod) || '30d';

    const periodMs = getPeriodMs(period);
    const periodStart = new Date(Date.now() - periodMs);

    const pubs = readPublications().filter(p =>
        p.userId === userId
        && p.status === 'published'
        && new Date(p.publishedAt || p.createdAt) >= periodStart
    );

    const allMetrics = readEngagementMetrics();

    const comparison: Record<SocialProvider, {
        posts: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        totalReach: number;
        avgEngagementRate: number;
    }> = {
        instagram: { posts: 0, totalLikes: 0, totalComments: 0, totalShares: 0, totalReach: 0, avgEngagementRate: 0 },
        twitter: { posts: 0, totalLikes: 0, totalComments: 0, totalShares: 0, totalReach: 0, avgEngagementRate: 0 },
    };

    for (const pub of pubs) {
        const latest = getLatestMetrics(pub.id, allMetrics);
        const prov = comparison[pub.provider];
        prov.posts++;
        if (latest) {
            prov.totalLikes += latest.metrics.likes;
            prov.totalComments += latest.metrics.comments;
            prov.totalShares += latest.metrics.shares;
            prov.totalReach += latest.metrics.reach;
            prov.avgEngagementRate += latest.metrics.engagementRate;
        }
    }

    // Calcular média
    for (const prov of ['instagram', 'twitter'] as SocialProvider[]) {
        if (comparison[prov].posts > 0) {
            comparison[prov].avgEngagementRate /= comparison[prov].posts;
        }
    }

    res.json({ success: true, data: comparison });
}));

/**
 * GET /api/social/dashboard/queue-status
 * Status da fila de processamento (admin/debug)
 */
router.get('/queue-status', asyncHandler(async (req: Request, res: Response) => {
    const stats = socialQueue.getStats();
    const recentJobs = socialQueue.listJobs({ limit: 20 });

    res.json({
        success: true,
        data: { stats, recentJobs },
    });
}));

/**
 * GET /api/social/dashboard/rate-limits
 * Status dos rate limits do usuário
 */
router.get('/rate-limits', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const provider = req.query.provider as SocialProvider | undefined;

    const status = rateLimiter.getStatus(userId, provider);

    res.json({ success: true, data: status });
}));

export default router;
