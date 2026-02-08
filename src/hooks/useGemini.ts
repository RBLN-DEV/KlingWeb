import { useState, useCallback } from 'react';
import type { ImageGeneration, AspectRatio } from '@/types';

interface GenerateImageOptions {
  prompt: string;
  model: string;
  aspectRatio: AspectRatio;
  quality: 'standard' | 'high' | 'ultra';
}

interface ApiImageResponse {
  id: string;
  prompt: string;
  imageUrl: string;
  imageBase64?: string;
  status: 'completed' | 'failed';
  model: string;
  createdAt: string;
  error?: string;
}

// URL base da API (em dev usa proxy, em prod usa mesma origem)
const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';

export function useGemini() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentGeneration, setCurrentGeneration] = useState<ImageGeneration | null>(null);

  /**
   * Converte resposta da API para o formato do frontend
   */
  const mapApiResponse = (data: ApiImageResponse, options: GenerateImageOptions): ImageGeneration => ({
    id: data.id,
    prompt: data.prompt,
    imageUrl: data.imageUrl,
    status: data.status,
    createdAt: new Date(data.createdAt),
    model: data.model,
    aspectRatio: options.aspectRatio,
    quality: options.quality,
  });

  /**
   * Gera imagem usando a API (Gemini ou Azure DALL-E)
   */
  const generateImage = useCallback(async (options: GenerateImageOptions): Promise<ImageGeneration> => {
    setIsGenerating(true);
    setProgress(0);

    try {
      // Simular progresso durante a requisição
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + Math.random() * 15;
        });
      }, 500);

      // Determinar provedor baseado no modelo
      let provider: 'gemini' | 'azure-dalle' | undefined;
      if (options.model.toLowerCase().includes('gemini')) {
        provider = 'gemini';
      } else if (options.model.toLowerCase().includes('dall')) {
        provider = 'azure-dalle';
      }

      const response = await fetch(`${API_BASE}/api/image/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: options.prompt,
          model: provider,
          aspectRatio: options.aspectRatio,
          quality: options.quality,
        }),
      });

      clearInterval(progressInterval);

      const result = await response.json();

      if (!result.success) {
        // Extrair mensagem de erro específica da API
        const apiError = result.error || result.message || 'Erro ao gerar imagem';
        const errorCode = result.code || result.status;
        
        // Mapear erros comuns para mensagens amigáveis
        let friendlyMessage = apiError;
        if (apiError.includes('content_policy') || apiError.includes('content policy') || apiError.includes('safety')) {
          friendlyMessage = 'O prompt foi bloqueado pela política de conteúdo. Tente reformular a descrição.';
        } else if (apiError.includes('quota') || apiError.includes('rate limit') || apiError.includes('429')) {
          friendlyMessage = 'Limite de requisições atingido. Aguarde alguns segundos e tente novamente.';
        } else if (apiError.includes('timeout') || apiError.includes('TIMEOUT')) {
          friendlyMessage = 'A geração demorou muito. Tente novamente com um prompt mais simples.';
        } else if (apiError.includes('invalid') && apiError.includes('key')) {
          friendlyMessage = 'Chave de API inválida. Verifique as configurações no painel de administração.';
        } else if (apiError.includes('billing') || apiError.includes('payment')) {
          friendlyMessage = 'Problema com faturamento da API. Verifique o plano de assinatura.';
        } else if (errorCode === 503 || apiError.includes('unavailable')) {
          friendlyMessage = 'Serviço de IA temporariamente indisponível. Tente novamente em instantes.';
        }
        
        const error = new Error(friendlyMessage);
        (error as any).code = errorCode;
        (error as any).originalError = apiError;
        throw error;
      }

      setProgress(100);

      const data = result.data as ApiImageResponse;
      const generation = mapApiResponse(data, options);

      setCurrentGeneration(generation);

      // Salvar no localStorage para a galeria
      const saved = localStorage.getItem('klingai_images');
      const images = saved ? JSON.parse(saved) : [];
      images.unshift(generation);
      localStorage.setItem('klingai_images', JSON.stringify(images.slice(0, 50)));

      return generation;
    } catch (error) {
      const err = error as Error & { code?: string; originalError?: string };
      console.error('[useGemini] Erro:', {
        message: err.message,
        code: err.code,
        originalError: err.originalError,
        model: options.model,
        promptLength: options.prompt.length,
      });
      throw error;
    } finally {
      setIsGenerating(false);
    }
  }, []);

  /**
   * Obtém imagens armazenadas localmente
   */
  const getStoredImages = useCallback((): ImageGeneration[] => {
    const saved = localStorage.getItem('klingai_images');
    return saved ? JSON.parse(saved) : [];
  }, []);

  /**
   * Remove uma imagem do armazenamento local
   */
  const deleteImage = useCallback((id: string) => {
    const saved = localStorage.getItem('klingai_images');
    if (saved) {
      const images = JSON.parse(saved);
      const filtered = images.filter((img: ImageGeneration) => img.id !== id);
      localStorage.setItem('klingai_images', JSON.stringify(filtered));
    }

    // Também tentar remover da API
    fetch(`${API_BASE}/api/image/${id}`, { method: 'DELETE' }).catch(() => { });
  }, []);

  /**
   * Obtém provedores disponíveis
   */
  const getAvailableProviders = useCallback(async (): Promise<string[]> => {
    try {
      const response = await fetch(`${API_BASE}/api/image/providers/list`);
      const result = await response.json();
      return result.success ? result.data : [];
    } catch {
      return [];
    }
  }, []);

  return {
    generateImage,
    isGenerating,
    progress,
    currentGeneration,
    getStoredImages,
    deleteImage,
    getAvailableProviders,
  };
}
