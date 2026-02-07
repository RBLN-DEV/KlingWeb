import { GenerationConfig, KlingTaskStatusData } from '../types/index.js';
export declare class KlingService {
    private config;
    private token;
    private tokenExpiry;
    constructor();
    /**
     * Gera JWT para autenticação na API Kling
     */
    private generateJWT;
    /**
     * Renova token se necessário
     */
    private refreshTokenIfNeeded;
    /**
     * Headers para requisições
     */
    private getHeaders;
    /**
     * Faz requisição com retry automático
     */
    private makeRequest;
    private sleep;
    /**
     * Converte URL para Base64 se necessário
     */
    private ensureBase64;
    /**
     * Cria vídeo a partir de imagem (Image-to-Video)
     */
    createImageToVideo(imageInput: string, prompt?: string, negativePrompt?: string, config?: Partial<GenerationConfig>): Promise<string>;
    /**
     * Cria vídeo com Motion Control
     */
    createMotionControlVideo(imageInput: string, videoUrl: string, prompt?: string, config?: Partial<GenerationConfig>): Promise<string>;
    /**
     * Obtém status de tarefa Image-to-Video
     */
    getImage2VideoStatus(taskId: string): Promise<KlingTaskStatusData>;
    /**
     * Obtém status de tarefa Motion Control
     */
    getMotionControlStatus(taskId: string): Promise<KlingTaskStatusData>;
    /**
     * Aguarda conclusão de uma tarefa
     */
    waitForCompletion(taskId: string, taskType?: 'image2video' | 'motion-control', onProgress?: (status: string, progress: number) => void, timeout?: number): Promise<string>;
    /**
     * Fluxo completo: cria vídeo e aguarda conclusão
     */
    generateVideo(imageInput: string, options?: {
        referenceVideoUrl?: string;
        prompt?: string;
        negativePrompt?: string;
        config?: Partial<GenerationConfig>;
    }, onProgress?: (status: string, progress: number) => void): Promise<string>;
}
export declare function getKlingService(): KlingService;
//# sourceMappingURL=kling.service.d.ts.map