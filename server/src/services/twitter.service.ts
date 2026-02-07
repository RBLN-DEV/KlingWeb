// ============================================================================
// Twitter/X Service — Integração com Twitter API v2
// ============================================================================
// Implementa:
//  - OAuth 2.0 com PKCE
//  - Publicação de tweets com mídia (imagens e vídeos)
//  - Upload de mídia (chunked para vídeos)
//  - Coleta de métricas (public_metrics)
//  - Refresh de tokens
// ============================================================================

import crypto from 'crypto';
import { generateOAuthState, generatePKCEVerifier, generatePKCEChallenge } from './crypto.service.js';
import { decrypt } from './crypto.service.js';
import type { SocialToken, PlatformMediaLimits } from '../types/social.types.js';

// ── Configuração ───────────────────────────────────────────────────────────

const TWITTER_CLIENT_ID = () => process.env.TWITTER_CLIENT_ID || '';
const TWITTER_CLIENT_SECRET = () => process.env.TWITTER_CLIENT_SECRET || '';
const CALLBACK_BASE = () => process.env.SOCIAL_OAUTH_CALLBACK_BASE || 'http://localhost:3001';

const TWITTER_API_BASE = 'https://api.twitter.com/2';
const TWITTER_UPLOAD_BASE = 'https://upload.twitter.com/1.1';

const TWITTER_SCOPES = [
    'tweet.read',
    'tweet.write',
    'users.read',
    'offline.access',
].join(' ');

// ── Media Limits ───────────────────────────────────────────────────────────

export const TWITTER_MEDIA_LIMITS: PlatformMediaLimits = {
    image: {
        maxSizeBytes: 5 * 1024 * 1024,     // 5 MB
        allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        maxWidth: 4096,
        maxHeight: 4096,
    },
    video: {
        maxSizeBytes: 512 * 1024 * 1024,   // 512 MB
        allowedFormats: ['video/mp4'],
        maxWidth: 1920,
        maxHeight: 1200,
        minWidth: 32,
        minHeight: 32,
        maxDurationSeconds: 140,
        minDurationSeconds: 0.5,
    },
    captionMaxLength: 280,
};

// ── Pending OAuth States (memória — limpar após uso) ───────────────────────

interface PendingTwitterOAuth {
    userId: string;
    state: string;
    codeVerifier: string;
    createdAt: number;
}

const pendingStates: Map<string, PendingTwitterOAuth> = new Map();

// Limpar states antigos (>15 min) a cada 5 min
setInterval(() => {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [key, value] of pendingStates.entries()) {
        if (value.createdAt < cutoff) pendingStates.delete(key);
    }
}, 5 * 60 * 1000);

// ── OAuth Methods ──────────────────────────────────────────────────────────

/**
 * Gera URL de autorização OAuth 2.0 com PKCE
 */
export function getTwitterAuthUrl(userId: string): { authorizationUrl: string; state: string } {
    const state = generateOAuthState();
    const codeVerifier = generatePKCEVerifier();
    const codeChallenge = generatePKCEChallenge(codeVerifier);

    pendingStates.set(state, {
        userId,
        state,
        codeVerifier,
        createdAt: Date.now(),
    });

    const callbackUrl = `${CALLBACK_BASE()}/api/social/oauth/twitter/callback`;

    const params = new URLSearchParams({
        response_type: 'code',
        client_id: TWITTER_CLIENT_ID(),
        redirect_uri: callbackUrl,
        scope: TWITTER_SCOPES,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
    });

    const authorizationUrl = `https://twitter.com/i/oauth2/authorize?${params.toString()}`;

    console.log(`[Twitter] Auth URL gerada para user ${userId}`);
    return { authorizationUrl, state };
}

/**
 * Processa o callback OAuth do Twitter
 */
