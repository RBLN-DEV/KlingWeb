import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Video, 
  Image, 
  Coins, 
  Clock, 
  TrendingUp, 
  Plus, 
  Play,
  Sparkles,
  ArrowRight,
  Share2,
  Instagram,
  Twitter,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { StatsCard } from '@/components/ui-custom/StatsCard';
import { VideoCard } from '@/components/ui-custom/VideoCard';
import { Button } from '@/components/ui/button';
import { useKling } from '@/hooks/useKling';
import { useGemini } from '@/hooks/useGemini';
import { AccountUsage } from '@/components/AccountUsage';
import type { VideoGeneration, UserStats } from '@/types';

export function Dashboard() {
  const navigate = useNavigate();
  const { getStoredVideos } = useKling();
  const { getStoredImages } = useGemini();
  const [videos, setVideos] = useState<VideoGeneration[]>([]);
  const [stats, setStats] = useState<UserStats>({
    totalVideos: 0,
    totalImages: 0,
    creditsRemaining: 100,
    totalDuration: 0,
    successRate: 98,
  });

  useEffect(() => {
    const storedVideos = getStoredVideos();
    const storedImages = getStoredImages();
    setVideos(storedVideos.slice(0, 6));
    
    // Calculate stats from local data
    const completedVideos = storedVideos.filter(v => v.status === 'completed');
    const totalDuration = completedVideos.reduce((acc, v) => acc + (v.duration || 0), 0);
    
    // Calcular taxa de sucesso combinada (vídeos + imagens)
    const totalAttempts = storedVideos.length + storedImages.length;
    const completedImages = storedImages.filter((img: any) => img.status === 'completed');
    const totalSuccess = completedVideos.length + completedImages.length;
    
    setStats(prev => ({
      ...prev,
      totalVideos: storedVideos.length,
      totalImages: storedImages.length,
      totalDuration,
      successRate: totalAttempts > 0 
        ? Math.round((totalSuccess / totalAttempts) * 100) 
        : 100,
    }));

    // Fetch real credits from Kling API
    fetch('/api/account/costs')
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data?.data?.resource_pack_subscribe_infos) {
          const packs = json.data.data.resource_pack_subscribe_infos;
          const remaining = packs.reduce((sum: number, p: { remaining_quantity: number }) => sum + p.remaining_quantity, 0);
          setStats(prev => ({
            ...prev,
            creditsRemaining: remaining,
          }));
        }
      })
      .catch(() => { /* silently fail — AccountUsage component shows the error */ });
  }, [getStoredVideos]);

  const handleDelete = (id: string) => {
    const saved = localStorage.getItem('klingai_videos');
    if (saved) {
      const allVideos = JSON.parse(saved);
      const filtered = allVideos.filter((v: VideoGeneration) => v.id !== id);
      localStorage.setItem('klingai_videos', JSON.stringify(filtered));
      setVideos(filtered.slice(0, 6));
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8"
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white">Dashboard</h1>
            <p className="text-[#b0b0b0] mt-1">Bem-vindo de volta! Aqui está o resumo da sua conta.</p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate('/image')}
              className="border-[#444444] text-white hover:bg-[#2a2a2a]"
            >
              <Image className="w-4 h-4 mr-2" />
              Nova Imagem
            </Button>
            <Button
              onClick={() => navigate('/video')}
              className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              <Video className="w-4 h-4 mr-2" />
              Novo Vídeo
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-8">
        <StatsCard
          title="Vídeos Gerados"
          value={stats.totalVideos}
          subtitle="Total de vídeos criados"
          icon={Video}
          color="purple"
          delay={0}
        />
        <StatsCard
          title="Imagens Geradas"
          value={stats.totalImages}
          subtitle="Total de imagens criadas"
          icon={Image}
          color="blue"
          delay={0.05}
        />
        <StatsCard
          title="Créditos Disponíveis"
          value={stats.creditsRemaining}
          subtitle="Créditos para gerar vídeos"
          icon={Coins}
          trend="neutral"
          color="green"
          delay={0.1}
        />
        <StatsCard
          title="Tempo Total"
          value={`${Math.floor(stats.totalDuration / 60)}m ${stats.totalDuration % 60}s`}
          subtitle="Duração total dos vídeos"
          icon={Clock}
          color="orange"
          delay={0.15}
        />
        <StatsCard
          title="Taxa de Sucesso"
          value={`${stats.successRate}%`}
          subtitle="Gerações bem-sucedidas"
          icon={TrendingUp}
          color="purple"
          delay={0.2}
        />
      </div>

      {/* Kling Account Usage */}
      <div className="mb-8">
        <AccountUsage />
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="mb-8"
      >
        <h2 className="text-lg font-semibold text-white mb-4">Ações Rápidas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/image')}
            className="p-6 bg-gradient-to-br from-[#7e57c2]/20 to-transparent border border-[#7e57c2]/30 rounded-xl text-left hover:border-[#7e57c2]/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-lg bg-[#7e57c2]/20 flex items-center justify-center mb-4">
              <Image className="w-6 h-6 text-[#7e57c2]" />
            </div>
            <h3 className="text-white font-medium mb-1">Gerar Imagem</h3>
            <p className="text-sm text-[#b0b0b0]">Crie imagens com Gemini</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/video')}
            className="p-6 bg-gradient-to-br from-green-500/20 to-transparent border border-green-500/30 rounded-xl text-left hover:border-green-500/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-lg bg-green-500/20 flex items-center justify-center mb-4">
              <Video className="w-6 h-6 text-green-500" />
            </div>
            <h3 className="text-white font-medium mb-1">Gerar Vídeo</h3>
            <p className="text-sm text-[#b0b0b0]">Transforme imagens em vídeos</p>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/prompts')}
            className="p-6 bg-gradient-to-br from-orange-500/20 to-transparent border border-orange-500/30 rounded-xl text-left hover:border-orange-500/50 transition-colors"
          >
            <div className="w-12 h-12 rounded-lg bg-orange-500/20 flex items-center justify-center mb-4">
              <Sparkles className="w-6 h-6 text-orange-500" />
            </div>
            <h3 className="text-white font-medium mb-1">Prompts</h3>
            <p className="text-sm text-[#b0b0b0]">Explore templates prontos</p>
          </motion.button>
        </div>
      </motion.div>

      {/* Social Media Widget */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Redes Sociais</h2>
          <Button
            variant="ghost"
            onClick={() => navigate('/social-hub')}
            className="text-[#7e57c2] hover:text-[#6a42b0] hover:bg-[#7e57c2]/10"
          >
            Social Hub
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/social-hub')}
            className="p-5 bg-gradient-to-br from-[#E4405F]/15 to-transparent border border-[#E4405F]/20 rounded-xl text-left hover:border-[#E4405F]/40 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#E4405F]/20 flex items-center justify-center">
                <Instagram className="w-5 h-5 text-[#E4405F]" />
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">Instagram</h3>
                <p className="text-xs text-[#b0b0b0]">Publique fotos e reels</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-[#b0b0b0]" />
              <span className="text-xs text-[#b0b0b0]">Conectar e publicar →</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => navigate('/social-hub')}
            className="p-5 bg-gradient-to-br from-[#1DA1F2]/15 to-transparent border border-[#1DA1F2]/20 rounded-xl text-left hover:border-[#1DA1F2]/40 transition-colors"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#1DA1F2]/20 flex items-center justify-center">
                <Twitter className="w-5 h-5 text-[#1DA1F2]" />
              </div>
              <div>
                <h3 className="text-white font-medium text-sm">Twitter / X</h3>
                <p className="text-xs text-[#b0b0b0]">Publique tweets com mídia</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5 text-[#b0b0b0]" />
              <span className="text-xs text-[#b0b0b0]">Conectar e publicar →</span>
            </div>
          </motion.button>
        </div>
      </motion.div>

      {/* Recent Videos */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.5 }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">Vídeos Recentes</h2>
          {videos.length > 0 && (
            <Button
              variant="ghost"
              onClick={() => navigate('/gallery')}
              className="text-[#7e57c2] hover:text-[#6a42b0] hover:bg-[#7e57c2]/10"
            >
              Ver todos
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {videos.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video, index) => (
              <VideoCard
                key={video.id}
                video={video}
                onDelete={handleDelete}
                delay={index * 0.1}
              />
            ))}
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-center py-16 bg-[#2a2a2a]/50 rounded-xl border border-dashed border-[#444444]"
          >
            <div className="w-16 h-16 rounded-full bg-[#444444] flex items-center justify-center mx-auto mb-4">
              <Play className="w-8 h-8 text-[#b0b0b0]" />
            </div>
            <h3 className="text-white font-medium mb-2">Nenhum vídeo ainda</h3>
            <p className="text-[#b0b0b0] mb-4">Comece criando seu primeiro vídeo com IA</p>
            <Button
              onClick={() => navigate('/video')}
              className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              <Plus className="w-4 h-4 mr-2" />
              Criar Vídeo
            </Button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
