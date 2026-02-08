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
    let currentToken: string;
    try {
        currentToken = decrypt(token.accessToken);
    } catch (err: any) {
        console.error('[Instagram] Erro ao descriptografar token para refresh:', err.message);
        throw new Error('Token criptografado inválido. A chave de criptografia pode ter mudado. Reconecte a conta Instagram.');
    }

    const params = new URLSearchParams({
        grant_type: 'fb_exchange_token',
        client_id: META_APP_ID(),
        client_secret: META_APP_SECRET(),
        fb_exchange_token: currentToken,
    });

    const url = `${GRAPH_API_BASE}/oauth/access_token?${params.toString()}`;

    // Tentar refresh — se falhar por certificado de proxy, tentar sem proxy
    let response: Response;
    try {
        response = await fetch(url);
    } catch (err: any) {
        const isCertError = err.message?.includes('certificate has expired')
            || err.message?.includes('CERT_HAS_EXPIRED')
            || err.message?.includes('tunneling socket')
            || err.message?.includes('unable to verify')
            || err.message?.includes('self signed certificate')
            || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';

        if (isCertError) {
            console.warn('[Instagram] Erro de certificado no proxy ao renovar token. Tentando sem proxy...');
            // Tentar sem proxy: usar um fetch direto sem variáveis de ambiente de proxy
            try {
                const directFetchOpts: RequestInit = {};
                // undici respeita env vars, então precisamos de um agent sem proxy
                const { Agent } = await import('undici');
                const directAgent = new Agent({ connect: { rejectUnauthorized: true } });
                response = await fetch(url, { dispatcher: directAgent as any } as any);
            } catch (retryErr: any) {
                console.error('[Instagram] Retry sem proxy também falhou:', retryErr.message);
                throw new Error(
                    'Erro ao renovar token: o certificado do proxy expirou e a conexão direta também falhou. ' +
                    'Verifique a configuração do proxy em Configurações ou reconecte a conta Instagram.'
                );
            }
        } else {
            throw new Error(`Erro de rede ao renovar token Instagram: ${err.message}`);
        }
    }

    const data = await response!.json() as any;

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
 * Fluxo: Validar URL → Create Container → Poll Status → Publish
 */
