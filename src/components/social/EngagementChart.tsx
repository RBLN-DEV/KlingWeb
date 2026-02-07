import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { DashboardChartData } from '@/types/social';

interface EngagementChartProps {
  data: DashboardChartData | null;
  isLoading: boolean;
}

export function EngagementChart({ data, isLoading }: EngagementChartProps) {
  const chartData = useMemo(() => {
    if (!data?.dataPoints) return [];
    return data.dataPoints.map(dp => ({
      ...dp,
      date: new Date(dp.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="h-[300px] bg-[#2a2a2a] rounded-xl border border-[#444444] animate-pulse flex items-center justify-center">
        <span className="text-[#666666] text-sm">Carregando gráfico...</span>
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="h-[300px] bg-[#2a2a2a] rounded-xl border border-[#444444] flex items-center justify-center">
        <span className="text-[#666666] text-sm">Sem dados de engajamento no período</span>
      </div>
    );
  }

  return (
    <div className="h-[300px] bg-[#2a2a2a] rounded-xl border border-[#444444] p-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7e57c2" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#7e57c2" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradComments" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#E4405F" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#E4405F" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gradShares" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1DA1F2" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#1DA1F2" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#333333" />
          <XAxis
            dataKey="date"
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
            itemStyle={{ color: '#b0b0b0' }}
            labelStyle={{ color: '#ffffff', fontWeight: 'bold' }}
          />
          <Legend
            wrapperStyle={{ fontSize: '12px', color: '#b0b0b0' }}
          />
          <Area
            type="monotone"
            dataKey="likes"
            name="Curtidas"
            stroke="#7e57c2"
            strokeWidth={2}
            fill="url(#gradLikes)"
          />
          <Area
            type="monotone"
            dataKey="comments"
            name="Comentários"
            stroke="#E4405F"
            strokeWidth={2}
            fill="url(#gradComments)"
          />
          <Area
            type="monotone"
            dataKey="shares"
            name="Compartilhamentos"
            stroke="#1DA1F2"
            strokeWidth={2}
            fill="url(#gradShares)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
