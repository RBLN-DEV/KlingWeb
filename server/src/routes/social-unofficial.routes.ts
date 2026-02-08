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
    loginInstagramWeb,
    validateInstagramWebSession,
    getInstagramProfileInfoWeb,
} from '../services/instagram-web-api.service.js';
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

    // Tentar Web API primeiro (melhor compatibilidade com proxy residencial)
    // Fallback para Mobile API se Web API falhar
    const hasProxy = !!process.env.INSTAGRAM_PROXY;

    console.log(`[Social-Unofficial] Instagram login @${username} (proxy=${hasProxy ? 'sim' : 'não'}, tentando Web API primeiro...)`);

    // ── Tentativa 1: Web API (emula Chrome, melhor com proxy) ──
    try {
        const session = await loginInstagramWeb({ username, password });

        const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const publicToken = saveSocialToken(userId, 'instagram', {
            providerUserId: session.userId,
            providerUsername: session.username,
            profilePictureUrl: session.profilePicUrl,
            accessToken: 'web-session',
            tokenExpiresAt,
            scopes: ['unofficial', 'web-api', 'publish_photo', 'publish_video', 'publish_story', 'publish_reel'],
            metadata: {
                instagramBusinessAccountId: session.userId,
                igCookies: encrypt(JSON.stringify(session.cookies)),
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
                apiMode: 'web',
            },
            message: `Instagram @${session.username} conectado com sucesso!`,
        });
        return;

    } catch (webErr: any) {
        console.warn(`[Social-Unofficial] Web API falhou para @${username}: ${webErr.message}. Tentando Mobile API...`);

        // Se Web API retornou erros definitivos, não tentar Mobile API
        if (webErr.message?.includes('CHECKPOINT_REQUIRED')) {
            res.status(403).json({
                success: false,
                error: 'Instagram solicitou verificação de segurança. Verifique seu email/telefone no app do Instagram e tente novamente.',
                requiresChallenge: true,
            });
            return;
        }
        if (webErr.message?.includes('TWO_FACTOR_REQUIRED')) {
            res.status(403).json({
                success: false,
                error: 'Autenticação de dois fatores (2FA) necessária. Desative temporariamente o 2FA.',
                requiresTwoFactor: true,
            });
            return;
        }
    }

    // ── Tentativa 2: Mobile API (fallback) ──
    try {
        const session = await loginInstagramUnofficial({ username, password });

        const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const publicToken = saveSocialToken(userId, 'instagram', {
            providerUserId: session.userId,
            providerUsername: session.username,
            profilePictureUrl: session.profilePicUrl,
            accessToken: 'unofficial-session',
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
                apiMode: 'mobile',
            },
            message: `Instagram @${session.username} conectado com sucesso!`,
        });
    } catch (err: any) {
        console.error('[Social-Unofficial] Ambas APIs falharam para Instagram:', err?.name, err?.message);

        let errorMsg = 'Erro ao conectar Instagram';
        let statusCode = 400;

        if (err.name === 'IgLoginBadPasswordError') {
            errorMsg = hasProxy
                ? 'Senha incorreta. Verifique suas credenciais do Instagram.'
                : 'Senha incorreta ou login bloqueado por IP de datacenter. Vá em Configurações → Proxy e configure um proxy residencial.';
        } else if (err.name === 'IgLoginInvalidUserError') {
            errorMsg = 'Usuário do Instagram não encontrado. Verifique o nome de usuário.';
        } else if (err.name === 'IgLoginTwoFactorRequiredError') {
            errorMsg = 'Autenticação de dois fatores (2FA) necessária. Desative temporariamente o 2FA na sua conta do Instagram.';
            statusCode = 403;
        } else if (err.name === 'IgCheckpointError') {
            errorMsg = 'Instagram solicitou verificação de segurança. Abra o app do Instagram, confirme a verificação e tente novamente.';
            statusCode = 403;
        } else if (err.name === 'IgChallengeWrongCodeError') {
            errorMsg = 'Código de verificação incorreto';
        } else if (err.name === 'IgLoginRequiredError') {
            errorMsg = 'Sessão expirada. Reconecte a conta.';
            statusCode = 401;
        } else if (err.message?.includes('ECONNREFUSED') || err.message?.includes('ENOTFOUND')) {
            errorMsg = 'Não foi possível conectar ao Instagram. Verifique sua conexão de internet ou configuração de proxy.';
            statusCode = 502;
        } else if (err.message?.includes('LOGIN_FAILED')) {
            errorMsg = hasProxy
                ? 'Login falhou. Verifique suas credenciais do Instagram.'
                : 'Login falhou. Configure um proxy residencial em Configurações → Proxy.';
        } else if (err.message) {
            errorMsg = err.message;
        }

        res.status(statusCode).json({ success: false, error: errorMsg });
    }
}));

