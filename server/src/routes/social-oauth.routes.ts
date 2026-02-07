// ============================================================================
// Social OAuth Routes — Autenticação com Instagram e Twitter/X
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';
import {
    saveSocialToken,
    getUserTokens,
    getPublicTokenById,
    deactivateToken,
    updateTokenCredentials,
} from '../services/social-token.store.js';
import {
    getInstagramAuthUrl,
    handleInstagramCallback,
    refreshInstagramToken,
    validateInstagramToken,
} from '../services/instagram.service.js';
import {
    getTwitterAuthUrl,
    handleTwitterCallback,
    refreshTwitterToken,
    validateTwitterToken,
} from '../services/twitter.service.js';
import { getTokenById } from '../services/social-token.store.js';

const router = Router();

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

// ── Instagram OAuth ────────────────────────────────────────────────────────

/**
 * POST /api/social/oauth/instagram/init
 * Gera URL de autorização do Instagram (via Facebook Login)
 */
router.post('/instagram/init', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;

    if (!process.env.META_APP_ID || !process.env.META_APP_SECRET) {
        res.status(503).json({
            success: false,
            error: 'Integração com Instagram não configurada. Configure META_APP_ID e META_APP_SECRET.',
        });
        return;
    }

    const { authorizationUrl, state } = getInstagramAuthUrl(userId);

    res.json({
        success: true,
        data: { authorizationUrl, state },
    });
}));

/**
 * GET /api/social/oauth/instagram/callback
 * Callback do OAuth do Instagram
 */
router.get('/instagram/callback', asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
        // Redirecionar para frontend com erro
        const frontendUrl = process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/social-hub?error=${encodeURIComponent(oauthError as string)}`);
        return;
    }

    if (!code || !state) {
        res.status(400).json({ success: false, error: 'Parâmetros code e state são obrigatórios' });
        return;
    }

    try {
        const result = await handleInstagramCallback(code as string, state as string);

        // Salvar token no store
        const publicToken = saveSocialToken(result.userId, 'instagram', {
            providerUserId: result.providerUserId,
            providerUsername: result.providerUsername,
            profilePictureUrl: result.profilePictureUrl,
            accessToken: result.accessToken,
            tokenExpiresAt: result.tokenExpiresAt,
            scopes: result.scopes,
            metadata: result.metadata,
        });

        // Redirecionar para o frontend com sucesso
        const frontendUrl = process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/social-hub?connected=instagram&username=${encodeURIComponent(result.providerUsername)}`);
    } catch (err) {
        console.error('[SocialOAuth] Erro no callback Instagram:', err);
        const frontendUrl = process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:5173';
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        res.redirect(`${frontendUrl}/social-hub?error=${encodeURIComponent(msg)}`);
    }
}));

// ── Twitter/X OAuth ────────────────────────────────────────────────────────

/**
 * POST /api/social/oauth/twitter/init
 * Gera URL de autorização do Twitter (OAuth 2.0 PKCE)
 */
router.post('/twitter/init', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;

    if (!process.env.TWITTER_CLIENT_ID || !process.env.TWITTER_CLIENT_SECRET) {
        res.status(503).json({
            success: false,
            error: 'Integração com Twitter/X não configurada. Configure TWITTER_CLIENT_ID e TWITTER_CLIENT_SECRET.',
        });
        return;
    }

    const { authorizationUrl, state } = getTwitterAuthUrl(userId);

    res.json({
        success: true,
        data: { authorizationUrl, state },
    });
}));

/**
 * GET /api/social/oauth/twitter/callback
 * Callback do OAuth do Twitter
 */
router.get('/twitter/callback', asyncHandler(async (req: Request, res: Response) => {
    const { code, state, error: oauthError } = req.query;

    if (oauthError) {
        const frontendUrl = process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/social-hub?error=${encodeURIComponent(oauthError as string)}`);
        return;
    }

    if (!code || !state) {
        res.status(400).json({ success: false, error: 'Parâmetros code e state são obrigatórios' });
        return;
    }

    try {
        const result = await handleTwitterCallback(code as string, state as string);

        // Salvar token no store
        const publicToken = saveSocialToken(result.userId, 'twitter', {
            providerUserId: result.providerUserId,
            providerUsername: result.providerUsername,
            profilePictureUrl: result.profilePictureUrl,
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            tokenExpiresAt: result.tokenExpiresAt,
            scopes: result.scopes,
            metadata: result.metadata,
        });

        const frontendUrl = process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:5173';
        res.redirect(`${frontendUrl}/social-hub?connected=twitter&username=${encodeURIComponent(result.providerUsername)}`);
    } catch (err) {
        console.error('[SocialOAuth] Erro no callback Twitter:', err);
        const frontendUrl = process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:5173';
        const msg = err instanceof Error ? err.message : 'Erro desconhecido';
        res.redirect(`${frontendUrl}/social-hub?error=${encodeURIComponent(msg)}`);
    }
}));

// ── Gerenciamento de Conexões ──────────────────────────────────────────────

/**
 * GET /api/social/connections
 * Lista todas as contas sociais conectadas do usuário
 */
router.get('/connections', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const tokens = getUserTokens(userId);

    res.json({ success: true, data: tokens });
}));

/**
 * DELETE /api/social/connections/:id
 * Desconecta uma conta social
 */
router.delete('/connections/:id', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const tokenId = req.params.id as string;

    try {
        deactivateToken(tokenId, userId);
        res.json({ success: true, message: 'Conta desconectada com sucesso' });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao desconectar';
        res.status(400).json({ success: false, error: msg });
    }
}));

/**
 * POST /api/social/connections/:id/refresh
 * Força refresh do token OAuth
 */
router.post('/connections/:id/refresh', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const tokenId = req.params.id as string;

    const token = getTokenById(tokenId);
    if (!token || token.userId !== userId) {
        res.status(404).json({ success: false, error: 'Conexão não encontrada' });
        return;
    }

    try {
        let newCredentials: { accessToken: string; refreshToken?: string; tokenExpiresAt: string };

        if (token.provider === 'instagram') {
            newCredentials = await refreshInstagramToken(token);
        } else if (token.provider === 'twitter') {
            newCredentials = await refreshTwitterToken(token);
        } else {
            res.status(400).json({ success: false, error: 'Provider não suportado' });
            return;
        }

        const updated = updateTokenCredentials(
            tokenId,
            newCredentials.accessToken,
            newCredentials.refreshToken,
            newCredentials.tokenExpiresAt
        );

        res.json({
            success: true,
            data: updated,
            message: 'Token renovado com sucesso',
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao renovar token';
        res.status(400).json({ success: false, error: msg });
    }
}));

/**
 * POST /api/social/connections/:id/validate
 * Valida se o token ainda é válido na rede social
 */
router.post('/connections/:id/validate', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const tokenId = req.params.id as string;

    const token = getTokenById(tokenId);
    if (!token || token.userId !== userId) {
        res.status(404).json({ success: false, error: 'Conexão não encontrada' });
        return;
    }

    let isValid = false;
    if (token.provider === 'instagram') {
        isValid = await validateInstagramToken(token);
    } else if (token.provider === 'twitter') {
        isValid = await validateTwitterToken(token);
    }

    res.json({
        success: true,
        data: {
            isValid,
            provider: token.provider,
            username: token.providerUsername,
            expiresAt: token.tokenExpiresAt,
        },
    });
}));

export default router;
