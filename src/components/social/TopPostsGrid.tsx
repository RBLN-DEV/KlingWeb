import { motion } from 'framer-motion';
import {
  Instagram,
  Twitter,
  Heart,
  MessageCircle,
  Share2,
  ExternalLink,
  Image as ImageIcon,
  Video,
  Film,
  Trophy,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TopPost, SocialProvider, MediaType } from '@/types/social';

const PROVIDER_ICONS: Record<SocialProvider, typeof Instagram> = {
  instagram: Instagram,
  twitter: Twitter,
};

const PROVIDER_COLORS: Record<SocialProvider, string> = {
  instagram: '#E4405F',
  twitter: '#1DA1F2',
};

const MEDIA_ICONS: Record<MediaType, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  reel: Film,
};

const RANK_COLORS = ['text-yellow-400', 'text-gray-300', 'text-amber-600'];

interface TopPostsGridProps {
  posts: TopPost[];
  isLoading: boolean;
}

export function TopPostsGrid({ posts, isLoading }: TopPostsGridProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-20 bg-[#2a2a2a] rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8">
        <Trophy className="w-10 h-10 text-[#444444] mx-auto mb-3" />
        <p className="text-sm text-[#666666]">Sem posts publicados no período</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {posts.map((post, index) => {
        const ProvIcon = PROVIDER_ICONS[post.provider];
        const provColor = PROVIDER_COLORS[post.provider];
        const MediaIcon = MEDIA_ICONS[post.mediaType];
        const rankColor = RANK_COLORS[index] || 'text-[#b0b0b0]';

        return (
          <motion.div
            key={post.publicationId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center gap-3 p-3 bg-[#2a2a2a] border border-[#444444] rounded-lg hover:border-[#555555] transition-colors"
          >
            {/* Rank */}
            <div className={cn('text-lg font-bold w-6 text-center flex-shrink-0', rankColor)}>
              {index + 1}
            </div>

            {/* Thumbnail */}
            <div className="w-12 h-12 rounded-lg bg-[#1a1a1a] border border-[#444444] overflow-hidden flex-shrink-0">
              {post.thumbnailUrl ? (
                <img src={post.thumbnailUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <MediaIcon className="w-5 h-5 text-[#666666]" />
                </div>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{post.caption || 'Sem legenda'}</p>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <ProvIcon className="w-3 h-3" style={{ color: provColor }} />
                  <span className="text-[10px] text-[#b0b0b0]">
                    {new Date(post.publishedAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="flex items-center gap-3 flex-shrink-0 text-xs text-[#b0b0b0]">
              <span className="flex items-center gap-1" title="Curtidas">
                <Heart className="w-3 h-3 text-red-400" />
                {formatNumber(post.metrics.likes)}
              </span>
              <span className="flex items-center gap-1" title="Comentários">
                <MessageCircle className="w-3 h-3 text-blue-400" />
                {formatNumber(post.metrics.comments)}
              </span>
              <span className="flex items-center gap-1" title="Compartilhamentos">
                <Share2 className="w-3 h-3 text-green-400" />
                {formatNumber(post.metrics.shares)}
              </span>
              {post.postUrl && (
                <a
                  href={post.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 hover:bg-[#444444] rounded transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
