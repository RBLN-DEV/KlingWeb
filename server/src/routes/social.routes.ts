// ============================================================================
// Social Routes — Router principal do módulo de redes sociais
// ============================================================================
// Monta todos os sub-routers:
//   /api/social/oauth/*       → Autenticação OAuth (Instagram, Twitter)
//   /api/social/publish/*     → Publicação de mídia
//   /api/social/webhooks/*    → Webhooks (Instagram)
//   /api/social/dashboard/*   → Métricas e analytics
//   /api/social/connections/* → Gerenciamento de contas (via oauth routes)
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import socialOAuthRoutes from './social-oauth.routes.js';
import socialPublishRoutes from './social-publish.routes.js';
import socialWebhookRoutes from './social-webhook.routes.js';
import socialDashboardRoutes from './social-dashboard.routes.js';
import socialUnofficialRoutes from './social-unofficial.routes.js';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';
import { engagementService } from '../services/engagement.service.js';

const router = Router();

// ── Middleware de autenticação (para rotas de engagement) ──────────────────

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
        res.status(401).json({ success: false, error: 'Token inválido ou expirado', code: 'INVALID_TOKEN' });
    }
}

// OAuth e Conexões (API Oficial)
router.use('/oauth', socialOAuthRoutes);
// Montar rotas de connections diretamente em /api/social/ (frontend busca /api/social/connections)
router.use('/', socialOAuthRoutes);

// Autenticação Não-Oficial (username/password)
router.use('/unofficial', socialUnofficialRoutes);

// Publicação
router.use('/publish', socialPublishRoutes);

// Publicações (GET/DELETE/retry — compartilham router de publish)
router.use('/', socialPublishRoutes);

// Webhooks (sem autenticação — verificado via assinatura)
router.use('/webhooks', socialWebhookRoutes);

// Dashboard e métricas
router.use('/dashboard', socialDashboardRoutes);

// ── Rotas de Engagement (por publicação) ───────────────────────────────────

/**
 * GET /api/social/engagement/:publicationId
 * Métricas atuais de uma publicação específica
 */
router.get('/engagement/:publicationId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const publicationId = req.params.publicationId as string;
    const summary = engagementService.getEngagementSummary(publicationId);

    res.json({ success: true, data: summary });
}));

/**
 * GET /api/social/engagement/history/:publicationId
 * Histórico de métricas para gráficos
 */
router.get('/engagement/history/:publicationId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const publicationId = req.params.publicationId as string;
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const history = engagementService.getMetricsHistory(publicationId, limit);

    res.json({ success: true, data: history });
}));

/**
 * POST /api/social/engagement/refresh/:publicationId
 * Força coleta imediata de métricas
 */
router.post('/engagement/refresh/:publicationId', requireAuth, asyncHandler(async (req: Request, res: Response) => {
    const publicationId = req.params.publicationId as string;
    const snapshot = await engagementService.collectNow(publicationId);

    if (!snapshot) {
        res.status(404).json({
            success: false,
            error: 'Publicação não encontrada ou sem dados de post',
        });
        return;
    }

    res.json({ success: true, data: snapshot });
}));

export default router;
