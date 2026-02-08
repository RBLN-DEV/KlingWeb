// ============================================================================
// Social Publish Handler — Processa jobs da fila de publicação
// ============================================================================
// Este módulo registra o handler 'publish' na fila de processamento.
// Quando um job é processado, ele:
//   1. Busca o token OAuth do usuário
//   2. Busca os dados da publicação
//   3. Chama o serviço correto (Instagram ou Twitter) para publicar
//   4. Atualiza a publicação com o resultado (providerPostId, providerPostUrl)
// ============================================================================

import { socialQueue } from './social-queue.service.js';
import { getTokenById, markTokenUsed } from './social-token.store.js';
import { getPublicationById, updatePublication } from '../routes/social-publish.routes.js';
import {
    publishInstagramImage,
    publishInstagramVideo,
} from './instagram.service.js';
import {
    uploadTwitterImage,
    uploadTwitterVideo,
    createTweetWithMedia,
} from './twitter.service.js';
import {
    sendTweet,
} from './twitter-unofficial.service.js';
import { InstagramBotService } from './instagram-bot/instagram-bot.service.js';
import type { QueueJob, SocialToken } from '../types/social.types.js';

// ── Register Handler ───────────────────────────────────────────────────────

export function registerPublishHandler(): void {
    socialQueue.registerHandler('publish', handlePublishJob);
    console.log('[Social] Publish handler registered with queue');
}

// ── Handler Implementation ─────────────────────────────────────────────────

async function handlePublishJob(job: QueueJob): Promise<void> {
    const publicationId = job.publicationId;
    const tokenId = job.tokenId;

    if (!publicationId || !tokenId) {
        throw new Error('Missing publicationId or tokenId in job');
    }

    // 1. Get token
    const token = getTokenById(tokenId);
    if (!token) {
        updatePublication(publicationId, {
            status: 'failed',
            error: 'Token OAuth não encontrado ou expirado',
        });
        throw new Error('OAuth token not found');
    }

    // 2. Get publication
    const publication = getPublicationById(publicationId);
    if (!publication) {
        throw new Error('Publication not found');
    }

    // 3. Update status to processing
    updatePublication(publicationId, { status: 'processing' });

    // Build full caption with hashtags
    const hashtagStr = publication.hashtags && publication.hashtags.length > 0
        ? '\n\n' + publication.hashtags.map(t => `#${t}`).join(' ')
        : '';
    const fullCaption = (publication.caption || '') + hashtagStr;

    try {
        let providerPostId: string | undefined;
        let providerPostUrl: string | undefined;

        if (job.provider === 'instagram') {
            const result = await publishToInstagram(
                token,
                publication.mediaUrl,
                publication.mediaType,
                fullCaption
            );
            providerPostId = result.postId;
            providerPostUrl = result.postUrl;
        } else if (job.provider === 'twitter') {
            const result = await publishToTwitter(
                token,
                publication.mediaUrl,
                publication.mediaType,
                fullCaption
            );
            providerPostId = result.tweetId;
            providerPostUrl = result.tweetUrl;
        } else {
            throw new Error(`Unknown provider: ${job.provider}`);
        }

        // 4. Update publication with success
        updatePublication(publicationId, {
            status: 'published',
            providerPostId,
            providerPostUrl,
            publishedAt: new Date().toISOString(),
        });

        // Mark token as used
        markTokenUsed(tokenId);

        console.log(`[Social] Published ${job.provider} post: ${providerPostId}`);

    } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        updatePublication(publicationId, {
            status: 'failed',
            error: errorMsg,
        });
        throw err; // Re-throw for queue retry logic
    }
}

// ── Instagram Publishing ───────────────────────────────────────────────────

