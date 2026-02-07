import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Download, Trash2, MoreVertical, Clock, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import type { VideoGeneration } from '@/types';
import { cn, formatDate, formatDuration } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface VideoCardProps {
  video: VideoGeneration;
  onDelete?: (id: string) => void;
  delay?: number;
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/20', label: 'Pendente' },
  processing: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/20', label: 'Processando' },
  completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/20', label: 'Concluído' },
  failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/20', label: 'Falhou' },
};

export function VideoCard({ video, onDelete, delay = 0 }: VideoCardProps) {
  // Video playback state can be added here if needed
  const [showVideoModal, setShowVideoModal] = useState(false);
  const StatusIcon = statusConfig[video.status].icon;

  const handleDelete = () => {
    if (onDelete && confirm('Tem certeza que deseja excluir este vídeo?')) {
      onDelete(video.id);
    }
  };

  const handleDownload = () => {
    if (video.videoUrl) {
      const link = document.createElement('a');
      link.href = video.videoUrl;
      link.download = `${video.title}.mp4`;
      link.click();
    }
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
        whileHover={{ y: -4 }}
        className="group relative bg-[#2a2a2a] rounded-xl overflow-hidden border border-[#444444] hover:border-[#7e57c2]/50 transition-all duration-300"
      >
        {/* Thumbnail */}
        <div 
          className="relative aspect-video bg-[#1a1a1a] overflow-hidden cursor-pointer"
          onClick={() => video.status === 'completed' && setShowVideoModal(true)}
        >
          {video.thumbnailUrl ? (
            <img
              src={video.thumbnailUrl}
              alt={video.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-[#444444] flex items-center justify-center">
                <Play className="w-6 h-6 text-[#b0b0b0]" />
              </div>
            </div>
          )}

          {/* Play overlay */}
          {video.status === 'completed' && (
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <motion.div
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="w-14 h-14 rounded-full bg-[#7e57c2] flex items-center justify-center"
              >
                <Play className="w-6 h-6 text-white ml-1" />
              </motion.div>
            </div>
          )}

          {/* Duration badge */}
          {video.duration > 0 && (
            <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/70 rounded text-xs text-white">
              {formatDuration(video.duration)}
            </div>
          )}

          {/* Status badge */}
          <div className={cn(
            'absolute top-2 left-2 px-2 py-1 rounded-full flex items-center gap-1.5',
            statusConfig[video.status].bg
          )}>
            <StatusIcon className={cn('w-3 h-3', statusConfig[video.status].color)} />
            <span className={cn('text-xs font-medium', statusConfig[video.status].color)}>
              {statusConfig[video.status].label}
            </span>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-white truncate">{video.title}</h3>
              <p className="text-xs text-[#b0b0b0] mt-1">{formatDate(video.createdAt)}</p>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-1.5 hover:bg-[#444444] rounded-lg transition-colors opacity-0 group-hover:opacity-100">
                  <MoreVertical className="w-4 h-4 text-[#b0b0b0]" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-[#2a2a2a] border-[#444444]">
                {video.status === 'completed' && video.videoUrl && (
                  <DropdownMenuItem onClick={handleDownload} className="text-white hover:bg-[#444444]">
                    <Download className="w-4 h-4 mr-2" />
                    Baixar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleDelete} className="text-red-400 hover:bg-red-500/20">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </motion.div>

      {/* Video Modal */}
      <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
        <DialogContent className="max-w-4xl bg-[#1a1a1a] border-[#444444] p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-white">{video.title}</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            {video.videoUrl && (
              <video
                src={video.videoUrl}
                controls
                autoPlay
                className="w-full rounded-lg"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
