// ============================================================================
// Twitter/X Unofficial Service — Integração via @the-convocation/twitter-scraper
// ============================================================================
// Usa reverse-engineering da API frontend do Twitter/X.
// Login com username/password/email (sem Developer Portal, sem OAuth app).
//
// Funcionalidades:
//  - Login com username/password/email (+ 2FA)
//  - Envio de tweets com texto
//  - Leitura de tweets e perfis
//  - Busca de tweets
//  - Métricas básicas (likes, retweets, replies, views)
//
// ⚠️  RISCOS: Viola ToS do Twitter/X. Conta pode ser banida.
//     Rate limiting agressivo. Use apenas para testes.
// ============================================================================

import { Scraper, SearchMode } from '@the-convocation/twitter-scraper';
import { encrypt, decrypt } from './crypto.service.js';
import type { SocialToken, PlatformMediaLimits } from '../types/social.types.js';

// ── Tipos ──────────────────────────────────────────────────────────────────

export interface TwitterCredentials {
    username: string;
    password: string;
    email?: string;
    twoFactorSecret?: string;
}

export interface TwitterSession {
    username: string;
    userId: string;
    displayName?: string;
    profilePicUrl?: string;
    followersCount?: number;
    followingCount?: number;
    tweetsCount?: number;
    cookies: string; // JSON serialized cookies
}

// ── Media Limits ───────────────────────────────────────────────────────────

export const TWITTER_UNOFFICIAL_MEDIA_LIMITS: PlatformMediaLimits = {
    image: {
        maxSizeBytes: 5 * 1024 * 1024,      // 5 MB
        allowedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        maxWidth: 4096,
        maxHeight: 4096,
    },
    video: {
        maxSizeBytes: 512 * 1024 * 1024,    // 512 MB
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

// ── Session Cache ──────────────────────────────────────────────────────────

const sessionCache: Map<string, { scraper: Scraper; expiresAt: number }> = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 minutos

// Limpar sessões expiradas
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of sessionCache.entries()) {
        if (value.expiresAt < now) {
            sessionCache.delete(key);
            console.log(`[TW-Unofficial] Sessão expirada removida: ${key}`);
        }
    }
}, 10 * 60 * 1000);

// ── Login / Session Management ─────────────────────────────────────────────

/**
 * Faz login no Twitter com username/password/email.
 * Retorna dados da sessão para persistência.
 */
export async function loginTwitterUnofficial(
    credentials: TwitterCredentials
): Promise<TwitterSession> {
    const scraper = new Scraper();

    // Login
    await scraper.login(
        credentials.username,
        credentials.password,
        credentials.email,
        credentials.twoFactorSecret
    );

    // Verificar login
    const isLoggedIn = await scraper.isLoggedIn();
    if (!isLoggedIn) {
        throw new Error('Falha no login do Twitter. Verifique credenciais, email ou 2FA.');
    }

    // Obter perfil
    const profile = await scraper.getProfile(credentials.username);
    if (!profile) {
        throw new Error('Não foi possível obter o perfil do Twitter após login.');
    }

    // Serializar cookies para persistência
    const cookies = await scraper.getCookies();
    const cookiesStr = JSON.stringify(cookies.map(c => ({
        key: c.key,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite,
    })));

    // Cachear sessão
    const sessionKey = `tw_${profile.userId}`;
    sessionCache.set(sessionKey, {
        scraper,
        expiresAt: Date.now() + SESSION_TTL,
    });

    console.log(`[TW-Unofficial] Login OK: @${credentials.username} (id=${profile.userId})`);

    return {
        username: profile.username || credentials.username,
        userId: profile.userId || '',
        displayName: profile.name,
        profilePicUrl: profile.avatar,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        tweetsCount: profile.tweetsCount,
        cookies: cookiesStr,
    };
}

/**
 * Restaura uma sessão do Twitter a partir de cookies salvos.
 */
