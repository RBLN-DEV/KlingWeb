// ============================================================================
// Social Webhook Routes — Recebimento de webhooks do Instagram
// ============================================================================

import { Router, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import crypto from 'crypto';
import { engagementService } from '../services/engagement.service.js';

const router = Router();

// ── Instagram Webhook Verification ─────────────────────────────────────────

/**
 * GET /api/social/webhooks/instagram
 * Verificação do webhook pela Meta (subscription verification)
 */
router.get('/instagram', (req: Request, res: Response) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    const verifyToken = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

    if (!verifyToken) {
        console.warn('[Webhook] INSTAGRAM_WEBHOOK_VERIFY_TOKEN não configurado');
        res.status(503).send('Webhook not configured');
        return;
    }

    if (mode === 'subscribe' && token === verifyToken) {
        console.log('[Webhook] Instagram webhook verificado com sucesso');
        res.status(200).send(challenge);
    } else {
        console.warn('[Webhook] Instagram webhook verification falhou');
        res.status(403).send('Forbidden');
    }
});

/**
 * POST /api/social/webhooks/instagram
 * Recebe eventos do Instagram (comentários, menções)
 */
router.post('/instagram', asyncHandler(async (req: Request, res: Response) => {
    // Validar assinatura HMAC-SHA256
    const signature = req.headers['x-hub-signature-256'] as string;
    const appSecret = process.env.META_APP_SECRET;

    if (appSecret && signature) {
        const expectedSignature = 'sha256=' + crypto
            .createHmac('sha256', appSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (signature !== expectedSignature) {
            console.warn('[Webhook] Instagram: assinatura inválida');
            res.status(403).json({ error: 'Invalid signature' });
            return;
        }
    }

    const body = req.body;

    if (body.object !== 'instagram') {
        res.status(400).json({ error: 'Unexpected object type' });
        return;
    }

    // Processar cada entry
    for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
            console.log(`[Webhook] Instagram event: field=${change.field}`, JSON.stringify(change.value).slice(0, 200));

            switch (change.field) {
                case 'comments':
                    await processInstagramComment(change.value);
                    break;
                case 'mentions':
                    await processInstagramMention(change.value);
                    break;
                default:
                    console.log(`[Webhook] Instagram: campo não tratado: ${change.field}`);
            }
        }
    }

    // Meta espera 200 OK rápido
    res.status(200).send('EVENT_RECEIVED');
}));

// ── Processadores de Eventos ───────────────────────────────────────────────

async function processInstagramComment(data: any): Promise<void> {
    const mediaId = data.media?.id || data.media_id;
    const commentText = data.text || '';
    console.log(`[Webhook] Novo comentário IG: media_id=${mediaId}, text="${commentText.slice(0, 50)}"`);

    if (mediaId) {
        await engagementService.handleWebhookComment(mediaId, commentText);
    }
}

async function processInstagramMention(data: any): Promise<void> {
    const mediaId = data.media_id;
    const commentId = data.comment_id;
    console.log(`[Webhook] Menção IG: media_id=${mediaId}, comment_id=${commentId}`);

    if (mediaId && commentId) {
        await engagementService.handleWebhookMention(mediaId, commentId);
    }
}

export default router;
