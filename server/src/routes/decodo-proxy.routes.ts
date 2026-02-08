// ============================================================================
// Decodo Proxy Routes — Dashboard + API de consulta proxy Decodo
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import path from 'path';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';
import { DATA_DIR, ensureDataDir, writeFileAtomic, readJsonSafe } from '../services/data-dir.js';
import {
    getProxyOverview,
    getSubscriptions,
    getSubUsers,
    getSubUser,
    createSubUser,
    updateSubUser,
    deleteSubUser,
    getTraffic,
    getTargets,
    getSubUserTraffic,
    getAllocatedSubUserTraffic,
    getEndpoints,
    getEndpointsByType,
    generateCustomBackConnectEndpoints,
    generateCustomEndpoints,
    getWhitelistedIps,
    addWhitelistedIps,
    deleteWhitelistedIp,
    type BackConnectParams,
} from '../services/decodo-proxy.service.js';

const router = Router();

// ── Auth middleware ─────────────────────────────────────────────────────────

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
        if (!user || user.status !== 'approved') {
            res.status(403).json({ success: false, error: 'Acesso negado' });
            return;
        }
        (req as any).userId = decoded.userId;
        (req as any).userRole = user.role; // Use role from DB, not JWT
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido' });
    }
}

router.use(requireAuth);

// ── Persistência da API key Decodo ─────────────────────────────────────────

const DECODO_CONFIG_FILE = path.join(DATA_DIR, 'decodo-config.json');

interface DecodoConfig {
    apiKey: string;      // API key do Decodo (armazenada em plain text — admin only)
    updatedAt: string;
    updatedBy: string;
}

function loadDecodoConfig(): DecodoConfig | null {
    return readJsonSafe<DecodoConfig>(DECODO_CONFIG_FILE);
}

function saveDecodoConfig(config: DecodoConfig): void {
    try {
        ensureDataDir();
        writeFileAtomic(DECODO_CONFIG_FILE, JSON.stringify(config, null, 2));
    } catch (err: any) {
        console.error('[Decodo] Erro ao salvar config:', err.message);
    }
}

function getApiKey(): string | null {
    // 1. Env var
    if (process.env.DECODO_API_KEY) return process.env.DECODO_API_KEY;
    // 2. Config file
    const config = loadDecodoConfig();
    return config?.apiKey || null;
}

// ── Rotas ───────────────────────────────────────────────────────────────────

/**
 * GET /api/decodo/overview
 * Retorna visão geral: subscription, sub-users, endpoints, traffic
 */
router.get('/overview', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) {
        res.status(400).json({
            success: false,
            error: 'API key do Decodo não configurada. Configure em Configurações > Rede.',
        });
        return;
    }

    const days = parseInt(req.query.days as string) || 30;
    const overview = await getProxyOverview(apiKey, days);

    res.json({ success: true, data: overview });
}));

/**
 * GET /api/decodo/subscriptions
 * Lista assinaturas ativas
 */
router.get('/subscriptions', asyncHandler(async (_req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const data = await getSubscriptions(apiKey);
    res.json({ success: true, data });
}));

/**
 * GET /api/decodo/sub-users
 * Lista sub-users do proxy
 */
router.get('/sub-users', asyncHandler(async (_req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const data = await getSubUsers(apiKey);
    res.json({ success: true, data });
}));

/**
 * GET /api/decodo/sub-users/:id/traffic
 * Tráfego de um sub-user
 */
router.get('/sub-users/:id/traffic', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const type = (req.query.type as string) || 'month';
    const data = await getSubUserTraffic(apiKey, req.params.id as string, type as '24h' | '7days' | 'month');
    res.json({ success: true, data });
}));

/**
 * POST /api/decodo/traffic
 * Tráfego geral por período
 */
router.post('/traffic', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const { days = 30, groupBy = 'day' } = req.body;
    const data = await getTraffic(apiKey, days, groupBy);
    res.json({ success: true, data });
}));

/**
 * GET /api/decodo/endpoints
 * Lista endpoints disponíveis
 */
router.get('/endpoints', asyncHandler(async (_req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const data = await getEndpoints(apiKey);
    res.json({ success: true, data });
}));

/**
 * GET /api/decodo/config
 * Retorna status da configuração (sem expor a key completa)
 */
router.get('/config', asyncHandler(async (_req: Request, res: Response) => {
    const apiKey = getApiKey();
    const config = loadDecodoConfig();

    res.json({
        success: true,
        data: {
            configured: !!apiKey,
            source: process.env.DECODO_API_KEY ? 'env' : (config?.apiKey ? 'ui' : 'none'),
            maskedKey: apiKey ? apiKey.substring(0, 12) + '...' + apiKey.substring(apiKey.length - 8) : null,
            updatedAt: config?.updatedAt || null,
        },
    });
}));

/**
 * POST /api/decodo/config
 * Salva API key do Decodo (somente admin)
 */
