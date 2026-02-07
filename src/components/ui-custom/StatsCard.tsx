import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  trend?: 'up' | 'down' | 'neutral';
  trendValue?: string;
  color?: 'purple' | 'blue' | 'green' | 'orange' | 'red' | 'pink';
  delay?: number;
}

const colorVariants = {
  purple: 'from-[#7e57c2]/20 to-[#7e57c2]/5 text-[#7e57c2]',
  blue: 'from-blue-500/20 to-blue-500/5 text-blue-500',
  green: 'from-green-500/20 to-green-500/5 text-green-500',
  orange: 'from-orange-500/20 to-orange-500/5 text-orange-500',
  red: 'from-red-500/20 to-red-500/5 text-red-500',
  pink: 'from-pink-500/20 to-pink-500/5 text-pink-500',
};

const iconBgVariants = {
  purple: 'bg-[#7e57c2]/20',
  blue: 'bg-blue-500/20',
  green: 'bg-green-500/20',
  orange: 'bg-orange-500/20',
  red: 'bg-red-500/20',
  pink: 'bg-pink-500/20',
};

export function StatsCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend = 'neutral',
  trendValue,
  color = 'purple',
  delay = 0,
}: StatsCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor = trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-[#b0b0b0]';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={cn(
        'relative overflow-hidden rounded-xl p-5',
        'bg-gradient-to-br border border-[#444444]',
        colorVariants[color]
      )}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      
      <div className="relative">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-[#b0b0b0]">{title}</p>
            <motion.h3
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: delay + 0.2 }}
              className="text-2xl font-bold text-white mt-1"
            >
              {value}
            </motion.h3>
            {subtitle && (
              <p className="text-xs text-[#b0b0b0] mt-1">{subtitle}</p>
            )}
          </div>
          
          <div className={cn('p-2.5 rounded-lg', iconBgVariants[color])}>
            <Icon className="w-5 h-5" />
          </div>
        </div>

        {trendValue && (
          <div className="flex items-center gap-1 mt-3">
            <TrendIcon className={cn('w-4 h-4', trendColor)} />
            <span className={cn('text-sm font-medium', trendColor)}>{trendValue}</span>
            <span className="text-xs text-[#b0b0b0]">vs último mês</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
