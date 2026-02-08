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

  // Publicar mídia no Instagram via URL
  const publish = useCallback(async (options: InstagramPublishOptions): Promise<InstagramPublishResult> => {
    setIsPublishing(true);
    setError(null);
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
      };

      setLastResult(result);

      if (!json.success) {
        setError(json.error || 'Erro ao publicar no Instagram');
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
  }, []);

  return {
    publish,
    checkBotStatus,
    isPublishing,
    error,
    lastResult,
    reset,
  };
}
