import { motion, AnimatePresence } from 'framer-motion';
import { Instagram, Twitter, Link2, Unlink, RefreshCw, Check, AlertCircle, Eye, EyeOff, Loader2, LogIn, Mail, User, Lock, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SocialConnection, SocialProvider, UnofficialLoginCredentials, UnofficialLoginResult } from '@/types/social';
import { useState } from 'react';

const PROVIDER_CONFIG = {
  instagram: {
    name: 'Instagram',
    icon: Instagram,
    color: '#E4405F',
    bgGradient: 'from-[#E4405F]/20 to-[#C13584]/20',
    borderColor: 'border-[#E4405F]/30',
    hoverBorder: 'hover:border-[#E4405F]/60',
    description: 'Conecte seu Instagram para publicar fotos, vídeos, reels e stories diretamente da plataforma.',
    connectedTip: 'Sua conta está pronta! Vá na Galeria e clique no ícone do Instagram em qualquer mídia para publicar.',
    needsEmail: false,
  },
  twitter: {
    name: 'Twitter / X',
    icon: Twitter,
    color: '#1DA1F2',
    bgGradient: 'from-[#1DA1F2]/20 to-[#0d8bd9]/20',
    borderColor: 'border-[#1DA1F2]/30',
    hoverBorder: 'hover:border-[#1DA1F2]/60',
    description: 'Conecte seu Twitter/X para publicar tweets com imagens e vídeos gerados aqui.',
    connectedTip: 'Sua conta está pronta para publicações.',
    needsEmail: true,
  },
};

interface ConnectAccountCardProps {
  provider: SocialProvider;
  connection: SocialConnection | undefined;
  onConnectUnofficial: (provider: SocialProvider, credentials: UnofficialLoginCredentials) => Promise<UnofficialLoginResult>;
  onDisconnect: (connectionId: string) => void;
  onRefresh: (connectionId: string) => void;
  isConnecting?: boolean;
  delay?: number;
}

