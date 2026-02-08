import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  BarChart3,
  Clock,
  Database,
  Globe,
  HardDrive,
  Key,
  RefreshCw,
  Server,
  Shield,
  TrendingUp,
  Users,
  Wifi,
  Eye,
  EyeOff,
  Save,
  CheckCircle2,
  XCircle,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

// ── Tipos ────────────────────────────────────────────────────────────────────

interface Subscription {
  traffic_limit: string;
  traffic: string;
  proxy_users_limit: number;
  ip_address_limit: number;
  valid_from: string;
  valid_until: string;
  service_type: string;
}

interface SubUser {
  id: number;
  username: string;
  status: string;
  created_at: string;
  traffic: number;
  traffic_bytes: number;
  traffic_limit: number | null;
  traffic_limit_bytes: number | null;
  auto_disable: boolean;
}

interface TrafficDataPoint {
  key: string;
  rx_bytes: number;
  tx_bytes: number;
  rx_tx_bytes: number;
  requests: number;
}

interface TrafficTotals {
  total_rx: number;
  total_tx: number;
  total_rx_tx: number;
  requests: number;
  unsuccessful_requests: number;
}

interface DecodoEndpointType {
  type: string;
  available_locations: string;
  url: string;
}

interface OverviewData {
  subscription: Subscription | null;
  subUsers: SubUser[];
  endpoints: DecodoEndpointType[];
  traffic: {
    metadata: { totals: TrafficTotals };
    data: TrafficDataPoint[];
  } | null;
  trafficPeriod: string;
}

interface ConfigData {
  configured: boolean;
  source: string;
  maskedKey: string | null;
  updatedAt: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR');
}

