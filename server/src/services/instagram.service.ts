// ============================================================================
// Instagram Service — Integração com Meta Graph API v21
// ============================================================================
// Implementa:
//  - OAuth 2.0 (Facebook Login para Instagram Business/Creator)
//  - Publicação de imagens e vídeos/reels
//  - Coleta de métricas (insights)
//  - Refresh de long-lived tokens
// ============================================================================

import crypto from 'crypto';
import { encrypt, decrypt, generateOAuthState } from './crypto.service.js';
import { rateLimiter } from './rate-limiter.service.js';
import type { SocialToken, MediaValidation, PlatformMediaLimits } from '../types/social.types.js';

// ── Configuração ───────────────────────────────────────────────────────────

const META_APP_ID = () => process.env.META_APP_ID || '';
const META_APP_SECRET = () => process.env.META_APP_SECRET || '';
const CALLBACK_BASE = () => process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:3001';

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

const INSTAGRAM_SCOPES = [
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_comments',
    'instagram_manage_insights',
    'pages_show_list',
    'pages_read_engagement',
].join(',');

// ── Media Limits ───────────────────────────────────────────────────────────

export const INSTAGRAM_MEDIA_LIMITS: PlatformMediaLimits = {
    image: {
        maxSizeBytes: 8 * 1024 * 1024,    // 8 MB
        allowedFormats: ['image/jpeg', 'image/png'],
        maxWidth: 1440,
        maxHeight: 1440,
        minWidth: 320,
        minHeight: 320,
        aspectRatios: ['4:5', '1:1', '1.91:1'],
    },
    video: {
        maxSizeBytes: 100 * 1024 * 1024,  // 100 MB (feed)
        allowedFormats: ['video/mp4'],
        maxWidth: 1920,
        maxHeight: 1080,
        minWidth: 600,
        minHeight: 600,
        maxDurationSeconds: 60,
        minDurationSeconds: 3,
    },
    reel: {
        maxSizeBytes: 250 * 1024 * 1024,  // 250 MB
        allowedFormats: ['video/mp4'],
        maxWidth: 1080,
        maxHeight: 1920,
        minWidth: 540,
        minHeight: 960,
        aspectRatios: ['9:16'],
        maxDurationSeconds: 90,
        minDurationSeconds: 3,
    },
    captionMaxLength: 2200,
};

// ── Pending OAuth States (memória — limpar após uso) ───────────────────────

interface PendingOAuth {
    userId: string;
    state: string;
    createdAt: number;
}

const pendingStates: Map<string, PendingOAuth> = new Map();

// Limpar states antigos (>15 min) a cada 5 min
setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [key, value] of pendingStates.entries()) {
        if (value.createdAt < cutoff) pendingStates.delete(key);
    }
}, 5 * 60 * 1000);

// ── OAuth Methods ──────────────────────────────────────────────────────────

/**
 * Gera URL de autorização do Facebook Login (para Instagram)
 */
export function getInstagramAuthUrl(userId: string): { authorizationUrl: string; state: string } {
    const state = generateOAuthState();

    pendingStates.set(state, {
        userId,
        state,
        createdAt: Date.now(),
    });

    const callbackUrl = `${CALLBACK_BASE()}/api/social/oauth/instagram/callback`;

    const params = new URLSearchParams({
        client_id: META_APP_ID(),
        redirect_uri: callbackUrl,
        scope: INSTAGRAM_SCOPES,
        response_type: 'code',
        state,
    });

    const authorizationUrl = `https://www.facebook.com/${GRAPH_API_VERSION}/dialog/oauth?${params.toString()}`;

    console.log(`[Instagram] Auth URL gerada para user ${userId}`);
    return { authorizationUrl, state };
}

/**
 * Processa o callback OAuth do Instagram
 */
