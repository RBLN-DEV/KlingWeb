// ============================================================================
// Instagram Unofficial Service — Integração via instagram-private-api
// ============================================================================
// Emula o app Android do Instagram para publicação direta.
// Login com username/password (sem OAuth, sem Meta Business Verification).
//
// Funcionalidades:
//  - Login com username/password (+ 2FA)
//  - Publicação de fotos no feed
//  - Publicação de vídeos no feed
//  - Publicação de stories (foto e vídeo)
//  - Publicação de álbuns (carrossel)
//  - Coleta básica de métricas (followers, media count)
//
// ⚠️  RISCOS: Viola ToS do Instagram. Conta pode ser banida.
//     Use apenas para testes. Não recomendado para produção.
// ============================================================================

import { IgApiClient } from 'instagram-private-api';
import { encrypt, decrypt } from './crypto.service.js';
import type { SocialToken, PlatformMediaLimits } from '../types/social.types.js';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface IGCredentials {
    username: string;
    password: string;
}

export interface IGSession {
    username: string;
    userId: string;
    profilePicUrl?: string;
    fullName?: string;
    followersCount?: number;
    followingCount?: number;
    mediaCount?: number;
    cookies: string; // serialized cookies for session persistence
}

// ── Media Limits ───────────────────────────────────────────────────────────

export const INSTAGRAM_UNOFFICIAL_MEDIA_LIMITS: PlatformMediaLimits = {
    image: {
        maxSizeBytes: 8 * 1024 * 1024,     // 8 MB
        allowedFormats: ['image/jpeg', 'image/png'],
        maxWidth: 1440,
        maxHeight: 1440,
        minWidth: 320,
        minHeight: 320,
        aspectRatios: ['4:5', '1:1', '1.91:1'],
    },
    video: {
        maxSizeBytes: 100 * 1024 * 1024,   // 100 MB (feed)
        allowedFormats: ['video/mp4'],
        maxWidth: 1920,
        maxHeight: 1080,
        minWidth: 600,
        minHeight: 600,
        maxDurationSeconds: 60,
        minDurationSeconds: 3,
    },
    reel: {
        maxSizeBytes: 250 * 1024 * 1024,   // 250 MB
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

// ── Session Cache ──────────────────────────────────────────────────────────
// Mantém instâncias do IgApiClient por userId para reutilizar sessões

const sessionCache: Map<string, { client: IgApiClient; expiresAt: number }> = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutos

// Limpar sessões expiradas a cada 10 minutos
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessionCache.entries()) {
        if (value.expiresAt < now) {
            sessionCache.delete(key);
            console.log(`[IG-Unofficial] Sessão expirada removida: ${key}`);
        }
    }
}, 10 * 60 * 1000);

// ── Login / Session Management ─────────────────────────────────────────────

/**
 * Faz login no Instagram com username/password.
 * Retorna dados da sessão para persistência.
 */
export async function loginInstagramUnofficial(
    credentials: IGCredentials
): Promise<IGSession> {
    const ig = new IgApiClient();

    // Gerar device fingerprint baseado no username
    ig.state.generateDevice(credentials.username);

    // Simular atividade pre-login (melhora chance de não ser bloqueado)
    await ig.simulate.preLoginFlow();

    // Login
    const loggedInUser = await ig.account.login(
        credentials.username,
        credentials.password
    );

    // Simular pós-login
    process.nextTick(async () => {
        try {
            await ig.simulate.postLoginFlow();
        } catch (e) {
            // Ignorar erros do postLoginFlow — não é crítico
        }
    });

    // Obter info do perfil
    const userInfo = await ig.user.info(loggedInUser.pk);

    // Serializar cookies para persistência
    const cookies = await ig.state.serializeCookieJar();
    const cookiesStr = JSON.stringify(cookies);

    // Cachear sessão
    const sessionKey = `ig_${loggedInUser.pk}`;
    sessionCache.set(sessionKey, {
        client: ig,
        expiresAt: Date.now() + SESSION_TTL,
    });

    console.log(`[IG-Unofficial] Login OK: @${credentials.username} (pk=${loggedInUser.pk})`);

    return {
        username: userInfo.username,
        userId: loggedInUser.pk.toString(),
        profilePicUrl: userInfo.profile_pic_url,
        fullName: userInfo.full_name,
        followersCount: userInfo.follower_count,
        followingCount: userInfo.following_count,
        mediaCount: userInfo.media_count,
        cookies: cookiesStr,
    };
}

/**
 * Restaura uma sessão do Instagram a partir de cookies salvos.
 * Usado para operações subsequentes sem refazer login.
 */
async function getOrRestoreClient(token: SocialToken): Promise<IgApiClient> {
    const sessionKey = `ig_${token.providerUserId}`;

    // Verificar cache
    const cached = sessionCache.get(sessionKey);
    if (cached && cached.expiresAt > Date.now()) {
        cached.expiresAt = Date.now() + SESSION_TTL; // Renovar TTL
        return cached.client;
    }

    // Restaurar de cookies
    const ig = new IgApiClient();
    const username = token.providerUsername;
    ig.state.generateDevice(username);

    // Tentar restaurar cookies
    if (token.metadata.igCookies) {
        try {
            const cookiesData = decrypt(token.metadata.igCookies as string);
            const cookies = JSON.parse(cookiesData);
            await ig.state.deserializeCookieJar(cookies);

            // Validar sessão
            try {
                await ig.account.currentUser();
                // Sessão válida — cachear
                sessionCache.set(sessionKey, {
                    client: ig,
                    expiresAt: Date.now() + SESSION_TTL,
                });
                console.log(`[IG-Unofficial] Sessão restaurada de cookies: @${username}`);
                return ig;
            } catch {
                console.log(`[IG-Unofficial] Cookies expirados para @${username}, re-login necessário`);
            }
        } catch {
            console.log(`[IG-Unofficial] Erro ao restaurar cookies para @${username}`);
        }
    }

    // Se chegou aqui, precisa de re-login
    if (token.metadata.igPassword) {
        const password = decrypt(token.metadata.igPassword as string);
        await ig.simulate.preLoginFlow();
        await ig.account.login(username, password);

        process.nextTick(async () => {
            try { await ig.simulate.postLoginFlow(); } catch {}
        });

        sessionCache.set(sessionKey, {
            client: ig,
            expiresAt: Date.now() + SESSION_TTL,
        });

        console.log(`[IG-Unofficial] Re-login automático: @${username}`);
        return ig;
    }

    throw new Error('Não foi possível restaurar sessão Instagram. Reconecte a conta.');
}

