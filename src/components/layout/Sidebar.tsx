import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  Image,
  Video,
  FolderOpen,
  Palette,
  FileText,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ShieldCheck,
  Share2,
  BarChart3,
  Bot,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

const navItems = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { id: 'image', label: 'Gerar Imagem', icon: Image, path: '/image' },
  { id: 'video', label: 'Gerar Vídeo', icon: Video, path: '/video' },
  { id: 'gallery', label: 'Meus Vídeos', icon: FolderOpen, path: '/gallery' },
  { id: 'image-gallery', label: 'Minhas Imagens', icon: Palette, path: '/image-gallery' },
  { id: 'social-hub', label: 'Social Hub', icon: Share2, path: '/social-hub' },
  { id: 'social-dashboard', label: 'Social Métricas', icon: BarChart3, path: '/social-dashboard' },
  { id: 'bot', label: 'Instagram Bot', icon: Bot, path: '/bot' },
  { id: 'prompts', label: 'Prompts', icon: FileText, path: '/prompts' },
  { id: 'settings', label: 'Configurações', icon: Settings, path: '/settings' },
];

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
  };

  // Fechar sidebar mobile ao mudar de rota
  // (NavLink onClick já faz isso, mas garantir)

  return (
    <>
      {/* Mobile Overlay */}
      <AnimatePresence>
        {isMobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-40 lg:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Mobile Toggle - botão fixo no topo */}
      <button
        onClick={() => setIsMobileOpen(!isMobileOpen)}
        className="fixed top-3 left-3 z-50 lg:hidden p-2.5 bg-[#2a2a2a] rounded-lg border border-[#444444] shadow-lg active:scale-95 transition-transform"
        aria-label="Menu"
      >
        {isMobileOpen ? (
          <ChevronLeft className="w-5 h-5 text-[#7e57c2]" />
        ) : (
          <Sparkles className="w-5 h-5 text-[#7e57c2]" />
        )}
      </button>

      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{
          width: isCollapsed ? 80 : 250,
        }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'fixed left-0 top-0 h-full h-[100dvh] bg-[#1a1a1a] border-r border-[#444444] z-50',
          'flex flex-col',
          // Mobile: escondido por padrão, aparece quando isMobileOpen
          isMobileOpen ? 'translate-x-0' : '-translate-x-full',
          // Desktop: sempre visível
          'lg:translate-x-0 lg:static',
          // Transição suave
          'transition-transform duration-300 lg:transition-none'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-[#444444]">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7e57c2] to-[#6a42b0] flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <AnimatePresence mode="wait">
              {!isCollapsed && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="font-semibold text-white whitespace-nowrap"
                >
                  KlingAI Studio
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <NavLink
                key={item.id}
                to={item.path}
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                  'hover:bg-[#2a2a2a] group relative',
                  isActive && 'bg-[#7e57c2]/20 text-[#7e57c2]'
                )}
              >
                <Icon className={cn(
                  'w-5 h-5 flex-shrink-0',
                  isActive ? 'text-[#7e57c2]' : 'text-[#b0b0b0] group-hover:text-white'
                )} />

                <AnimatePresence mode="wait">
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={cn(
                        'text-sm whitespace-nowrap',
                        isActive ? 'text-[#7e57c2] font-medium' : 'text-[#b0b0b0] group-hover:text-white'
                      )}
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {/* Active indicator */}
                {isActive && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#7e57c2] rounded-r-full"
                  />
                )}

                {/* Tooltip for collapsed state */}
                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-[#2a2a2a] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                    {item.label}
                  </div>
                )}
              </NavLink>
            );
          })}

          {/* Admin Link - only for admin users */}
          {user?.role === 'admin' && (
            <>
              <div className="h-px bg-[#444444] my-2 mx-2" />
              <NavLink
                to="/admin"
                onClick={() => setIsMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                  'hover:bg-[#2a2a2a] group relative',
                  location.pathname === '/admin' && 'bg-[#ff6e40]/20 text-[#ff6e40]'
                )}
              >
                <ShieldCheck className={cn(
                  'w-5 h-5 flex-shrink-0',
                  location.pathname === '/admin' ? 'text-[#ff6e40]' : 'text-[#b0b0b0] group-hover:text-white'
                )} />

                <AnimatePresence mode="wait">
                  {!isCollapsed && (
                    <motion.span
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className={cn(
                        'text-sm whitespace-nowrap',
                        location.pathname === '/admin' ? 'text-[#ff6e40] font-medium' : 'text-[#b0b0b0] group-hover:text-white'
                      )}
                    >
                      Administração
                    </motion.span>
                  )}
                </AnimatePresence>

                {location.pathname === '/admin' && (
                  <motion.div
                    layoutId="activeIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-[#ff6e40] rounded-r-full"
                  />
                )}

                {isCollapsed && (
                  <div className="absolute left-full ml-2 px-2 py-1 bg-[#2a2a2a] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50">
                    Administração
                  </div>
                )}
              </NavLink>
            </>
          )}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-[#444444]">
          <div className={cn(
            'flex items-center gap-3',
            isCollapsed && 'justify-center'
          )}>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#7e57c2] to-[#6a42b0] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-medium text-white">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>

            <AnimatePresence mode="wait">
              {!isCollapsed && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex-1 min-w-0"
                >
                  <p className="text-sm font-medium text-white truncate">
                    {user?.name || 'Usuário'}
                  </p>
                  <p className="text-xs text-[#b0b0b0] truncate">
                    {user?.email || ''}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {!isCollapsed && (
              <button
                onClick={handleLogout}
                className="p-1.5 hover:bg-[#2a2a2a] rounded-lg transition-colors"
                title="Sair"
              >
                <LogOut className="w-4 h-4 text-[#b0b0b0] hover:text-white" />
              </button>
            )}
          </div>
        </div>

        {/* Collapse Toggle (Desktop only) */}
        <button
          onClick={onToggle}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-[#7e57c2] rounded-full items-center justify-center hover:bg-[#6a42b0] transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-white" />
          ) : (
            <ChevronLeft className="w-3 h-3 text-white" />
          )}
        </button>
      </motion.aside>
    </>
  );
}