import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import type {
  Publication,
  PublishRequest,
  PublishMultiRequest,
  PublicationStatus,
  SocialProvider,
  QueueStats,
} from '@/types/social';

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function useSocialPublish() {
  const { token } = useAuth();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  // Publish to a single provider
  const publish = useCallback(async (request: PublishRequest): Promise<Publication | null> => {
    if (!token) return null;
    setIsPublishing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/social/publish`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(request),
      });
      const json = await res.json();
      if (json.success) {
        const pub = json.data as Publication;
        setPublications(prev => [pub, ...prev]);
        return pub;
      } else {
        setError(json.error || 'Erro ao publicar');
        return null;
      }
    } catch (err) {
      setError('Erro de rede ao publicar');
      return null;
    } finally {
      setIsPublishing(false);
    }
  }, [token, headers]);

  // Publish to multiple providers
  const publishMulti = useCallback(async (request: PublishMultiRequest): Promise<Publication[]> => {
    if (!token) return [];
    setIsPublishing(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/social/publish/multi`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(request),
      });
      const json = await res.json();
      if (json.success) {
        const pubs = json.data as Publication[];
        setPublications(prev => [...pubs, ...prev]);
        return pubs;
      } else {
        setError(json.error || 'Erro ao publicar');
        return [];
      }
    } catch (err) {
      setError('Erro de rede ao publicar');
      return [];
    } finally {
      setIsPublishing(false);
    }
  }, [token, headers]);

  // Fetch publications
  const fetchPublications = useCallback(async (
    filters?: { status?: PublicationStatus; provider?: SocialProvider; limit?: number }
  ) => {
    if (!token) return;
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters?.status) params.set('status', filters.status);
      if (filters?.provider) params.set('provider', filters.provider);
      if (filters?.limit) params.set('limit', String(filters.limit));

      const res = await fetch(`${API_BASE}/api/social/publications?${params}`, {
        headers: headers(),
      });
      const json = await res.json();
      if (json.success) {
        setPublications(json.data);
      } else {
        setError(json.error || 'Erro ao carregar publicações');
      }
    } catch (err) {
      setError('Erro de rede ao carregar publicações');
    } finally {
      setIsLoading(false);
    }
  }, [token, headers]);

  // Get single publication details
  const getPublication = useCallback(async (id: string): Promise<Publication | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/api/social/publications/${id}`, {
        headers: headers(),
      });
      const json = await res.json();
      return json.success ? json.data : null;
    } catch {
      return null;
    }
  }, [token, headers]);

  // Cancel a publication
  const cancelPublication = useCallback(async (id: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/api/social/publications/${id}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const json = await res.json();
      if (json.success) {
        setPublications(prev => prev.map(p =>
          p.id === id ? { ...p, status: 'cancelled' as PublicationStatus } : p
        ));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [token, headers]);

  // Retry a failed publication
  const retryPublication = useCallback(async (id: string): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch(`${API_BASE}/api/social/publications/${id}/retry`, {
        method: 'POST',
        headers: headers(),
      });
      const json = await res.json();
      if (json.success) {
        setPublications(prev => prev.map(p =>
          p.id === id ? { ...p, status: 'queued' as PublicationStatus } : p
        ));
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [token, headers]);

  // Get queue status
  const getQueueStatus = useCallback(async (): Promise<QueueStats | null> => {
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/api/social/dashboard/queue-status`, {
        headers: headers(),
      });
      const json = await res.json();
      return json.success ? json.data : null;
    } catch {
      return null;
    }
  }, [token, headers]);

  return {
    publications,
    isPublishing,
    isLoading,
    error,
    publish,
    publishMulti,
    fetchPublications,
    getPublication,
    cancelPublication,
    retryPublication,
    getQueueStatus,
  };
}
