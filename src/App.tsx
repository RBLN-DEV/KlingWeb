import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import { ToastContainer } from '@/components/ui-custom/Toast';
import { Sidebar } from '@/components/layout/Sidebar';
import { Login } from '@/pages/Login';
import { Register } from '@/pages/Register';
import { PendingApproval } from '@/pages/PendingApproval';
import { Dashboard } from '@/pages/Dashboard';
import { ImageGeneration } from '@/pages/ImageGeneration';
import { VideoGeneration } from '@/pages/VideoGeneration';
import { Gallery } from '@/pages/Gallery';
import { ImageGallery } from '@/pages/ImageGallery';
import { Prompts } from '@/pages/Prompts';
import { Settings } from '@/pages/Settings';
import { AdminUsers } from '@/pages/AdminUsers';
import { SocialHub } from '@/pages/SocialHub';
import { SocialDashboard } from '@/pages/SocialDashboard';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { cn } from '@/lib/utils';

// Protected Route Component
function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-[#444444] border-t-[#7e57c2] rounded-full"
        />
      </div>
    );
  }

  // If user exists but is pending, redirect to pending page
  if (user && user.status === 'pending') {
    return <Navigate to="/pending" replace />;
  }

  // If user exists but is rejected, redirect to login
  if (user && user.status === 'rejected') {
    return <Navigate to="/login" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}

// Admin Route Component
function AdminRoute() {
  const { user } = useAuth();
  
  if (!user || user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// Public Route Component (redirects to dashboard if authenticated)
function PublicRoute() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-12 h-12 border-4 border-[#444444] border-t-[#7e57c2] rounded-full"
        />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

// Main Layout with Sidebar
function MainLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#1a1a1a] flex">
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />
      <main
        className={cn(
          'flex-1 min-h-screen transition-all duration-300',
          // Mobile: sem margin (sidebar é overlay)
          'ml-0',
          // Desktop: margin baseado no estado do sidebar
          isSidebarCollapsed ? 'lg:ml-[80px]' : 'lg:ml-[250px]'
        )}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="min-h-screen"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// App Routes
function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route element={<PublicRoute />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      {/* Pending Approval - accessible with token but not authenticated */}
      <Route path="/pending" element={<PendingApproval />} />

      {/* Protected Routes */}
      <Route element={<ProtectedRoute />}>
        <Route element={<MainLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/image" element={<ImageGeneration />} />
          <Route path="/video" element={<VideoGeneration />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/image-gallery" element={<ImageGallery />} />
          <Route path="/social-hub" element={<ErrorBoundary fallbackTitle="Erro no Social Hub" fallbackMessage="Não foi possível carregar a página de redes sociais."><SocialHub /></ErrorBoundary>} />
          <Route path="/social-dashboard" element={<ErrorBoundary fallbackTitle="Erro no Social Dashboard" fallbackMessage="Não foi possível carregar as métricas de redes sociais."><SocialDashboard /></ErrorBoundary>} />
          <Route path="/prompts" element={<Prompts />} />
          <Route path="/settings" element={<Settings />} />
          
          {/* Admin Routes */}
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<AdminUsers />} />
          </Route>
        </Route>
      </Route>

      {/* Redirect root to dashboard or login */}
      <Route path="/" element={<RootRedirect />} />

      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

// Root Redirect
function RootRedirect() {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />;
}

// 404 Page
function NotFound() {
  return (
    <div className="min-h-screen bg-[#1a1a1a] flex items-center justify-center">
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-8xl font-bold text-[#7e57c2] mb-4"
        >
          404
        </motion.div>
        <h1 className="text-2xl text-white mb-4">Página não encontrada</h1>
        <p className="text-[#b0b0b0] mb-6">A página que você procura não existe.</p>
        <a
          href="/dashboard"
          className="inline-flex items-center px-6 py-3 bg-[#7e57c2] hover:bg-[#6a42b0] text-white rounded-lg transition-colors"
        >
          Voltar ao Dashboard
        </a>
      </div>
    </div>
  );
}

// Main App
function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
          <ToastContainer />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}

export default App;