export async function handleInstagramCallback(code: string, state: string): Promise<{
    userId: string;
    providerUserId: string;
    providerUsername: string;
    profilePictureUrl?: string;
    accessToken: string;
    tokenExpiresAt: string;
    scopes: string[];
    metadata: SocialToken['metadata'];
}> {
    // Validar state (CSRF protection)
    const pending = pendingStates.get(state);
    if (!pending) {
        throw new Error('State inválido ou expirado');
    }
    pendingStates.delete(state);

    const callbackUrl = `${CALLBACK_BASE()}/api/social/oauth/instagram/callback`;

    // 1. Trocar code por short-lived access_token
    const tokenUrl = `${GRAPH_API_BASE}/oauth/access_token`;
    const tokenParams = new URLSearchParams({
        client_id: META_APP_ID(),
        client_secret: META_APP_SECRET(),
        redirect_uri: callbackUrl,
        code,
    });

    const tokenResponse = await fetch(`${tokenUrl}?${tokenParams.toString()}`);
    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
        throw new Error(`Meta OAuth error: ${tokenData.error.message}`);
    }

    const shortLivedToken = tokenData.access_token;

    // 2. Trocar por long-lived token (60 dias)
    const longLivedParams = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: META_APP_ID(),
        client_secret: META_APP_SECRET(),
        fb_exchange_token: shortLivedToken,
    });

    const longLivedResponse = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${longLivedParams.toString()}`);
    const longLivedData = await longLivedResponse.json() as any;

    if (longLivedData.error) {
        throw new Error(`Erro ao obter long-lived token: ${longLivedData.error.message}`);
    }

    const accessToken = longLivedData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000; // 60 dias padrão

    // 3. Obter Facebook Pages do usuário
    const pagesResponse = await fetch(
        `${GRAPH_API_BASE}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${accessToken}`
    );
    const pagesData = await pagesResponse.json() as any;

    if (!pagesData.data || pagesData.data.length === 0) {
        throw new Error('Nenhuma Facebook Page encontrada. Você precisa de uma página conectada a uma conta Instagram Business/Creator.');
    }

    // Encontrar página com Instagram Business Account
    const pageWithIg = pagesData.data.find((p: any) => p.instagram_business_account);
    if (!pageWithIg) {
        throw new Error('Nenhuma conta Instagram Business/Creator encontrada vinculada às suas páginas.');
    }

    const igAccountId = pageWithIg.instagram_business_account.id;
    const pageAccessToken = pageWithIg.access_token;

    // 4. Obter dados do Instagram
    const igResponse = await fetch(
        `${GRAPH_API_BASE}/${igAccountId}?fields=id,username,profile_picture_url,followers_count&access_token=${accessToken}`
    );
    const igData = await igResponse.json() as any;

    if (igData.error) {
        throw new Error(`Erro ao obter perfil Instagram: ${igData.error.message}`);
    }

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log(`[Instagram] Callback processado: @${igData.username} (IG ID: ${igAccountId})`);

    return {
        userId: pending.userId,
        providerUserId: igAccountId,
        providerUsername: igData.username,
        profilePictureUrl: igData.profile_picture_url,
        accessToken: pageAccessToken, // Page token é necessário para publicar
        tokenExpiresAt,
        scopes: INSTAGRAM_SCOPES.split(','),
        metadata: {
            instagramBusinessAccountId: igAccountId,
            facebookPageId: pageWithIg.id,
            facebookPageAccessToken: encrypt(pageAccessToken),
        },
    };
}

/**
 * Refresh do long-lived token do Instagram
 * Deve ser chamado antes dos 60 dias de expiração
 */
export async function refreshInstagramToken(token: SocialToken): Promise<{
    accessToken: string;
    tokenExpiresAt: string;
}> {
    const currentToken = decrypt(token.accessToken);

    const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: META_APP_ID(),
        client_secret: META_APP_SECRET(),
        fb_exchange_token: currentToken,
    });

    const response = await fetch(`${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`);
    const data = await response.json() as any;

    if (data.error) {
        throw new Error(`Erro ao renovar token Instagram: ${data.error.message}`);
    }

    const expiresIn = data.expires_in || 5184000;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log(`[Instagram] Token renovado para @${token.providerUsername}`);

    return {
        accessToken: data.access_token,
        tokenExpiresAt,
    };
}

// ── Publicação ─────────────────────────────────────────────────────────────

/**
 * Publica uma imagem no Instagram
 * Fluxo: Create Container → Publish
 */
export async function publishInstagramImage(
    token: SocialToken,
    imageUrl: string,
    caption: string
): Promise<{ postId: string; postUrl: string }> {
    const accessToken = decrypt(token.accessToken);
    const igUserId = token.metadata.instagramBusinessAccountId;

    if (!igUserId) {
        throw new Error('Instagram Business Account ID não encontrado no token');
    }

    // Etapa 1: Criar container de mídia
    const containerResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            image_url: imageUrl,
            caption,
            access_token: accessToken,
        }),
    });

    const containerData = await containerResponse.json() as any;
    if (containerData.error) {
        throw new Error(`Erro ao criar container IG: ${containerData.error.message}`);
    }

    const containerId = containerData.id;

    // Etapa 2: Publicar (imagens não precisam de polling — são processadas instantaneamente)
    const publishResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: accessToken,
        }),
    });

    const publishData = await publishResponse.json() as any;
    if (publishData.error) {
        throw new Error(`Erro ao publicar no IG: ${publishData.error.message}`);
    }

    const postId = publishData.id;
    const postUrl = `https://www.instagram.com/p/${postId}/`; // Aproximação — permalink real requer outra chamada

    // Obter permalink real
    try {
        const permalinkResponse = await fetch(
            `${GRAPH_API_BASE}/${postId}?fields=permalink&access_token=${accessToken}`
        );
        const permalinkData = await permalinkResponse.json() as any;
        if (permalinkData.permalink) {
            return { postId, postUrl: permalinkData.permalink };
        }
    } catch {
        // Usar URL aproximada
    }

    console.log(`[Instagram] Imagem publicada: ${postId}`);
    return { postId, postUrl };
}

