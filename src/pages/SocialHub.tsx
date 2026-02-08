import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Share2,
  Plus,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ConnectAccountCard } from '@/components/social/ConnectAccountCard';
import { PublishModal } from '@/components/social/PublishModal';
import { PublicationsList } from '@/components/social/PublicationsList';
import { useSocialAuth } from '@/hooks/useSocialAuth';
import { useSocialPublish } from '@/hooks/useSocialPublish';
import type { PublishRequest, MediaType } from '@/types/social';

export function SocialHub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    connections,
    isLoading: isLoadingAuth,
    isConnecting,
    error: authError,
    connectProviderUnofficial,
    disconnectProvider,
    refreshConnection,
  } = useSocialAuth();

  const {
    publications,
    isPublishing,
    isLoading: isLoadingPubs,
    error: pubError,
    publish,
    fetchPublications,
    cancelPublication,
    retryPublication,
  } = useSocialPublish();

  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);
  const [publishMediaUrl, setPublishMediaUrl] = useState('');
  const [publishMediaType, setPublishMediaType] = useState<MediaType>('image');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Check for OAuth callback params (legado — mantido para compatibilidade)
  useEffect(() => {
    const status = searchParams.get('oauth');
    const provider = searchParams.get('provider');
    const error = searchParams.get('error');

    if (status === 'success' && provider) {
      setStatusMessage({
        type: 'success',
        text: `${provider === 'instagram' ? 'Instagram' : 'Twitter'} conectado com sucesso!`,
      });
      setTimeout(() => setStatusMessage(null), 5000);
    } else if (status === 'error' || error) {
      setStatusMessage({
        type: 'error',
        text: error || 'Erro ao conectar conta. Tente novamente.',
      });
      setTimeout(() => setStatusMessage(null), 8000);
    }
  }, [searchParams]);

  // Load publications on mount
  useEffect(() => {
    fetchPublications({ limit: 20 });
  }, [fetchPublications]);

  const handlePublish = async (request: PublishRequest) => {
    await publish(request);
  };

  const openPublishModal = (mediaUrl: string, mediaType: MediaType) => {
    setPublishMediaUrl(mediaUrl);
    setPublishMediaType(mediaType);
    setIsPublishModalOpen(true);
  };

  const error = authError || pubError;

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
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7e57c2] to-[#E4405F] flex items-center justify-center">
              <Share2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Social Hub</h1>
              <p className="text-[#b0b0b0] mt-0.5">
                Gerencie suas redes sociais e publique conteúdo
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/social-dashboard')}
              className="border-[#444444] text-white hover:bg-[#2a2a2a]"
            >
              Métricas
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Status message */}
      {statusMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={`mb-6 p-4 rounded-lg border flex items-center gap-3 ${
            statusMessage.type === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <p className="text-sm">{statusMessage.text}</p>
        </motion.div>
      )}

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

      {/* Connected Accounts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="mb-8"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Contas Conectadas</h2>
        {isLoadingAuth ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 text-[#7e57c2] animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ConnectAccountCard
              provider="instagram"
              connection={connections.find(c => c.provider === 'instagram' && c.isActive)}
              onConnectUnofficial={connectProviderUnofficial}
              onDisconnect={disconnectProvider}
              onRefresh={refreshConnection}
              isConnecting={isConnecting}
              delay={0}
            />
            <ConnectAccountCard
              provider="twitter"
              connection={connections.find(c => c.provider === 'twitter' && c.isActive)}
              onConnectUnofficial={connectProviderUnofficial}
              onDisconnect={disconnectProvider}
              onRefresh={refreshConnection}
              isConnecting={isConnecting}
              delay={0.1}
            />
          </div>
        )}
      </motion.div>

      {/* Quick Publish */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="mb-8"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Publicação Rápida</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/image-gallery')}
            className="p-6 bg-gradient-to-br from-[#7e57c2]/20 to-transparent border border-[#7e57c2]/30 rounded-xl text-left hover:border-[#7e57c2]/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-lg bg-[#7e57c2]/20 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-[#7e57c2]" />
            </div>
            <h3 className="text-white font-medium mb-1">Da Galeria de Imagens</h3>
            <p className="text-sm text-[#b0b0b0]">Selecione uma imagem gerada</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/gallery')}
            className="p-6 bg-gradient-to-br from-green-500/20 to-transparent border border-green-500/30 rounded-xl text-left hover:border-green-500/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-green-500" />
            </div>
            <h3 className="text-white font-medium mb-1">Da Galeria de Vídeos</h3>
            <p className="text-sm text-[#b0b0b0]">Selecione um vídeo gerado</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              // Open modal with URL input for external media
              const url = prompt('Cole a URL da mídia:');
              if (url) {
                const type = url.match(/\.(mp4|mov|avi|webm)/i) ? 'video' : 'image';
                openPublishModal(url, type as MediaType);
              }
            }}
            className="p-6 bg-gradient-to-br from-orange-500/20 to-transparent border border-orange-500/30 rounded-xl text-left hover:border-orange-500/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center mb-4">
              <Share2 className="w-6 h-6 text-orange-500" />
            </div>
            <h3 className="text-white font-medium mb-1">URL Externa</h3>
            <p className="text-sm text-[#b0b0b0]">Publique a partir de uma URL</p>
          </motion.button>
        </div>
      </motion.div>

      {/* Recent Publications */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Publicações Recentes</h2>
          {publications.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => navigate('/social-dashboard')}
              className="text-[#7e57c2] hover:text-[#6a42b0] hover:bg-[#7e57c2]/10"
            >
              Ver todas
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>
        <PublicationsList
          publications={publications}
          onCancel={cancelPublication}
          onRetry={retryPublication}
          isLoading={isLoadingPubs}
        />
      </motion.div>

      {/* Publish Modal */}
      <PublishModal
        isOpen={isPublishModalOpen}
        onClose={() => setIsPublishModalOpen(false)}
        onPublish={handlePublish}
        connections={connections}
        mediaUrl={publishMediaUrl}
        mediaType={publishMediaType}
        isPublishing={isPublishing}
      />
    </div>
  );
}
