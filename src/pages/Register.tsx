import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Sparkles, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export function Register() {
  const navigate = useNavigate();
  const { register } = useAuth();
  const { addToast } = useToast();
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const passwordStrength = (password: string): number => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const strengthLabels = ['Muito fraca', 'Fraca', 'Média', 'Forte', 'Muito forte'];
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-500', 'bg-green-600'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
      addToast({
        type: 'error',
        title: 'Campos obrigatórios',
        message: 'Preencha todos os campos',
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      addToast({
        type: 'error',
        title: 'Senhas não coincidem',
        message: 'Verifique se as senhas são iguais',
      });
      return;
    }

    if (!formData.acceptTerms) {
      addToast({
        type: 'error',
        title: 'Termos de uso',
        message: 'Aceite os termos de uso para continuar',
      });
      return;
    }

    setIsLoading(true);
    
    try {
      await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        acceptTerms: formData.acceptTerms,
      });
      
      addToast({
        type: 'success',
        title: 'Conta criada!',
        message: 'Aguarde a aprovação de um administrador para acessar a plataforma.',
        duration: 8000,
      });
      
      navigate('/pending');
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Erro no cadastro',
        message: error?.message || 'Tente novamente mais tarde',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const strength = passwordStrength(formData.password);

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <motion.div
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-1/4 -right-1/4 w-[600px] h-[600px] rounded-full bg-[#7e57c2]/30 blur-[120px]"
        />
        <motion.div
          animate={{
            scale: [1.2, 1, 1.2],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -bottom-1/4 -left-1/4 w-[500px] h-[500px] rounded-full bg-[#6a42b0]/30 blur-[100px]"
        />
        <div className="absolute inset-0 opacity-20">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #7e57c2 1px, transparent 0)`,
            backgroundSize: '40px 40px',
          }} />
        </div>
      </div>

      {/* Form Card */}
      <motion.div
        initial={{ opacity: 0, rotateY: 30, x: 50 }}
        animate={{ opacity: 1, rotateY: 0, x: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{ perspective: 1000 }}
        className="relative w-full max-w-md"
      >
        <motion.div
          whileHover={{ rotateX: 2, rotateY: -2 }}
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
            <h1 className="text-2xl font-bold text-white mb-2">Comece sua jornada</h1>
            <p className="text-[#b0b0b0]">Crie vídeos incríveis com IA</p>
          </motion.div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Label htmlFor="name" className="text-white mb-2 block">Nome</Label>
              <div className="relative">
                <User className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors',
                  focusedField === 'name' ? 'text-[#7e57c2]' : 'text-[#b0b0b0]'
                )} />
                <Input
                  id="name"
                  type="text"
                  placeholder="Seu nome completo"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  className={cn(
                    'pl-10 bg-[#1a1a1a] border-[#444444] text-white placeholder:text-[#666]',
                    'focus:border-[#7e57c2] focus:ring-[#7e57c2]/20',
                    focusedField === 'name' && 'border-[#7e57c2] shadow-[0_0_0_3px_rgba(126,87,194,0.2)]'
                  )}
                />
              </div>
            </motion.div>

            {/* Email */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
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
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 }}
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
              
              {/* Password Strength */}
              {formData.password && (
                <div className="mt-2">
                  <div className="flex gap-1 h-1">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          'flex-1 rounded-full transition-colors',
                          i < strength ? strengthColors[strength - 1] : 'bg-[#444444]'
                        )}
                      />
                    ))}
                  </div>
                  <p className={cn('text-xs mt-1', strengthColors[strength - 1]?.replace('bg-', 'text-'))}>
                    {strengthLabels[strength - 1]}
                  </p>
                </div>
              )}
            </motion.div>

            {/* Confirm Password */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.7 }}
            >
              <Label htmlFor="confirmPassword" className="text-white mb-2 block">Confirmar senha</Label>
              <div className="relative">
                <Lock className={cn(
                  'absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 transition-colors',
                  focusedField === 'confirmPassword' ? 'text-[#7e57c2]' : 'text-[#b0b0b0]'
                )} />
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  onFocus={() => setFocusedField('confirmPassword')}
                  onBlur={() => setFocusedField(null)}
                  className={cn(
                    'pl-10 pr-10 bg-[#1a1a1a] border-[#444444] text-white placeholder:text-[#666]',
                    'focus:border-[#7e57c2] focus:ring-[#7e57c2]/20',
                    focusedField === 'confirmPassword' && 'border-[#7e57c2] shadow-[0_0_0_3px_rgba(126,87,194,0.2)]'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#b0b0b0] hover:text-white transition-colors"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </motion.div>

            {/* Terms */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="flex items-start gap-2"
            >
              <Checkbox
                id="terms"
                checked={formData.acceptTerms}
                onCheckedChange={(checked) => setFormData({ ...formData, acceptTerms: checked as boolean })}
                className="border-[#444444] data-[state=checked]:bg-[#7e57c2] data-[state=checked]:border-[#7e57c2] mt-0.5"
              />
              <Label htmlFor="terms" className="text-sm text-[#b0b0b0] cursor-pointer leading-relaxed">
                Aceito os{' '}
                <Link to="/terms" className="text-[#7e57c2] hover:text-[#6a42b0]">termos de uso</Link>
                {' '}e{' '}
                <Link to="/privacy" className="text-[#7e57c2] hover:text-[#6a42b0]">política de privacidade</Link>
              </Label>
            </motion.div>

            {/* Submit Button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9 }}
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
                    Criar conta
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
            transition={{ delay: 1 }}
            className="flex items-center gap-4 my-6"
          >
            <div className="flex-1 h-px bg-[#444444]" />
            <span className="text-sm text-[#b0b0b0]">ou</span>
            <div className="flex-1 h-px bg-[#444444]" />
          </motion.div>

          {/* Login Link */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="text-center"
          >
            <p className="text-[#b0b0b0]">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-[#7e57c2] hover:text-[#6a42b0] font-medium transition-colors">
                Entrar
              </Link>
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
}
