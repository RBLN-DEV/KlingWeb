import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export type PublishDestination = 'feed' | 'story' | 'reel';

export interface InstagramPublishOptions {
  mediaUrl: string;
  caption: string;
  destination: PublishDestination;
  mediaType?: 'image' | 'video';
}

export interface InstagramPublishResult {
  success: boolean;
  postUrl?: string;
  mediaId?: string;
  error?: string;
  needsLogin?: boolean;
}

export interface BotStatus {
  isLoggedIn: boolean;
  username?: string;
  userId?: string;
  sessionActive: boolean;
}

export function useInstagramPublish() {
  const { token } = useAuth();
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [lastResult, setLastResult] = useState<InstagramPublishResult | null>(null);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  // Verificar status do bot
  const checkBotStatus = useCallback(async (): Promise<BotStatus | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/instagram-bot/status`, {
        headers: headers(),
      });
      const json = await res.json();
      if (json.success) {
        return json.data as BotStatus;
      }
      return null;
    } catch {
      return null;
    }
  }, [headers]);

  // Trigger manual login (auto-login via token salvo)
  const triggerLogin = useCallback(async (): Promise<BotStatus | null> => {
    try {
      const res = await fetch(`${API_BASE}/api/instagram-bot/login`, {
        method: 'POST',
        headers: headers(),
      });
      const json = await res.json();
      if (json.success) {
        setNeedsLogin(false);
        return await checkBotStatus();
      }
      setError(json.error || 'Falha no login');
      return null;
    } catch {
      setError('Erro de rede ao fazer login');
      return null;
    }
  }, [headers, checkBotStatus]);

  // Publicar mídia no Instagram via URL
  const publish = useCallback(async (options: InstagramPublishOptions): Promise<InstagramPublishResult> => {
    setIsPublishing(true);
    setError(null);
    setNeedsLogin(false);
    setLastResult(null);

    try {
      const res = await fetch(`${API_BASE}/api/instagram-bot/publish`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(options),
      });

      const json = await res.json();
      const result: InstagramPublishResult = {
        success: json.success,
        postUrl: json.postUrl,
        mediaId: json.mediaId,
        error: json.error,
        needsLogin: json.needsLogin,
      };

      setLastResult(result);

      if (!json.success) {
        setError(json.error || 'Erro ao publicar no Instagram');
        if (json.needsLogin) {
          setNeedsLogin(true);
        }
      }

      return result;
    } catch (err: any) {
      const errorMsg = err.message || 'Erro de rede ao publicar';
      setError(errorMsg);
      const result: InstagramPublishResult = { success: false, error: errorMsg };
      setLastResult(result);
      return result;
    } finally {
      setIsPublishing(false);
    }
  }, [headers]);

  // Limpar estado
  const reset = useCallback(() => {
    setError(null);
    setLastResult(null);
    setIsPublishing(false);
    setNeedsLogin(false);
  }, []);

  return {
    publish,
    checkBotStatus,
    triggerLogin,
    isPublishing,
    error,
    needsLogin,
    lastResult,
    reset,
  };
}
