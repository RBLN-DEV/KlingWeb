import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Sparkles, Mail, Lock, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const { addToast } = useToast();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      addToast({
        type: 'error',
        title: 'Campos obrigatórios',
        message: 'Preencha todos os campos',
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const result = await login({
        email: formData.email,
        password: formData.password,
        rememberMe: formData.rememberMe,
      });
      
      if (result.status === 'pending') {
        navigate('/pending');
        return;
      }

      if (result.status === 'rejected') {
        addToast({
          type: 'error',
          title: 'Conta rejeitada',
          message: 'Sua conta foi rejeitada pelo administrador. Entre em contato para mais informações.',
        });
        return;
      }
      
      addToast({
        type: 'success',
        title: 'Bem-vindo!',
        message: 'Login realizado com sucesso',
      });
      
      navigate('/dashboard');
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Erro no login',
        message: error?.message || 'Verifique suas credenciais',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-1/4 -left-1/4 w-[600px] h-[600px] rounded-full bg-[#7e57c2]/30 blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-1/4 -right-1/4 w-[500px] h-[500px] rounded-full bg-[#6a42b0]/30 blur-[100px]"
        />
        
        {/* Particle grid */}
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #7e57c2 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }} />
        </div>
      </div>

      {/* Form Card */}
      <motion.div
        initial={{ opacity: 0, rotateY: -30, x: -50 }}
        animate={{ opacity: 1, rotateY: 0, x: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ perspective: 1000 }}
        className="relative w-full max-w-md"
      >
        <motion.div
          whileHover={{ rotateX: 2, rotateY: 2 }}
          transition={{ duration: 0.3 }}
          className="bg-[#2a2a2a]/80 backdrop-blur-xl rounded-2xl border border-[#444444] p-8 shadow-2xl"
        >
          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex justify-center mb-8"
          >
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#7e57c2] to-[#6a42b0] flex items-center justify-center shadow-lg shadow-[#7e57c2]/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center mb-8"
          >
            <h1 className="text-2xl font-bold text-white mb-2">Bem-vindo de volta</h1>
            <p className="text-[#b0b0b0]">Entre para continuar criando</p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Label htmlFor="email" className="text-white mb-2 block">Email</Label>
              <div className="relative">
                <Mail className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors',
                  focusedField === 'email' ? 'text-[#7e57c2]' : 'text-[#b0b0b0]'
                )} />
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  className={cn(
                    'pl-10 bg-[#1a1a1a] border-[#444444] text-white placeholder:text-[#666]',
                    'focus:border-[#7e57c2] focus:ring-[#7e57c2]/20',
                    focusedField === 'email' && 'border-[#7e57c2] shadow-[0_0_0_3px_rgba(126,87,194,0.2)]'
                  )}
                />
              </div>
            </motion.div>

            {/* Password */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Label htmlFor="password" className="text-white mb-2 block">Senha</Label>
              <div className="relative">
                <Lock className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors',
                  focusedField === 'password' ? 'text-[#7e57c2]' : 'text-[#b0b0b0]'
                )} />
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  className={cn(
                    'pl-10 pr-10 bg-[#1a1a1a] border-[#444444] text-white placeholder:text-[#666]',
                    'focus:border-[#7e57c2] focus:ring-[#7e57c2]/20',
                    focusedField === 'password' && 'border-[#7e57c2] shadow-[0_0_0_3px_rgba(126,87,194,0.2)]'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0b0b0] hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>

            {/* Remember Me & Forgot Password */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2">
                <Checkbox
                  id="remember"
                  checked={formData.rememberMe}
                  onCheckedChange={(checked) => setFormData({ ...formData, rememberMe: checked as boolean })}
                  className="border-[#444444] data-[state=checked]:bg-[#7e57c2] data-[state=checked]:border-[#7e57c2]"
                />
                <Label htmlFor="remember" className="text-sm text-[#b0b0b0] cursor-pointer">
                  Lembrar-me
                </Label>
              </div>
              <Link to="/forgot-password" className="text-sm text-[#7e57c2] hover:text-[#6a42b0] transition-colors">
                Esqueceu a senha?
              </Link>
            </motion.div>

            {/* Submit Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
            >
              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-[#7e57c2] hover:bg-[#6a42b0] text-white h-12 font-medium"
              >
                {isLoading ? (
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                  />
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </motion.div>
          </form>

          {/* Divider */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-4 my-6"
          >
            <div className="flex-1 h-px bg-[#444444]" />
            <span className="text-sm text-[#b0b0b0]">ou</span>
            <div className="flex-1 h-px bg-[#444444]" />
          </motion.div>

          {/* Register Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.9 }}
            className="text-center"
          >
            <p className="text-[#b0b0b0]">
              Não tem uma conta?{' '}
              <Link to="/register" className="text-[#7e57c2] hover:text-[#6a42b0] font-medium transition-colors">
                Criar conta
              </Link>
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
