import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Zap,
  Calendar,
  BarChart3,
  Settings,
  Users,
  Heart,
  MessageCircle,
  Eye,
  UserPlus,
  UserMinus,
  Play,
  Square,
  Shield,
  Plus,
  Trash2,
  RefreshCw,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  LogIn,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useInstagramBot } from '@/hooks/useInstagramBot';
import { useToast } from '@/contexts/ToastContext';
import { cn } from '@/lib/utils';

type Tab = 'growth' | 'content' | 'analytics' | 'settings';

export function BotDashboard() {
  const { addToast } = useToast();
  const bot = useInstagramBot();

  const [activeTab, setActiveTab] = useState<Tab>('growth');
  const [botStatus, setBotStatus] = useState<any>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Growth state
  const [growthStats, setGrowthStats] = useState<any>(null);
  const [targets, setTargets] = useState<any>(null);
  const [newInfluencer, setNewInfluencer] = useState('');
  const [newInfluencerNiche, setNewInfluencerNiche] = useState('');
  const [hashtagInput, setHashtagInput] = useState('');
  const [sessionRunning, setSessionRunning] = useState(false);

  // Followers state
  const [followerStats, setFollowerStats] = useState<any>(null);
  const [whitelist, setWhitelist] = useState<string[]>([]);
  const [newWhitelistUser, setNewWhitelistUser] = useState('');

  // Content state
  const [scheduledPosts, setScheduledPosts] = useState<any[]>([]);
  const [daemonRunning, setDaemonRunning] = useState(false);

  // Analytics state
  const [analyticsReport, setAnalyticsReport] = useState<any>(null);
  const [bestTimes, setBestTimes] = useState<any>(null);

  // ── Load Status ──
  const loadStatus = useCallback(async () => {
    try {
      const status = await bot.getStatus();
      setBotStatus(status);
    } catch {
      setBotStatus(null);
    }
  }, [bot]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  // ── Login ──
  const handleLogin = async () => {
    setIsConnecting(true);
    try {
      // Tentar auto-login primeiro
      const status = await bot.loginBot();
      setBotStatus(status);
      addToast({ type: 'success', title: 'Bot conectado!', message: `Autenticado como @${status.username}` });
    } catch {
      // Se falhar, mostrar formulário de login direto
      if (!loginUsername || !loginPassword) {
        addToast({ type: 'error', title: 'Login necessário', message: 'Digite usuário e senha do Instagram' });
        setIsConnecting(false);
        return;
      }
      try {
        const status = await bot.loginDirect(loginUsername, loginPassword);
        setBotStatus(status);
        addToast({ type: 'success', title: 'Bot conectado!', message: `Autenticado como @${loginUsername}` });
      } catch (err: any) {
        addToast({ type: 'error', title: 'Erro no login', message: err.message });
      }
    }
    setIsConnecting(false);
  };

  // ── Growth ──
  const loadGrowthData = useCallback(async () => {
    try {
      const [stats, tgts] = await Promise.all([bot.getGrowthStats(), bot.getGrowthTargets()]);
      setGrowthStats(stats);
      setTargets(tgts);
    } catch { /* ignore */ }
  }, [bot]);

  const handleGrowthSession = async (type: 'aggressive' | 'balanced' | 'safe') => {
    setSessionRunning(true);
    try {
      await bot.runGrowthSession(type);
      addToast({ type: 'success', title: 'Sessão concluída!', message: `Sessão ${type} finalizada` });
      loadGrowthData();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Erro na sessão', message: err.message });
    }
    setSessionRunning(false);
  };

  const handleAddInfluencer = async () => {
    if (!newInfluencer.trim()) return;
    try {
      await bot.addInfluencer(newInfluencer.trim(), newInfluencerNiche.trim());
      setNewInfluencer('');
      setNewInfluencerNiche('');
      loadGrowthData();
      addToast({ type: 'success', title: 'Influenciador adicionado', message: `@${newInfluencer} adicionado` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Erro', message: err.message });
    }
  };

  const handleLikeHashtag = async () => {
    if (!hashtagInput.trim()) return;
    try {
      await bot.likeByHashtag(hashtagInput.trim(), 30);
      setHashtagInput('');
      loadGrowthData();
      addToast({ type: 'success', title: 'Curtidas enviadas', message: `Posts de #${hashtagInput} curtidos` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Erro', message: err.message });
    }
  };

  // ── Followers ──
  const loadFollowerData = useCallback(async () => {
    try {
      const [stats, wl] = await Promise.all([bot.getFollowerStats(), bot.getWhitelist()]);
      setFollowerStats(stats);
      setWhitelist(wl);
    } catch { /* ignore */ }
  }, [bot]);

  const handleCleanNonFollowers = async () => {
    try {
      const result = await bot.cleanNonFollowers(50, 2);
      loadFollowerData();
      addToast({ type: 'success', title: 'Limpeza concluída', message: `${(result as any)?.unfollowed || 0} unfollows realizados` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Erro', message: err.message });
    }
  };

  const handleAddWhitelist = async () => {
    if (!newWhitelistUser.trim()) return;
    try {
      await bot.addToWhitelist(newWhitelistUser.trim());
      setNewWhitelistUser('');
      loadFollowerData();
    } catch (err: any) {
      addToast({ type: 'error', title: 'Erro', message: err.message });
    }
  };

  // ── Content ──
  const loadContentData = useCallback(async () => {
    try {
      const [posts, daemon] = await Promise.all([bot.getScheduledPosts(), bot.getDaemonStatus()]);
      setScheduledPosts(posts);
      setDaemonRunning(daemon.running);
    } catch { /* ignore */ }
  }, [bot]);

  const handleToggleDaemon = async () => {
    try {
      if (daemonRunning) {
        await bot.stopDaemon();
        setDaemonRunning(false);
        addToast({ type: 'info', title: 'Daemon parado', message: 'Auto-postagem desativada' });
      } else {
        await bot.startDaemon();
        setDaemonRunning(true);
        addToast({ type: 'success', title: 'Daemon iniciado', message: 'Auto-postagem ativada' });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: 'Erro', message: err.message });
    }
  };

  // ── Analytics ──
  const loadAnalyticsData = useCallback(async () => {
    try {
      const [report, times] = await Promise.all([bot.getAnalyticsReport(), bot.getBestTimes()]);
      setAnalyticsReport(report);
      setBestTimes(times);
    } catch { /* ignore */ }
  }, [bot]);

  // Load data when tab changes
  useEffect(() => {
    if (!botStatus?.isLoggedIn) return;
    if (activeTab === 'growth') loadGrowthData();
    if (activeTab === 'content') loadContentData();
    if (activeTab === 'analytics') loadAnalyticsData();
    if (activeTab === 'settings') loadFollowerData();
  }, [activeTab, botStatus]);

  // ── Tabs ──
  const tabs: { id: Tab; label: string; icon: any }[] = [
    { id: 'growth', label: 'Crescimento', icon: TrendingUp },
    { id: 'content', label: 'Conteúdo', icon: Calendar },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  // ── Not logged in view ──
  if (!botStatus?.isLoggedIn) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto w-full">
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
            <Bot className="w-8 h-8 text-[#7e57c2]" />
            Instagram Bot
          </h1>
          <p className="text-[#b0b0b0] mt-1">Automação inteligente de crescimento</p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#2a2a2a] rounded-xl p-6 sm:p-8 border border-[#444444] max-w-md mx-auto"
        >
          <div className="text-center mb-6">
            <div className="w-16 h-16 rounded-full bg-[#7e57c2]/20 flex items-center justify-center mx-auto mb-4">
              <LogIn className="w-8 h-8 text-[#7e57c2]" />
            </div>
            <h2 className="text-xl font-semibold text-white">Conectar Instagram</h2>
            <p className="text-sm text-[#b0b0b0] mt-2">
              Conecte sua conta para usar as funcionalidades do bot
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <Label className="text-white">Usuário do Instagram</Label>
              <Input
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                placeholder="@seuusuario"
                className="bg-[#1a1a1a] border-[#444444] text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-white">Senha</Label>
              <Input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="bg-[#1a1a1a] border-[#444444] text-white mt-1"
              />
            </div>
            <Button
              onClick={handleLogin}
              disabled={isConnecting}
              className="w-full bg-[#7e57c2] hover:bg-[#6a42b0] text-white h-12"
            >
              {isConnecting ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Conectando...</>
              ) : (
                <><LogIn className="w-5 h-5 mr-2" /> Conectar Bot</>
              )}
            </Button>
            <p className="text-xs text-[#666] text-center">
              Ou conecte via Social Hub para auto-login
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full overflow-x-hidden">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-3">
              <Bot className="w-8 h-8 text-[#7e57c2]" />
              Instagram Bot
            </h1>
            <p className="text-[#b0b0b0] mt-1">
              Conectado como <span className="text-[#7e57c2] font-medium">@{botStatus?.username}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 rounded-full">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-400 text-sm font-medium">Online</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 -mx-1 px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all',
                activeTab === tab.id
                  ? 'bg-[#7e57c2] text-white'
                  : 'bg-[#2a2a2a] text-[#b0b0b0] hover:bg-[#333] hover:text-white'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
        >
          {activeTab === 'growth' && (
            <GrowthTab
              stats={growthStats}
              targets={targets}
              sessionRunning={sessionRunning || bot.loading}
              onRunSession={handleGrowthSession}
              onAbort={() => bot.abortGrowthSession()}
              onAddInfluencer={handleAddInfluencer}
              newInfluencer={newInfluencer}
              setNewInfluencer={setNewInfluencer}
              newInfluencerNiche={newInfluencerNiche}
              setNewInfluencerNiche={setNewInfluencerNiche}
              hashtagInput={hashtagInput}
              setHashtagInput={setHashtagInput}
              onLikeHashtag={handleLikeHashtag}
              onRefresh={loadGrowthData}
            />
          )}
          {activeTab === 'content' && (
            <ContentTab
              posts={scheduledPosts}
              daemonRunning={daemonRunning}
              onToggleDaemon={handleToggleDaemon}
              onCancelPost={(id) => { bot.cancelScheduledPost(id).then(loadContentData); }}
              onRefresh={loadContentData}
            />
          )}
          {activeTab === 'analytics' && (
            <AnalyticsTab
              report={analyticsReport}
              bestTimes={bestTimes}
              loading={bot.loading}
              onAnalyze={() => bot.analyzePerformance(9).then(loadAnalyticsData)}
              onRefresh={loadAnalyticsData}
            />
          )}
          {activeTab === 'settings' && (
            <SettingsTab
              followerStats={followerStats}
              whitelist={whitelist}
              newUser={newWhitelistUser}
              setNewUser={setNewWhitelistUser}
              onAddWhitelist={handleAddWhitelist}
              onRemoveWhitelist={(u) => bot.removeFromWhitelist(u).then(loadFollowerData)}
              onCleanNonFollowers={handleCleanNonFollowers}
              loading={bot.loading}
              onRefresh={loadFollowerData}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// GROWTH TAB
// ══════════════════════════════════════════════════════════════

function GrowthTab(props: {
  stats: any;
  targets: any;
  sessionRunning: boolean;
  onRunSession: (type: 'aggressive' | 'balanced' | 'safe') => void;
  onAbort: () => void;
  onAddInfluencer: () => void;
  newInfluencer: string;
  setNewInfluencer: (v: string) => void;
  newInfluencerNiche: string;
  setNewInfluencerNiche: (v: string) => void;
  hashtagInput: string;
  setHashtagInput: (v: string) => void;
  onLikeHashtag: () => void;
  onRefresh: () => void;
}) {
  const { stats, targets, sessionRunning } = props;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Follows Hoje', value: stats?.today?.follows ?? 0, icon: UserPlus, color: 'text-green-400' },
          { label: 'Unfollows Hoje', value: stats?.today?.unfollows ?? 0, icon: UserMinus, color: 'text-red-400' },
          { label: 'Curtidas Hoje', value: stats?.today?.likes ?? 0, icon: Heart, color: 'text-pink-400' },
          { label: 'Comentários', value: stats?.today?.comments ?? 0, icon: MessageCircle, color: 'text-blue-400' },
          { label: 'Stories Vistos', value: stats?.today?.storiesViewed ?? 0, icon: Eye, color: 'text-purple-400' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="bg-[#2a2a2a] rounded-xl p-4 border border-[#444444]">
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('w-4 h-4', item.color)} />
                <span className="text-xs text-[#b0b0b0]">{item.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{item.value}</p>
            </div>
          );
        })}
      </div>

      {/* Session Controls */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium flex items-center gap-2">
            <Zap className="w-5 h-5 text-[#7e57c2]" />
            Sessões de Crescimento
          </h3>
          <Button variant="ghost" size="sm" onClick={props.onRefresh} className="text-[#b0b0b0]">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {sessionRunning ? (
          <div className="text-center py-6">
            <Loader2 className="w-10 h-10 text-[#7e57c2] animate-spin mx-auto mb-4" />
            <p className="text-white font-medium">Sessão em andamento...</p>
            <p className="text-sm text-[#b0b0b0] mt-1">Isso pode levar alguns minutos</p>
            <Button onClick={props.onAbort} variant="outline" className="mt-4 border-red-500/50 text-red-400">
              <Square className="w-4 h-4 mr-2" /> Abortar
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {[
              { type: 'safe' as const, label: '🛡️ Segura', desc: 'Para contas novas', color: 'border-green-500/30 hover:border-green-500/60' },
              { type: 'balanced' as const, label: '⚡ Balanceada', desc: 'Recomendada', color: 'border-[#7e57c2]/30 hover:border-[#7e57c2]/60' },
              { type: 'aggressive' as const, label: '🚀 Agressiva', desc: 'Máximo crescimento', color: 'border-orange-500/30 hover:border-orange-500/60' },
            ].map((session) => (
              <button
                key={session.type}
                onClick={() => props.onRunSession(session.type)}
                className={cn(
                  'p-4 rounded-lg border bg-[#1a1a1a] text-left transition-all hover:bg-[#333]',
                  session.color
                )}
              >
                <div className="font-medium text-white mb-1">{session.label}</div>
                <div className="text-xs text-[#b0b0b0]">{session.desc}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Like by Hashtag */}
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <h4 className="text-white font-medium mb-3 flex items-center gap-2">
            <Heart className="w-4 h-4 text-pink-400" /> Curtir por Hashtag
          </h4>
          <div className="flex gap-2">
            <Input
              value={props.hashtagInput}
              onChange={(e) => props.setHashtagInput(e.target.value)}
              placeholder="#hashtag"
              className="bg-[#1a1a1a] border-[#444444] text-white"
            />
            <Button onClick={props.onLikeHashtag} disabled={sessionRunning} className="bg-[#7e57c2]">
              <Heart className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Add Influencer */}
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <h4 className="text-white font-medium mb-3 flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-blue-400" /> Adicionar Influenciador
          </h4>
          <div className="flex gap-2">
            <Input
              value={props.newInfluencer}
              onChange={(e) => props.setNewInfluencer(e.target.value)}
              placeholder="@username"
              className="bg-[#1a1a1a] border-[#444444] text-white flex-1"
            />
            <Input
              value={props.newInfluencerNiche}
              onChange={(e) => props.setNewInfluencerNiche(e.target.value)}
              placeholder="Nicho"
              className="bg-[#1a1a1a] border-[#444444] text-white w-24"
            />
            <Button onClick={props.onAddInfluencer} className="bg-[#7e57c2]">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Targets List */}
      {targets && (
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <h4 className="text-white font-medium mb-3">Alvos de Crescimento</h4>
          <div className="space-y-2">
            {targets.influencers?.length > 0 && (
              <div>
                <span className="text-xs text-[#b0b0b0] uppercase tracking-wider">Influenciadores</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {targets.influencers.map((inf: any, i: number) => (
                    <span key={i} className="px-2 py-1 bg-[#7e57c2]/20 text-[#7e57c2] rounded text-sm">
                      @{inf.username} {inf.niche && `(${inf.niche})`}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {targets.hashtags?.length > 0 && (
              <div className="mt-3">
                <span className="text-xs text-[#b0b0b0] uppercase tracking-wider">Hashtags</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {targets.hashtags.slice(0, 10).map((tag: string, i: number) => (
                    <span key={i} className="px-2 py-1 bg-pink-500/20 text-pink-400 rounded text-sm">
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CONTENT TAB
// ══════════════════════════════════════════════════════════════

function ContentTab(props: {
  posts: any[];
  daemonRunning: boolean;
  onToggleDaemon: () => void;
  onCancelPost: (id: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Daemon Control */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-white font-medium flex items-center gap-2">
              <Calendar className="w-5 h-5 text-[#7e57c2]" />
              Auto-Publicação
            </h3>
            <p className="text-sm text-[#b0b0b0] mt-1">
              {props.daemonRunning
                ? 'Publicando automaticamente posts agendados'
                : 'Ative para publicar posts automaticamente no horário agendado'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
              props.daemonRunning ? 'bg-green-500/20 text-green-400' : 'bg-[#444444] text-[#b0b0b0]'
            )}>
              <div className={cn('w-1.5 h-1.5 rounded-full', props.daemonRunning ? 'bg-green-400 animate-pulse' : 'bg-[#666]')} />
              {props.daemonRunning ? 'Ativo' : 'Inativo'}
            </div>
            <Switch checked={props.daemonRunning} onCheckedChange={props.onToggleDaemon} />
          </div>
        </div>
      </div>

      {/* Scheduled Posts */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium">Posts Agendados</h3>
          <Button variant="ghost" size="sm" onClick={props.onRefresh} className="text-[#b0b0b0]">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {props.posts.length === 0 ? (
          <div className="text-center py-8">
            <Calendar className="w-12 h-12 text-[#444444] mx-auto mb-3" />
            <p className="text-[#b0b0b0]">Nenhum post agendado</p>
            <p className="text-xs text-[#666] mt-1">Use o agendamento para programar publicações</p>
          </div>
        ) : (
          <div className="space-y-3">
            {props.posts.map((post) => (
              <div key={post.id} className="flex items-center gap-4 p-3 bg-[#1a1a1a] rounded-lg">
                <div className={cn(
                  'w-10 h-10 rounded-lg flex items-center justify-center',
                  post.posted ? 'bg-green-500/20' : 'bg-[#7e57c2]/20'
                )}>
                  {post.posted ? <CheckCircle className="w-5 h-5 text-green-400" /> : <Clock className="w-5 h-5 text-[#7e57c2]" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{post.caption || 'Sem legenda'}</p>
                  <p className="text-xs text-[#b0b0b0]">
                    {post.contentType} • {new Date(post.scheduledTime).toLocaleString('pt-BR')}
                  </p>
                </div>
                {!post.posted && (
                  <Button variant="ghost" size="sm" onClick={() => props.onCancelPost(post.id)} className="text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ANALYTICS TAB
// ══════════════════════════════════════════════════════════════

function AnalyticsTab(props: {
  report: any;
  bestTimes: any;
  loading: boolean;
  onAnalyze: () => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Best Times */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium flex items-center gap-2">
            <Clock className="w-5 h-5 text-[#7e57c2]" />
            Melhores Horários para Postar
          </h3>
          <Button variant="ghost" size="sm" onClick={props.onRefresh} className="text-[#b0b0b0]">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {props.bestTimes ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              { label: '1º Post', hour: props.bestTimes.primeiro_post },
              { label: '2º Post', hour: props.bestTimes.segundo_post },
              { label: '3º Post', hour: props.bestTimes.terceiro_post },
            ].map((item) => (
              <div key={item.label} className="bg-[#1a1a1a] rounded-lg p-4 text-center">
                <p className="text-xs text-[#b0b0b0] mb-1">{item.label}</p>
                <p className="text-2xl font-bold text-[#7e57c2]">{String(item.hour).padStart(2, '0')}:00</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#b0b0b0] text-center py-4">Carregando dados...</p>
        )}
      </div>

      {/* Performance Analysis */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#7e57c2]" />
            Performance dos Posts
          </h3>
          <Button onClick={props.onAnalyze} disabled={props.loading} size="sm" className="bg-[#7e57c2]">
            {props.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Analisar
          </Button>
        </div>

        {props.report ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-[#1a1a1a] rounded-lg p-4">
                <p className="text-xs text-[#b0b0b0]">Posts Analisados</p>
                <p className="text-xl font-bold text-white">{props.report.postPerformance?.totalAnalyzed ?? 0}</p>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg p-4">
                <p className="text-xs text-[#b0b0b0]">Engajamento Médio</p>
                <p className="text-xl font-bold text-white">{(props.report.postPerformance?.avgEngagement ?? 0).toFixed(0)}</p>
              </div>
              <div className="bg-[#1a1a1a] rounded-lg p-4">
                <p className="text-xs text-[#b0b0b0]">Melhor Post</p>
                <p className="text-xl font-bold text-green-400">{props.report.postPerformance?.bestPost?.engagement ?? 0}</p>
              </div>
            </div>

            {props.report.recommendations?.length > 0 && (
              <div className="bg-[#1a1a1a] rounded-lg p-4">
                <p className="text-sm text-[#b0b0b0] mb-2">💡 Recomendações</p>
                <ul className="space-y-1">
                  {props.report.recommendations.map((rec: string, i: number) => (
                    <li key={i} className="text-sm text-white flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" />
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-6">
            <BarChart3 className="w-12 h-12 text-[#444444] mx-auto mb-3" />
            <p className="text-[#b0b0b0]">Clique em "Analisar" para ver performance</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ══════════════════════════════════════════════════════════════

function SettingsTab(props: {
  followerStats: any;
  whitelist: string[];
  newUser: string;
  setNewUser: (v: string) => void;
  onAddWhitelist: () => void;
  onRemoveWhitelist: (u: string) => void;
  onCleanNonFollowers: () => void;
  loading: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Follower Stats */}
      {props.followerStats && (
        <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
          <h3 className="text-white font-medium mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#7e57c2]" />
            Estatísticas de Seguidores
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Histórico Total', value: props.followerStats.totalHistoric ?? 0 },
              { label: 'Seguindo', value: props.followerStats.activelyFollowing ?? 0 },
              { label: 'Unfollowed', value: props.followerStats.unfollowed ?? 0 },
              { label: 'Follow-back', value: props.followerStats.followBackRate ?? '0%' },
            ].map((item) => (
              <div key={item.label} className="bg-[#1a1a1a] rounded-lg p-3 text-center">
                <p className="text-xs text-[#b0b0b0]">{item.label}</p>
                <p className="text-lg font-bold text-white mt-1">{item.value}</p>
              </div>
            ))}
          </div>

          <Button
            onClick={props.onCleanNonFollowers}
            disabled={props.loading}
            className="mt-4 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30"
          >
            {props.loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserMinus className="w-4 h-4 mr-2" />}
            Limpar Não-Seguidores
          </Button>
        </div>
      )}

      {/* Whitelist */}
      <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-medium flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-400" />
            Whitelist ({props.whitelist.length} protegidos)
          </h3>
          <Button variant="ghost" size="sm" onClick={props.onRefresh} className="text-[#b0b0b0]">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex gap-2 mb-4">
          <Input
            value={props.newUser}
            onChange={(e) => props.setNewUser(e.target.value)}
            placeholder="@username"
            className="bg-[#1a1a1a] border-[#444444] text-white"
            onKeyDown={(e) => e.key === 'Enter' && props.onAddWhitelist()}
          />
          <Button onClick={props.onAddWhitelist} className="bg-green-600 hover:bg-green-700">
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {props.whitelist.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {props.whitelist.map((user) => (
              <div key={user} className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/30 rounded text-sm">
                <Shield className="w-3 h-3 text-green-400" />
                <span className="text-green-300">@{user}</span>
                <button onClick={() => props.onRemoveWhitelist(user)} className="ml-1 text-red-400 hover:text-red-300">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#b0b0b0] text-sm">Nenhum usuário na whitelist</p>
        )}
      </div>
    </div>
  );
}
