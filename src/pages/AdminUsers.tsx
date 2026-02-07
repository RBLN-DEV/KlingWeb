import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  MoreHorizontal,
  RefreshCw,
  UserCog,
  Mail,
  Calendar,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface UserData {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
  updatedAt: string;
  approvedBy?: string;
  rejectedReason?: string;
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function AdminUsers() {
  const { token } = useAuth();
  const { addToast } = useToast();

  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'user' as const });
  const [creating, setCreating] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
  };

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/admin/users`, { headers });
      const data = await res.json();
      if (data.success) {
        setUsers(data.data);
      } else {
        addToast({ type: 'error', title: 'Erro ao carregar usuários', message: data.error });
      }
    } catch {
      addToast({ type: 'error', title: 'Erro de conexão' });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleApprove = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'approved' }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'approved' } : u));
        addToast({ type: 'success', title: 'Usuário aprovado' });
      } else {
        addToast({ type: 'error', title: 'Erro', message: data.error });
      }
    } catch {
      addToast({ type: 'error', title: 'Erro de conexão' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId: string) => {
    setActionLoading(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/status`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status: 'rejected' }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, status: 'rejected' } : u));
        addToast({ type: 'success', title: 'Usuário rejeitado' });
      } else {
        addToast({ type: 'error', title: 'Erro', message: data.error });
      }
    } catch {
      addToast({ type: 'error', title: 'Erro de conexão' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    setActionLoading(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}/role`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole as any } : u));
        addToast({ type: 'success', title: `Usuário agora é ${newRole === 'admin' ? 'Administrador' : 'Usuário'}` });
      }
    } catch {
      addToast({ type: 'error', title: 'Erro de conexão' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Tem certeza que deseja remover este usuário?')) return;
    setActionLoading(userId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers,
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.filter(u => u.id !== userId));
        addToast({ type: 'success', title: 'Usuário removido' });
      } else {
        addToast({ type: 'error', title: 'Erro', message: data.error });
      }
    } catch {
      addToast({ type: 'error', title: 'Erro de conexão' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) {
      addToast({ type: 'error', title: 'Preencha todos os campos' });
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(newUser),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => [data.data, ...prev]);
        setNewUser({ name: '', email: '', password: '', role: 'user' });
        setShowCreateForm(false);
        addToast({ type: 'success', title: 'Usuário criado com sucesso' });
      } else {
        addToast({ type: 'error', title: 'Erro', message: data.error });
      }
    } catch {
      addToast({ type: 'error', title: 'Erro de conexão' });
    } finally {
      setCreating(false);
    }
  };

  // Filtros
  const filtered = users.filter(u => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      if (!u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
    }
    if (statusFilter !== 'all' && u.status !== statusFilter) return false;
    return true;
  });

  const statusCounts = {
    all: users.length,
    pending: users.filter(u => u.status === 'pending').length,
    approved: users.filter(u => u.status === 'approved').length,
    rejected: users.filter(u => u.status === 'rejected').length,
  };

  const formatDate = (d: string) => {
    try {
      return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7e57c2] to-[#ff6e40] flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">Gerenciar Usuários</h1>
              <p className="text-[#b0b0b0] mt-0.5">Aprovar, rejeitar e gerenciar contas</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={fetchUsers}
              variant="outline"
              className="border-[#444444] text-[#b0b0b0] hover:text-white hover:bg-[#2a2a2a]"
            >
              <RefreshCw className={cn('w-4 h-4 mr-2', loading && 'animate-spin')} />
              Atualizar
            </Button>
            <Button
              onClick={() => setShowCreateForm(true)}
              className="bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Pending Alert */}
      {statusCounts.pending > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl flex items-center gap-3"
        >
          <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0" />
          <p className="text-yellow-200 text-sm">
            <strong>{statusCounts.pending}</strong> usuário(s) aguardando aprovação
          </p>
          <Button
            onClick={() => setStatusFilter('pending')}
            size="sm"
            className="ml-auto bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border border-yellow-500/30"
          >
            Ver pendentes
          </Button>
        </motion.div>
      )}

      {/* Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-[#2a2a2a] rounded-xl p-4 border border-[#444444] mb-6"
      >
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#666]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por nome ou email..."
              className="pl-10 bg-[#1a1a1a] border-[#444444] text-white"
            />
          </div>

          <div className="flex gap-2 overflow-x-auto pb-2 lg:pb-0">
            {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map((status) => (
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
                {status === 'pending' && `Pendentes (${statusCounts.pending})`}
                {status === 'approved' && `Aprovados (${statusCounts.approved})`}
                {status === 'rejected' && `Rejeitados (${statusCounts.rejected})`}
              </button>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Users List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="w-8 h-8 border-3 border-[#444444] border-t-[#7e57c2] rounded-full"
          />
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((user, index) => (
            <UserRow
              key={user.id}
              user={user}
              index={index}
              isLoading={actionLoading === user.id}
              onApprove={handleApprove}
              onReject={handleReject}
              onToggleRole={handleToggleRole}
              onDelete={handleDelete}
              formatDate={formatDate}
            />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16 bg-[#2a2a2a]/50 rounded-xl border border-dashed border-[#444444]"
        >
          <Users className="w-12 h-12 text-[#666] mx-auto mb-4" />
          <h3 className="text-white font-medium mb-2">Nenhum usuário encontrado</h3>
          <p className="text-[#b0b0b0]">Ajuste os filtros ou adicione um novo usuário</p>
        </motion.div>
      )}

      {/* Create User Modal */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setShowCreateForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#2a2a2a] rounded-2xl border border-[#444444] p-6 shadow-2xl"
            >
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#7e57c2]" />
                Adicionar Usuário
              </h2>

              <form onSubmit={handleCreateUser} className="space-y-4">
                <div>
                  <Label className="text-white mb-1.5 block">Nome</Label>
                  <Input
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="Nome completo"
                    className="bg-[#1a1a1a] border-[#444444] text-white"
                  />
                </div>
                <div>
                  <Label className="text-white mb-1.5 block">Email</Label>
                  <Input
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="email@exemplo.com"
                    className="bg-[#1a1a1a] border-[#444444] text-white"
                  />
                </div>
                <div>
                  <Label className="text-white mb-1.5 block">Senha</Label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    className="bg-[#1a1a1a] border-[#444444] text-white"
                  />
                </div>
                <div>
                  <Label className="text-white mb-1.5 block">Função</Label>
                  <Select value={newUser.role} onValueChange={(v) => setNewUser({ ...newUser, role: v as any })}>
                    <SelectTrigger className="bg-[#1a1a1a] border-[#444444] text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#2a2a2a] border-[#444444]">
                      <SelectItem value="user" className="text-white">Usuário</SelectItem>
                      <SelectItem value="admin" className="text-white">Administrador</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowCreateForm(false)}
                    className="flex-1 border-[#444444] text-[#b0b0b0] hover:bg-[#1a1a1a]"
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    disabled={creating}
                    className="flex-1 bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
                  >
                    {creating ? 'Criando...' : 'Criar Usuário'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ───── User Row ─────
function UserRow({
  user,
  index,
  isLoading,
  onApprove,
  onReject,
  onToggleRole,
  onDelete,
  formatDate,
}: {
  user: UserData;
  index: number;
  isLoading: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onToggleRole: (id: string, currentRole: string) => void;
  onDelete: (id: string) => void;
  formatDate: (d: string) => string;
}) {
  const statusConfig = {
    pending: { icon: Clock, color: 'text-yellow-500', bg: 'bg-yellow-500/20', label: 'Pendente' },
    approved: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/20', label: 'Aprovado' },
    rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/20', label: 'Rejeitado' },
  };

  const StatusIcon = statusConfig[user.status].icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className={cn(
        'flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-[#2a2a2a] rounded-xl border transition-colors',
        user.status === 'pending' ? 'border-yellow-500/30' : 'border-[#444444]',
        isLoading && 'opacity-60 pointer-events-none'
      )}
    >
      {/* Avatar + Info */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
          user.role === 'admin'
            ? 'bg-gradient-to-br from-[#ff6e40] to-[#ff3d00]'
            : 'bg-gradient-to-br from-[#7e57c2] to-[#6a42b0]'
        )}>
          {user.role === 'admin' ? (
            <Shield className="w-5 h-5 text-white" />
          ) : (
            <span className="text-sm font-bold text-white">{user.name.charAt(0).toUpperCase()}</span>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-white font-medium truncate">{user.name}</p>
            {user.role === 'admin' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#ff6e40]/20 text-[#ff6e40] font-semibold uppercase">
                Admin
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-[#b0b0b0] flex items-center gap-1">
              <Mail className="w-3 h-3" /> {user.email}
            </span>
            <span className="text-xs text-[#b0b0b0] flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {formatDate(user.createdAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2 sm:gap-3">
        <span className={cn(
          'px-2.5 py-1 rounded-full text-xs flex items-center gap-1 font-medium',
          statusConfig[user.status].bg
        )}>
          <StatusIcon className={cn('w-3 h-3', statusConfig[user.status].color)} />
          <span className={statusConfig[user.status].color}>
            {statusConfig[user.status].label}
          </span>
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {user.status === 'pending' && (
            <>
              <Button
                size="sm"
                onClick={() => onApprove(user.id)}
                className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs"
              >
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                Aprovar
              </Button>
              <Button
                size="sm"
                onClick={() => onReject(user.id)}
                variant="outline"
                className="border-red-500/50 text-red-400 hover:bg-red-500/20 h-8 px-3 text-xs"
              >
                <XCircle className="w-3.5 h-3.5 mr-1" />
                Rejeitar
              </Button>
            </>
          )}
          {user.status === 'rejected' && (
            <Button
              size="sm"
              onClick={() => onApprove(user.id)}
              className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs"
            >
              <CheckCircle className="w-3.5 h-3.5 mr-1" />
              Aprovar
            </Button>
          )}
          <button
            onClick={() => onToggleRole(user.id, user.role)}
            className="p-1.5 hover:bg-[#444444] rounded-lg transition-colors"
            title={user.role === 'admin' ? 'Tornar Usuário' : 'Tornar Admin'}
          >
            <UserCog className="w-4 h-4 text-[#b0b0b0]" />
          </button>
          <button
            onClick={() => onDelete(user.id)}
            className="p-1.5 hover:bg-red-500/20 rounded-lg transition-colors"
            title="Remover"
          >
            <Trash2 className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
