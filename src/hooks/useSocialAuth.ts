import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type { SocialConnection, SocialProvider, UnofficialLoginCredentials, UnofficialLoginResult } from '@/types/social';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function useSocialAuth() {
  const { token, logout } = useAuth();
  const [connections, setConnections] = useState<SocialConnection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  // Helper: checar se resposta indica sessão expirada e fazer auto-logout
  const checkSessionExpired = useCallback((res: Response, json: any) => {
    if (res.status === 401 || json?.code === 'SESSION_EXPIRED') {
      logout();
      return true;
    }
    return false;
  }, [logout]);

  // Fetch all connections (oficial + não-oficial)
  const fetchConnections = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      // Buscar conexões oficiais
      const res = await fetch(`${API_BASE}/api/social/connections`, { headers: headers() });
      let officialConnections: SocialConnection[] = [];
      try {
        const json = await res.json();
        if (checkSessionExpired(res, json)) return;
        officialConnections = json.success ? json.data : [];
      } catch { /* response not JSON */ }

      // Buscar conexões não-oficiais
      const resUnofficial = await fetch(`${API_BASE}/api/social/unofficial/connections`, { headers: headers() });
      let unofficialConnections: SocialConnection[] = [];
      try {
        const jsonUnofficial = await resUnofficial.json();
        if (checkSessionExpired(resUnofficial, jsonUnofficial)) return;
        unofficialConnections = jsonUnofficial.success ? jsonUnofficial.data : [];
      } catch { /* response not JSON */ }

      // Marcar authMode em cada conexão
      const allConnections = [
        ...officialConnections.map((c: SocialConnection) => ({ ...c, authMode: 'official' as const })),
        ...unofficialConnections.map((c: SocialConnection) => ({ ...c, authMode: 'unofficial' as const })),
      ];

      setConnections(allConnections);
    } catch (err) {
      setError('Erro de rede ao carregar conexões');
    } finally {
      setIsLoading(false);
    }
  }, [token, headers, checkSessionExpired]);

  // Connect via OAuth (modo oficial — mantido para futuro)
  const connectProvider = useCallback(async (provider: SocialProvider) => {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/social/oauth/${provider}/init`, {
        method: 'POST',
        headers: headers(),
      });
      const json = await res.json();
      if (json.success && json.data?.authUrl) {
        window.location.href = json.data.authUrl;
      } else {
        setError(json.error || 'Erro ao iniciar conexão');
      }
    } catch (err) {
      setError('Erro de rede ao conectar');
    }
  }, [token, headers]);

  // Connect via credenciais (modo não-oficial)
  const connectProviderUnofficial = useCallback(async (
    provider: SocialProvider,
    credentials: UnofficialLoginCredentials
  ): Promise<UnofficialLoginResult> => {
    if (!token) {
      return { success: false, error: 'Não autenticado' };
    }
    setIsConnecting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/social/unofficial/${provider}/login`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(credentials),
      });
      const json = await res.json();
      if (checkSessionExpired(res, json)) {
        return { success: false, error: 'Sessão expirada. Faça login novamente.' };
      }

      if (json.success) {
        // Recarregar conexões
        await fetchConnections();
        return {
          success: true,
          connection: json.data,
        };
      } else {
        const errorMsg = json.error || 'Erro ao conectar';
        setError(errorMsg);
        return {
          success: false,
          error: errorMsg,
          requiresTwoFactor: json.requiresTwoFactor,
          requiresChallenge: json.requiresChallenge,
        };
      }
    } catch (err) {
      const msg = 'Erro de rede ao conectar';
      setError(msg);
      return { success: false, error: msg };
    } finally {
      setIsConnecting(false);
    }
  }, [token, headers, fetchConnections, checkSessionExpired]);

  // Disconnect a provider
  const disconnectProvider = useCallback(async (connectionId: string) => {
    if (!token) return;
    setError(null);

    // Verificar se é conexão não-oficial
    const conn = connections.find(c => c.id === connectionId);
    const isUnofficial = conn?.authMode === 'unofficial';

    try {
      const endpoint = isUnofficial
        ? `${API_BASE}/api/social/unofficial/connections/${connectionId}`
        : `${API_BASE}/api/social/connections/${connectionId}`;

      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: headers(),
      });
      const json = await res.json();
      if (json.success) {
        setConnections(prev => prev.filter(c => c.id !== connectionId));
      } else {
        setError(json.error || 'Erro ao desconectar');
      }
    } catch (err) {
      setError('Erro de rede ao desconectar');
    }
  }, [token, headers, connections]);

  // Refresh token for a connection
  const refreshConnection = useCallback(async (connectionId: string) => {
    if (!token) return;
    setError(null);

    const conn = connections.find(c => c.id === connectionId);
    const isUnofficial = conn?.authMode === 'unofficial';

    try {
      const endpoint = isUnofficial
        ? `${API_BASE}/api/social/unofficial/connections/${connectionId}/refresh`
        : `${API_BASE}/api/social/connections/${connectionId}/refresh`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
      });
      const json = await res.json();
      if (json.success) {
        await fetchConnections();
      } else {
        setError(json.error || 'Erro ao atualizar sessão');
      }
    } catch (err) {
      setError('Erro de rede ao atualizar sessão');
    }
  }, [token, headers, fetchConnections, connections]);

  // Validate a connection
  const validateConnection = useCallback(async (connectionId: string): Promise<boolean> => {
    if (!token) return false;

    const conn = connections.find(c => c.id === connectionId);
    const isUnofficial = conn?.authMode === 'unofficial';

    try {
      const endpoint = isUnofficial
        ? `${API_BASE}/api/social/unofficial/connections/${connectionId}/validate`
        : `${API_BASE}/api/social/connections/${connectionId}/validate`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: headers(),
      });
      const json = await res.json();
      return json.success && json.data?.valid === true;
    } catch {
      return false;
    }
  }, [token, headers, connections]);

  // Get connection for a specific provider
  const getProviderConnection = useCallback((provider: SocialProvider) => {
    return connections.find(c => c.provider === provider && c.isActive);
  }, [connections]);

  // Load on mount
  useEffect(() => {
    fetchConnections();
  }, [fetchConnections]);

  return {
    connections,
    isLoading,
    isConnecting,
    error,
    connectProvider,
    connectProviderUnofficial,
    disconnectProvider,
    refreshConnection,
    validateConnection,
    getProviderConnection,
    fetchConnections,
  };
}