router.post('/config', asyncHandler(async (req: Request, res: Response) => {
    const role = (req as any).userRole;
    if (role !== 'admin') {
        res.status(403).json({ success: false, error: 'Somente admin pode configurar API key' });
        return;
    }

    const { apiKey } = req.body;
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 20) {
        res.status(400).json({ success: false, error: 'API key inválida' });
        return;
    }

    // Testar a key antes de salvar
    try {
        const testResult = await getSubscriptions(apiKey);
        if (!testResult || testResult.length === 0) {
            res.status(400).json({
                success: false,
                error: 'API key inválida ou sem assinaturas ativas. Verifique sua key no dashboard Decodo.',
            });
            return;
        }
    } catch {
        res.status(400).json({ success: false, error: 'Não foi possível validar a API key' });
        return;
    }

    const config: DecodoConfig = {
        apiKey,
        updatedAt: new Date().toISOString(),
        updatedBy: (req as any).userId,
    };
    saveDecodoConfig(config);

    // Também setar env var para uso imediato
    process.env.DECODO_API_KEY = apiKey;

    console.log(`[Decodo] API key configurada por ${(req as any).userId}`);

    res.json({
        success: true,
        message: 'API key do Decodo configurada com sucesso',
        data: {
            maskedKey: apiKey.substring(0, 12) + '...' + apiKey.substring(apiKey.length - 8),
        },
    });
}));

// ── Back Connect Endpoints ──────────────────────────────────────────────────

/**
 * POST /api/decodo/back-connect
 * Gera endpoints back-connect customizados
 */
router.post('/back-connect', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const params: BackConnectParams = {
        username: req.body.username,
        password: req.body.password,
        session_type: req.body.session_type || 'sticky',
        session_time: req.body.session_time || 10,
        country: req.body.country,
        state: req.body.state,
        city: req.body.city,
        output_format: req.body.output_format || 'protocol:auth@endpoint',
        count: req.body.count || 10,
        page: req.body.page || 1,
        response_format: 'json',
        domain: req.body.domain || 'gate.decodo.com',
        ip: req.body.ip,
        protocol: req.body.protocol || 'http',
    };

    if (!params.username || !params.password) {
        res.status(400).json({ success: false, error: 'username e password são obrigatórios' });
        return;
    }

    const data = await generateCustomBackConnectEndpoints(apiKey, params);
    res.json({ success: true, data });
}));

/**
 * POST /api/decodo/custom-endpoints
 * Gera endpoints customizados (não back-connect)
 */
router.post('/custom-endpoints', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const data = await generateCustomEndpoints(apiKey, req.body);
    res.json({ success: true, data });
}));

/**
 * GET /api/decodo/endpoints/:type
 * Endpoints por tipo (random/sticky)
 */
router.get('/endpoints/:type', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }

    const type = req.params.type as 'random' | 'sticky';
    const data = await getEndpointsByType(apiKey, type);
    res.json({ success: true, data });
}));

// ── Whitelisted IPs ─────────────────────────────────────────────────────────

router.get('/whitelisted-ips', asyncHandler(async (_req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const data = await getWhitelistedIps(apiKey);
    res.json({ success: true, data });
}));

router.post('/whitelisted-ips', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const { ips } = req.body;
    if (!Array.isArray(ips) || ips.length === 0) {
        res.status(400).json({ success: false, error: 'Lista de IPs é obrigatória' });
        return;
    }
    const data = await addWhitelistedIps(apiKey, ips);
    res.json({ success: true, data });
}));

router.delete('/whitelisted-ips/:id', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const ok = await deleteWhitelistedIp(apiKey, req.params.id as string);
    res.json({ success: ok, message: ok ? 'IP removido' : 'Falha ao remover IP' });
}));

// ── Targets / Statistics ────────────────────────────────────────────────────

router.post('/targets', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const { days = 30, search } = req.body;
    const data = await getTargets(apiKey, days, search);
    res.json({ success: true, data });
}));

router.get('/allocated-traffic', asyncHandler(async (_req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const data = await getAllocatedSubUserTraffic(apiKey);
    res.json({ success: true, data });
}));

// ── Sub User CRUD ───────────────────────────────────────────────────────────

router.get('/sub-users/:id', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const data = await getSubUser(apiKey, req.params.id as string);
    res.json({ success: true, data });
}));

router.post('/sub-users', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const role = (req as any).userRole;
    if (role !== 'admin') { res.status(403).json({ success: false, error: 'Admin only' }); return; }
    const data = await createSubUser(apiKey, req.body);
    res.json({ success: true, data });
}));

router.put('/sub-users/:id', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const role = (req as any).userRole;
    if (role !== 'admin') { res.status(403).json({ success: false, error: 'Admin only' }); return; }
    const data = await updateSubUser(apiKey, req.params.id as string, req.body);
    res.json({ success: true, data });
}));

router.delete('/sub-users/:id', asyncHandler(async (req: Request, res: Response) => {
    const apiKey = getApiKey();
    if (!apiKey) { res.status(400).json({ success: false, error: 'API key não configurada' }); return; }
    const role = (req as any).userRole;
    if (role !== 'admin') { res.status(403).json({ success: false, error: 'Admin only' }); return; }
    const ok = await deleteSubUser(apiKey, req.params.id as string);
    res.json({ success: ok, message: ok ? 'Sub-user removido' : 'Falha ao remover' });
}));

export default router;