function daysUntil(date: string): number {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

// ── Componente Principal ─────────────────────────────────────────────────────

export function ProxyDashboard() {
  const { token: authToken, user } = useAuth();
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [config, setConfig] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }), [authToken]);

  // ── Carregar config e overview ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, overRes] = await Promise.all([
        fetch(`${API_BASE}/api/decodo/config`, { headers: headers() }),
        fetch(`${API_BASE}/api/decodo/overview?days=30`, { headers: headers() }),
      ]);

      if (cfgRes.ok) {
        const cfgJson = await cfgRes.json();
        if (cfgJson.success) setConfig(cfgJson.data);
      }

      if (overRes.ok) {
        const overJson = await overRes.json();
        if (overJson.success) setOverview(overJson.data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [headers]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Salvar API key ──
  const handleSaveKey = async () => {
    if (!apiKeyInput.trim()) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/decodo/config`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        setSaveResult({ ok: true, msg: 'API key configurada!' });
        setApiKeyInput('');
        setTimeout(() => loadData(), 500);
      } else {
        setSaveResult({ ok: false, msg: json.error || 'Erro ao salvar' });
      }
    } catch {
      setSaveResult({ ok: false, msg: 'Erro de conexão' });
    } finally {
      setSaving(false);
    }
  };

  const sub = overview?.subscription;
  const traffic = overview?.traffic;
  const totals = traffic?.metadata?.totals;
  const subUsers = overview?.subUsers || [];
  const endpoints = overview?.endpoints || [];

  const trafficUsedGb = sub ? parseFloat(sub.traffic) : 0;
  const trafficLimitGb = sub ? parseFloat(sub.traffic_limit) : 0;
  const trafficPercent = trafficLimitGb > 0 ? Math.min((trafficUsedGb / trafficLimitGb) * 100, 100) : 0;
  const daysLeft = sub?.valid_until ? daysUntil(sub.valid_until) : 0;

  // ── Se não configurado, mostrar setup ──
  if (!loading && !config?.configured) {
    return (
      <div className="space-y-6">
        <div className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-[#7e57c2]/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-[#7e57c2]" />
            </div>
            <div>
              <h3 className="text-white font-medium">Decodo Proxy API</h3>
              <p className="text-sm text-[#b0b0b0]">Configure sua API key para monitorar o proxy</p>
            </div>
          </div>

          <div className="bg-[#1a1a1a] rounded-lg p-4 border border-[#444444]/50 mb-4">
            <p className="text-sm text-[#b0b0b0]">
              Obtenha sua API key no{' '}
              <a href="https://dashboard.decodo.com/profile?tab=api-keys" target="_blank" rel="noopener" className="text-[#7e57c2] hover:underline">
                Dashboard Decodo → Settings → API Keys
              </a>
            </p>
          </div>

          {user?.role === 'admin' && (
            <div className="space-y-3">
              <Label className="text-white">API Key</Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKeyInput}
                  onChange={(e) => { setApiKeyInput(e.target.value); setSaveResult(null); }}
                  placeholder="Cole sua API key aqui..."
                  className="bg-[#1a1a1a] border-[#444444] text-white font-mono text-sm pr-10"
                />
                <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-white">
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {saveResult && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className={cn('flex items-center gap-2 text-sm', saveResult.ok ? 'text-green-400' : 'text-red-400')}>
                  {saveResult.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {saveResult.msg}
                </motion.div>
              )}

              <Button onClick={handleSaveKey} disabled={saving || !apiKeyInput.trim()} className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white">
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Validando...' : 'Salvar API Key'}
              </Button>
            </div>
          )}

          {user?.role !== 'admin' && (
            <p className="text-sm text-yellow-400">Somente administradores podem configurar a API key.</p>
          )}
        </div>
      </div>
    );
  }

  // ── Loading ──
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-[#2a2a2a] rounded-xl p-6 border border-[#444444] animate-pulse">
            <div className="h-4 bg-[#444] rounded w-1/3 mb-4" />
            <div className="h-8 bg-[#444] rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  // ── Dashboard Principal ──
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#7e57c2] to-[#5c35a0] flex items-center justify-center">
            <Globe className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-white font-semibold">Decodo Proxy</h3>
            <p className="text-xs text-[#b0b0b0]">
              Key: {config?.maskedKey || '...'} · {config?.source === 'env' ? 'Via env' : 'Via UI'}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadData}
          className="border-[#444444] text-[#b0b0b0] hover:bg-[#2a2a2a] hover:text-white">
          <RefreshCw className="w-4 h-4 mr-1" />
          Atualizar
        </Button>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Assinatura */}
        <StatCard
          icon={<HardDrive className="w-4 h-4" />}
          label="Plano"
          value={sub ? `${sub.traffic_limit} GB` : '--'}
          sub={sub ? `Até ${new Date(sub.valid_until).toLocaleDateString('pt-BR')}` : ''}
          color="purple"
        />
        {/* Tráfego usado */}
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="Tráfego Usado"
          value={totals ? formatBytes(totals.total_rx_tx) : `${trafficUsedGb} GB`}
          sub={trafficLimitGb > 0 ? `${trafficPercent.toFixed(1)}% do limite` : ''}
          color={trafficPercent > 80 ? 'red' : trafficPercent > 50 ? 'yellow' : 'green'}
        />
        {/* Requests */}
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Requests (30d)"
          value={totals ? formatNumber(totals.requests) : '--'}
          sub={totals ? `${formatNumber(totals.unsuccessful_requests)} falhas` : ''}
          color="blue"
        />
        {/* Dias restantes */}
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="Dias Restantes"
          value={daysLeft > 0 ? String(daysLeft) : '--'}
          sub={daysLeft > 0 ? (daysLeft <= 7 ? '⚠️ Renovar em breve!' : 'até expirar') : ''}
          color={daysLeft <= 7 ? 'red' : daysLeft <= 14 ? 'yellow' : 'green'}
        />
      </div>

      {/* Tráfego + Barra de uso */}
      {sub && (
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white font-medium text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-[#7e57c2]" />
              Uso de Tráfego
            </h4>
            <span className="text-xs text-[#b0b0b0]">
              {trafficUsedGb} GB / {trafficLimitGb} GB
            </span>
          </div>
          <div className="w-full h-3 bg-[#1a1a1a] rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${trafficPercent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className={cn(
                'h-full rounded-full',
                trafficPercent > 80 ? 'bg-red-500' : trafficPercent > 50 ? 'bg-yellow-500' : 'bg-[#7e57c2]',
              )}
            />
          </div>
          <p className="text-xs text-[#666] mt-2">
            Restante: {(trafficLimitGb - trafficUsedGb).toFixed(2)} GB
          </p>
        </div>
      )}

      {/* Chart - Tráfego diário */}
      {traffic && traffic.data.length > 0 && (
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <h4 className="text-white font-medium text-sm flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-[#7e57c2]" />
            Tráfego Diário (30 dias)
          </h4>
          <div className="flex items-end gap-1 h-32">
            {traffic.data.map((dp, i) => {
              const maxBytes = Math.max(...traffic.data.map(d => d.rx_tx_bytes), 1);
              const height = Math.max((dp.rx_tx_bytes / maxBytes) * 100, 2);
              return (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] border border-[#555] rounded px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                    {formatBytes(dp.rx_tx_bytes)} · {dp.requests} req
                  </div>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${height}%` }}
                    transition={{ duration: 0.5, delay: i * 0.02 }}
                    className="w-full bg-[#7e57c2] hover:bg-[#9575cd] rounded-t cursor-pointer min-h-[2px]"
                  />
                </div>
              );
            })}
          </div>
          <div className="flex justify-between mt-2 text-xs text-[#666]">
            <span>{traffic.data[0]?.key?.slice(5, 10)}</span>
            <span>{traffic.data[traffic.data.length - 1]?.key?.slice(5, 10)}</span>
          </div>
        </div>
      )}

      {/* Sub-Users + Endpoints */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Sub Users */}
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <h4 className="text-white font-medium text-sm flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-[#7e57c2]" />
            Sub-Usuários ({subUsers.length}/{sub?.proxy_users_limit || '?'})
          </h4>
          {subUsers.length === 0 ? (
            <p className="text-sm text-[#666]">Nenhum sub-usuário</p>
          ) : (
            <div className="space-y-2">
              {subUsers.map(u => (
                <div key={u.id} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white font-mono">{u.username}</p>
                    <p className="text-xs text-[#b0b0b0]">
                      {u.status === 'active' ? '🟢 Ativo' : '🔴 Inativo'} · Desde {u.created_at?.slice(0, 10)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-white">{formatBytes(u.traffic_bytes)}</p>
                    <p className="text-xs text-[#b0b0b0]">
                      {u.traffic_limit_bytes ? `/ ${formatBytes(u.traffic_limit_bytes)}` : 'Sem limite'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Endpoints */}
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <h4 className="text-white font-medium text-sm flex items-center gap-2 mb-3">
            <Server className="w-4 h-4 text-[#7e57c2]" />
            Endpoints Disponíveis
          </h4>
          {endpoints.length === 0 ? (
            <p className="text-sm text-[#666]">Nenhum endpoint</p>
          ) : (
            <div className="space-y-2">
              {endpoints.map((ep, i) => (
                <div key={i} className="flex items-center justify-between bg-[#1a1a1a] rounded-lg p-3">
                  <div>
                    <p className="text-sm text-white capitalize">{ep.type}</p>
                    <p className="text-xs text-[#b0b0b0]">{ep.url}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[#7e57c2] font-semibold">{ep.available_locations}</p>
                    <p className="text-xs text-[#b0b0b0]">locais</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Tráfego breakdown */}
          {totals && (
            <div className="mt-4 pt-4 border-t border-[#444444]">
              <h5 className="text-xs text-[#b0b0b0] mb-2 uppercase tracking-wider">Tráfego (30d)</h5>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-[#1a1a1a] rounded-lg p-2 text-center">
                  <ArrowDownRight className="w-3 h-3 text-green-400 mx-auto mb-1" />
                  <p className="text-xs text-[#b0b0b0]">Download</p>
                  <p className="text-sm text-white font-semibold">{formatBytes(totals.total_rx)}</p>
                </div>
                <div className="bg-[#1a1a1a] rounded-lg p-2 text-center">
                  <ArrowUpRight className="w-3 h-3 text-blue-400 mx-auto mb-1" />
                  <p className="text-xs text-[#b0b0b0]">Upload</p>
                  <p className="text-sm text-white font-semibold">{formatBytes(totals.total_tx)}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Config / API Key (Admin) */}
      {user?.role === 'admin' && (
        <div className="bg-[#2a2a2a] rounded-xl p-5 border border-[#444444]">
          <h4 className="text-white font-medium text-sm flex items-center gap-2 mb-3">
            <Key className="w-4 h-4 text-[#7e57c2]" />
            Alterar API Key
          </h4>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showKey ? 'text' : 'password'}
                value={apiKeyInput}
                onChange={(e) => { setApiKeyInput(e.target.value); setSaveResult(null); }}
                placeholder="Nova API key..."
                className="bg-[#1a1a1a] border-[#444444] text-white font-mono text-sm pr-10"
              />
              <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-white">
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button onClick={handleSaveKey} disabled={saving || !apiKeyInput.trim()} size="sm" className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white">
              <Save className="w-4 h-4" />
            </Button>
          </div>
          <AnimatePresence>
            {saveResult && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className={cn('text-xs mt-2', saveResult.ok ? 'text-green-400' : 'text-red-400')}>
                {saveResult.ok ? '✅' : '❌'} {saveResult.msg}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  color: 'purple' | 'green' | 'blue' | 'red' | 'yellow';
}) {
  const colors = {
    purple: 'from-[#7e57c2]/20 to-[#7e57c2]/5 border-[#7e57c2]/30',
    green: 'from-green-500/20 to-green-500/5 border-green-500/30',
    blue: 'from-blue-500/20 to-blue-500/5 border-blue-500/30',
    red: 'from-red-500/20 to-red-500/5 border-red-500/30',
    yellow: 'from-yellow-500/20 to-yellow-500/5 border-yellow-500/30',
  };
  const iconColors = {
    purple: 'text-[#7e57c2]',
    green: 'text-green-400',
    blue: 'text-blue-400',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn('bg-gradient-to-b rounded-xl p-4 border', colors[color])}
    >
      <div className={cn('mb-2', iconColors[color])}>{icon}</div>
      <p className="text-xs text-[#b0b0b0] mb-1">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-[#666] mt-1">{sub}</p>}
    </motion.div>
  );
}
