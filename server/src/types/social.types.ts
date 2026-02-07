// ============================================================================
// Módulo Social Media — Tipos TypeScript
// ============================================================================

// ── Providers ──────────────────────────────────────────────────────────────

export type SocialProvider = 'instagram' | 'twitter';

// ── OAuth & Tokens ─────────────────────────────────────────────────────────

export interface SocialToken {
    id: string;
    userId: string;                           // Referência ao StoredUser.id
    provider: SocialProvider;
    providerUserId: string;
    providerUsername: string;
    profilePictureUrl?: string;
    accessToken: string;                      // Criptografado com AES-256-GCM
    refreshToken?: string;                    // Criptografado (Twitter / IG long-lived)
    tokenExpiresAt: string;                   // ISO 8601
    scopes: string[];
    isActive: boolean;
    connectedAt: string;                      // ISO 8601
    lastRefreshedAt: string;
    lastUsedAt?: string;
    metadata: {
        // Instagram-specific (Official API)
        instagramBusinessAccountId?: string;
        facebookPageId?: string;
        facebookPageAccessToken?: string;     // Criptografado — necessário para publicação IG
        // Twitter-specific (Official API)
        twitterCodeVerifier?: string;         // PKCE (temporário, durante auth flow)
        // Unofficial mode fields
        authMode?: 'official' | 'unofficial';
        // Instagram Unofficial
        igCookies?: string;                   // Criptografado — cookies da sessão IG
        igPassword?: string;                  // Criptografado — para re-login automático
        // Twitter Unofficial
        twCookies?: string;                   // Criptografado — cookies da sessão Twitter
        twPassword?: string;                  // Criptografado — para re-login automático
        twEmail?: string;                     // Criptografado — email para login Twitter
    };
}

export type PublicSocialToken = Omit<SocialToken, 'accessToken' | 'refreshToken' | 'metadata'> & {
    metadata: {
        instagramBusinessAccountId?: string;
        facebookPageId?: string;
    };
};

// ── Publicações ────────────────────────────────────────────────────────────

export type PublicationStatus =
    | 'queued'
    | 'processing'
    | 'media_ready'
    | 'publishing'
    | 'published'
    | 'failed'
    | 'cancelled';

export type MediaType = 'image' | 'video' | 'reel';

export interface Publication {
    id: string;
    userId: string;
    socialTokenId: string;
    provider: SocialProvider;

    // Conteúdo
    mediaType: MediaType;
    mediaSourceId?: string;                   // ID da imagem/vídeo no sistema KlingAI
    mediaUrl: string;
    caption: string;
    hashtags: string[];

    // Status
    status: PublicationStatus;
    providerMediaId?: string;
    providerPostId?: string;
    providerPostUrl?: string;
    error?: string;

    // Retry
    retryCount: number;
    maxRetries: number;
    nextRetryAt?: string;

    // Agendamento
    scheduledAt?: string;
    publishedAt?: string;

    // Timestamps
    createdAt: string;
    updatedAt: string;
}

// ── Engajamento ────────────────────────────────────────────────────────────

export interface EngagementMetrics {
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    impressions: number;
    reach: number;
    engagementRate: number;
    videoViews?: number;
    videoWatchTime?: number;
}

export interface ProviderSpecificMetrics {
    // Instagram
    ig_saves?: number;
    ig_profile_visits?: number;
    ig_website_clicks?: number;
    // Twitter
    tw_retweets?: number;
    tw_quote_tweets?: number;
    tw_bookmarks?: number;
    tw_url_clicks?: number;
}

export interface EngagementSnapshot {
    id: string;
    publicationId: string;
    provider: SocialProvider;
    providerPostId: string;
    metrics: EngagementMetrics;
    providerMetrics: ProviderSpecificMetrics;
    collectedAt: string;
    collectionMethod: 'webhook' | 'polling';
}

