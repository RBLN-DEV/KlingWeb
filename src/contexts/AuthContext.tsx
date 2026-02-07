import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { User, AuthState, LoginFormData, RegisterFormData } from '@/types';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

interface AuthContextType extends AuthState {
  login: (data: LoginFormData) => Promise<{ status: string }>;
  register: (data: RegisterFormData) => Promise<{ status: string }>;
  logout: () => void;
  updateUser: (user: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isAuthenticated: false,
    isLoading: true,
  });

  // Restore session from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('klingai_token');
    const storedUser = localStorage.getItem('klingai_user');
    if (storedToken && storedUser) {
      try {
        const user = JSON.parse(storedUser) as User;
        if (user.status === 'approved') {
          setState({
            user,
            token: storedToken,
            isAuthenticated: true,
            isLoading: false,
          });
        } else {
          // User exists but not approved — keep token for pending page but not authenticated
          setState({
            user,
            token: storedToken,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } catch {
        localStorage.removeItem('klingai_token');
        localStorage.removeItem('klingai_user');
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } else {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  }, []);

  const login = useCallback(async (data: LoginFormData): Promise<{ status: string }> => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, password: data.password }),
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Erro no login');
    }

    const user = json.data.user as User;
    const token = json.data.token as string;

    localStorage.setItem('klingai_token', token);
    localStorage.setItem('klingai_user', JSON.stringify(user));

    if (user.status === 'approved') {
      setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
    } else {
      setState({
        user,
        token,
        isAuthenticated: false,
        isLoading: false,
      });
    }

    return { status: user.status };
  }, []);

  const register = useCallback(async (data: RegisterFormData): Promise<{ status: string }> => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: data.name, email: data.email, password: data.password }),
    });

    const json = await res.json();

    if (!res.ok || !json.success) {
      throw new Error(json.error || 'Erro no cadastro');
    }

    const user = json.data.user as User;
    const token = json.data.token as string;

    localStorage.setItem('klingai_token', token);
    localStorage.setItem('klingai_user', JSON.stringify(user));

    // Newly registered users are always pending
    setState({
      user,
      token,
      isAuthenticated: false,
      isLoading: false,
    });

    return { status: user.status };
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('klingai_token');
    localStorage.removeItem('klingai_user');
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  }, []);

  const updateUser = useCallback((userData: Partial<User>) => {
    setState(prev => {
      if (!prev.user) return prev;
      const updatedUser = { ...prev.user, ...userData };
      localStorage.setItem('klingai_user', JSON.stringify(updatedUser));
      return { ...prev, user: updatedUser };
    });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
