import { useState, useCallback, useRef } from 'react';
import type { VideoGeneration, KlingParameters } from '@/types';

interface GenerateVideoOptions {
  imageUrl: string;
  imageBase64?: string;
  referenceVideo?: File;
  parameters: KlingParameters;
  title: string;
}

interface ApiVideoResponse {
  id: string;
  taskId: string;
  title: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  statusMessage: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  createdAt: string;
  updatedAt: string;
  error?: string;
}

// URL base da API (em dev usa proxy, em prod usa mesma origem)
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function useKling() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [currentGeneration, setCurrentGeneration] = useState<VideoGeneration | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);


  /**
   * Converte resposta da API para o formato do frontend
   */
  const mapApiResponse = (data: ApiVideoResponse): VideoGeneration => ({
    id: data.id,
    title: data.title,
    status: data.status,
    thumbnailUrl: data.thumbnailUrl,
    videoUrl: data.videoUrl,
    duration: 5, // Será atualizado após geração real
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
    parameters: {
      duration: 5,
      cfgScale: 0.5,
      preserveStructure: true,
      identityConsistency: true,
      mode: 'standard',
    },
    imageUrl: data.thumbnailUrl || '',
  });

  /**
   * Faz polling do status da geração
   */
  const pollStatus = useCallback(async (
    generationId: string,
    onUpdate: (gen: VideoGeneration) => void
  ): Promise<VideoGeneration> => {
    return new Promise((resolve, reject) => {
      const poll = async () => {
        try {
          const response = await fetch(`${API_BASE}/api/video/status/${generationId}`);
          const result = await response.json();

          if (!result.success) {
            throw new Error(result.error || 'Erro ao obter status');
          }

          const data = result.data as ApiVideoResponse;
          const generation = mapApiResponse(data);

          setProgress(data.progress);
          setStatusMessage(data.statusMessage);
          onUpdate(generation);

          if (data.status === 'completed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            resolve(generation);
          } else if (data.status === 'failed') {
            if (pollingRef.current) clearInterval(pollingRef.current);
            reject(new Error(data.error || 'Geração falhou'));
          }
        } catch (error) {
          if (pollingRef.current) clearInterval(pollingRef.current);
          reject(error);
        }
      };

      // Polling a cada 3 segundos
      pollingRef.current = setInterval(poll, 3000);
      poll(); // Primeira chamada imediata
    });
  }, []);

  /**
   * Gera vídeo usando a API Kling
   */
  const generateVideo = useCallback(async (options: GenerateVideoOptions): Promise<VideoGeneration> => {
    setIsGenerating(true);
    setProgress(0);
    setStatusMessage('Preparando geração...');

    try {
      // Preparar corpo da requisição
      // Detectar se é Base64 (Data URI)
      let finalImageUrl = options.imageUrl;
      let finalImageBase64 = options.imageBase64;

      if (options.imageUrl.startsWith('data:')) {
        finalImageBase64 = options.imageUrl.split(',')[1];
        finalImageUrl = '';
      }

      const body: Record<string, unknown> = {
        imageUrl: finalImageUrl,
        imageBase64: finalImageBase64,
        title: options.title,
        prompt: '', // Pode ser adicionado no futuro
        config: {
          duration: options.parameters.duration,
          mode: options.parameters.mode === 'professional' ? 'pro' : 'std',
          cfgScale: options.parameters.cfgScale,
        },
      };

      // Se tiver vídeo de referência, fazer upload primeiro para obter URL pública
      if (options.referenceVideo) {
        setStatusMessage('Enviando vídeo de referência...');
        const formData = new FormData();
        formData.append('video', options.referenceVideo);

        const uploadResponse = await fetch(`${API_BASE}/api/video/upload`, {
          method: 'POST',
          body: formData,
        });

        const uploadResult = await uploadResponse.json();
        if (!uploadResult.success) {
          throw new Error(uploadResult.error || 'Erro ao enviar vídeo de referência');
        }

        body.referenceVideoUrl = uploadResult.data.videoUrl;
        console.log('[useKling] Vídeo de referência enviado:', uploadResult.data.videoUrl);
      }

      setStatusMessage('Enviando para API Kling...');

      const response = await fetch(`${API_BASE}/api/video/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Erro ao iniciar geração');
      }

      const initialData = result.data as ApiVideoResponse;
      let generation = mapApiResponse(initialData);

      setCurrentGeneration(generation);
      setStatusMessage('Processando...');

      // Fazer polling até completar
      generation = await pollStatus(initialData.id, (updated) => {
        setCurrentGeneration(updated);
      });

      setProgress(100);
      setStatusMessage('Vídeo gerado com sucesso!');
      setCurrentGeneration(generation);

      // Salvar no localStorage para a galeria
      const saved = localStorage.getItem('klingai_videos');
      const videos = saved ? JSON.parse(saved) : [];
      videos.unshift(generation);
      localStorage.setItem('klingai_videos', JSON.stringify(videos.slice(0, 50)));

      return generation;
    } catch (error) {
      setStatusMessage('Erro na geração');
      throw error;
    } finally {
      setIsGenerating(false);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    }
  }, [pollStatus]);

  /**
   * Obtém vídeos armazenados localmente
   */
  const getStoredVideos = useCallback((): VideoGeneration[] => {
    const saved = localStorage.getItem('klingai_videos');
    return saved ? JSON.parse(saved) : [];
  }, []);

  /**
   * Remove um vídeo do armazenamento local
   */
  const deleteVideo = useCallback((id: string) => {
    const saved = localStorage.getItem('klingai_videos');
    if (saved) {
      const videos = JSON.parse(saved);
      const filtered = videos.filter((v: VideoGeneration) => v.id !== id);
      localStorage.setItem('klingai_videos', JSON.stringify(filtered));
    }

    // Também tentar remover da API
    fetch(`${API_BASE}/api/video/${id}`, { method: 'DELETE' }).catch(() => { });
  }, []);

  return {
    generateVideo,
    isGenerating,
    progress,
    statusMessage,
    currentGeneration,
    getStoredVideos,
    deleteVideo,
  };
}