async function publishToInstagram(
    token: SocialToken,
    mediaUrl: string,
    mediaType: string,
    caption: string
): Promise<{ postId: string; postUrl: string }> {
    const isUnofficial = token.metadata.authMode === 'unofficial';

    if (isUnofficial) {
        return publishToInstagramUnofficial(token, mediaUrl, mediaType, caption);
    }

    // Modo oficial (API Graph)
    if (mediaType === 'image') {
        return publishInstagramImage(token, mediaUrl, caption);
    } else {
        return publishInstagramVideo(token, mediaUrl, caption, mediaType === 'reel');
    }
}

async function publishToInstagramUnofficial(
    token: SocialToken,
    mediaUrl: string,
    mediaType: string,
    caption: string
): Promise<{ postId: string; postUrl: string }> {
    // Usar Instagram Bot (Web API) em vez do instagram-private-api (mobile API)
    // O Bot usa proxy residencial brasileiro e emulação de browser Chrome
    const appUserId = token.userId || 'default';
    const bot = InstagramBotService.getInstance(appUserId);

    // Garantir que o bot está logado
    if (!bot.getStatus().isLoggedIn) {
        console.log('[IG-WebAPI] Bot não logado, tentando login automático...');
        const username = token.providerUsername || process.env.INSTAGRAM_USERNAME || '';
        const password = token.metadata?.igPassword || process.env.INSTAGRAM_PASSWORD || '';
        if (username && password) {
            const loginOk = await bot.loginDirect(username, password);
            if (!loginOk) {
                throw new Error('Falha no login do bot via Web API');
            }
        } else {
            // Tentar auto-login a partir dos tokens salvos
            const autoOk = await bot.autoLogin(appUserId);
            if (!autoOk) {
                throw new Error('Bot não autenticado e credenciais não disponíveis');
            }
        }
    }

    // Determinar destino correto
    let destination: 'feed' | 'story' | 'reel' = 'feed';
    if (mediaType === 'reel') {
        destination = 'reel';
    } else if (mediaType === 'story') {
        destination = 'story';
    }

    const result = await bot.publishFromUrl({
        mediaUrl,
        caption,
        destination,
        mediaType: (mediaType === 'image') ? 'image' : 'video',
    });

    if (!result.success) {
        throw new Error(result.error || 'Falha na publicação via Web API');
    }

    return {
        postId: result.mediaId || 'unknown',
        postUrl: result.postUrl || `https://www.instagram.com/${token.providerUsername}/`,
    };
}

// ── Twitter Publishing ─────────────────────────────────────────────────────

async function publishToTwitter(
    token: SocialToken,
    mediaUrl: string,
    mediaType: string,
    caption: string
): Promise<{ tweetId: string; tweetUrl: string }> {
    const isUnofficial = token.metadata.authMode === 'unofficial';

    if (isUnofficial) {
        return publishToTwitterUnofficial(token, mediaUrl, mediaType, caption);
    }

    // Modo oficial (API v2)
    const response = await fetch(mediaUrl);
    if (!response.ok) {
        throw new Error(`Failed to download media: ${response.statusText}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());

    let mediaId: string;
    if (mediaType === 'image') {
        mediaId = await uploadTwitterImage(token, buffer, 'image/jpeg');
    } else {
        mediaId = await uploadTwitterVideo(token, buffer, 'video/mp4');
    }

    return createTweetWithMedia(token, caption, [mediaId]);
}

async function publishToTwitterUnofficial(
    token: SocialToken,
    _mediaUrl: string,
    _mediaType: string,
    caption: string
): Promise<{ tweetId: string; tweetUrl: string }> {
    // twitter-scraper suporta envio de tweets com texto
    // Upload de mídia não é suportado nativamente pela lib
    // Então enviamos apenas o texto + URL da mídia
    const tweetText = _mediaUrl
        ? `${caption}\n\n${_mediaUrl}`
        : caption;

    // Truncar para 280 caracteres
    const truncated = tweetText.length > 280
        ? tweetText.substring(0, 277) + '...'
        : tweetText;

    return sendTweet(token, truncated);
}
