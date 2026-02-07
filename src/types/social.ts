// Social Media Integration — Frontend Types
// Espelha os tipos do backend (server/src/types/social.types.ts)

export type SocialProvider = 'instagram' | 'twitter';
export type AuthMode = 'official' | 'unofficial';

export interface SocialConnection {
  id: string;
  provider: SocialProvider;
  accountName: string;
  accountId: string;
  profilePictureUrl?: string;
  isActive: boolean;
  connectedAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  authMode?: AuthMode;
}

// Credenciais para login não-oficial (username/password)
export interface UnofficialLoginCredentials {
  username: string;
  password: string;
  email?: string; // Necessário para Twitter
}

export interface UnofficialLoginResult {
  success: boolean;
  connection?: SocialConnection;
  error?: string;
  requiresTwoFactor?: boolean;
  requiresChallenge?: boolean;
}

export type PublicationStatus =
  | 'draft'
  | 'queued'
  | 'processing'
  | 'published'
  | 'failed'
  | 'cancelled';

export type MediaType = 'image' | 'video' | 'reel';

export interface Publication {
  id: string;
  userId: string;
  provider: SocialProvider;
  tokenId: string;
  status: PublicationStatus;
  mediaType: MediaType;
  mediaUrl: string;
  caption: string;
  hashtags: string[];
  externalPostId?: string;
  externalPostUrl?: string;
  scheduledFor?: string;
  publishedAt?: string;
  error?: string;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublishRequest {
  provider: SocialProvider;
  tokenId: string;
  mediaUrl: string;
  mediaType: MediaType;
  caption: string;
  hashtags?: string[];
  scheduledFor?: string;
}

export interface PublishMultiRequest {
  providers: {
    provider: SocialProvider;
    tokenId: string;
    captionOverride?: string;
  }[];
  mediaUrl: string;
  mediaType: MediaType;
  caption: string;
  hashtags?: string[];
}

// Dashboard types
export interface DashboardSummary {
  period: '7d' | '30d' | '90d';
  totalPosts: number;
  totalPostsDelta: number;
  totalLikes: number;
  totalLikesDelta: number;
  totalReach: number;
  totalReachDelta: number;
  avgEngagementRate: number;
  avgEngagementRateDelta: number;
  byProvider: {
    instagram: ProviderSummary;
    twitter: ProviderSummary;
  };
}

export interface ProviderSummary {
  posts: number;
  likes: number;
  reach: number;
  engagementRate: number;
}

export interface DashboardChartData {
  period: string;
  provider: 'all' | SocialProvider;
  dataPoints: ChartDataPoint[];
}

export interface ChartDataPoint {
  date: string;
  likes: number;
  comments: number;
  shares: number;
  impressions: number;
  reach: number;
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

export interface ProviderComparisonData {
  provider: SocialProvider;
  totalPosts: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalReach: number;
  avgEngagementRate: number;
}

export interface QueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  deadLetter: number;
  recentJobs: QueueJobSummary[];
}

export interface QueueJobSummary {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface RateLimitStatus {
  provider: SocialProvider;
  endpoints: {
    key: string;
    remaining: number;
    limit: number;
    resetsAt: string;
    isLimited: boolean;
  }[];
}
