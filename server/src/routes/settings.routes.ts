// ============================================================================
// Settings Routes — Configurações do servidor (Proxy, etc.)
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';

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
            res.status(401).json({ success: false, error: 'Sessão expirada' });
            return;
        }

        if (user.status !== 'approved') {
            res.status(403).json({ success: false, error: 'Conta pendente de aprovação' });
            return;
        }

        (req as any).userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }
}

router.use(requireAuth);

// ── Proxy Config (em memória — persiste enquanto servidor roda) ─────────

let serverProxyConfig: {
    enabled: boolean;
    proxyUrl: string;
    updatedAt: string;
    updatedBy: string;
} | null = null;

/**
 * POST /api/settings/proxy
 * Salva configuração de proxy no servidor
 */
router.post('/proxy', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { enabled, proxyUrl } = req.body;

    if (enabled && !proxyUrl) {
        res.status(400).json({
            success: false,
            error: 'URL do proxy é obrigatória quando proxy está habilitado',
        });
        return;
    }

    // Validar formato da URL de proxy
    if (enabled && proxyUrl) {
        try {
            const url = new URL(proxyUrl);
            if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
                res.status(400).json({
                    success: false,
                    error: 'Protocolo do proxy deve ser http, https, socks4 ou socks5',
                });
                return;
            }
        } catch {
            res.status(400).json({
                success: false,
                error: 'URL do proxy inválida. Use formato: http://user:pass@host:port',
            });
            return;
        }
    }

    // Salvar configuração
    serverProxyConfig = {
        enabled: !!enabled,
        proxyUrl: enabled ? proxyUrl : '',
        updatedAt: new Date().toISOString(),
        updatedBy: userId,
    };

    // Atualizar variáveis de ambiente para uso imediato
    if (enabled && proxyUrl) {
        process.env.INSTAGRAM_PROXY = proxyUrl;
        process.env.HTTPS_PROXY = proxyUrl;
        console.log(`[Settings] Proxy configurado: ${proxyUrl.substring(0, 40)}...`);
    } else {
        delete process.env.INSTAGRAM_PROXY;
        delete process.env.HTTPS_PROXY;
        console.log('[Settings] Proxy desabilitado');
    }

    res.json({
        success: true,
        message: enabled ? 'Proxy configurado com sucesso' : 'Proxy desabilitado',
        data: {
            enabled: serverProxyConfig.enabled,
            updatedAt: serverProxyConfig.updatedAt,
        },
    });
}));

/**
 * GET /api/settings/proxy
 * Retorna configuração atual do proxy
 */
router.get('/proxy', asyncHandler(async (_req: Request, res: Response) => {
    const hasEnvProxy = !!(process.env.INSTAGRAM_PROXY || process.env.HTTPS_PROXY);

    res.json({
        success: true,
        data: {
            enabled: serverProxyConfig?.enabled || hasEnvProxy,
            proxyUrl: serverProxyConfig?.proxyUrl
                ? serverProxyConfig.proxyUrl.replace(/\/\/([^:]+):[^@]+@/, '//***:***@')  // mascarar credenciais
                : (hasEnvProxy ? '(configurado via variável de ambiente)' : ''),
            updatedAt: serverProxyConfig?.updatedAt || null,
            source: serverProxyConfig ? 'ui' : (hasEnvProxy ? 'env' : 'none'),
        },
    });
}));

/**
 * POST /api/settings/proxy/test
 * Testa conexão com o proxy
 */
router.post('/proxy/test', asyncHandler(async (req: Request, res: Response) => {
    const { proxyUrl } = req.body;

    const testUrl = proxyUrl || process.env.INSTAGRAM_PROXY || process.env.HTTPS_PROXY;

    if (!testUrl) {
        res.status(400).json({
            success: false,
            error: 'Nenhum proxy configurado para testar',
        });
        return;
    }

    // Validar URL
    try {
        new URL(testUrl);
    } catch {
        res.status(400).json({
            success: false,
            error: 'URL do proxy inválida',
        });
        return;
    }

    try {
        // Tentar fazer uma requisição simples via proxy
        const { HttpsProxyAgent } = await import('https-proxy-agent');
        const agent = new HttpsProxyAgent(testUrl);

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch('https://www.instagram.com/', {
            method: 'HEAD',
            signal: controller.signal,
            agent: agent as any,
        } as any);

        clearTimeout(timeout);

        if (response.ok || response.status === 301 || response.status === 302) {
            res.json({
                success: true,
                message: 'Proxy funcionando! Conexão com Instagram estabelecida.',
                data: {
                    status: response.status,
                    latencyMs: 0,  // TODO: medir latência
                },
            });
        } else {
            res.json({
                success: false,
                error: `Proxy conectou, mas Instagram retornou HTTP ${response.status}`,
            });
        }
    } catch (error: any) {
        console.error('[Settings] Erro ao testar proxy:', error?.message);

        let errorMsg = 'Falha ao conectar via proxy';
        if (error.message?.includes('ECONNREFUSED')) {
            errorMsg = 'Proxy recusou a conexão. Verifique se o proxy está online.';
        } else if (error.message?.includes('ENOTFOUND')) {
            errorMsg = 'Host do proxy não encontrado. Verifique o endereço.';
        } else if (error.message?.includes('ETIMEDOUT') || error.name === 'AbortError') {
            errorMsg = 'Timeout ao conectar ao proxy (>10s). Proxy pode estar lento ou inacessível.';
        } else if (error.message?.includes('ECONNRESET')) {
            errorMsg = 'Conexão com o proxy foi resetada. Verifique credenciais.';
        } else if (error.message) {
            errorMsg = error.message;
        }

        res.status(502).json({
            success: false,
            error: errorMsg,
        });
    }
}));

export default router;
