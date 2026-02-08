import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

interface BotStatus {
  isLoggedIn: boolean;
  username?: string;
  userId?: string;
  config: BotConfig;
  sessionRunning: boolean;
}

interface BotConfig {
  maxFollowsPerHour: number;
  maxLikesPerHour: number;
  maxUnfollowsPerHour: number;
  maxCommentsPerHour: number;
  targetHashtags: string[];
  proxyUrl?: string;
}

interface GrowthStats {
  today: {
    follows: number;
    unfollows: number;
    likes: number;
    comments: number;
    storiesViewed: number;
  };
  weekly: {
    follows: number;
    unfollows: number;
    likes: number;
    comments: number;
    storiesViewed: number;
  };
}

interface GrowthTargets {
  influencers: Array<{ username: string; niche: string; addedAt: string }>;
  competitors: string[];
  hashtags: string[];
  commentTemplates: string[];
}

interface ScheduledPost {
  id: string;
  contentType: string;
  mediaPath: string;
  caption: string;
  hashtags: string[];
  scheduledTime: string;
  posted: boolean;
  postedAt?: string;
  error?: string;
}

interface AnalyticsReport {
  bestTimes: Array<{ hour: number; score: number; recommendation: string }>;
  postPerformance: {
    totalAnalyzed: number;
    avgEngagement: number;
    bestPost?: { engagement: number; url: string };
  };
  recommendations: string[];
}

interface FollowerStats {
  totalHistoric: number;
  activelyFollowing: number;
  unfollowed: number;
  whitelistCount: number;
  followBackRate: string;
}

export function useInstagramBot() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  }), [token]);

  const apiCall = useCallback(async <T>(endpoint: string, options?: RequestInit): Promise<T> => {
    setError(null);
    const resp = await fetch(`${API_BASE}/api/instagram-bot${endpoint}`, {
      ...options,
      headers: { ...headers(), ...options?.headers },
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Erro na API');
    return data.data as T;
  }, [headers]);

  // ── Status ──
  const getStatus = useCallback(async (): Promise<BotStatus> => {
    return apiCall<BotStatus>('/status');
  }, [apiCall]);

  // ── Login ──
  const loginBot = useCallback(async (): Promise<BotStatus> => {
    return apiCall<BotStatus>('/login', { method: 'POST' });
  }, [apiCall]);

  const loginDirect = useCallback(async (username: string, password: string): Promise<BotStatus> => {
    return apiCall<BotStatus>('/login-direct', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }, [apiCall]);

  // ── Growth ──
  const runGrowthSession = useCallback(async (type: 'aggressive' | 'balanced' | 'safe') => {
    setLoading(true);
    try {
      return await apiCall('/growth/session', {
        method: 'POST',
        body: JSON.stringify({ type }),
      });
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const abortGrowthSession = useCallback(async () => {
    return apiCall('/growth/abort', { method: 'POST' });
  }, [apiCall]);

  const likeByHashtag = useCallback(async (hashtag: string, maxLikes: number = 30) => {
    setLoading(true);
    try {
      return await apiCall('/growth/like-hashtag', {
        method: 'POST',
        body: JSON.stringify({ hashtag, maxLikes }),
      });
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const getGrowthStats = useCallback(async (): Promise<GrowthStats> => {
    return apiCall<GrowthStats>('/growth/stats');
  }, [apiCall]);

  const getGrowthTargets = useCallback(async (): Promise<GrowthTargets> => {
    return apiCall<GrowthTargets>('/growth/targets');
  }, [apiCall]);

  const addInfluencer = useCallback(async (username: string, niche: string) => {
    return apiCall('/growth/add-influencer', {
      method: 'POST',
      body: JSON.stringify({ username, niche }),
    });
  }, [apiCall]);

  // ── Followers ──
  const getFollowerStats = useCallback(async (): Promise<FollowerStats> => {
    return apiCall<FollowerStats>('/followers/stats');
  }, [apiCall]);

  const cleanNonFollowers = useCallback(async (maxUnfollows: number = 50, daysBefore: number = 2) => {
    setLoading(true);
    try {
      return await apiCall('/followers/clean', {
        method: 'POST',
        body: JSON.stringify({ maxUnfollows, daysBefore }),
      });
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const getWhitelist = useCallback(async (): Promise<string[]> => {
    return apiCall<string[]>('/followers/whitelist');
  }, [apiCall]);

  const addToWhitelist = useCallback(async (username: string) => {
    return apiCall('/followers/whitelist', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
  }, [apiCall]);

  const removeFromWhitelist = useCallback(async (username: string) => {
    return apiCall(`/followers/whitelist/${username}`, { method: 'DELETE' });
  }, [apiCall]);

  // ── Content Scheduler ──
  const getScheduledPosts = useCallback(async (all = false): Promise<ScheduledPost[]> => {
    return apiCall<ScheduledPost[]>(`/scheduler/posts?all=${all}`);
  }, [apiCall]);

  const schedulePost = useCallback(async (post: {
    mediaPath: string; caption?: string; hashtags?: string[];
    scheduledTime?: string; contentType?: string;
  }) => {
    return apiCall('/scheduler/schedule', {
      method: 'POST',
      body: JSON.stringify(post),
    });
  }, [apiCall]);

  const cancelScheduledPost = useCallback(async (postId: string) => {
    return apiCall(`/scheduler/posts/${postId}`, { method: 'DELETE' });
  }, [apiCall]);

  const startDaemon = useCallback(async (intervalMs = 300000) => {
    return apiCall('/scheduler/daemon/start', {
      method: 'POST',
      body: JSON.stringify({ intervalMs }),
    });
  }, [apiCall]);

  const stopDaemon = useCallback(async () => {
    return apiCall('/scheduler/daemon/stop', { method: 'POST' });
  }, [apiCall]);

  const getDaemonStatus = useCallback(async (): Promise<{ running: boolean }> => {
    return apiCall<{ running: boolean }>('/scheduler/daemon/status');
  }, [apiCall]);

  // ── Analytics ──
  const getAnalyticsReport = useCallback(async (): Promise<AnalyticsReport> => {
    return apiCall<AnalyticsReport>('/analytics/report');
  }, [apiCall]);

  const getBestTimes = useCallback(async () => {
    return apiCall('/analytics/best-times');
  }, [apiCall]);

  const analyzePerformance = useCallback(async (numPosts = 9) => {
    setLoading(true);
    try {
      return await apiCall('/analytics/analyze-performance', {
        method: 'POST',
        body: JSON.stringify({ numPosts }),
      });
    } finally {
      setLoading(false);
    }
  }, [apiCall]);

  const getFollowerActivity = useCallback(async () => {
    return apiCall('/analytics/activity');
  }, [apiCall]);

  return {
    loading,
    error,
    setError,
    // Status & Login
    getStatus,
    loginBot,
    loginDirect,
    // Growth
    runGrowthSession,
    abortGrowthSession,
    likeByHashtag,
    getGrowthStats,
    getGrowthTargets,
    addInfluencer,
    // Followers
    getFollowerStats,
    cleanNonFollowers,
    getWhitelist,
    addToWhitelist,
    removeFromWhitelist,
    // Content
    getScheduledPosts,
    schedulePost,
    cancelScheduledPost,
    startDaemon,
    stopDaemon,
    getDaemonStatus,
    // Analytics
    getAnalyticsReport,
    getBestTimes,
    analyzePerformance,
    getFollowerActivity,
  };
}
