// ============================================================================
// Social Publish Routes — Publicação de mídia em redes sociais
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';
import { getTokenById } from '../services/social-token.store.js';
import { socialQueue } from '../services/social-queue.service.js';
import { rateLimiter, RATE_LIMITS } from '../services/rate-limiter.service.js';
import type { Publication, PublishRequest, PublishMultiRequest } from '../types/social.types.js';

const router = Router();

// ── Data Layer ─────────────────────────────────────────────────────────────

import { DATA_DIR, ensureDataDir } from '../services/data-dir.js';
import { isTableStorageAvailable } from '../services/database/table-storage.service.js';
import {
    dbGetAllPublications, dbGetPublicationById as dbGetPub,
    dbGetUserPublications, dbSavePublication, dbDeletePublication,
} from '../services/database/publication.repository.js';

const PUBLICATIONS_FILE = path.join(DATA_DIR, 'publications.json');
const useDb = isTableStorageAvailable();

// Cache local para leitura sync
let pubsCache: Publication[] | null = null;

function readPublicationsFromFile(): Publication[] {
    ensureDataDir();
    if (!fs.existsSync(PUBLICATIONS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(PUBLICATIONS_FILE, 'utf-8'));
    } catch { return []; }
}

function writePublicationsToFile(pubs: Publication[]): void {
    ensureDataDir();
    const tmp = PUBLICATIONS_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(pubs, null, 2), 'utf-8');
    fs.renameSync(tmp, PUBLICATIONS_FILE);
}

function readPublications(): Publication[] {
    if (pubsCache) return [...pubsCache];
    const pubs = readPublicationsFromFile();
    pubsCache = pubs;
    return [...pubs];
}

function writePublications(pubs: Publication[]): void {
    pubsCache = [...pubs];
    writePublicationsToFile(pubs);
    // Gravar no Table Storage (async)
    if (useDb) {
        const recent = pubs.slice(-20);
        Promise.all(recent.map(p => dbSavePublication(p))).catch(err =>
            console.error('[SocialPublish] Erro ao gravar no Table Storage:', err.message)
        );
    }
}

export function getPublicationById(id: string): Publication | undefined {
    return readPublications().find(p => p.id === id);
}

export function updatePublication(id: string, updates: Partial<Publication>): Publication {
    const pubs = readPublications();
    const idx = pubs.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Publicação não encontrada');

    pubs[idx] = { ...pubs[idx], ...updates, updatedAt: new Date().toISOString() };
    writePublications(pubs);
    return pubs[idx];
}

/**
 * Inicializa publications: carrega do DB ou migra JSON→DB
 */
export async function initPublicationsStore(): Promise<void> {
    if (useDb) {
        try {
            const dbPubs = await dbGetAllPublications();
            if (dbPubs.length > 0) {
                pubsCache = dbPubs;
                console.log(`[SocialPublish] ${dbPubs.length} publicações carregadas do Table Storage`);
            } else {
                const filePubs = readPublicationsFromFile();
                if (filePubs.length > 0) {
                    console.log(`[SocialPublish] Migrando ${filePubs.length} publicações de JSON → Table Storage...`);
                    for (const p of filePubs) await dbSavePublication(p);
                    pubsCache = filePubs;
                    console.log('[SocialPublish] Migração concluída.');
                } else {
                    pubsCache = [];
                }
            }
        } catch (err: any) {
            console.error('[SocialPublish] Fallback JSON:', err.message);
            pubsCache = readPublicationsFromFile();
        }
    } else {
        pubsCache = readPublicationsFromFile();
    }
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

// ── Rotas ──────────────────────────────────────────────────────────────────

/**
 * POST /api/social/publish
 * Publica mídia em uma rede social
 */
router.post('/', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const body = req.body as PublishRequest;

    // Validações
    if (!body.socialTokenId || !body.mediaUrl || !body.caption) {
        res.status(400).json({
            success: false,
            error: 'socialTokenId, mediaUrl e caption são obrigatórios',
        });
        return;
    }

    // Verificar token OAuth
    const socialToken = getTokenById(body.socialTokenId);
    if (!socialToken || socialToken.userId !== userId || !socialToken.isActive) {
        res.status(400).json({ success: false, error: 'Conta social não encontrada ou inativa' });
        return;
    }

    // Verificar rate limit
    const configKey = socialToken.provider === 'instagram'
        ? 'instagram:content_publish'
        : 'twitter:tweets_create';

    const rateLimitCheck = rateLimiter.canMakeRequest(userId, configKey);
    if (!rateLimitCheck.allowed) {
        const retryAfterSec = Math.ceil((rateLimitCheck.retryAfterMs || 60000) / 1000);
        res.status(429).json({
            success: false,
            error: `Limite de publicações atingido. Tente novamente em ${retryAfterSec} segundos.`,
            retryAfter: retryAfterSec,
        });
        return;
    }

    // Criar publicação
    const now = new Date().toISOString();
    const publication: Publication = {
        id: crypto.randomUUID(),
        userId,
        socialTokenId: body.socialTokenId,
        provider: socialToken.provider,
        mediaType: body.mediaType || 'image',
        mediaSourceId: body.mediaSourceId,
        mediaUrl: body.mediaUrl,
        caption: body.caption,
        hashtags: body.hashtags || [],
        status: body.scheduledAt ? 'queued' : 'queued',
        retryCount: 0,
        maxRetries: 3,
        scheduledAt: body.scheduledAt,
        createdAt: now,
        updatedAt: now,
    };

    // Salvar publicação
    const pubs = readPublications();
    pubs.push(publication);
    writePublications(pubs);

    // Enfileirar job de publicação
    socialQueue.enqueue({
        type: 'publish',
        provider: socialToken.provider,
        publicationId: publication.id,
        tokenId: body.socialTokenId,
        priority: 'high',
        scheduledAt: body.scheduledAt || now,
        data: { publicationId: publication.id },
    });

    console.log(`[SocialPublish] Publicação ${publication.id} enfileirada (${socialToken.provider})`);

    res.status(201).json({
        success: true,
        data: publication,
        message: body.scheduledAt
            ? `Publicação agendada para ${body.scheduledAt}`
            : 'Publicação adicionada à fila de processamento',
    });
}));