export async function handleTwitterCallback(code: string, state: string): Promise<{
    userId: string;
    providerUserId: string;
    providerUsername: string;
    profilePictureUrl?: string;
    accessToken: string;
    refreshToken?: string;
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

    const callbackUrl = `${CALLBACK_BASE()}/api/social/oauth/twitter/callback`;

    // 1. Trocar code por access_token (com PKCE verifier)
    const credentials = Buffer.from(`${TWITTER_CLIENT_ID()}:${TWITTER_CLIENT_SECRET()}`).toString('base64');

    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: callbackUrl,
            code_verifier: pending.codeVerifier,
        }).toString(),
    });

    const tokenData = await tokenResponse.json() as any;

    if (tokenData.error) {
        throw new Error(`Twitter OAuth error: ${tokenData.error_description || tokenData.error}`);
    }

    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in || 7200; // 2 horas padrão

    // 2. Obter dados do usuário
    const userResponse = await fetch(`${TWITTER_API_BASE}/users/me?user.fields=id,name,username,profile_image_url`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    const userData = await userResponse.json() as any;

    if (userData.errors) {
        throw new Error(`Erro ao obter perfil Twitter: ${userData.errors[0]?.message}`);
    }

    const user = userData.data;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log(`[Twitter] Callback processado: @${user.username} (ID: ${user.id})`);

    return {
        userId: pending.userId,
        providerUserId: user.id,
        providerUsername: user.username,
        profilePictureUrl: user.profile_image_url,
        accessToken,
        refreshToken,
        tokenExpiresAt,
        scopes: TWITTER_SCOPES.split(' '),
        metadata: {},
    };
}

/**
 * Refresh do access token do Twitter
 */
export async function refreshTwitterToken(token: SocialToken): Promise<{
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: string;
}> {
    const currentRefreshToken = token.refreshToken ? decrypt(token.refreshToken) : null;

    if (!currentRefreshToken) {
        throw new Error('Refresh token não disponível. Reconecte a conta.');
    }

    const credentials = Buffer.from(`${TWITTER_CLIENT_ID()}:${TWITTER_CLIENT_SECRET()}`).toString('base64');

    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${credentials}`,
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: currentRefreshToken,
        }).toString(),
    });

    const data = await response.json() as any;

    if (data.error) {
        throw new Error(`Erro ao renovar token Twitter: ${data.error_description || data.error}`);
    }

    const expiresIn = data.expires_in || 7200;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    console.log(`[Twitter] Token renovado para @${token.providerUsername}`);

    return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token, // Twitter pode rotacionar o refresh token
        tokenExpiresAt,
    };
}

// ── Publicação ─────────────────────────────────────────────────────────────

/**
 * Upload de imagem para o Twitter
 * Retorna media_id_string
 */
export async function uploadTwitterImage(
    token: SocialToken,
    imageBuffer: Buffer,
    mimeType: string = 'image/jpeg'
): Promise<string> {
    const accessToken = decrypt(token.accessToken);

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: mimeType });
    formData.append('media', blob, `image.${mimeType.split('/')[1]}`);
    formData.append('media_category', 'tweet_image');

    // Twitter media upload usa OAuth 1.0a no endpoint v1.1
    // Com OAuth 2.0 user token, podemos usar o endpoint simples
    const response = await fetch(`${TWITTER_UPLOAD_BASE}/media/upload.json`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
        },
        body: formData,
    });

    const data = await response.json() as any;

    if (data.errors) {
        throw new Error(`Erro upload mídia Twitter: ${data.errors[0]?.message}`);
    }

    console.log(`[Twitter] Imagem uploaded: media_id=${data.media_id_string}`);
    return data.media_id_string;
}

/**
 * Upload de vídeo para o Twitter (chunked upload)
 * Usado para vídeos acima de 5MB
 */
export async function uploadTwitterVideo(
    token: SocialToken,
    videoBuffer: Buffer,
    mimeType: string = 'video/mp4'
): Promise<string> {
    const accessToken = decrypt(token.accessToken);
    const totalBytes = videoBuffer.length;
    const chunkSize = 5 * 1024 * 1024; // 5 MB chunks

    // INIT
    const initParams = new URLSearchParams({
        command: 'INIT',
        total_bytes: totalBytes.toString(),
        media_type: mimeType,
        media_category: 'tweet_video',
    });

    const initResponse = await fetch(`${TWITTER_UPLOAD_BASE}/media/upload.json`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: initParams.toString(),
    });

    const initData = await initResponse.json() as any;
    if (!initData.media_id_string) {
        throw new Error('Erro ao iniciar upload de vídeo no Twitter');
    }

    const mediaId = initData.media_id_string;

    // APPEND (chunks)
    let segmentIndex = 0;
    for (let offset = 0; offset < totalBytes; offset += chunkSize) {
        const chunk = videoBuffer.subarray(offset, Math.min(offset + chunkSize, totalBytes));
        const blob = new Blob([new Uint8Array(chunk)], { type: 'application/octet-stream' });

        const formData = new FormData();
        formData.append('command', 'APPEND');
        formData.append('media_id', mediaId);
        formData.append('segment_index', segmentIndex.toString());
        formData.append('media_data', blob);

        await fetch(`${TWITTER_UPLOAD_BASE}/media/upload.json`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}` },
            body: formData,
        });

        segmentIndex++;
        console.log(`[Twitter] Video chunk ${segmentIndex} uploaded (${Math.min(offset + chunkSize, totalBytes)}/${totalBytes})`);
    }

    // FINALIZE
    const finalizeParams = new URLSearchParams({
        command: 'FINALIZE',
        media_id: mediaId,
    });

    const finalizeResponse = await fetch(`${TWITTER_UPLOAD_BASE}/media/upload.json`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: finalizeParams.toString(),
    });

    const finalizeData = await finalizeResponse.json() as any;

    // STATUS polling (se processing_info presente)
    if (finalizeData.processing_info) {
        await pollTwitterMediaStatus(accessToken, mediaId);
    }

    console.log(`[Twitter] Vídeo uploaded: media_id=${mediaId}`);
    return mediaId;
}

