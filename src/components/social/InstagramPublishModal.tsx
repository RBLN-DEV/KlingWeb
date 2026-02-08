import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Instagram,
  Image as ImageIcon,
  Film,
  BookOpen,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstagramPublish, type PublishDestination } from '@/hooks/useInstagramPublish';
import { useToast } from '@/contexts/ToastContext';

interface InstagramPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  mediaType: 'image' | 'video';
  defaultCaption?: string;
  thumbnailUrl?: string;
}

const destinations: {
  id: PublishDestination;
  label: string;
  description: string;
  icon: typeof ImageIcon;
  videoOnly?: boolean;
  color: string;
}[] = [
  {
    id: 'feed',
    label: 'Feed',
    description: 'Post no feed principal',
    icon: ImageIcon,
    color: 'from-blue-500 to-purple-600',
  },
  {
    id: 'story',
    label: 'Stories',
    description: 'Story (24h)',
    icon: BookOpen,
    color: 'from-orange-500 to-pink-600',
  },
  {
    id: 'reel',
    label: 'Reels',
    description: 'Vídeo curto no Reels',
    icon: Film,
    videoOnly: true,
    color: 'from-pink-500 to-red-600',
  },
];

export function InstagramPublishModal({
  isOpen,
  onClose,
  mediaUrl,
  mediaType,
  defaultCaption = '',
  thumbnailUrl,
}: InstagramPublishModalProps) {
  const { publish, checkBotStatus, isPublishing, lastResult, reset } = useInstagramPublish();
  const { addToast } = useToast();

  const [destination, setDestination] = useState<PublishDestination>('feed');
  const [caption, setCaption] = useState(defaultCaption);
  const [botConnected, setBotConnected] = useState<boolean | null>(null);
  const [botUsername, setBotUsername] = useState<string>('');
  const [step, setStep] = useState<'config' | 'publishing' | 'result'>('config');

  // Verificar status do bot ao abrir
  useEffect(() => {
    if (isOpen) {
      reset();
      setStep('config');
      setCaption(defaultCaption);
      checkBotStatus().then(status => {
        setBotConnected(status?.isLoggedIn ?? false);
        setBotUsername(status?.username || '');
      });
    }
  }, [isOpen, defaultCaption, checkBotStatus, reset]);

  // Filtrar destinos disponíveis
  const availableDestinations = destinations.filter(d => {
    if (d.videoOnly && mediaType === 'image') return false;
    return true;
  });

  const handlePublish = useCallback(async () => {
    setStep('publishing');

    const result = await publish({
      mediaUrl,
      caption,
      destination,
      mediaType,
    });

    setStep('result');

    if (result.success) {
      addToast({
        type: 'success',
        title: 'Publicado no Instagram!',
        message: `${destination === 'feed' ? 'Post' : destination === 'story' ? 'Story' : 'Reel'} publicado com sucesso`,
      });
    } else {
      addToast({
        type: 'error',
        title: 'Erro na publicação',
        message: result.error || 'Falha ao publicar no Instagram',
      });
    }
  }, [publish, mediaUrl, caption, destination, mediaType, addToast]);

  const handleClose = () => {
    if (!isPublishing) {
      reset();
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-lg bg-[#2a2a2a] rounded-2xl border border-[#444444] overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[#444444]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center">
                <Instagram className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-white font-semibold">Publicar no Instagram</h2>
                {botUsername && (
                  <p className="text-xs text-[#b0b0b0]">@{botUsername}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleClose}
              disabled={isPublishing}
              className="p-2 hover:bg-[#444444] rounded-lg transition-colors disabled:opacity-50"
            >
              <X className="w-5 h-5 text-[#b0b0b0]" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Bot Status */}
            {botConnected === false && (
              <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <WifiOff className="w-5 h-5 text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-red-400 text-sm font-medium">Bot desconectado</p>
                  <p className="text-red-400/70 text-xs">Faça login no Instagram Bot primeiro</p>
                </div>
              </div>
            )}

            {botConnected === true && step === 'config' && (
              <>
                <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <Wifi className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 text-xs">Bot conectado como @{botUsername}</span>
                </div>

                {/* Media Preview */}
                <div className="flex gap-3">
                  <div className="w-24 h-24 rounded-lg bg-[#1a1a1a] overflow-hidden flex-shrink-0">
                    {mediaType === 'video' ? (
                      thumbnailUrl ? (
                        <img src={thumbnailUrl} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="w-8 h-8 text-[#666]" />
                        </div>
                      )
                    ) : (
                      <img src={mediaUrl} alt="Preview" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-[#7e57c2]/20 text-[#7e57c2]">
                      {mediaType === 'video' ? '🎬 Vídeo' : '🖼️ Imagem'}
                    </span>
                    <p className="text-xs text-[#b0b0b0] mt-1 line-clamp-2 break-all">
                      {mediaUrl.length > 80 ? mediaUrl.substring(0, 80) + '...' : mediaUrl}
                    </p>
                  </div>
                </div>

                {/* Destination Selection */}
                <div>
                  <label className="text-sm text-[#b0b0b0] mb-2 block">Destino</label>
                  <div className="grid grid-cols-3 gap-2">
                    {availableDestinations.map(dest => (
                      <button
                        key={dest.id}
                        onClick={() => setDestination(dest.id)}
                        className={`relative p-3 rounded-xl border transition-all text-center ${
                          destination === dest.id
                            ? 'border-[#7e57c2] bg-[#7e57c2]/10'
                            : 'border-[#444444] hover:border-[#666] bg-[#1a1a1a]'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${dest.color} flex items-center justify-center mx-auto mb-1.5`}>
                          <dest.icon className="w-4 h-4 text-white" />
                        </div>
                        <p className="text-white text-xs font-medium">{dest.label}</p>
                        <p className="text-[#b0b0b0] text-[10px] mt-0.5">{dest.description}</p>
                        {destination === dest.id && (
                          <motion.div
                            layoutId="dest-indicator"
                            className="absolute -top-1 -right-1 w-4 h-4 bg-[#7e57c2] rounded-full flex items-center justify-center"
                          >
                            <CheckCircle className="w-3 h-3 text-white" />
                          </motion.div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Caption */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-sm text-[#b0b0b0]">Legenda</label>
                    <span className="text-xs text-[#666]">{caption.length}/2200</span>
                  </div>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value.slice(0, 2200))}
                    placeholder="Escreva a legenda do post..."
                    rows={3}
                    className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#444444] rounded-lg text-white text-sm placeholder:text-[#666] focus:outline-none focus:border-[#7e57c2] resize-none"
                  />
                </div>

                {/* Publish Button */}
                <Button
                  onClick={handlePublish}
                  disabled={!botConnected || isPublishing}
                  className="w-full bg-gradient-to-r from-[#f09433] via-[#e6683c] to-[#bc1888] hover:opacity-90 text-white font-medium h-11"
                >
                  <Send className="w-4 h-4 mr-2" />
                  Publicar {destination === 'feed' ? 'no Feed' : destination === 'story' ? 'nos Stories' : 'como Reel'}
                </Button>
              </>
            )}

            {/* Publishing State */}
            {step === 'publishing' && (
              <div className="py-10 text-center space-y-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-16 h-16 rounded-full bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888] flex items-center justify-center mx-auto"
                >
                  <Loader2 className="w-8 h-8 text-white" />
                </motion.div>
                <div>
                  <h3 className="text-white font-medium">Publicando...</h3>
                  <p className="text-[#b0b0b0] text-sm mt-1">
                    Enviando {mediaType === 'video' ? 'vídeo' : 'imagem'} para o Instagram
                  </p>
                </div>
              </div>
            )}

            {/* Result State */}
            {step === 'result' && lastResult && (
              <div className="py-8 text-center space-y-4">
                {lastResult.success ? (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto"
                    >
                      <CheckCircle className="w-8 h-8 text-green-400" />
                    </motion.div>
                    <div>
                      <h3 className="text-white font-medium">Publicado com sucesso! 🎉</h3>
                      <p className="text-[#b0b0b0] text-sm mt-1">
                        Seu {destination === 'feed' ? 'post' : destination === 'story' ? 'story' : 'reel'} está no ar
                      </p>
                    </div>
                    {lastResult.postUrl && (
                      <a
                        href={lastResult.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 bg-[#7e57c2]/20 hover:bg-[#7e57c2]/30 text-[#7e57c2] rounded-lg transition-colors text-sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Ver no Instagram
                      </a>
                    )}
                  </>
                ) : (
                  <>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto"
                    >
                      <AlertCircle className="w-8 h-8 text-red-400" />
                    </motion.div>
                    <div>
                      <h3 className="text-white font-medium">Erro na publicação</h3>
                      <p className="text-red-400 text-sm mt-1">{lastResult.error}</p>
                    </div>
                    <Button
                      onClick={() => setStep('config')}
                      variant="outline"
                      className="border-[#444444] text-white hover:bg-[#444444]"
                    >
                      Tentar novamente
                    </Button>
                  </>
                )}

                <Button
                  onClick={handleClose}
                  className="w-full bg-[#444444] hover:bg-[#555] text-white mt-2"
                >
                  Fechar
                </Button>
              </div>
            )}

            {/* Loading bot status */}
            {botConnected === null && (
              <div className="py-8 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-[#7e57c2] animate-spin mx-auto" />
                <p className="text-[#b0b0b0] text-sm">Verificando conexão do bot...</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
