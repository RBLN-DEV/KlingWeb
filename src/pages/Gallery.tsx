import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Search, 
  Grid3X3, 
  List, 
  CheckCircle,
  XCircle,
  Loader2,
  Clock,
  Trash2,
  Download,
  Play,
  Instagram
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useKling } from '@/hooks/useKling';
import { useToast } from '@/contexts/ToastContext';
import { VideoCard } from '@/components/ui-custom/VideoCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatDate, formatDuration } from '@/lib/utils';
import { InstagramPublishModal } from '@/components/social/InstagramPublishModal';
import type { VideoGeneration } from '@/types';

type ViewMode = 'grid' | 'list';
type StatusFilter = 'all' | 'processing' | 'completed' | 'failed';
type SortOption = 'newest' | 'oldest' | 'name';

export function Gallery() {
  const navigate = useNavigate();
  const { getStoredVideos, deleteVideo } = useKling();
  const { addToast } = useToast();
  
  const [videos, setVideos] = useState<VideoGeneration[]>([]);
  const [filteredVideos, setFilteredVideos] = useState<VideoGeneration[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    const stored = getStoredVideos();
    setVideos(stored);
    setFilteredVideos(stored);
  }, [getStoredVideos]);

  useEffect(() => {
    let result = [...videos];

    // Search filter
    if (searchQuery) {
      result = result.filter(v =>
        v.title.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(v => v.status === statusFilter);
    }

    // Sort
    result.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'name':
          return a.title.localeCompare(b.title);
        default:
          return 0;
      }
    });

    setFilteredVideos(result);
  }, [videos, searchQuery, statusFilter, sortOption]);

  const handleDelete = (id: string) => {
    deleteVideo(id);
    const updated = videos.filter(v => v.id !== id);
    setVideos(updated);
    addToast({
      type: 'success',
      title: 'Vídeo excluído',
      message: 'O vídeo foi removido com sucesso',
    });
  };

  const statusCounts = {
    all: videos.length,
    processing: videos.filter(v => v.status === 'processing').length,
    completed: videos.filter(v => v.status === 'completed').length,
    failed: videos.filter(v => v.status === 'failed').length,
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-3xl font-bold text-white">Meus Vídeos</h1>
        <p className="text-[#b0b0b0] mt-1">Gerencie todos os seus vídeos gerados</p>
      </motion.div>

      {/* Filters Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#2a2a2a] rounded-xl p-4 border border-[#444444] mb-6"
      >
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#666]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar vídeos..."
              className="pl-10 bg-[#1a1a1a] border-[#444444] text-white"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0">
            {(['all', 'processing', 'completed', 'failed'] as StatusFilter[]).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  statusFilter === status
                    ? 'bg-[#7e57c2] text-white'
                    : 'bg-[#1a1a1a] text-[#b0b0b0] hover:bg-[#444444]'
                )}
              >
                {status === 'all' && `Todos (${statusCounts.all})`}
                {status === 'processing' && `Processando (${statusCounts.processing})`}
                {status === 'completed' && `Concluídos (${statusCounts.completed})`}
                {status === 'failed' && `Falhou (${statusCounts.failed})`}
              </button>
            ))}
          </div>

          {/* Sort & View */}
          <div className="flex gap-2">
            <Select value={sortOption} onValueChange={(v) => setSortOption(v as SortOption)}>
              <SelectTrigger className="w-[140px] bg-[#1a1a1a] border-[#444444] text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#2a2a2a] border-[#444444]">
                <SelectItem value="newest" className="text-white">Mais recentes</SelectItem>
                <SelectItem value="oldest" className="text-white">Mais antigos</SelectItem>
                <SelectItem value="name" className="text-white">Nome</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex bg-[#1a1a1a] rounded-lg border border-[#444444]">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  'p-2 rounded-l-lg transition-colors',
                  viewMode === 'grid' ? 'bg-[#7e57c2] text-white' : 'text-[#b0b0b0] hover:text-white'
                )}
              >
                <Grid3X3 className="w-5 h-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  'p-2 rounded-r-lg transition-colors',
                  viewMode === 'list' ? 'bg-[#7e57c2] text-white' : 'text-[#b0b0b0] hover:text-white'
                )}
              >
                <List className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Videos Grid/List */}
      {filteredVideos.length > 0 ? (
        <AnimatePresence mode="popLayout">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVideos.map((video, index) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onDelete={handleDelete}
                  delay={index * 0.05}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredVideos.map((video, index) => (
                <VideoListItem
                  key={video.id}
                  video={video}
                  onDelete={handleDelete}
                  delay={index * 0.05}
                />
              ))}
            </div>
          )}
        </AnimatePresence>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 bg-[#2a2a2a]/50 rounded-xl border border-dashed border-[#444444]"
        >
          <div className="w-16 h-16 rounded-full bg-[#444444] flex items-center justify-center mx-auto mb-4">
            <Play className="w-8 h-8 text-[#b0b0b0]" />
          </div>
          <h3 className="text-white font-medium mb-2">
            {searchQuery || statusFilter !== 'all'
              ? 'Nenhum vídeo encontrado'
              : 'Nenhum vídeo ainda'}
          </h3>
          <p className="text-[#b0b0b0] mb-4">
            {searchQuery || statusFilter !== 'all'
              ? 'Tente ajustar os filtros'
              : 'Comece criando seu primeiro vídeo com IA'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <Button
              onClick={() => navigate('/video')}
              className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              Criar Vídeo
            </Button>
          )}
        </motion.div>
      )}
    </div>
  );
}

