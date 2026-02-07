import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Instagram,
  Twitter,
  Image as ImageIcon,
  Video,
  Film,
  Send,
  Clock,
  Hash,
  AlertTriangle,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SocialConnection, SocialProvider, MediaType, PublishRequest } from '@/types/social';

const PROVIDER_ICONS: Record<SocialProvider, typeof Instagram> = {
  instagram: Instagram,
  twitter: Twitter,
};

const PROVIDER_COLORS: Record<SocialProvider, string> = {
  instagram: '#E4405F',
  twitter: '#1DA1F2',
};

const MEDIA_LIMITS: Record<SocialProvider, Record<MediaType, { maxCaption: number }>> = {
  instagram: {
    image: { maxCaption: 2200 },
    video: { maxCaption: 2200 },
    reel: { maxCaption: 2200 },
  },
  twitter: {
    image: { maxCaption: 280 },
    video: { maxCaption: 280 },
    reel: { maxCaption: 280 },
  },
};

interface PublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPublish: (request: PublishRequest) => Promise<void>;
  connections: SocialConnection[];
  mediaUrl: string;
  mediaType: MediaType;
  isPublishing: boolean;
}

export function PublishModal({
  isOpen,
  onClose,
  onPublish,
  connections,
  mediaUrl,
  mediaType,
  isPublishing,
}: PublishModalProps) {
  const [selectedProvider, setSelectedProvider] = useState<SocialProvider | null>(null);
  const [caption, setCaption] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [isScheduled, setIsScheduled] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);

  const activeConnections = useMemo(
    () => connections.filter(c => c.isActive),
    [connections]
  );

  const selectedConnection = useMemo(
    () => activeConnections.find(c => c.provider === selectedProvider),
    [activeConnections, selectedProvider]
  );

  const maxCaption = selectedProvider
    ? MEDIA_LIMITS[selectedProvider][mediaType]?.maxCaption ?? 2200
    : 2200;

  const captionLength = caption.length;
  const isCaptionTooLong = captionLength > maxCaption;

  const handleAddHashtag = () => {
    const tag = hashtagInput.trim().replace(/^#/, '');
    if (tag && !hashtags.includes(tag)) {
      setHashtags(prev => [...prev, tag]);
      setHashtagInput('');
    }
  };

  const handleRemoveHashtag = (tag: string) => {
    setHashtags(prev => prev.filter(t => t !== tag));
  };

  const handleHashtagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddHashtag();
    }
  };

  const handlePublish = async () => {
    if (!selectedProvider || !selectedConnection) return;

    const scheduledFor = isScheduled && scheduleDate && scheduleTime
      ? new Date(`${scheduleDate}T${scheduleTime}`).toISOString()
      : undefined;

    await onPublish({
      provider: selectedProvider,
      tokenId: selectedConnection.id,
      mediaUrl,
      mediaType,
      caption,
      hashtags,
      scheduledFor,
    });

    setPublishSuccess(true);
    setTimeout(() => {
      setPublishSuccess(false);
      onClose();
      resetForm();
    }, 2000);
  };

  const resetForm = () => {
    setSelectedProvider(null);
    setCaption('');
    setHashtags([]);
    setHashtagInput('');
    setScheduleDate('');
    setScheduleTime('');
    setIsScheduled(false);
    setPublishSuccess(false);
  };

  const canPublish =
    selectedProvider &&
    selectedConnection &&
    caption.trim().length > 0 &&
    !isCaptionTooLong &&
    !isPublishing;

  const mediaIcon = mediaType === 'image' ? ImageIcon : mediaType === 'video' ? Video : Film;
  const MediaIcon = mediaIcon;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl bg-[#1e1e1e] border border-[#444444] rounded-xl shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-[#444444]">
              <div>
                <h2 className="text-xl font-bold text-white">Publicar nas Redes Sociais</h2>
                <p className="text-sm text-[#b0b0b0] mt-0.5">
                  Selecione a rede e personalize sua publicação
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-[#2a2a2a] rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-[#b0b0b0]" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Success State */}
              {publishSuccess ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center py-12"
                >
                  <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
                    <Check className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Publicação Enviada!</h3>
                  <p className="text-[#b0b0b0]">
                    {isScheduled ? 'Agendada com sucesso' : 'Adicionada à fila de publicação'}
                  </p>
                </motion.div>
              ) : (
                <>
                  {/* Media Preview */}
                  <div className="flex gap-4">
                    <div className="w-32 h-32 rounded-lg bg-[#2a2a2a] border border-[#444444] overflow-hidden flex-shrink-0">
                      {mediaType === 'image' || mediaType === 'reel' ? (
                        <img
                          src={mediaUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-8 h-8 text-[#b0b0b0]" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <MediaIcon className="w-4 h-4 text-[#7e57c2]" />
                        <span className="text-sm font-medium text-white capitalize">{mediaType}</span>
                      </div>
                      <p className="text-xs text-[#b0b0b0] break-all">{mediaUrl}</p>
                    </div>
                  </div>

                  {/* Provider Selection */}
                  <div>
                    <label className="block text-sm font-medium text-[#b0b0b0] mb-3">
                      Selecionar Rede Social
                    </label>
                    {activeConnections.length === 0 ? (
                      <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm text-amber-200 font-medium">Nenhuma conta conectada</p>
                          <p className="text-xs text-amber-200/70 mt-1">
                            Conecte uma conta no Social Hub antes de publicar.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {activeConnections.map(conn => {
                          const ProvIcon = PROVIDER_ICONS[conn.provider];
                          const color = PROVIDER_COLORS[conn.provider];
                          const isSelected = selectedProvider === conn.provider;

                          return (
                            <button
                              key={conn.id}
                              onClick={() => setSelectedProvider(conn.provider)}
                              className={cn(
                                'flex items-center gap-3 p-4 rounded-lg border transition-all',
                                isSelected
                                  ? 'border-[#7e57c2] bg-[#7e57c2]/10'
                                  : 'border-[#444444] bg-[#2a2a2a] hover:bg-[#333333]'
                              )}
                            >
                              <ProvIcon className="w-5 h-5" style={{ color }} />
                              <div className="text-left">
                                <p className="text-sm font-medium text-white">
                                  {conn.provider === 'instagram' ? 'Instagram' : 'Twitter / X'}
                                </p>
                                <p className="text-xs text-[#b0b0b0]">@{conn.accountName}</p>
                              </div>
                              {isSelected && (
                                <Check className="w-4 h-4 text-[#7e57c2] ml-auto" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Caption */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium text-[#b0b0b0]">Legenda</label>
                      <span className={cn(
                        'text-xs',
                        isCaptionTooLong ? 'text-red-400' : 'text-[#666666]'
                      )}>
                        {captionLength}/{maxCaption}
                      </span>
                    </div>
                    <textarea
                      value={caption}
                      onChange={e => setCaption(e.target.value)}
                      placeholder="Escreva a legenda da sua publicação..."
                      rows={4}
                      className={cn(
                        'w-full px-4 py-3 bg-[#2a2a2a] border rounded-lg text-white text-sm',
                        'placeholder:text-[#666666] focus:outline-none focus:ring-2 resize-none',
                        isCaptionTooLong
                          ? 'border-red-500 focus:ring-red-500/50'
                          : 'border-[#444444] focus:ring-[#7e57c2]/50'
                      )}
                    />
                  </div>

                  {/* Hashtags */}
                  <div>
                    <label className="block text-sm font-medium text-[#b0b0b0] mb-2">
                      <Hash className="w-3.5 h-3.5 inline mr-1" />
                      Hashtags
                    </label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={hashtagInput}
                        onChange={e => setHashtagInput(e.target.value)}
                        onKeyDown={handleHashtagKeyDown}
                        placeholder="Adicionar hashtag..."
                        className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#444444] rounded-lg text-white text-sm placeholder:text-[#666666] focus:outline-none focus:ring-2 focus:ring-[#7e57c2]/50"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddHashtag}
                        disabled={!hashtagInput.trim()}
                        className="border-[#444444] text-white hover:bg-[#2a2a2a]"
                      >
                        Adicionar
                      </Button>
                    </div>
                    {hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {hashtags.map(tag => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#7e57c2]/20 border border-[#7e57c2]/30 rounded-full text-xs text-[#7e57c2]"
                          >
                            #{tag}
                            <button
                              onClick={() => handleRemoveHashtag(tag)}
                              className="hover:text-white transition-colors"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Schedule */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        checked={isScheduled}
                        onChange={e => setIsScheduled(e.target.checked)}
                        className="w-4 h-4 rounded border-[#444444] bg-[#2a2a2a] text-[#7e57c2] focus:ring-[#7e57c2]"
                      />
                      <Clock className="w-4 h-4 text-[#b0b0b0]" />
                      <span className="text-sm text-[#b0b0b0]">Agendar publicação</span>
                    </label>
                    {isScheduled && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex gap-3"
                      >
                        <input
                          type="date"
                          value={scheduleDate}
                          onChange={e => setScheduleDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#444444] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#7e57c2]/50"
                        />
                        <input
                          type="time"
                          value={scheduleTime}
                          onChange={e => setScheduleTime(e.target.value)}
                          className="flex-1 px-3 py-2 bg-[#2a2a2a] border border-[#444444] rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#7e57c2]/50"
                        />
                      </motion.div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            {!publishSuccess && (
              <div className="flex items-center justify-end gap-3 p-6 border-t border-[#444444]">
                <Button
                  variant="outline"
                  onClick={onClose}
                  className="border-[#444444] text-[#b0b0b0] hover:text-white hover:bg-[#2a2a2a]"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handlePublish}
                  disabled={!canPublish}
                  className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white disabled:opacity-50"
                >
                  {isPublishing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Publicando...
                    </>
                  ) : isScheduled ? (
                    <>
                      <Clock className="w-4 h-4 mr-2" />
                      Agendar
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Publicar Agora
                    </>
                  )}
                </Button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