async function getOrRestoreScraper(token: SocialToken): Promise<Scraper> {
    const sessionKey = `tw_${token.providerUserId}`;

    // Verificar cache
    const cached = sessionCache.get(sessionKey);
    if (cached && cached.expiresAt > Date.now()) {
        cached.expiresAt = Date.now() + SESSION_TTL;
        return cached.scraper;
    }

    // Restaurar de cookies
    const scraper = new Scraper();

    if (token.metadata.twCookies) {
        try {
            const cookiesData = decrypt(token.metadata.twCookies as string);
            const cookies = JSON.parse(cookiesData);

            // setCookies espera strings no formato "key=value; Domain=...; Path=..."
            const cookieStrings = cookies.map((c: any) => {
                let str = `${c.key}=${c.value}`;
                if (c.domain) str += `; Domain=${c.domain}`;
                if (c.path) str += `; Path=${c.path}`;
                if (c.secure) str += '; Secure';
                if (c.httpOnly) str += '; HttpOnly';
                if (c.sameSite) str += `; SameSite=${c.sameSite}`;
                return str;
            });

            await scraper.setCookies(cookieStrings);

            // Validar sessão
            const isLoggedIn = await scraper.isLoggedIn();
            if (isLoggedIn) {
                sessionCache.set(sessionKey, {
                    scraper,
                    expiresAt: Date.now() + SESSION_TTL,
                });
                console.log(`[TW-Unofficial] Sessão restaurada de cookies: @${token.providerUsername}`);
                return scraper;
            }

            console.log(`[TW-Unofficial] Cookies expirados para @${token.providerUsername}`);
        } catch (e) {
            console.log(`[TW-Unofficial] Erro ao restaurar cookies: ${e}`);
        }
    }

    // Re-login se tiver credenciais salvas
    if (token.metadata.twPassword) {
        const password = decrypt(token.metadata.twPassword as string);
        const email = token.metadata.twEmail ? decrypt(token.metadata.twEmail as string) : undefined;

        await scraper.login(
            token.providerUsername,
            password,
            email
        );

        const isLoggedIn = await scraper.isLoggedIn();
        if (!isLoggedIn) {
            throw new Error('Re-login falhou. Reconecte a conta Twitter.');
        }

        sessionCache.set(sessionKey, {
            scraper,
            expiresAt: Date.now() + SESSION_TTL,
        });

        console.log(`[TW-Unofficial] Re-login automático: @${token.providerUsername}`);
        return scraper;
    }

    throw new Error('Não foi possível restaurar sessão Twitter. Reconecte a conta.');
}

// ── Publicação ─────────────────────────────────────────────────────────────

// Bearer token padrão do Twitter Web App (público)
const TWITTER_BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

/**
 * Envia um tweet via API GraphQL interna do Twitter
 */
