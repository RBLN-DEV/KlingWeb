import jwt from 'jsonwebtoken';
import {
    KlingConfig,
    GenerationConfig,
    KlingCreateTaskResponse,
    KlingTaskStatusResponse,
    KlingTaskStatusData
} from '../types/index.js';

const DEFAULT_CONFIG: GenerationConfig = {
    duration: 5,
    aspectRatio: '9:16',
    mode: 'std',
    cfgScale: 0.7,
};

export class KlingService {
    private config: KlingConfig;
    private token: string;
    private tokenExpiry: number = 0;

    constructor() {
        this.config = {
            accessKey: process.env.KLING_ACCESS_KEY || '',
            secretKey: process.env.KLING_SECRET_KEY || '',
            baseUrl: process.env.KLING_BASE_URL || 'https://api-singapore.klingai.com',
            maxRetries: 3,
            retryDelay: 5000,
            pollInterval: 10000,
        };

        if (!this.config.accessKey || !this.config.secretKey) {
            throw new Error('KLING_ACCESS_KEY and KLING_SECRET_KEY are required');
        }

        this.token = this.generateJWT();
    }

    /**
     * Gera JWT para autenticação na API Kling
     */
    private generateJWT(): string {
        const now = Math.floor(Date.now() / 1000);

        const payload = {
            iss: this.config.accessKey,
            exp: now + 3600, // 1 hora
            iat: now - 30,   // Margem de segurança
            nbf: now - 30,
        };

        const token = jwt.sign(payload, this.config.secretKey, {
            algorithm: 'HS256',
            header: { alg: 'HS256', typ: 'JWT' },
        });

        this.tokenExpiry = now + 3600;
        console.log('[KlingService] JWT gerado com sucesso');

        return token;
    }

    /**
     * Renova token se necessário
     */
    private refreshTokenIfNeeded(): void {
        const now = Math.floor(Date.now() / 1000);
        if (now > this.tokenExpiry - 300) { // 5 minutos antes de expirar
            console.log('[KlingService] Renovando token JWT...');
            this.token = this.generateJWT();
        }
    }

    /**
     * Headers para requisições
     */
    private getHeaders(): Record<string, string> {
        this.refreshTokenIfNeeded();
        return {
            'Authorization': `Bearer ${this.token}`,
            'Content-Type': 'application/json',
        };
    }