/**
 * Poll do status de processamento de vídeo no Twitter
 */
async function pollTwitterMediaStatus(accessToken: string, mediaId: string): Promise<void> {
    const maxPolls = 60; // 5 minutos max

    for (let i = 0; i < maxPolls; i++) {
        const statusParams = new URLSearchParams({
            command: 'STATUS',
            media_id: mediaId,
        });

        const response = await fetch(
            `${TWITTER_UPLOAD_BASE}/media/upload.json?${statusParams.toString()}`,
            { headers: { 'Authorization': `Bearer ${accessToken}` } }
        );

        const data = await response.json() as any;
        const processingInfo = data.processing_info;

        if (!processingInfo) return; // Pronto

        if (processingInfo.state === 'succeeded') return;
        if (processingInfo.state === 'failed') {
            throw new Error(`Twitter video processing failed: ${processingInfo.error?.message || 'Unknown error'}`);
        }

        const waitSeconds = processingInfo.check_after_secs || 5;
        console.log(`[Twitter] Media ${mediaId} processing... state=${processingInfo.state}, check_after=${waitSeconds}s`);
        await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
    }

    throw new Error('Twitter video processing timeout');
}

/**
 * Cria um tweet com mídia
 */
export async function createTweetWithMedia(
    token: SocialToken,
    text: string,
    mediaIds: string[]
): Promise<{ tweetId: string; tweetUrl: string }> {
    const accessToken = decrypt(token.accessToken);

    const body: any = { text };
    if (mediaIds.length > 0) {
        body.media = { media_ids: mediaIds };
    }

    const response = await fetch(`${TWITTER_API_BASE}/tweets`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    const data = await response.json() as any;

    if (data.errors) {
        throw new Error(`Erro ao criar tweet: ${data.errors[0]?.message}`);
    }

    const tweetId = data.data.id;
    const tweetUrl = `https://twitter.com/${token.providerUsername}/status/${tweetId}`;

    console.log(`[Twitter] Tweet criado: ${tweetId}`);
    return { tweetId, tweetUrl };
}

// ── Métricas ───────────────────────────────────────────────────────────────

/**
 * Obtém métricas públicas de um tweet
 */
export async function getTwitterTweetMetrics(
    token: SocialToken,
    tweetId: string
): Promise<{
    likes: number;
    retweets: number;
    replies: number;
    quotes: number;
    impressions: number;
    bookmarks: number;
}> {
    const accessToken = decrypt(token.accessToken);

    const response = await fetch(
        `${TWITTER_API_BASE}/tweets/${tweetId}?tweet.fields=public_metrics,organic_metrics`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    const data = await response.json() as any;

    if (data.errors) {
        throw new Error(`Erro ao obter métricas Twitter: ${data.errors[0]?.message}`);
    }

    const metrics = data.data?.public_metrics || {};

    return {
        likes: metrics.like_count || 0,
        retweets: metrics.retweet_count || 0,
        replies: metrics.reply_count || 0,
        quotes: metrics.quote_count || 0,
        impressions: metrics.impression_count || 0,
        bookmarks: metrics.bookmark_count || 0,
    };
}

/**
 * Valida se o token do Twitter ainda é válido
 */
export async function validateTwitterToken(token: SocialToken): Promise<boolean> {
    try {
        const accessToken = decrypt(token.accessToken);
        const response = await fetch(`${TWITTER_API_BASE}/users/me`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        const data = await response.json() as any;
        return !data.errors;
    } catch {
        return false;
    }
}
