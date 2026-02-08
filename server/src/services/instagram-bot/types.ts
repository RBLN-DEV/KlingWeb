// ============================================================================
// Instagram Bot — Tipos TypeScript
// ============================================================================

export interface BotConfig {
    // Delays (ms)
    minDelay: number;
    maxDelay: number;
    longMinDelay: number;
    longMaxDelay: number;

    // Limites por hora
    maxLikesPerHour: number;
    maxFollowsPerHour: number;
    maxUnfollowsPerHour: number;
    maxCommentsPerHour: number;
    maxActionsPerDay: number;

    // Conteúdo
    postsPerDay: number;
    defaultPostHours: number[];

    // Alvos
    targetHashtags: string[];
    targetInfluencers: string[];
    targetCompetitors: string[];

    // Comentários
    commentTemplates: string[];
}

export const DEFAULT_BOT_CONFIG: BotConfig = {
    minDelay: 2000,
    maxDelay: 5000,
    longMinDelay: 10000,
    longMaxDelay: 20000,
    maxLikesPerHour: 30,
    maxFollowsPerHour: 20,
    maxUnfollowsPerHour: 25,
    maxCommentsPerHour: 8,
    maxActionsPerDay: 400,
    postsPerDay: 2,
    defaultPostHours: [9, 19],
    targetHashtags: ['tecnologia', 'programacao', 'developer', 'coding'],
    targetInfluencers: [],
    targetCompetitors: [],
    commentTemplates: [
        'Conteúdo incrível! 🔥',
        'Muito bom mesmo! 👏',
        'Adorei isso! ❤️',
        'Que post fantástico! ✨',
        'Valeu pela dica! 🙌',
        'Salvando aqui! 💾',
        'Muito útil, obrigado! 🙏',
    ],
};

export interface UserProfile {
    username: string;
    userId: string;
    followersCount: number;
    followingCount: number;
    isPrivate: boolean;
    isVerified: boolean;
    followedAt?: string;
    unfollowedAt?: string;
    followsBack?: boolean;
    source: string;
}

export interface GrowthStats {
    day: string;
    followsPerformed: number;
    unfollowsPerformed: number;
    likesSent: number;
    commentsSent: number;
    storiesViewed: number;
}

export interface GrowthSessionConfig {
    follows: number;
    unfollows: number;
    likes: number;
    comments: number;
    stories: number;
    likesPerTag: number;
}

export type GrowthSessionType = 'aggressive' | 'balanced' | 'safe';

export const GROWTH_SESSION_CONFIGS: Record<GrowthSessionType, GrowthSessionConfig> = {
    aggressive: {
        follows: 50, unfollows: 50, likes: 100,
        comments: 15, stories: 100, likesPerTag: 50,
    },
    balanced: {
        follows: 30, unfollows: 30, likes: 60,
        comments: 8, stories: 50, likesPerTag: 30,
    },
    safe: {
        follows: 15, unfollows: 15, likes: 30,
        comments: 3, stories: 20, likesPerTag: 15,
    },
};

export interface ScheduledPost {
    id: string;
    contentType: 'feed' | 'story' | 'reel';
    mediaPath: string;
    caption: string;
    hashtags: string[];
    scheduledTime: string;
    posted: boolean;
    postedAt?: string;
    error?: string;
}

export interface AnalyticsData {
    followerActivity: Record<number, number>;
    postPerformance: {
        totalAnalyzed: number;
        avgEngagement: number;
        bestPost?: any;
        posts: any[];
        analyzedAt?: string;
    };
    bestTimes: {
        top5: Array<[number, number, string]>;
        allHours: Array<[number, number, string]>;
        updatedAt?: string;
    };
    lastUpdated?: string;
}

export interface BotActionResult {
    success: boolean;
    action: string;
    count?: number;
    details?: string;
    error?: string;
}

export interface BotStatusInfo {
    isLoggedIn: boolean;
    username?: string;
    userId?: string;
    sessionActive: boolean;
    config: BotConfig;
    rateLimiterStats: Record<string, number>;
    growthStatsToday?: GrowthStats;
    followersManagerStats?: Record<string, any>;
}