    /**
     * Faz requisição com retry automático
     */
    private async makeRequest<T>(
        method: 'GET' | 'POST',
        endpoint: string,
        body?: unknown
    ): Promise<T> {
        const url = `${this.config.baseUrl}${endpoint}`;

        for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
            try {
                const response = await fetch(url, {
                    method,
                    headers: this.getHeaders(),
                    body: body ? JSON.stringify(body) : undefined,
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }

                return await response.json() as T;
            } catch (error) {
                console.error(`[KlingService] Tentativa ${attempt + 1} falhou:`, error);

                if (attempt < this.config.maxRetries - 1) {
                    await this.sleep(this.config.retryDelay * (attempt + 1));
                } else {
                    throw error;
                }
            }
        }

        throw new Error('Max retries exceeded');
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Converte URL para Base64 se necessário
     */
    private async ensureBase64(content: string): Promise<string> {
        if (content.startsWith('http://') || content.startsWith('https://')) {
            console.log('[KlingService] Baixando imagem e convertendo para Base64...');
            const response = await fetch(content);
            const arrayBuffer = await response.arrayBuffer();
            return Buffer.from(arrayBuffer).toString('base64');
        }

        // Se já for Base64 ou data URL, retorna como está
        if (content.startsWith('data:')) {
            return content.split(',')[1] || content;
        }

        return content;
    }

    /**
     * Cria vídeo a partir de imagem (Image-to-Video)
     */
    async createImageToVideo(
        imageInput: string,
        prompt: string = '',
        negativePrompt: string = '',
        config: Partial<GenerationConfig> = {}
    ): Promise<string> {
        const genConfig = { ...DEFAULT_CONFIG, ...config };

        console.log('[KlingService] Iniciando Image-to-Video...');

        const imageBase64 = await this.ensureBase64(imageInput);

        const payload = {
            model_name: 'kling-v1',
            image: imageBase64,
            prompt,
            negative_prompt: negativePrompt,
            duration: String(genConfig.duration),
            aspect_ratio: genConfig.aspectRatio,
            mode: genConfig.mode,
            cfg_scale: genConfig.cfgScale,
        };

        const result = await this.makeRequest<KlingCreateTaskResponse>(
            'POST',
            '/v1/videos/image2video',
            payload
        );

        console.log('[KlingService] Task criada:', result.data.task_id);
        return result.data.task_id;
    }

    /**
     * Cria vídeo com Motion Control
     */
    async createMotionControlVideo(
        imageInput: string,
        videoUrl: string,
        prompt: string = '',
        config: Partial<GenerationConfig> = {}
    ): Promise<string> {
        const genConfig = { ...DEFAULT_CONFIG, ...config };

        console.log('[KlingService] Iniciando Motion Control...');

        // Para imagem: API aceita Base64 ou URL
        let imageValue: string;
        if (imageInput.startsWith('http://') || imageInput.startsWith('https://')) {
            imageValue = imageInput;
        } else {
            imageValue = await this.ensureBase64(imageInput);
        }

        // Video DEVE ser uma URL pública
        if (!videoUrl.startsWith('http://') && !videoUrl.startsWith('https://')) {
            throw new Error('Motion Control requer uma URL pública para o vídeo de referência');
        }

        const payload: Record<string, unknown> = {
            image_url: imageValue,
            video_url: videoUrl,
            character_orientation: 'video', // "video" permite até 30s
            mode: genConfig.mode,
            keep_original_sound: 'no',
        };

        if (prompt && prompt.trim()) {
            payload.prompt = prompt.substring(0, 2500);
        }

        const result = await this.makeRequest<KlingCreateTaskResponse>(
            'POST',
            '/v1/videos/motion-control',
            payload
        );

        console.log('[KlingService] Motion Control Task criada:', result.data.task_id);
        return result.data.task_id;
    }

    /**
     * Obtém status de tarefa Image-to-Video
     */
    async getImage2VideoStatus(taskId: string): Promise<KlingTaskStatusData> {
        const result = await this.makeRequest<KlingTaskStatusResponse>(
            'GET',
            `/v1/videos/image2video/${taskId}`
        );
        return result.data;
    }

    /**
     * Obtém status de tarefa Motion Control
     */
    async getMotionControlStatus(taskId: string): Promise<KlingTaskStatusData> {
        const result = await this.makeRequest<KlingTaskStatusResponse>(
            'GET',
            `/v1/videos/motion-control/${taskId}`
        );
        return result.data;
    }

    /**
     * Aguarda conclusão de uma tarefa
     */
    async waitForCompletion(
        taskId: string,
        taskType: 'image2video' | 'motion-control' = 'image2video',
        onProgress?: (status: string, progress: number) => void,
        timeout: number = 1800000 // 30 minutos
    ): Promise<string> {
        console.log(`[KlingService] Aguardando tarefa ${taskId} (${taskType})...`);

        const startTime = Date.now();
        const estimatedTime = taskType === 'motion-control' ? 300000 : 180000;

        while (Date.now() - startTime < timeout) {
            const statusData = taskType === 'motion-control'
                ? await this.getMotionControlStatus(taskId)
                : await this.getImage2VideoStatus(taskId);

            const status = statusData.task_status;

            // Calcular progresso
            let progress = statusData.task_progress || 0;
            if (progress === 0) {
                const elapsed = Date.now() - startTime;
                progress = Math.min(95, Math.floor((elapsed / estimatedTime) * 100));
            }

            console.log(`[KlingService] Status: ${status} - ${progress}%`);

            if (onProgress) {
                onProgress(status, progress);
            }

            if (status === 'succeed') {
                if (onProgress) onProgress(status, 100);

                const videos = statusData.task_result?.videos;
                if (videos && videos.length > 0) {
                    console.log('[KlingService] Vídeo pronto:', videos[0].url);
                    return videos[0].url;
                }
                throw new Error('Vídeo não encontrado na resposta');
            }

            if (status === 'failed') {
                const errorMsg = statusData.task_status_msg || 'Erro desconhecido';
                throw new Error(`Geração falhou: ${errorMsg}`);
            }

            await this.sleep(this.config.pollInterval);
        }

        throw new Error(`Timeout após ${timeout / 1000} segundos`);
    }

    /**
     * Fluxo completo: cria vídeo e aguarda conclusão
     */
    async generateVideo(
        imageInput: string,
        options: {
            referenceVideoUrl?: string;
            prompt?: string;
            negativePrompt?: string;
            config?: Partial<GenerationConfig>;
        } = {},
        onProgress?: (status: string, progress: number) => void
    ): Promise<string> {
        let taskId: string;
        let taskType: 'image2video' | 'motion-control';

        if (options.referenceVideoUrl) {
            taskId = await this.createMotionControlVideo(
                imageInput,
                options.referenceVideoUrl,
                options.prompt || '',
                options.config
            );
            taskType = 'motion-control';
        } else {
            taskId = await this.createImageToVideo(
                imageInput,
                options.prompt || '',
                options.negativePrompt || '',
                options.config
            );
            taskType = 'image2video';
        }

        return await this.waitForCompletion(taskId, taskType, onProgress);
    }
}

// Singleton
let klingServiceInstance: KlingService | null = null;

export function getKlingService(): KlingService {
    if (!klingServiceInstance) {
        klingServiceInstance = new KlingService();
    }
    return klingServiceInstance;
}