async function sendTweetGraphQL(
    scraper: InstanceType<typeof Scraper>,
    text: string,
    replyToId?: string
): Promise<{ tweetId: string }> {
    const cookies = await scraper.getCookies();

    // Extrair ct0 (csrf token) dos cookies
    // Cookie type from tough-cookie has .key and .value
    const ct0Cookie = cookies.find(c => {
        const name = (c as any).key || (c as any).name || '';
        return name === 'ct0';
    });

    let csrfToken = '';
    if (ct0Cookie) {
        csrfToken = (ct0Cookie as any).value || '';
    }

    // Formatar cookies para header
    const cookieStr = cookies.map(c => {
        const name = (c as any).key || (c as any).name || '';
        const value = (c as any).value || '';
        return `${name}=${value}`;
    }).join('; ');

    const variables: any = {
        tweet_text: text,
        dark_request: false,
        media: {
            media_entities: [],
            possibly_sensitive: false,
        },
        semantic_annotation_ids: [],
    };

    if (replyToId) {
        variables.reply = {
            in_reply_to_tweet_id: replyToId,
            exclude_reply_user_ids: [],
        };
    }

    const body = {
        variables,
        features: {
            interactive_text_enabled: true,
            longform_notetweets_inline_media_enabled: false,
            responsive_web_text_conversations_enabled: false,
            tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: false,
            vibe_api_enabled: false,
            rweb_lists_timeline_redesign_enabled: true,
            responsive_web_graphql_exclude_directive_enabled: true,
            verified_phone_label_enabled: false,
            creator_subscriptions_tweet_preview_api_enabled: true,
            responsive_web_graphql_timeline_navigation_enabled: true,
            responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
            tweetypie_unmention_optimization_enabled: true,
            responsive_web_edit_tweet_api_enabled: true,
            graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
            view_counts_everywhere_api_enabled: true,
            longform_notetweets_consumption_enabled: true,
            tweet_awards_web_tipping_enabled: false,
            freedom_of_speech_not_reach_fetch_enabled: true,
            standardized_nudges_misinfo: true,
            longform_notetweets_rich_text_read_enabled: true,
            responsive_web_enhance_cards_enabled: false,
            subscriptions_verification_info_enabled: true,
            subscriptions_verification_info_reason_enabled: true,
            subscriptions_verification_info_verified_since_enabled: true,
            super_follow_badge_privacy_enabled: false,
            super_follow_exclusive_tweet_notifications_enabled: false,
            super_follow_tweet_api_enabled: false,
            super_follow_user_api_enabled: false,
            android_graphql_skip_api_media_color_palette: false,
            creator_subscriptions_subscription_count_enabled: false,
            blue_business_profile_image_shape_enabled: false,
            unified_cards_ad_metadata_container_dynamic_card_content_query_enabled: false,
        },
        queryId: 'a1p9RWpkYKBjWv_I3WzS-A',
    };

    const response = await fetch('https://twitter.com/i/api/graphql/a1p9RWpkYKBjWv_I3WzS-A/CreateTweet', {
        method: 'POST',
        headers: {
            'authorization': `Bearer ${TWITTER_BEARER_TOKEN}`,
            'content-type': 'application/json',
            'cookie': cookieStr,
            'x-csrf-token': csrfToken,
            'x-twitter-auth-type': 'OAuth2Session',
            'x-twitter-active-user': 'yes',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Twitter GraphQL error (${response.status}): ${errorText.substring(0, 200)}`);
    }

    const responseData = await response.json() as any;

    let tweetId = '';
    if (responseData?.data?.create_tweet?.tweet_results?.result?.rest_id) {
        tweetId = responseData.data.create_tweet.tweet_results.result.rest_id;
    } else if (responseData?.data?.create_tweet?.tweet_results?.result?.legacy?.id_str) {
        tweetId = responseData.data.create_tweet.tweet_results.result.legacy.id_str;
    }

    if (!tweetId) {
        console.warn('[TW-Unofficial] Resposta sem tweet ID:', JSON.stringify(responseData).substring(0, 500));
    }

    return { tweetId };
}

/**
 * Envia um tweet com texto
 */
export async function sendTweet(
    token: SocialToken,
    text: string
): Promise<{ tweetId: string; tweetUrl: string }> {
    const scraper = await getOrRestoreScraper(token);

    const { tweetId } = await sendTweetGraphQL(scraper, text);

    const tweetUrl = tweetId
        ? `https://x.com/${token.providerUsername}/status/${tweetId}`
        : `https://x.com/${token.providerUsername}`;

    console.log(`[TW-Unofficial] Tweet enviado: ${tweetId}`);

    return { tweetId, tweetUrl };
}

/**
 * Envia um tweet como resposta a outro tweet
 */
export async function replyToTweet(
    token: SocialToken,
    text: string,
    replyToId: string
): Promise<{ tweetId: string; tweetUrl: string }> {
    const scraper = await getOrRestoreScraper(token);

    const { tweetId } = await sendTweetGraphQL(scraper, text, replyToId);

    const tweetUrl = tweetId
        ? `https://x.com/${token.providerUsername}/status/${tweetId}`
        : `https://x.com/${token.providerUsername}`;

    console.log(`[TW-Unofficial] Reply enviado: ${tweetId} (reply to ${replyToId})`);

    return { tweetId, tweetUrl };
}

// ── Leitura / Métricas ─────────────────────────────────────────────────────

/**
 * Obtém dados de um tweet específico
 */
export async function getTweetData(
    token: SocialToken,
    tweetId: string
): Promise<{
    text: string;
    likes: number;
    retweets: number;
    replies: number;
    views: number;
    photos: string[];
    videos: string[];
    createdAt?: Date;
} | null> {
    const scraper = await getOrRestoreScraper(token);
    const tweet = await scraper.getTweet(tweetId);

    if (!tweet) return null;

    return {
        text: tweet.text || '',
        likes: tweet.likes || 0,
        retweets: tweet.retweets || 0,
        replies: tweet.replies || 0,
        views: tweet.views || 0,
        photos: tweet.photos.map(p => p.url),
        videos: tweet.videos.map(v => v.url || v.preview),
        createdAt: tweet.timeParsed,
    };
}

/**
 * Obtém os tweets mais recentes do usuário
 */
export async function getLatestTweets(
    token: SocialToken,
    count: number = 10
): Promise<Array<{
    id: string;
    text: string;
    likes: number;
    retweets: number;
    replies: number;
    views: number;
    createdAt?: Date;
}>> {
    const scraper = await getOrRestoreScraper(token);

    const tweets: Array<any> = [];
    const generator = scraper.getTweets(token.providerUsername, count);

    for await (const tweet of generator) {
        tweets.push({
            id: tweet.id || '',
            text: tweet.text || '',
            likes: tweet.likes || 0,
            retweets: tweet.retweets || 0,
            replies: tweet.replies || 0,
            views: tweet.views || 0,
            createdAt: tweet.timeParsed,
        });

        if (tweets.length >= count) break;
    }

    return tweets;
}

/**
 * Obtém informações do perfil
 */
export async function getTwitterProfileInfo(
    token: SocialToken
): Promise<{
    followersCount: number;
    followingCount: number;
    tweetsCount: number;
    displayName: string;
    biography: string;
    profilePicUrl: string;
    isVerified: boolean;
}> {
    const scraper = await getOrRestoreScraper(token);
    const profile = await scraper.getProfile(token.providerUsername);

    if (!profile) {
        throw new Error('Não foi possível obter o perfil do Twitter.');
    }

    return {
        followersCount: profile.followersCount || 0,
        followingCount: profile.followingCount || 0,
        tweetsCount: profile.tweetsCount || 0,
        displayName: profile.name || '',
        biography: profile.biography || '',
        profilePicUrl: profile.avatar || '',
        isVerified: profile.isVerified || false,
    };
}

/**
 * Busca tweets por query
 */
export async function searchTweets(
    token: SocialToken,
    query: string,
    count: number = 20
): Promise<Array<{
    id: string;
    text: string;
    username: string;
    likes: number;
    retweets: number;
    views: number;
}>> {
    const scraper = await getOrRestoreScraper(token);

    const tweets: Array<any> = [];
    const generator = scraper.searchTweets(query, count, SearchMode.Latest);

    for await (const tweet of generator) {
        tweets.push({
            id: tweet.id || '',
            text: tweet.text || '',
            username: tweet.username || '',
            likes: tweet.likes || 0,
            retweets: tweet.retweets || 0,
            views: tweet.views || 0,
        });

        if (tweets.length >= count) break;
    }

    return tweets;
}

/**
 * Valida se a sessão do Twitter ainda é válida
 */
export async function validateTwitterSession(token: SocialToken): Promise<boolean> {
    try {
        const scraper = await getOrRestoreScraper(token);
        return await scraper.isLoggedIn();
    } catch {
        return false;
    }
}
