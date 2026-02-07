import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  FileText,
  Heart,
  Eye,
  TrendingUp,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/ui-custom/StatsCard';
import { EngagementChart } from '@/components/social/EngagementChart';
import { TopPostsGrid } from '@/components/social/TopPostsGrid';
import { ProviderComparison } from '@/components/social/ProviderComparison';
import { useSocialMetrics } from '@/hooks/useSocialMetrics';
import { cn } from '@/lib/utils';

type Period = '7d' | '30d' | '90d';

const PERIOD_LABELS: Record<Period, string> = {
  '7d': '7 dias',
  '30d': '30 dias',
  '90d': '90 dias',
};

export function SocialDashboard() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>('7d');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    summary,
    chartData,
    topPosts,
    comparison,
    isLoading,
    error,
    fetchAllMetrics,
  } = useSocialMetrics();

  useEffect(() => {
    fetchAllMetrics(period);
  }, [period, fetchAllMetrics]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAllMetrics(period);
    setIsRefreshing(false);
  };

  const formatDelta = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value}`;
  };

  const formatLargeNumber = (n: number): string => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7e57c2] to-[#1DA1F2] flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Social Dashboard</h1>
              <p className="text-[#b0b0b0] mt-0.5">
                Métricas de engajamento das suas redes sociais
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate('/social-hub')}
              className="border-[#444444] text-white hover:bg-[#2a2a2a]"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Social Hub
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-[#444444] text-white hover:bg-[#2a2a2a]"
            >
              <RefreshCw className={cn('w-4 h-4 mr-1', isRefreshing && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Period Selector */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="flex gap-2 mb-6"
      >
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={cn(
              'px-4 py-2 rounded-lg text-sm font-medium transition-all',
              period === p
                ? 'bg-[#7e57c2] text-white'
                : 'bg-[#2a2a2a] text-[#b0b0b0] hover:bg-[#333333] hover:text-white border border-[#444444]'
            )}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg"
        >
          <p className="text-sm text-red-300">{error}</p>
        </motion.div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatsCard
          title="Total de Posts"
          value={summary?.totalPosts ?? 0}
          subtitle={`${formatDelta(summary?.totalPostsDelta ?? 0)} vs período anterior`}
          icon={FileText}
          trend={summary?.totalPostsDelta && summary.totalPostsDelta > 0 ? 'up' : 'neutral'}
          trendValue={formatDelta(summary?.totalPostsDelta ?? 0)}
          color="purple"
          delay={0}
        />
        <StatsCard
          title="Total de Curtidas"
          value={formatLargeNumber(summary?.totalLikes ?? 0)}
          subtitle={`${formatDelta(summary?.totalLikesDelta ?? 0)} vs período anterior`}
          icon={Heart}
          trend={summary?.totalLikesDelta && summary.totalLikesDelta > 0 ? 'up' : 'neutral'}
          trendValue={formatDelta(summary?.totalLikesDelta ?? 0)}
          color="pink"
          delay={0.1}
        />
        <StatsCard
          title="Alcance Total"
          value={formatLargeNumber(summary?.totalReach ?? 0)}
          subtitle={`${formatDelta(summary?.totalReachDelta ?? 0)} vs período anterior`}
          icon={Eye}
          trend={summary?.totalReachDelta && summary.totalReachDelta > 0 ? 'up' : 'neutral'}
          trendValue={formatDelta(summary?.totalReachDelta ?? 0)}
          color="blue"
          delay={0.2}
        />
        <StatsCard
          title="Taxa de Engajamento"
          value={`${(summary?.avgEngagementRate ?? 0).toFixed(1)}%`}
          subtitle={`${formatDelta(summary?.avgEngagementRateDelta ?? 0)}% vs período anterior`}
          icon={TrendingUp}
          trend={summary?.avgEngagementRateDelta && summary.avgEngagementRateDelta > 0 ? 'up' : 'neutral'}
          trendValue={`${formatDelta(summary?.avgEngagementRateDelta ?? 0)}%`}
          color="green"
          delay={0.3}
        />
      </div>

      {/* Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-8"
      >
        <h2 className="text-lg font-semibold text-white mb-4">
          📈 Engajamento ao Longo do Tempo
        </h2>
        <EngagementChart data={chartData} isLoading={isLoading} />
      </motion.div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Posts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <h2 className="text-lg font-semibold text-white mb-4">🏆 Top Posts</h2>
          <TopPostsGrid posts={topPosts} isLoading={isLoading} />
        </motion.div>

        {/* Provider Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <h2 className="text-lg font-semibold text-white mb-4">📊 Comparativo por Rede</h2>
          <ProviderComparison data={comparison} isLoading={isLoading} />
        </motion.div>
      </div>
    </div>
  );
}
