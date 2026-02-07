import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Coins,
  Package,
  Calendar,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ResourcePack {
  resource_pack_name: string;
  total_quantity: number;
  remaining_quantity: number;
  purchase_time: string;
  effective_time: string;
  invalid_time: string;
  status: 'toBeOnline' | 'online' | 'expired' | 'runOut';
}

interface AccountCostsResponse {
  success: boolean;
  data?: {
    code: number;
    data?: {
      resource_pack_subscribe_infos: ResourcePack[];
    };
  };
  error?: string;
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  online: { label: 'Ativo', color: 'text-green-400 bg-green-500/20 border-green-500/30', icon: CheckCircle2 },
  toBeOnline: { label: 'Pendente', color: 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30', icon: Clock },
  expired: { label: 'Expirado', color: 'text-red-400 bg-red-500/20 border-red-500/30', icon: XCircle },
  runOut: { label: 'Esgotado', color: 'text-orange-400 bg-orange-500/20 border-orange-500/30', icon: AlertCircle },
};

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function AccountUsage() {
  const [packs, setPacks] = useState<ResourcePack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchAccountData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/account/costs');
      const json: AccountCostsResponse = await res.json();

      if (!json.success) {
        throw new Error(json.error || 'Erro ao buscar dados');
      }

      const infos = json.data?.data?.resource_pack_subscribe_infos || [];
      setPacks(infos);
      setLastUpdated(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccountData();
  }, [fetchAccountData]);

  // Calcular totais agregados
  const totalCredits = packs.reduce((sum, p) => sum + p.total_quantity, 0);
  const remainingCredits = packs.reduce((sum, p) => sum + p.remaining_quantity, 0);
  const usedCredits = totalCredits - remainingCredits;
  const usagePercent = totalCredits > 0 ? Math.round((usedCredits / totalCredits) * 100) : 0;
  const remainingPercent = totalCredits > 0 ? Math.round((remainingCredits / totalCredits) * 100) : 0;

  if (loading) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-[#2a2a2a]/50 rounded-xl border border-[#444444] p-8 flex items-center justify-center"
      >
        <Loader2 className="w-6 h-6 text-[#7e57c2] animate-spin mr-3" />
        <span className="text-[#b0b0b0]">Carregando dados da conta Kling...</span>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-red-500/10 rounded-xl border border-red-500/30 p-6"
      >
        <div className="flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400" />
          <div>
            <p className="text-red-400 font-medium">Erro ao carregar dados da conta</p>
            <p className="text-red-400/70 text-sm mt-1">{error}</p>
          </div>
          <button
            onClick={fetchAccountData}
            className="ml-auto text-red-400 hover:text-red-300 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Coins className="w-5 h-5 text-[#7e57c2]" />
          Uso da API Kling
        </h2>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-[#b0b0b0]">
              Atualizado: {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
          <button
            onClick={fetchAccountData}
            className="p-1.5 rounded-lg hover:bg-[#444444] text-[#b0b0b0] hover:text-white transition-colors"
            title="Atualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Resumo geral dos créditos */}
      <div className="bg-gradient-to-br from-[#7e57c2]/20 to-[#7e57c2]/5 rounded-xl border border-[#7e57c2]/30 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          {/* Barra de progresso circular */}
          <div className="relative w-28 h-28 flex-shrink-0 mx-auto sm:mx-0">
            <svg className="w-28 h-28 -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="50"
                stroke="#444444"
                strokeWidth="10"
                fill="none"
              />
              <circle
                cx="60"
                cy="60"
                r="50"
                stroke="#7e57c2"
                strokeWidth="10"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${remainingPercent * 3.14} ${100 * 3.14}`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{remainingPercent}%</span>
              <span className="text-[10px] text-[#b0b0b0]">restante</span>
            </div>
          </div>

          {/* Números */}
          <div className="flex-1 grid grid-cols-3 gap-4">
            <div className="text-center sm:text-left">
              <p className="text-xs text-[#b0b0b0] mb-1">Total</p>
              <p className="text-xl font-bold text-white">{totalCredits.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-[#b0b0b0]">créditos</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-xs text-[#b0b0b0] mb-1">Utilizados</p>
              <p className="text-xl font-bold text-orange-400">{usedCredits.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-[#b0b0b0]">{usagePercent}% do total</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-xs text-[#b0b0b0] mb-1">Disponíveis</p>
              <p className="text-xl font-bold text-green-400">{remainingCredits.toLocaleString('pt-BR')}</p>
              <p className="text-xs text-[#b0b0b0]">{remainingPercent}% do total</p>
            </div>
          </div>
        </div>
      </div>

      {/* Lista de pacotes */}
      {packs.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-[#b0b0b0] flex items-center gap-2">
            <Package className="w-4 h-4" />
            Pacotes de Recursos ({packs.length})
          </h3>
          {packs.map((pack, index) => {
            const config = statusConfig[pack.status] || statusConfig.online;
            const StatusIcon = config.icon;
            const packUsed = pack.total_quantity - pack.remaining_quantity;
            const packPercent = pack.total_quantity > 0
              ? Math.round((pack.remaining_quantity / pack.total_quantity) * 100)
              : 0;

            return (
              <motion.div
                key={`${pack.resource_pack_name}-${index}`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="bg-[#2a2a2a]/50 rounded-xl border border-[#444444] p-4 hover:border-[#555555] transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Nome e status */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-white font-medium truncate">{pack.resource_pack_name}</h4>
                      <span className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border',
                        config.color
                      )}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-[#b0b0b0]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(pack.effective_time)} — {formatDate(pack.invalid_time)}
                      </span>
                    </div>
                  </div>

                  {/* Créditos do pacote */}
                  <div className="flex items-center gap-4 sm:text-right">
                    <div>
                      <p className="text-sm text-[#b0b0b0]">
                        <span className="text-white font-medium">{pack.remaining_quantity.toLocaleString('pt-BR')}</span>
                        {' / '}
                        {pack.total_quantity.toLocaleString('pt-BR')}
                      </p>
                      <p className="text-xs text-[#b0b0b0]">
                        {packUsed.toLocaleString('pt-BR')} usados
                      </p>
                    </div>
                    {/* Mini barra de progresso */}
                    <div className="w-16 h-16 flex-shrink-0">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                        <circle cx="32" cy="32" r="26" stroke="#444444" strokeWidth="5" fill="none" />
                        <circle
                          cx="32" cy="32" r="26"
                          stroke={packPercent > 20 ? '#7e57c2' : packPercent > 0 ? '#f59e0b' : '#ef4444'}
                          strokeWidth="5"
                          fill="none"
                          strokeLinecap="round"
                          strokeDasharray={`${packPercent * 1.634} ${100 * 1.634}`}
                        />
                      </svg>
                      <div className="relative -mt-[52px] flex items-center justify-center h-[52px]">
                        <span className="text-xs font-bold text-white">{packPercent}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {packs.length === 0 && (
        <div className="text-center py-8 bg-[#2a2a2a]/50 rounded-xl border border-dashed border-[#444444]">
          <Package className="w-8 h-8 text-[#b0b0b0] mx-auto mb-2" />
          <p className="text-[#b0b0b0] text-sm">Nenhum pacote de recursos encontrado</p>
        </div>
      )}
    </motion.div>
  );
}