/**
 * POST /api/social/publish/multi
 * Publica a mesma mídia em múltiplas redes
 */
router.post('/multi', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const body = req.body as PublishMultiRequest;

    if (!body.socialTokenIds || body.socialTokenIds.length === 0 || !body.mediaUrl) {
        res.status(400).json({
            success: false,
            error: 'socialTokenIds, mediaUrl são obrigatórios',
        });
        return;
    }

    const results: { tokenId: string; provider: string; publicationId: string; status: string }[] = [];

    for (const tokenId of body.socialTokenIds) {
        const socialToken = getTokenById(tokenId);
        if (!socialToken || socialToken.userId !== userId || !socialToken.isActive) {
            results.push({ tokenId, provider: 'unknown', publicationId: '', status: 'error: token inválido' });
            continue;
        }

        const caption = body.captions?.[socialToken.provider] || body.captions?.['default'] || '';
        const now = new Date().toISOString();

        const publication: Publication = {
            id: crypto.randomUUID(),
            userId,
            socialTokenId: tokenId,
            provider: socialToken.provider,
            mediaType: body.mediaType || 'image',
            mediaSourceId: body.mediaSourceId,
            mediaUrl: body.mediaUrl,
            caption,
            hashtags: body.hashtags || [],
            status: 'queued',
            retryCount: 0,
            maxRetries: 3,
            scheduledAt: body.scheduledAt,
            createdAt: now,
            updatedAt: now,
        };

        const pubs = readPublications();
        pubs.push(publication);
        writePublications(pubs);

        socialQueue.enqueue({
            type: 'publish',
            provider: socialToken.provider,
            publicationId: publication.id,
            tokenId,
            priority: 'high',
            scheduledAt: body.scheduledAt || now,
        });

        results.push({
            tokenId,
            provider: socialToken.provider,
            publicationId: publication.id,
            status: 'queued',
        });
    }

    res.status(201).json({
        success: true,
        data: results,
        message: `${results.filter(r => r.status === 'queued').length} publicações enfileiradas`,
    });
}));

/**
 * GET /api/social/publications
 * Lista publicações do usuário
 */
router.get('/publications', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const { status, provider, limit = '50' } = req.query;

    let pubs = readPublications().filter(p => p.userId === userId);

    if (status) pubs = pubs.filter(p => p.status === status);
    if (provider) pubs = pubs.filter(p => p.provider === provider);

    // Ordenar por data (mais recente primeiro)
    pubs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Limitar
    pubs = pubs.slice(0, parseInt(limit as string, 10));

    res.json({ success: true, data: pubs });
}));

/**
 * GET /api/social/publications/:id
 * Detalhes de uma publicação
 */
router.get('/publications/:id', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const id = req.params.id as string;

    const pub = readPublications().find(p => p.id === id && p.userId === userId);
    if (!pub) {
        res.status(404).json({ success: false, error: 'Publicação não encontrada' });
        return;
    }

    // Incluir jobs da fila
    const jobs = socialQueue.getJobsByPublication(id);

    res.json({
        success: true,
        data: { ...pub, jobs },
    });
}));

/**
 * DELETE /api/social/publications/:id
 * Cancela uma publicação (se ainda estiver na fila)
 */
router.delete('/publications/:id', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const id = req.params.id as string;

    const pubs = readPublications();
    const idx = pubs.findIndex(p => p.id === id && p.userId === userId);

    if (idx === -1) {
        res.status(404).json({ success: false, error: 'Publicação não encontrada' });
        return;
    }

    if (pubs[idx].status === 'published') {
        res.status(400).json({ success: false, error: 'Publicação já foi publicada. Use a rede social para excluir.' });
        return;
    }

    // Cancelar jobs na fila
    const jobs = socialQueue.getJobsByPublication(id);
    for (const job of jobs) {
        socialQueue.cancel(job.id);
    }

    pubs[idx].status = 'cancelled';
    pubs[idx].updatedAt = new Date().toISOString();
    writePublications(pubs);

    res.json({ success: true, message: 'Publicação cancelada' });
}));

/**
 * POST /api/social/publications/:id/retry
 * Retry de publicação falha
 */
router.post('/publications/:id/retry', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const id = req.params.id as string;

    const pubs = readPublications();
    const idx = pubs.findIndex(p => p.id === id && p.userId === userId);

    if (idx === -1) {
        res.status(404).json({ success: false, error: 'Publicação não encontrada' });
        return;
    }

    if (pubs[idx].status !== 'failed') {
        res.status(400).json({ success: false, error: 'Apenas publicações com status "failed" podem ser retentadas' });
        return;
    }

    const now = new Date().toISOString();
    pubs[idx].status = 'queued';
    pubs[idx].retryCount = 0;
    pubs[idx].error = undefined;
    pubs[idx].updatedAt = now;
    writePublications(pubs);

    socialQueue.enqueue({
        type: 'publish',
        provider: pubs[idx].provider,
        publicationId: pubs[idx].id,
        tokenId: pubs[idx].socialTokenId,
        priority: 'high',
    });

    res.json({
        success: true,
        data: pubs[idx],
        message: 'Publicação reenfileirada para nova tentativa',
    });
}));

export default router;
