import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Grid3X3,
  List,
  Trash2,
  Download,
  Image as ImageIcon,
  Eye,
  X,
  Copy,
  Check,
  Sparkles,
  Palette,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useGemini } from '@/hooks/useGemini';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn, formatDate } from '@/lib/utils';
import type { ImageGeneration } from '@/types';

type ViewMode = 'grid' | 'list';
type ModelFilter = 'all' | 'gemini' | 'azure-dalle';
type SortOption = 'newest' | 'oldest' | 'prompt';

export function ImageGallery() {
  const navigate = useNavigate();
  const { getStoredImages, deleteImage } = useGemini();
  const { addToast } = useToast();

  const [images, setImages] = useState<ImageGeneration[]>([]);
  const [filteredImages, setFilteredImages] = useState<ImageGeneration[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [modelFilter, setModelFilter] = useState<ModelFilter>('all');
  const [sortOption, setSortOption] = useState<SortOption>('newest');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [previewImage, setPreviewImage] = useState<ImageGeneration | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  useEffect(() => {
    const stored = getStoredImages();
    setImages(stored);
  }, [getStoredImages]);

  useEffect(() => {
    let result = [...images];

    // Search filter
    if (searchQuery) {
      result = result.filter(img =>
        img.prompt.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Model filter
    if (modelFilter !== 'all') {
      result = result.filter(img => {
        const model = (img.model || '').toLowerCase();
        if (modelFilter === 'gemini') return model.includes('gemini');
        if (modelFilter === 'azure-dalle') return model.includes('dall') || model.includes('azure');
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortOption) {
        case 'newest':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case 'oldest':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'prompt':
          return a.prompt.localeCompare(b.prompt);
        default:
          return 0;
      }
    });

    setFilteredImages(result);
  }, [images, searchQuery, modelFilter, sortOption]);

  const handleDelete = useCallback((id: string) => {
    deleteImage(id);
    setImages(prev => prev.filter(img => img.id !== id));
    if (previewImage?.id === id) setPreviewImage(null);
    addToast({
      type: 'success',
      title: 'Imagem excluída',
      message: 'A imagem foi removida com sucesso',
    });
  }, [deleteImage, addToast, previewImage]);

  const handleDownload = useCallback((image: ImageGeneration) => {
    if (!image.imageUrl) return;
    const link = document.createElement('a');
    link.href = image.imageUrl;
    link.download = `image_${image.id}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleCopyPrompt = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
    addToast({ type: 'success', title: 'Prompt copiado!' });
  }, [addToast]);

  const modelCounts = {
    all: images.length,
    gemini: images.filter(img => (img.model || '').toLowerCase().includes('gemini')).length,
    'azure-dalle': images.filter(img => {
      const m = (img.model || '').toLowerCase();
      return m.includes('dall') || m.includes('azure');
    }).length,
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7e57c2] to-[#e040fb] flex items-center justify-center">
            <Palette className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Galeria de Imagens</h1>
            <p className="text-[#b0b0b0] mt-0.5">Todas as suas imagens geradas por IA</p>
          </div>
        </div>
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
              placeholder="Buscar por prompt..."
              className="pl-10 bg-[#1a1a1a] border-[#444444] text-white"
            />
          </div>

          {/* Model Filter */}
          <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0">
            {(['all', 'gemini', 'azure-dalle'] as ModelFilter[]).map((model) => (
              <button
                key={model}
                onClick={() => setModelFilter(model)}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
                  modelFilter === model
                    ? 'bg-[#7e57c2] text-white'
                    : 'bg-[#1a1a1a] text-[#b0b0b0] hover:bg-[#444444]'
                )}
              >
                {model === 'all' && `Todas (${modelCounts.all})`}
                {model === 'gemini' && `Gemini (${modelCounts.gemini})`}
                {model === 'azure-dalle' && `DALL-E (${modelCounts['azure-dalle']})`}
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
                <SelectItem value="oldest" className="text-white">Mais antigas</SelectItem>
                <SelectItem value="prompt" className="text-white">Prompt</SelectItem>
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

      {/* Images Grid/List */}
      {filteredImages.length > 0 ? (
        <AnimatePresence mode="popLayout">
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredImages.map((image, index) => (
                <ImageGridCard
                  key={image.id}
                  image={image}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                  onPreview={setPreviewImage}
                  delay={index * 0.05}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredImages.map((image, index) => (
                <ImageListItem
                  key={image.id}
                  image={image}
                  onDelete={handleDelete}
                  onDownload={handleDownload}
                  onPreview={setPreviewImage}
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
            <ImageIcon className="w-8 h-8 text-[#b0b0b0]" />
          </div>
          <h3 className="text-white font-medium mb-2">
            {searchQuery || modelFilter !== 'all'
              ? 'Nenhuma imagem encontrada'
              : 'Nenhuma imagem ainda'}
          </h3>
          <p className="text-[#b0b0b0] mb-4">
            {searchQuery || modelFilter !== 'all'
              ? 'Tente ajustar os filtros'
              : 'Comece gerando sua primeira imagem com IA'}
          </p>
          {!searchQuery && modelFilter === 'all' && (
            <Button
              onClick={() => navigate('/image')}
              className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              Gerar Imagem
            </Button>
          )}
        </motion.div>
      )}

      {/* Image Preview Modal */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setPreviewImage(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative max-w-4xl w-full bg-[#2a2a2a] rounded-2xl border border-[#444444] overflow-hidden shadow-2xl"
            >
              {/* Close button */}
              <button
                onClick={() => setPreviewImage(null)}
                className="absolute top-4 right-4 z-10 p-2 bg-black/50 hover:bg-black/70 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-white" />
              </button>

              <div className="flex flex-col lg:flex-row">
                {/* Image */}
                <div className="flex-1 bg-[#1a1a1a] flex items-center justify-center min-h-[300px] lg:min-h-[500px]">
                  {previewImage.imageUrl ? (
                    <img
                      src={previewImage.imageUrl}
                      alt={previewImage.prompt}
                      className="max-w-full max-h-[70vh] object-contain"
                    />
                  ) : (
                    <ImageIcon className="w-16 h-16 text-[#444]" />
                  )}
                </div>

                {/* Details */}
                <div className="w-full lg:w-80 p-6 space-y-4 border-t lg:border-t-0 lg:border-l border-[#444444]">
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">Detalhes</h3>
                    <p className="text-xs text-[#b0b0b0]">{formatDate(previewImage.createdAt)}</p>
                  </div>

                  <div>
                    <p className="text-xs text-[#b0b0b0] uppercase tracking-wider mb-1">Modelo</p>
                    <span className="inline-flex px-2 py-1 rounded-md bg-[#7e57c2]/20 text-[#7e57c2] text-sm font-medium">
                      {previewImage.model || 'Desconhecido'}
                    </span>
                  </div>

                  {previewImage.aspectRatio && (
                    <div>
                      <p className="text-xs text-[#b0b0b0] uppercase tracking-wider mb-1">Aspect Ratio</p>
                      <p className="text-white text-sm">{previewImage.aspectRatio}</p>
                    </div>
                  )}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-[#b0b0b0] uppercase tracking-wider">Prompt</p>
                      <button
                        onClick={() => handleCopyPrompt(previewImage.prompt)}
                        className="p-1 hover:bg-[#444444] rounded transition-colors"
                        title="Copiar prompt"
                      >
                        {copiedPrompt ? (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-[#b0b0b0]" />
                        )}
                      </button>
                    </div>
                    <p className="text-white text-sm leading-relaxed max-h-48 overflow-y-auto scrollbar-thin">
                      {previewImage.prompt}
                    </p>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={() => handleDownload(previewImage)}
                      className="flex-1 bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                      disabled={!previewImage.imageUrl}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar
                    </Button>
                    <Button
                      onClick={() => {
                        handleDelete(previewImage.id);
                        setPreviewImage(null);
                      }}
                      variant="outline"
                      className="border-red-500/50 text-red-400 hover:bg-red-500/20 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───── Grid Card ─────
function ImageGridCard({
  image,
  onDelete,
  onDownload,
  onPreview,
  delay = 0,
}: {
  image: ImageGeneration;
  onDelete: (id: string) => void;
  onDownload: (image: ImageGeneration) => void;
  onPreview: (image: ImageGeneration) => void;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay }}
      className="group relative bg-[#2a2a2a] rounded-xl border border-[#444444] overflow-hidden hover:border-[#7e57c2]/50 transition-colors"
    >
      {/* Image */}
      <div
        className="aspect-square bg-[#1a1a1a] cursor-pointer overflow-hidden"
        onClick={() => onPreview(image)}
      >
        {image.imageUrl ? (
          <img
            src={image.imageUrl}
            alt={image.prompt}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-[#444]" />
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
            <button
              onClick={(e) => { e.stopPropagation(); onPreview(image); }}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur-sm transition-colors"
              title="Visualizar"
            >
              <Eye className="w-4 h-4 text-white" />
            </button>
            <div className="flex gap-1">
              <button
                onClick={(e) => { e.stopPropagation(); onDownload(image); }}
                className="p-2 bg-white/20 hover:bg-white/30 rounded-lg backdrop-blur-sm transition-colors"
                title="Baixar"
              >
                <Download className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(image.id); }}
                className="p-2 bg-red-500/30 hover:bg-red-500/50 rounded-lg backdrop-blur-sm transition-colors"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="p-3">
        <p className="text-white text-sm line-clamp-2 leading-snug mb-2">
          {image.prompt}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#7e57c2]/20 text-[#7e57c2]">
            {image.model || 'IA'}
          </span>
          <span className="text-xs text-[#b0b0b0]">{formatDate(image.createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}

// ───── List Item ─────
function ImageListItem({
  image,
  onDelete,
  onDownload,
  onPreview,
  delay = 0,
}: {
  image: ImageGeneration;
  onDelete: (id: string) => void;
  onDownload: (image: ImageGeneration) => void;
  onPreview: (image: ImageGeneration) => void;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
      className="flex items-center gap-4 p-4 bg-[#2a2a2a] rounded-xl border border-[#444444] hover:border-[#7e57c2]/50 transition-colors"
    >
      {/* Thumbnail */}
      <div
        className="w-20 h-20 rounded-lg bg-[#1a1a1a] overflow-hidden flex-shrink-0 cursor-pointer"
        onClick={() => onPreview(image)}
      >
        {image.imageUrl ? (
          <img
            src={image.imageUrl}
            alt={image.prompt}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-6 h-6 text-[#666]" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm line-clamp-2 mb-1">{image.prompt}</p>
        <div className="flex items-center gap-3">
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#7e57c2]/20 text-[#7e57c2]">
            {image.model || 'IA'}
          </span>
          {image.aspectRatio && (
            <span className="text-xs text-[#b0b0b0]">{image.aspectRatio}</span>
          )}
          <span className="text-xs text-[#b0b0b0]">{formatDate(image.createdAt)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onPreview(image)}
          className="p-2 hover:bg-[#444444] rounded-lg transition-colors"
          title="Visualizar"
        >
          <Eye className="w-4 h-4 text-[#b0b0b0]" />
        </button>
        {image.imageUrl && (
          <button
            onClick={() => onDownload(image)}
            className="p-2 hover:bg-[#444444] rounded-lg transition-colors"
            title="Baixar"
          >
            <Download className="w-4 h-4 text-[#b0b0b0]" />
          </button>
        )}
        <button
          onClick={() => onDelete(image.id)}
          className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
          title="Excluir"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
    </motion.div>
  );
}
