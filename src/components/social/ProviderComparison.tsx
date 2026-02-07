import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { Instagram, Twitter } from 'lucide-react';
import type { ProviderComparisonData, SocialProvider } from '@/types/social';

const PROVIDER_COLORS: Record<SocialProvider, string> = {
  instagram: '#E4405F',
  twitter: '#1DA1F2',
};

interface ProviderComparisonProps {
  data: ProviderComparisonData[];
  isLoading: boolean;
}

export function ProviderComparison({ data, isLoading }: ProviderComparisonProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [
      {
        name: 'Posts',
        Instagram: data.find(d => d.provider === 'instagram')?.totalPosts ?? 0,
        Twitter: data.find(d => d.provider === 'twitter')?.totalPosts ?? 0,
      },
      {
        name: 'Curtidas',
        Instagram: data.find(d => d.provider === 'instagram')?.totalLikes ?? 0,
        Twitter: data.find(d => d.provider === 'twitter')?.totalLikes ?? 0,
      },
      {
        name: 'Comentários',
        Instagram: data.find(d => d.provider === 'instagram')?.totalComments ?? 0,
        Twitter: data.find(d => d.provider === 'twitter')?.totalComments ?? 0,
      },
      {
        name: 'Compartilhamentos',
        Instagram: data.find(d => d.provider === 'instagram')?.totalShares ?? 0,
        Twitter: data.find(d => d.provider === 'twitter')?.totalShares ?? 0,
      },
    ];
  }, [data]);

  if (isLoading) {
    return (
      <div className="h-[280px] bg-[#2a2a2a] rounded-xl border border-[#444444] animate-pulse flex items-center justify-center">
        <span className="text-[#666666] text-sm">Carregando comparativo...</span>
      </div>
    );
  }

  if (chartData.length === 0 || data.every(d => d.totalPosts === 0)) {
    return (
      <div className="h-[280px] bg-[#2a2a2a] rounded-xl border border-[#444444] flex flex-col items-center justify-center gap-3">
        <div className="flex gap-4">
          <Instagram className="w-8 h-8 text-[#444444]" />
          <Twitter className="w-8 h-8 text-[#444444]" />
        </div>
        <span className="text-[#666666] text-sm">Sem dados comparativos no período</span>
      </div>
    );
  }

  return (
    <div className="h-[280px] bg-[#2a2a2a] rounded-xl border border-[#444444] p-4">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
          <XAxis
            dataKey="name"
            tick={{ fill: '#b0b0b0', fontSize: 11 }}
            axisLine={{ stroke: '#444444' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#b0b0b0', fontSize: 11 }}
            axisLine={{ stroke: '#444444' }}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#1e1e1e',
              border: '1px solid #444444',
              borderRadius: '8px',
              color: '#ffffff',
              fontSize: '12px',
            }}
          />
          <Legend wrapperStyle={{ fontSize: '12px', color: '#b0b0b0' }} />
          <Bar
            dataKey="Instagram"
            fill={PROVIDER_COLORS.instagram}
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="Twitter"
            fill={PROVIDER_COLORS.twitter}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
