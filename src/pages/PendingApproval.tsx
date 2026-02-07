import { motion } from 'framer-motion';
import { Clock, LogOut, RefreshCw, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function PendingApproval() {
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [checking, setChecking] = useState(false);

  const handleCheckStatus = async () => {
    if (!token) {
      navigate('/login');
      return;
    }

    setChecking(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (data.success) {
        const updatedUser = data.data;
        if (updatedUser.status === 'approved') {
          // Update stored user and redirect
          localStorage.setItem('klingai_user', JSON.stringify(updatedUser));
          addToast({ type: 'success', title: 'Conta aprovada!', message: 'Bem-vindo ao KlingAI Studio!' });
          // Force page reload to re-init auth state
          window.location.href = '/dashboard';
        } else if (updatedUser.status === 'rejected') {
          addToast({ type: 'error', title: 'Conta rejeitada', message: 'Sua conta foi rejeitada pelo administrador.' });
          logout();
          navigate('/login');
        } else {
          addToast({ type: 'info', title: 'Ainda pendente', message: 'Sua conta ainda está aguardando aprovação.' });
        }
      }
    } catch {
      addToast({ type: 'error', title: 'Erro de conexão' });
    } finally {
      setChecking(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0.3, 0.2] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 left-1/4 w-[500px] h-[500px] rounded-full bg-[#7e57c2]/20 blur-[120px]"
        />
        <motion.div
          animate={{ scale: [1.2, 1, 1.2], opacity: [0.15, 0.25, 0.15] }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] rounded-full bg-yellow-500/10 blur-[100px]"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md"
      >
        <div className="bg-[#2a2a2a]/80 backdrop-blur-xl rounded-2xl border border-[#444444] p-8 shadow-2xl text-center">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7e57c2] to-[#6a42b0] flex items-center justify-center shadow-lg shadow-[#7e57c2]/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Clock animation */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 mx-auto mb-6 rounded-full bg-yellow-500/10 border-2 border-yellow-500/30 flex items-center justify-center"
          >
            <Clock className="w-10 h-10 text-yellow-500" />
          </motion.div>

          <h1 className="text-2xl font-bold text-white mb-3">Aguardando Aprovação</h1>
          
          <p className="text-[#b0b0b0] mb-2">
            Olá{user?.name ? `, ${user.name}` : ''}! Sua conta foi criada com sucesso.
          </p>
          
          <p className="text-[#b0b0b0] mb-6 text-sm">
            Um administrador precisa aprovar sua conta antes de você acessar a plataforma.
            Você receberá acesso assim que for aprovado.
          </p>

          <div className="bg-[#1a1a1a] rounded-xl p-4 mb-6 border border-[#444444]">
            <div className="flex items-center justify-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
              <span className="text-yellow-500 text-sm font-medium">Status: Pendente</span>
            </div>
            {user?.email && (
              <p className="text-xs text-[#b0b0b0]">
                Conta: {user.email}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Button
              onClick={handleCheckStatus}
              disabled={checking}
              className="w-full bg-[#7e57c2] hover:bg-[#6a42b0] text-white"
            >
              {checking ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full mr-2"
                />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              Verificar Status
            </Button>
            
            <Button
              onClick={handleLogout}
              variant="outline"
              className="w-full border-[#444444] text-[#b0b0b0] hover:text-white hover:bg-[#2a2a2a]"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sair
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
