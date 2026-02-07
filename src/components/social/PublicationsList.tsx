import { motion } from 'framer-motion';
import {
  Instagram,
  Twitter,
  ExternalLink,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Ban,
  RotateCcw,
  Image as ImageIcon,
  Video,
  Film,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Publication, SocialProvider, MediaType } from '@/types/social';

const PROVIDER_ICONS: Record<SocialProvider, typeof Instagram> = {
  instagram: Instagram,
  twitter: Twitter,
};

const PROVIDER_COLORS: Record<SocialProvider, string> = {
  instagram: '#E4405F',
  twitter: '#1DA1F2',
};

const STATUS_CONFIG: Record<string, { icon: typeof Clock; color: string; label: string }> = {
  queued: { icon: Clock, color: 'text-blue-400', label: 'Na Fila' },
  processing: { icon: Loader2, color: 'text-amber-400', label: 'Processando' },
  published: { icon: CheckCircle, color: 'text-green-400', label: 'Publicado' },
  failed: { icon: XCircle, color: 'text-red-400', label: 'Falhou' },
  cancelled: { icon: Ban, color: 'text-[#666666]', label: 'Cancelado' },
  draft: { icon: Clock, color: 'text-[#b0b0b0]', label: 'Rascunho' },
};

const MEDIA_ICONS: Record<MediaType, typeof ImageIcon> = {
  image: ImageIcon,
  video: Video,
  reel: Film,
};

interface PublicationsListProps {
  publications: Publication[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  isLoading: boolean;
}

export function PublicationsList({ publications, onCancel, onRetry, isLoading }: PublicationsListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-[#7e57c2] animate-spin" />
      </div>
    );
  }

  if (publications.length === 0) {
    return (
      <div className="text-center py-12 bg-[#2a2a2a]/50 rounded-xl border border-dashed border-[#444444]">
        <div className="w-16 h-16 rounded-full bg-[#444444] flex items-center justify-center mx-auto mb-4">
          <ImageIcon className="w-8 h-8 text-[#b0b0b0]" />
        </div>
        <h3 className="text-white font-medium mb-2">Nenhuma publicação ainda</h3>
        <p className="text-[#b0b0b0] text-sm">
          Publique conteúdo pelo Social Hub ou diretamente das galerias.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {publications.map((pub, index) => {
        const ProvIcon = PROVIDER_ICONS[pub.provider];
        const provColor = PROVIDER_COLORS[pub.provider];
        const statusConf = STATUS_CONFIG[pub.status] || STATUS_CONFIG.draft;
        const StatusIcon = statusConf.icon;
        const MediaIcon = MEDIA_ICONS[pub.mediaType];

        return (
          <motion.div
            key={pub.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="flex items-center gap-4 p-4 bg-[#2a2a2a] border border-[#444444] rounded-lg hover:border-[#555555] transition-colors"
          >
            {/* Media type icon */}
            <div className="w-10 h-10 rounded-lg bg-[#1a1a1a] flex items-center justify-center flex-shrink-0">
              <MediaIcon className="w-5 h-5 text-[#b0b0b0]" />
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">
                {pub.caption || 'Sem legenda'}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <div className="flex items-center gap-1">
                  <ProvIcon className="w-3 h-3" style={{ color: provColor }} />
                  <span className="text-xs text-[#b0b0b0]">
                    {pub.provider === 'instagram' ? 'Instagram' : 'Twitter'}
                  </span>
                </div>
                <div className={cn('flex items-center gap-1', statusConf.color)}>
                  <StatusIcon className={cn(
                    'w-3 h-3',
                    pub.status === 'processing' && 'animate-spin'
                  )} />
                  <span className="text-xs">{statusConf.label}</span>
                </div>
                <span className="text-xs text-[#666666]">
                  {new Date(pub.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {pub.externalPostUrl && (
                <a
                  href={pub.externalPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1.5 hover:bg-[#444444] rounded-lg transition-colors"
                  title="Abrir no navegador"
                >
                  <ExternalLink className="w-4 h-4 text-[#b0b0b0]" />
                </a>
              )}
              {pub.status === 'failed' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRetry(pub.id)}
                  className="text-amber-400 hover:bg-amber-400/10 h-8 px-2"
                >
                  <RotateCcw className="w-3.5 h-3.5 mr-1" />
                  Retry
                </Button>
              )}
              {(pub.status === 'queued' || pub.status === 'draft') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onCancel(pub.id)}
                  className="text-red-400 hover:bg-red-400/10 h-8 px-2"
                >
                  <Ban className="w-3.5 h-3.5 mr-1" />
                  Cancelar
                </Button>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