// ── Publicação ─────────────────────────────────────────────────────────────

/**
 * Publica uma foto no feed do Instagram
 */
export async function publishInstagramPhoto(
    token: SocialToken,
    imageBuffer: Buffer,
    caption: string
): Promise<{ postId: string; postUrl: string }> {
    const ig = await getOrRestoreClient(token);

    const result = await ig.publish.photo({
        file: imageBuffer,
        caption,
    });

    const mediaId = result.media.id;
    const code = result.media.code;
    const postUrl = `https://www.instagram.com/p/${code}/`;

    console.log(`[IG-Unofficial] Foto publicada: ${mediaId} (${postUrl})`);

    return { postId: mediaId, postUrl };
}

/**
 * Publica um vídeo no feed do Instagram
 */
export async function publishInstagramVideoUnofficial(
    token: SocialToken,
    videoBuffer: Buffer,
    coverBuffer: Buffer,
    caption: string
): Promise<{ postId: string; postUrl: string }> {
    const ig = await getOrRestoreClient(token);

    const result = await ig.publish.video({
        video: videoBuffer,
        coverImage: coverBuffer,
        caption,
    });

    const mediaId = result.media.id;
    const code = result.media.code;
    const postUrl = `https://www.instagram.com/p/${code}/`;

    console.log(`[IG-Unofficial] Vídeo publicado: ${mediaId} (${postUrl})`);

    return { postId: mediaId, postUrl };
}

/**
 * Publica uma foto como Story
 */
export async function publishInstagramStoryPhoto(
    token: SocialToken,
    imageBuffer: Buffer
): Promise<{ storyId: string }> {
    const ig = await getOrRestoreClient(token);

    const result = await ig.publish.story({
        file: imageBuffer,
    });

    // O resultado de stories pode variar; extrair o ID
    const storyId = result?.media?.id || result?.media?.pk?.toString() || 'unknown';

    console.log(`[IG-Unofficial] Story (foto) publicado: ${storyId}`);

    return { storyId };
}

/**
 * Publica um vídeo como Story
 */
export async function publishInstagramStoryVideo(
    token: SocialToken,
    videoBuffer: Buffer,
    coverBuffer: Buffer
): Promise<{ storyId: string }> {
    const ig = await getOrRestoreClient(token);

    const result = await ig.publish.story({
        video: videoBuffer,
        coverImage: coverBuffer,
    });

    const storyId = result?.media?.id || result?.media?.pk?.toString() || 'unknown';

    console.log(`[IG-Unofficial] Story (vídeo) publicado: ${storyId}`);

    return { storyId };
}

/**
 * Publica um álbum (carrossel) no feed
 */
export async function publishInstagramAlbum(
    token: SocialToken,
    items: Array<
        { type: 'photo'; buffer: Buffer } |
        { type: 'video'; buffer: Buffer; coverBuffer: Buffer }
    >,
    caption: string
): Promise<{ postId: string; postUrl: string }> {
    const ig = await getOrRestoreClient(token);

    const albumItems = items.map(item => {
        if (item.type === 'photo') {
            return { file: item.buffer };
        } else {
            return {
                video: item.buffer,
                coverImage: item.coverBuffer,
            };
        }
    });

    const result = await ig.publish.album({
        items: albumItems as any,
        caption,
    });

    const mediaId = result.media.id;
    const code = result.media.code;
    const postUrl = `https://www.instagram.com/p/${code}/`;

    console.log(`[IG-Unofficial] Álbum publicado: ${mediaId} (${postUrl})`);

    return { postId: mediaId, postUrl };
}

// ── Métricas Básicas ───────────────────────────────────────────────────────

/**
 * Obtém informações do perfil (followers, media count, etc)
 */
export async function getInstagramProfileInfo(
    token: SocialToken
): Promise<{
    followersCount: number;
    followingCount: number;
    mediaCount: number;
    fullName: string;
    biography: string;
    profilePicUrl: string;
}> {
    const ig = await getOrRestoreClient(token);
    const userId = parseInt(token.providerUserId, 10);
    const userInfo = await ig.user.info(userId);

    return {
        followersCount: userInfo.follower_count,
        followingCount: userInfo.following_count,
        mediaCount: userInfo.media_count,
        fullName: userInfo.full_name,
        biography: userInfo.biography,
        profilePicUrl: userInfo.profile_pic_url,
    };
}

/**
 * Valida se a sessão do Instagram ainda é válida
 */
export async function validateInstagramSession(token: SocialToken): Promise<boolean> {
    try {
        const ig = await getOrRestoreClient(token);
        await ig.account.currentUser();
        return true;
    } catch {
        return false;
    }
}