export interface EngagementSummary {
    publicationId: string;
    provider: SocialProvider;
    currentMetrics: EngagementMetrics;
    deltas: {
        likes: number;
        comments: number;
        shares: number;
        impressions: number;
    };
    history: {
        timestamp: string;
        likes: number;
        comments: number;
        impressions: number;
    }[];
    lastUpdatedAt: string;
}

// ── Fila de Jobs ───────────────────────────────────────────────────────────

export type QueueJobType = 'publish' | 'collect_metrics' | 'refresh_token';
export type QueueJobPriority = 'high' | 'normal' | 'low';
export type QueueJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead';

export interface QueueJob {
    id: string;
    publicationId?: string;
    tokenId?: string;
    type: QueueJobType;
    priority: QueueJobPriority;
    provider: SocialProvider;
    scheduledAt: string;
    attempts: number;
    maxAttempts: number;
    status: QueueJobStatus;
    error?: string;
    data?: Record<string, unknown>;
    createdAt: string;
    processedAt?: string;
    completedAt?: string;
}

// ── Rate Limiting ──────────────────────────────────────────────────────────

export interface RateLimitConfig {
    maxRequests: number;
    windowMs: number;
    provider: SocialProvider;
    endpoint: string;
}

export interface RateLimitState {
    key: string;
    requests: number;
    windowStart: number;
    resetAt: number;
    retryAfter?: number;
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export type DashboardPeriod = '7d' | '30d' | '90d';

export interface DashboardSummary {
    period: DashboardPeriod;
    totalPosts: number;
    totalPostsDelta: number;
    totalLikes: number;
    totalLikesDelta: number;
    totalReach: number;
    totalReachDelta: number;
    avgEngagementRate: number;
    avgEngagementRateDelta: number;
    byProvider: {
        instagram: { posts: number; likes: number; reach: number; engagementRate: number };
        twitter: { posts: number; likes: number; reach: number; engagementRate: number };
    };
}

export interface DashboardChartData {
    period: string;
    provider: 'all' | SocialProvider;
    dataPoints: {
        date: string;
        likes: number;
        comments: number;
        shares: number;
        impressions: number;
        reach: number;
    }[];
}

export interface TopPost {
    publicationId: string;
    provider: SocialProvider;
    mediaType: MediaType;
    caption: string;
    thumbnailUrl?: string;
    postUrl: string;
    metrics: {
        likes: number;
        comments: number;
        shares: number;
        engagementRate: number;
    };
    publishedAt: string;
}

// ── Media Validation ───────────────────────────────────────────────────────

export interface MediaValidation {
    isValid: boolean;
    errors: string[];
    suggestions: string[];
}

export interface MediaLimits {
    maxSizeBytes: number;
    allowedFormats: string[];
    maxWidth: number;
    maxHeight: number;
    minWidth?: number;
    minHeight?: number;
    aspectRatios?: string[];
    maxDurationSeconds?: number;
    minDurationSeconds?: number;
}

export interface PlatformMediaLimits {
    image: MediaLimits;
    video: MediaLimits;
    reel?: MediaLimits;
    captionMaxLength: number;
}

// ── Publish Request/Response ───────────────────────────────────────────────

export interface PublishRequest {
    socialTokenId: string;
    mediaType: MediaType;
    mediaUrl: string;
    mediaSourceId?: string;
    caption: string;
    hashtags?: string[];
    scheduledAt?: string;
}

export interface PublishMultiRequest {
    socialTokenIds: string[];
    mediaType: MediaType;
    mediaUrl: string;
    mediaSourceId?: string;
    captions: Record<string, string>;       // provider → caption customizado
    hashtags?: string[];
    scheduledAt?: string;
}

export interface PublishResult {
    success: boolean;
    publicationId: string;
    postId?: string;
    postUrl?: string;
    error?: string;
}

// ── OAuth Request/Response ─────────────────────────────────────────────────

export interface OAuthInitResponse {
    authorizationUrl: string;
    state: string;
}

export interface OAuthCallbackResult {
    success: boolean;
    token?: PublicSocialToken;
    error?: string;
}
