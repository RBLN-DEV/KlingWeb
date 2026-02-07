// ============================================================================
// Social Unofficial Auth Routes — Login com username/password
// ============================================================================
// Rotas para autenticação não-oficial (sem OAuth, sem API keys).
// Login direto com credenciais do Instagram e Twitter.
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';
import {
    saveSocialToken,
    getUserTokens,
    getTokenById,
    deactivateToken,
    updateTokenCredentials,
} from '../services/social-token.store.js';
import {
    loginInstagramUnofficial,
    validateInstagramSession,
    getInstagramProfileInfo,
} from '../services/instagram-unofficial.service.js';
import {
    loginTwitterUnofficial,
    validateTwitterSession,
    getTwitterProfileInfo,
} from '../services/twitter-unofficial.service.js';
import { encrypt } from '../services/crypto.service.js';

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
        res.status(401).json({ success: false, error: 'Token inválido ou expirado', code: 'INVALID_TOKEN' });
    }
}

router.use(requireAuth);

// ── Instagram Login ────────────────────────────────────────────────────────

/**
 * POST /api/social/unofficial/instagram/login
 * Login no Instagram com username/password
 */
router.post('/instagram/login', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({
            success: false,
            error: 'Username e password são obrigatórios',
        });
        return;
    }

    try {
        const session = await loginInstagramUnofficial({ username, password });

        // Salvar token no store (sem expiração — sessão por cookies)
        // Token "nunca expira" (cookies duram ~90 dias no Instagram)
        const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const publicToken = saveSocialToken(userId, 'instagram', {
            providerUserId: session.userId,
            providerUsername: session.username,
            profilePictureUrl: session.profilePicUrl,
            accessToken: 'unofficial-session', // placeholder — cookies são o real auth
            tokenExpiresAt,
            scopes: ['unofficial', 'publish_photo', 'publish_video', 'publish_story'],
            metadata: {
                instagramBusinessAccountId: session.userId,
                igCookies: encrypt(session.cookies),
                igPassword: encrypt(password),
                authMode: 'unofficial',
            },
        });

        res.json({
            success: true,
            data: {
                ...publicToken,
                profile: {
                    fullName: session.fullName,
                    followersCount: session.followersCount,
                    followingCount: session.followingCount,
                    mediaCount: session.mediaCount,
                },
            },
            message: `Instagram @${session.username} conectado com sucesso!`,
        });
    } catch (err: any) {
        console.error('[Social-Unofficial] Erro login Instagram:', err);

        let errorMsg = 'Erro ao conectar Instagram';
        if (err.name === 'IgLoginBadPasswordError') {
            errorMsg = 'Senha incorreta';
        } else if (err.name === 'IgLoginInvalidUserError') {
            errorMsg = 'Usuário não encontrado';
        } else if (err.name === 'IgLoginTwoFactorRequiredError') {
            errorMsg = 'Autenticação de dois fatores (2FA) necessária. Desative temporariamente ou use um app authenticator.';
        } else if (err.name === 'IgCheckpointError') {
            errorMsg = 'Instagram solicitou verificação de segurança. Verifique seu email/telefone e tente novamente.';
        } else if (err.name === 'IgChallengeWrongCodeError') {
            errorMsg = 'Código de verificação incorreto';
        } else if (err.message) {
            errorMsg = err.message;
        }

        res.status(400).json({ success: false, error: errorMsg });
    }
}));

// ── Twitter Login ──────────────────────────────────────────────────────────

/**
 * POST /api/social/unofficial/twitter/login
 * Login no Twitter com username/password/email
 */
router.post('/twitter/login', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { username, password, email, twoFactorSecret } = req.body;

    if (!username || !password) {
        res.status(400).json({
            success: false,
            error: 'Username e password são obrigatórios',
        });
        return;
    }

    try {
        const session = await loginTwitterUnofficial({
            username,
            password,
            email,
            twoFactorSecret,
        });

        // Token "nunca expira" (cookies de sessão)
        const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const publicToken = saveSocialToken(userId, 'twitter', {
            providerUserId: session.userId,
            providerUsername: session.username,
            profilePictureUrl: session.profilePicUrl,
            accessToken: 'unofficial-session',
            tokenExpiresAt,
            scopes: ['unofficial', 'tweet_read', 'tweet_write'],
            metadata: {
                twCookies: encrypt(session.cookies),
                twPassword: encrypt(password),
                twEmail: email ? encrypt(email) : undefined,
                authMode: 'unofficial',
            },
        });

        res.json({
            success: true,
            data: {
                ...publicToken,
                profile: {
                    displayName: session.displayName,
                    followersCount: session.followersCount,
                    followingCount: session.followingCount,
                    tweetsCount: session.tweetsCount,
                },
            },
            message: `Twitter @${session.username} conectado com sucesso!`,
        });
    } catch (err: any) {
        console.error('[Social-Unofficial] Erro login Twitter:', err);

        let errorMsg = 'Erro ao conectar Twitter';
        if (err.message?.includes('Authentication')) {
            errorMsg = 'Falha na autenticação. Verifique credenciais e tente incluir o email.';
        } else if (err.message?.includes('two factor') || err.message?.includes('2fa')) {
            errorMsg = 'Autenticação de dois fatores (2FA) necessária.';
        } else if (err.message) {
            errorMsg = err.message;
        }

        res.status(400).json({ success: false, error: errorMsg });
    }
}));

// ── Gerenciamento de Conexões ──────────────────────────────────────────────

/**
 * GET /api/social/unofficial/connections
 * Lista contas conectadas (mesma lógica do OAuth)
 */
router.get('/connections', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const tokens = getUserTokens(userId);
    res.json({ success: true, data: tokens });
}));

/**
 * DELETE /api/social/unofficial/connections/:id
 * Desconecta conta
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
 * POST /api/social/unofficial/connections/:id/validate
 * Valida se a sessão ainda é válida
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
        isValid = await validateInstagramSession(token);
    } else if (token.provider === 'twitter') {
        isValid = await validateTwitterSession(token);
    }

    res.json({
        success: true,
        data: {
            isValid,
            provider: token.provider,
            username: token.providerUsername,
            expiresAt: token.tokenExpiresAt,
            authMode: token.metadata.authMode || 'official',
        },
    });
}));

/**
 * POST /api/social/unofficial/connections/:id/refresh
 * Re-login para renovar sessão
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
        if (token.provider === 'instagram') {
            // Re-login automático — getOrRestoreClient já faz isso
            const isValid = await validateInstagramSession(token);
            if (!isValid) {
                throw new Error('Sessão expirada. Reconecte a conta.');
            }

            // Atualizar perfil
            const profile = await getInstagramProfileInfo(token);
            const newExpires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
            const updated = updateTokenCredentials(tokenId, 'unofficial-session', undefined, newExpires);

            res.json({
                success: true,
                data: { ...updated, profile },
                message: 'Sessão Instagram renovada',
            });
        } else if (token.provider === 'twitter') {
            const isValid = await validateTwitterSession(token);
            if (!isValid) {
                throw new Error('Sessão expirada. Reconecte a conta.');
            }

            const profile = await getTwitterProfileInfo(token);
            const newExpires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
            const updated = updateTokenCredentials(tokenId, 'unofficial-session', undefined, newExpires);

            res.json({
                success: true,
                data: { ...updated, profile },
                message: 'Sessão Twitter renovada',
            });
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Erro ao renovar sessão';
        res.status(400).json({ success: false, error: msg });
    }
}));

export default router;