export function ConnectAccountCard({
  provider,
  connection,
  onConnectUnofficial,
  onDisconnect,
  onRefresh,
  isConnecting = false,
  delay = 0,
}: ConnectAccountCardProps) {
  const config = PROVIDER_CONFIG[provider];
  const Icon = config.icon;
  const isConnected = !!connection?.isActive;
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginWarning, setLoginWarning] = useState<string | null>(null);

  // Form fields
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');

  const handleDisconnect = async () => {
    if (!connection) return;
    setIsDisconnecting(true);
    await onDisconnect(connection.id);
    setIsDisconnecting(false);
  };

  const handleRefresh = async () => {
    if (!connection) return;
    setIsRefreshing(true);
    await onRefresh(connection.id);
    setIsRefreshing(false);
  };

  const handleLogin = async () => {
    setLoginError(null);
    setLoginWarning(null);

    if (!username.trim() || !password.trim()) {
      setLoginError('Preencha todos os campos obrigatórios');
      return;
    }

    if (provider === 'twitter' && !email.trim()) {
      setLoginError('O email é obrigatório para o Twitter');
      return;
    }

    const credentials: UnofficialLoginCredentials = {
      username: username.trim(),
      password: password.trim(),
      ...(email.trim() ? { email: email.trim() } : {}),
    };

    const result = await onConnectUnofficial(provider, credentials);

    if (result.success) {
      setShowLoginForm(false);
      setUsername('');
      setPassword('');
      setEmail('');
    } else {
      if (result.requiresTwoFactor) {
        setLoginWarning('Autenticação de dois fatores detectada. Desative temporariamente o 2FA na sua conta e tente novamente.');
      } else if (result.requiresChallenge) {
        setLoginWarning('Verificação de segurança necessária. Abra o app oficial, confirme a verificação e tente novamente.');
      }
      setLoginError(result.error || 'Erro ao conectar');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn(
        'relative rounded-xl border p-6 bg-gradient-to-br transition-all duration-300',
        config.bgGradient,
        config.borderColor,
        config.hoverBorder,
        isConnected && 'ring-1 ring-green-500/30'
      )}
    >
      {/* Status badge */}
      {isConnected && (
        <div className="absolute top-3 right-3 flex items-center gap-1.5 px-2 py-1 bg-green-500/20 border border-green-500/30 rounded-full">
          <Check className="w-3 h-3 text-green-400" />
          <span className="text-[10px] font-medium text-green-400">Conectado</span>
        </div>
      )}

      {/* Provider Icon + Info */}
      <div className="flex items-start gap-4 mb-4">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: `${config.color}20` }}
        >
          <Icon className="w-6 h-6" style={{ color: config.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-lg">{config.name}</h3>
          {isConnected && connection ? (
            <div>
              <p className="text-sm text-[#b0b0b0] truncate">@{connection.accountName}</p>
              <p className="text-[11px] text-green-400/70 mt-0.5">{config.connectedTip}</p>
              {connection.authMode === 'unofficial' && (
                <div className="flex items-center gap-1 mt-1">
                  <ShieldAlert className="w-3 h-3 text-amber-400" />
                  <span className="text-[11px] text-amber-400">Modo direto (suas credenciais são criptografadas)</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[#b0b0b0]">{config.description}</p>
          )}
        </div>
      </div>

      {/* Login Form */}
      <AnimatePresence>
        {showLoginForm && !isConnected && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mb-4 space-y-3 overflow-hidden"
          >
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <p className="text-[11px] text-blue-300 leading-relaxed">
                <ShieldAlert className="w-3 h-3 inline mr-1 mb-0.5" />
                <strong>Seus dados estão seguros:</strong> suas credenciais são criptografadas e armazenadas apenas no nosso servidor. 
                Elas são usadas exclusivamente para publicar conteúdo no seu perfil.
              </p>
            </div>

            {/* Username */}
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
              <input
                type="text"
                placeholder="Nome de usuário"
                value={username}
                onChange={e => setUsername(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#555] transition-colors"
              />
            </div>

            {/* Email (Twitter) */}
            {config.needsEmail && (
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
                <input
                  type="email"
                  placeholder="Email da conta"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#555] transition-colors"
                />
              </div>
            )}

            {/* Password */}
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666]" />
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="Senha"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                className="w-full pl-10 pr-10 py-2.5 bg-[#1a1a1a] border border-[#333] rounded-lg text-sm text-white placeholder:text-[#666] focus:outline-none focus:border-[#555] transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#666] hover:text-[#999] transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Login Warning */}
            {loginWarning && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                <p className="text-[11px] text-amber-300 leading-relaxed">{loginWarning}</p>
              </div>
            )}

            {/* Login Error */}
            {loginError && (
              <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-red-300 leading-relaxed">{loginError}</p>
              </div>
            )}

            {/* Login Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleLogin}
                disabled={isConnecting}
                className="flex-1 text-white"
                style={{ backgroundColor: config.color }}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Conectando...
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 mr-2" />
                    Entrar
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowLoginForm(false);
                  setLoginError(null);
                  setLoginWarning(null);
                }}
                className="border-[#444] text-[#b0b0b0] hover:text-white hover:bg-[#2a2a2a]"
              >
                Cancelar
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex gap-2">
        {isConnected ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="border-[#444444] text-[#b0b0b0] hover:text-white hover:bg-[#2a2a2a] flex-1"
            >
              <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', isRefreshing && 'animate-spin')} />
              Renovar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
            >
              <Unlink className="w-3.5 h-3.5 mr-1.5" />
              Desconectar
            </Button>
          </>
        ) : !showLoginForm ? (
          <Button
            onClick={() => setShowLoginForm(true)}
            className="w-full text-white"
            style={{ backgroundColor: config.color }}
          >
            <Link2 className="w-4 h-4 mr-2" />
            Conectar {config.name}
          </Button>
        ) : null}
      </div>
    </motion.div>
  );
}