export async function publishInstagramImage(
    token: SocialToken,
    imageUrl: string,
    caption: string
): Promise<{ postId: string; postUrl: string }> {
    let accessToken: string;
    try {
        accessToken = decrypt(token.accessToken);
    } catch (err: any) {
        throw new Error(`Erro ao descriptografar token: ${err.message}. Reconecte a conta Instagram.`);
    }

    const igUserId = token.metadata.instagramBusinessAccountId;

    if (!igUserId) {
        throw new Error('Instagram Business Account ID não encontrado no token');
    }

    // Etapa 0: Verificar se a URL da imagem é acessível publicamente
    console.log(`[Instagram] Verificando acessibilidade da imagem: ${imageUrl.substring(0, 100)}...`);
    try {
        const headResp = await fetch(imageUrl, { method: 'HEAD' });
        if (!headResp.ok) {
            throw new Error(
                `A URL da imagem retornou HTTP ${headResp.status}. ` +
                'A Meta Graph API requer que a imagem esteja acessível publicamente via HTTPS. ' +
                'Verifique se a URL não expirou (SAS token) e se está acessível externamente.'
            );
        }
    } catch (err: any) {
        if (err.message?.includes('A URL da imagem retornou')) throw err;
        console.warn(`[Instagram] Não foi possível verificar URL da imagem (${err.message}), tentando publicar assim mesmo...`);
    }

    // Etapa 1: Criar container de mídia
    console.log(`[Instagram] Criando container para IG userId=${igUserId}...`);
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
        const errMsg = containerData.error.message || 'Erro desconhecido';
        const errCode = containerData.error.code;
        // Código 36003 = URL da mídia não acessível
        if (errCode === 36003 || errMsg.includes('media url')) {
            throw new Error(
                `Erro ao criar container IG: a URL da imagem não é acessível pela Meta. ` +
                `Certifique-se de que a imagem está hospedada em URL pública HTTPS. Detalhe: ${errMsg}`
            );
        }
        throw new Error(`Erro ao criar container IG: ${errMsg}`);
    }

    const containerId = containerData.id;
    if (!containerId) {
        throw new Error('Container criado mas sem ID retornado. Resposta inesperada da API Meta.');
    }

    console.log(`[Instagram] Container criado: ${containerId}. Aguardando processamento...`);

    // Etapa 1.5: Poll do status do container (imagens também podem demorar)
    let containerReady = false;
    for (let i = 0; i < 12; i++) { // Máximo 60s (5s * 12)
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            const statusResponse = await fetch(
                `${GRAPH_API_BASE}/${containerId}?fields=status_code,status&access_token=${accessToken}`
            );
            const statusData = await statusResponse.json() as any;

            if (statusData.status_code === 'FINISHED') {
                containerReady = true;
                break;
            }
            if (statusData.status_code === 'ERROR') {
                const errorStatus = statusData.status || 'desconhecido';
                throw new Error(
                    `Container de mídia falhou no processamento do Instagram. ` +
                    `Status: ${errorStatus}. Possível causa: imagem não acessível, formato inválido ou URL expirada.`
                );
            }
            if (statusData.status_code === 'IN_PROGRESS') {
                console.log(`[Instagram] Container ${containerId}: processando... (${i + 1}/12)`);
                continue;
            }
            // Se não tem status_code, pode já estar pronto (imagens são rápidas)
            if (!statusData.status_code) {
                containerReady = true;
                break;
            }
        } catch (err: any) {
            if (err.message?.includes('Container de mídia falhou')) throw err;
            console.warn(`[Instagram] Erro ao verificar status do container: ${err.message}`);
        }
    }

    if (!containerReady) {
        console.warn('[Instagram] Timeout aguardando container, tentando publicar assim mesmo...');
    }

    // Etapa 2: Publicar
    console.log(`[Instagram] Publicando container ${containerId}...`);
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
        const errMsg = publishData.error.message || 'Erro desconhecido';
        throw new Error(`Erro ao publicar no IG: ${errMsg}`);
    }

    const postId = publishData.id;
    if (!postId) {
        throw new Error(
            'Publicação retornou sem ID. Isso geralmente indica que o container ainda não foi processado ' +
            'ou que a URL da mídia não é acessível pelo Instagram. Verifique se a imagem está hospedada em URL pública HTTPS.'
        );
    }

    let postUrl = `https://www.instagram.com/p/${postId}/`;

    // Obter permalink real
    try {
        const permalinkResponse = await fetch(
            `${GRAPH_API_BASE}/${postId}?fields=permalink&access_token=${accessToken}`
        );
        const permalinkData = await permalinkResponse.json() as any;
        if (permalinkData.permalink) {
            postUrl = permalinkData.permalink;
        }
    } catch {
        // Usar URL aproximada
    }

    console.log(`[Instagram] ✅ Imagem publicada com sucesso: ${postId} → ${postUrl}`);
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
    let accessToken: string;
    try {
        accessToken = decrypt(token.accessToken);
    } catch (err: any) {
        throw new Error(`Erro ao descriptografar token: ${err.message}. Reconecte a conta Instagram.`);
    }

    const igUserId = token.metadata.instagramBusinessAccountId;

    if (!igUserId) {
        throw new Error('Instagram Business Account ID não encontrado no token');
    }

    // Verificar acessibilidade do vídeo
    console.log(`[Instagram] Verificando acessibilidade do vídeo: ${videoUrl.substring(0, 100)}...`);
    try {
        const headResp = await fetch(videoUrl, { method: 'HEAD' });
        if (!headResp.ok) {
            throw new Error(
                `A URL do vídeo retornou HTTP ${headResp.status}. ` +
                'A Meta Graph API requer que o vídeo esteja acessível publicamente via HTTPS.'
            );
        }
    } catch (err: any) {
        if (err.message?.includes('A URL do vídeo retornou')) throw err;
        console.warn(`[Instagram] Não foi possível verificar URL do vídeo: ${err.message}`);
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
