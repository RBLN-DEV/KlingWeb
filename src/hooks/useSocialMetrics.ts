import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type {
  DashboardSummary,
  DashboardChartData,
  TopPost,
  ProviderComparisonData,
  RateLimitStatus,
  SocialProvider,
} from '@/types/social';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

type Period = '7d' | '30d' | '90d';

export function useSocialMetrics() {
  const { token } = useAuth();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [chartData, setChartData] = useState<DashboardChartData | null>(null);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [comparison, setComparison] = useState<ProviderComparisonData[]>([]);
  const [rateLimits, setRateLimits] = useState<RateLimitStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  // Fetch dashboard summary
  const fetchSummary = useCallback(async (period: Period = '7d') => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/social/dashboard/summary?period=${period}`, {
        headers: headers(),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setSummary(json.data);
      } else {
        setError(json.error || 'Erro ao carregar resumo');
      }
    } catch (err) {
      // Silent — prevent crash on network/parse errors
    } finally {
      setIsLoading(false);
    }
  }, [token, headers]);

  // Fetch chart data
  const fetchChartData = useCallback(async (
    period: Period = '7d',
    provider: 'all' | SocialProvider = 'all'
  ) => {
    if (!token) return;
    try {
      const params = new URLSearchParams({ period, provider });
      const res = await fetch(`${API_BASE}/api/social/dashboard/chart?${params}`, {
        headers: headers(),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setChartData(json.data);
      }
    } catch {
      // silent
    }
  }, [token, headers]);

  // Fetch top posts
  const fetchTopPosts = useCallback(async (limit: number = 5) => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/social/dashboard/top-posts?limit=${limit}`, {
        headers: headers(),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setTopPosts(json.data);
      }
    } catch {
      // silent
    }
  }, [token, headers]);

  // Fetch provider comparison
  const fetchComparison = useCallback(async (period: Period = '7d') => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/social/dashboard/comparison?period=${period}`, {
        headers: headers(),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setComparison(json.data);
      }
    } catch {
      // silent
    }
  }, [token, headers]);

  // Fetch rate limits
  const fetchRateLimits = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/social/dashboard/rate-limits`, {
        headers: headers(),
      });
      if (!res.ok) return;
      const json = await res.json();
      if (json.success) {
        setRateLimits(json.data);
      }
    } catch {
      // silent
    }
  }, [token, headers]);

  // Fetch all dashboard data at once
  const fetchAllMetrics = useCallback(async (period: Period = '7d') => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      await Promise.all([
        fetchSummary(period),
        fetchChartData(period),
        fetchTopPosts(),
        fetchComparison(period),
      ]);
    } catch {
      setError('Erro ao carregar métricas');
    } finally {
      setIsLoading(false);
    }
  }, [token, fetchSummary, fetchChartData, fetchTopPosts, fetchComparison]);

  return {
    summary,
    chartData,
    topPosts,
    comparison,
    rateLimits,
    isLoading,
    error,
    fetchSummary,
    fetchChartData,
    fetchTopPosts,
    fetchComparison,
    fetchRateLimits,
    fetchAllMetrics,
  };
}