// ── Instagram Login (Web API) ──────────────────────────────────────────────

/**
 * POST /api/social/unofficial/instagram/login-web
 * Login no Instagram via Web API (alternativa ao mobile API)
 * Melhor para IPs de datacenter — emula navegador Chrome
 */
router.post('/instagram/login-web', asyncHandler(async (req: Request, res: Response) => {
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
        const session = await loginInstagramWeb({ username, password });

        const tokenExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

        const publicToken = saveSocialToken(userId, 'instagram', {
            providerUserId: session.userId,
            providerUsername: session.username,
            profilePictureUrl: session.profilePicUrl,
            accessToken: 'web-session',
            tokenExpiresAt,
            scopes: ['unofficial', 'web-api', 'publish_photo', 'publish_video', 'publish_story', 'publish_reel'],
            metadata: {
                instagramBusinessAccountId: session.userId,
                igCookies: encrypt(JSON.stringify(session.cookies)),
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
                apiMode: 'web',
            },
            message: `Instagram @${session.username} conectado via Web API!`,
        });
    } catch (err: any) {
        console.error('[Social-Unofficial] Erro login Instagram Web:', err?.message);

        let errorMsg = 'Erro ao conectar Instagram via Web API';
        let statusCode = 400;

        if (err.message?.includes('CHECKPOINT_REQUIRED')) {
            errorMsg = 'Instagram solicitou verificação de segurança. Verifique seu email/telefone no app do Instagram e tente novamente.';
            statusCode = 403;
        } else if (err.message?.includes('TWO_FACTOR_REQUIRED')) {
            errorMsg = 'Autenticação de dois fatores (2FA) necessária. Desative temporariamente o 2FA.';
            statusCode = 403;
        } else if (err.message?.includes('LOGIN_FAILED')) {
            const isDatacenter = !process.env.INSTAGRAM_PROXY;
            errorMsg = isDatacenter
                ? 'Senha incorreta ou login bloqueado por IP de datacenter. Configure um proxy residencial.'
                : 'Senha incorreta. Verifique suas credenciais.';
        } else if (err.message) {
            errorMsg = err.message;
        }

        res.status(statusCode).json({ success: false, error: errorMsg });
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
        // Tentar Web API primeiro, fallback para mobile API
        if (token.accessToken === 'web-session') {
            isValid = await validateInstagramWebSession(token);
        } else {
            isValid = await validateInstagramSession(token);
        }
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
            // Determinar qual API usar baseado no tipo de sessão
            const isWebSession = token.accessToken === 'web-session';

            if (isWebSession) {
                const isValid = await validateInstagramWebSession(token);
                if (!isValid) {
                    throw new Error('Sessão expirada. Reconecte a conta.');
                }
                const profile = await getInstagramProfileInfoWeb(token);
                const newExpires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
                const updated = updateTokenCredentials(tokenId, 'web-session', undefined, newExpires);
                res.json({
                    success: true,
                    data: { ...updated, profile },
                    message: 'Sessão Instagram (Web) renovada',
                });
            } else {
                // Re-login automático — getOrRestoreClient já faz isso
                const isValid = await validateInstagramSession(token);
                if (!isValid) {
                    throw new Error('Sessão expirada. Reconecte a conta.');
                }
                const profile = await getInstagramProfileInfo(token);
                const newExpires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
                const updated = updateTokenCredentials(tokenId, 'unofficial-session', undefined, newExpires);
                res.json({
                    success: true,
                    data: { ...updated, profile },
                    message: 'Sessão Instagram renovada',
                });
            }
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