// List Item Component
function VideoListItem({ 
  video, 
  onDelete, 
  delay = 0 
}: { 
  video: VideoGeneration; 
  onDelete: (id: string) => void;
  delay?: number;
}) {
  const [showPublishModal, setShowPublishModal] = useState(false);
  const statusConfig = {
    pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/20', label: 'Pendente' },
    processing: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-500/20', label: 'Processando' },
    completed: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/20', label: 'Concluído' },
    failed: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/20', label: 'Falhou' },
  };

  const StatusIcon = statusConfig[video.status].icon;

  const handleDownload = () => {
    if (video.videoUrl) {
      const link = document.createElement('a');
      link.href = video.videoUrl;
      link.download = `${video.title}.mp4`;
      link.click();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center gap-4 p-4 bg-[#2a2a2a] rounded-xl border border-[#444444] hover:border-[#7e57c2]/50 transition-colors"
    >
      {/* Thumbnail */}
      <div className="w-24 h-16 rounded-lg bg-[#1a1a1a] overflow-hidden flex-shrink-0">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="w-6 h-6 text-[#666]" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="text-white font-medium truncate">{video.title}</h4>
        <div className="flex items-center gap-3 mt-1">
          <span className={cn(
            'px-2 py-0.5 rounded-full text-xs flex items-center gap-1',
            statusConfig[video.status].bg
          )}>
            <StatusIcon className={cn('w-3 h-3', statusConfig[video.status].color)} />
            <span className={statusConfig[video.status].color}>
              {statusConfig[video.status].label}
            </span>
          </span>
          <span className="text-xs text-[#b0b0b0]">{formatDate(video.createdAt)}</span>
          <span className="text-xs text-[#b0b0b0]">{formatDuration(video.duration)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {video.status === 'completed' && video.videoUrl && (
          <>
            <button
              onClick={() => setShowPublishModal(true)}
              className="p-2 hover:bg-[#444444] rounded-lg transition-colors"
              title="Publicar no Instagram"
            >
              <Instagram className="w-4 h-4 text-pink-400" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 hover:bg-[#444444] rounded-lg transition-colors"
              title="Baixar"
            >
              <Download className="w-4 h-4 text-[#b0b0b0]" />
            </button>
          </>
        )}
        <button
          onClick={() => onDelete(video.id)}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
          title="Excluir"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>

      {/* Instagram Publish Modal */}
      {video.videoUrl && (
        <InstagramPublishModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          mediaUrl={video.videoUrl}
          mediaType="video"
          defaultCaption={video.title || ''}
          thumbnailUrl={video.thumbnailUrl}
        />
      )}
    </motion.div>
  );
}