/**
 * Publica um vídeo/reel no Instagram
 * Fluxo: Create Container → Poll Status → Publish
 */
export async function publishInstagramVideo(
    token: SocialToken,
    videoUrl: string,
    caption: string,
    isReel: boolean = false
): Promise<{ postId: string; postUrl: string }> {
    const accessToken = decrypt(token.accessToken);
    const igUserId = token.metadata.instagramBusinessAccountId;

    if (!igUserId) {
        throw new Error('Instagram Business Account ID não encontrado no token');
    }

    // Etapa 1: Criar container de vídeo
    const containerBody: Record<string, string> = {
        video_url: videoUrl,
        caption,
        access_token: accessToken,
    };

    if (isReel) {
        containerBody.media_type = 'REELS';
    }

    const containerResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(containerBody),
    });

    const containerData = await containerResponse.json() as any;
    if (containerData.error) {
        throw new Error(`Erro ao criar container de vídeo IG: ${containerData.error.message}`);
    }

    const containerId = containerData.id;

    // Etapa 2: Poll até status === FINISHED
    const maxPolls = 60; // 5 minutos (5s * 60)
    for (let i = 0; i < maxPolls; i++) {
        await new Promise(resolve => setTimeout(resolve, 5000));

        const statusResponse = await fetch(
            `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
        );
        const statusData = await statusResponse.json() as any;

        if (statusData.status_code === 'FINISHED') break;
        if (statusData.status_code === 'ERROR') {
            throw new Error('Instagram: Erro no processamento do vídeo');
        }

        console.log(`[Instagram] Video container ${containerId}: status=${statusData.status_code} (poll ${i + 1}/${maxPolls})`);
    }

    // Etapa 3: Publicar
    const publishResponse = await fetch(`${GRAPH_API_BASE}/${igUserId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            creation_id: containerId,
            access_token: accessToken,
        }),
    });

    const publishData = await publishResponse.json() as any;
    if (publishData.error) {
        throw new Error(`Erro ao publicar vídeo IG: ${publishData.error.message}`);
    }

    const postId = publishData.id;
    let postUrl = `https://www.instagram.com/reel/${postId}/`;

    // Permalink real
    try {
        const permalinkResponse = await fetch(
            `${GRAPH_API_BASE}/${postId}?fields=permalink&access_token=${accessToken}`
        );
        const permalinkData = await permalinkResponse.json() as any;
        if (permalinkData.permalink) postUrl = permalinkData.permalink;
    } catch {}

    console.log(`[Instagram] Vídeo/Reel publicado: ${postId}`);
    return { postId, postUrl };
}

// ── Métricas ───────────────────────────────────────────────────────────────

/**
 * Obtém insights de uma mídia publicada
 */
export async function getInstagramMediaInsights(
    token: SocialToken,
    mediaId: string
): Promise<{
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    impressions: number;
    reach: number;
}> {
    const accessToken = decrypt(token.accessToken);

    // Obter métricas básicas (likes/comments via fields)
    const mediaResponse = await fetch(
        `${GRAPH_API_BASE}/${mediaId}?fields=like_count,comments_count,timestamp&access_token=${accessToken}`
    );
    const mediaData = await mediaResponse.json() as any;

    // Obter insights detalhados
    const insightsResponse = await fetch(
        `${GRAPH_API_BASE}/${mediaId}/insights?metric=impressions,reach,saved,shares&access_token=${accessToken}`
    );
    const insightsData = await insightsResponse.json() as any;

    let impressions = 0, reach = 0, saves = 0, shares = 0;

    if (insightsData.data) {
        for (const metric of insightsData.data) {
            const value = metric.values?.[0]?.value || 0;
            switch (metric.name) {
                case 'impressions': impressions = value; break;
                case 'reach': reach = value; break;
                case 'saved': saves = value; break;
                case 'shares': shares = value; break;
            }
        }
    }

    return {
        likes: mediaData.like_count || 0,
        comments: mediaData.comments_count || 0,
        shares,
        saves,
        impressions,
        reach,
    };
}

/**
 * Valida se o token do Instagram ainda é válido
 */
export async function validateInstagramToken(token: SocialToken): Promise<boolean> {
    try {
        const accessToken = decrypt(token.accessToken);
        const response = await fetch(
            `${GRAPH_API_BASE}/me?access_token=${accessToken}`
        );
        const data = await response.json() as any;
        return !data.error;
    } catch {
        return false;
    }
}
