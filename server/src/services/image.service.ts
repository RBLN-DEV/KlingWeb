import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// Import opcional do storage (pode não estar configurado)
let storageService: any = null;
try {
    const { getStorageService } = require('./storage.service');
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        storageService = getStorageService();
        console.log('[ImageService] Azure Blob Storage disponível para persistência de imagens');
    }
} catch {
    console.log('[ImageService] Azure Blob Storage não disponível, usando armazenamento local');
}


export interface ImageGenerationResult {
    imageUrl: string;
    imageBase64?: string;
    filePath?: string;
    model: string;
}

export class ImageService {
    private geminiClient: GoogleGenAI | null = null;
    private azureConfig: {
        endpoint: string;
        key: string;
        deployment: string;
        apiVersion: string;
    } | null = null;

    private tempDir: string;

    constructor() {
        this.initializeClients();

        // Diretório para arquivos temporários — persistente em produção
        this.tempDir = process.env.NODE_ENV === 'production' && fs.existsSync('/home')
            ? '/home/temp_uploads'
            : path.join(process.cwd(), 'temp_uploads');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    // Inicializar clientes de API
    private initializeClients() {
        // Configurar Gemini (novo SDK @google/genai)
        if (process.env.GEMINI_API_KEY) {
            this.geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
            console.log('[ImageService] Gemini configurado (SDK @google/genai)');
        }

        // Configurar Azure DALL-E
        if (process.env.AZURE_DALLE_ENDPOINT && process.env.AZURE_DALLE_KEY) {
            this.azureConfig = {
                endpoint: process.env.AZURE_DALLE_ENDPOINT,
                key: process.env.AZURE_DALLE_KEY,
                deployment: process.env.AZURE_DALLE_DEPLOYMENT || 'dall-e-3',
                apiVersion: process.env.AZURE_DALLE_API_VERSION || '2024-04-01-preview',
            };
            console.log('[ImageService] Azure DALL-E configurado');
        }

        // Diretório para arquivos temporários — persistente em produção
        this.tempDir = process.env.NODE_ENV === 'production' && fs.existsSync('/home')
            ? '/home/temp_uploads'
            : path.join(process.cwd(), 'temp_uploads');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /**
     * Gera imagem usando Azure DALL-E 3
     */
    async generateWithAzureDalle(
        prompt: string,
        size: '1024x1024' | '1024x1792' | '1792x1024' = '1024x1024'
    ): Promise<ImageGenerationResult> {
        if (!this.azureConfig) {
            throw new Error('Azure DALL-E não configurado');
        }

        console.log('[ImageService] Gerando imagem com Azure DALL-E...');

        const url = `${this.azureConfig.endpoint}openai/deployments/${this.azureConfig.deployment}/images/generations?api-version=${this.azureConfig.apiVersion}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'api-key': this.azureConfig.key,
            },
            body: JSON.stringify({
                prompt,
                n: 1,
                size,
                style: 'vivid',
                quality: 'standard',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();

            // Verificar se é erro de política de conteúdo
            if (errorText.toLowerCase().includes('content_policy') ||
                errorText.toLowerCase().includes('responsibleaipolicyviolation')) {
                throw new Error('CONTENT_POLICY_VIOLATION');
            }

            throw new Error(`Azure DALL-E error: ${errorText}`);
        }

        const data = await response.json() as { data: Array<{ url: string }> };

        console.log('[ImageService] Imagem Azure DALL-E gerada com sucesso');

        let imageUrl = data.data[0].url;

        // Persistir no Azure Blob Storage (DALL-E retorna URL temporária da Azure)
        if (storageService) {
            try {
                const imgResponse = await fetch(imageUrl);
                const imgBuffer = Buffer.from(await imgResponse.arrayBuffer());
                const blobName = `dalle/${uuidv4()}.png`;
                imageUrl = await storageService.uploadImage(blobName, imgBuffer, 'image/png');
                console.log(`[ImageService] DALL-E image persistida no Azure Blob: ${blobName}`);
            } catch (uploadError: any) {
                console.warn(`[ImageService] Usando URL original DALL-E (erro Blob): ${uploadError?.message}`);
            }
        }

        return {
            imageUrl,
            model: 'azure-dalle',
        };
    }

    /**
     * Gera imagem usando Google Gemini (SDK @google/genai)
     * Modelos disponíveis: gemini-2.0-flash-exp-image-generation, gemini-2.5-flash-image
     */
    async generateWithGemini(prompt: string): Promise<ImageGenerationResult> {
        if (!this.geminiClient) {
            throw new Error('Gemini não configurado');
        }

        console.log('[ImageService] Gerando imagem com Gemini (novo SDK)...');

        // Lista de modelos para tentar (em ordem de preferência)
        const modelsToTry = [
            'gemini-2.0-flash-exp-image-generation',
            'gemini-2.5-flash-image',
        ];

        let lastError: Error | null = null;

        for (const modelName of modelsToTry) {
            try {
                console.log(`[ImageService] Tentando modelo: ${modelName}`);

                const response = await this.geminiClient.models.generateContent({
                    model: modelName,
                    contents: `Generate a high-quality image: ${prompt}`,
                    config: {
                        responseModalities: ['IMAGE', 'TEXT'],
                    },
                });

                // Procurar por partes de imagem na resposta
                if (response.candidates && response.candidates.length > 0) {
                    for (const candidate of response.candidates) {
                        for (const part of candidate.content?.parts || []) {
                            // O novo SDK retorna inlineData diretamente
                            if (part.inlineData?.data) {
                                const imageData = part.inlineData.data;

                                // Salvar imagem em arquivo temporário
                                const filename = `gemini_${uuidv4()}.png`;
                                const filepath = path.join(this.tempDir, filename);

                                const buffer = Buffer.from(imageData, 'base64');
                                fs.writeFileSync(filepath, buffer);

                                console.log(`[ImageService] Imagem Gemini gerada com ${modelName}:`, filepath);

                                // Tentar upload para Azure Blob Storage para persistência
                                let persistentUrl = `/temp/${filename}`;
                                if (storageService) {
                                    try {
                                        const blobName = `gemini/${filename}`;
                                        persistentUrl = await storageService.uploadImage(blobName, buffer, 'image/png');
                                        console.log(`[ImageService] Imagem persistida no Azure Blob: ${blobName}`);
                                    } catch (uploadError: any) {
                                        console.warn(`[ImageService] Fallback para URL local (erro Blob): ${uploadError?.message}`);
                                    }
                                }

                                return {
                                    imageUrl: persistentUrl,
                                    imageBase64: imageData,
                                    filePath: filepath,
                                    model: 'gemini',
                                };
                            }
                        }
                    }
                }

                throw new Error('Nenhuma imagem na resposta');
            } catch (error: any) {
                console.warn(`[ImageService] Modelo ${modelName} falhou:`, error?.message);
                lastError = error;
                // Se não é erro 404/not found, não tente outro modelo (é erro de conteúdo/limite)
                if (!error?.message?.includes('not found') && !error?.message?.includes('404')) {
                    throw error;
                }
            }
        }

        throw lastError || new Error('Nenhum modelo Gemini de imagem disponível');
    }

    /**
     * Gera imagem usando o provedor disponível
     * Com fallback automático se Azure falhar por política de conteúdo
     */
    async generate(
        prompt: string,
        preferredProvider?: 'gemini' | 'azure-dalle'
    ): Promise<ImageGenerationResult> {
        // Se especificou provedor específico
        if (preferredProvider === 'gemini' && this.geminiClient) {
            return this.generateWithGemini(prompt);
        }

        if (preferredProvider === 'azure-dalle' && this.azureConfig) {
            try {
                return await this.generateWithAzureDalle(prompt);
            } catch (error) {
                if (error instanceof Error && error.message === 'CONTENT_POLICY_VIOLATION') {
                    console.warn('[ImageService] Azure DALL-E bloqueou por política. Tentando Gemini como fallback...');
                    if (this.geminiClient) {
                        return this.generateWithGemini(prompt);
                    }
                }
                throw error;
            }
        }

        // Auto-seleção: prioriza Azure DALL-E com fallback para Gemini
        if (this.azureConfig) {
            try {
                return await this.generateWithAzureDalle(prompt);
            } catch (error) {
                if (error instanceof Error && error.message === 'CONTENT_POLICY_VIOLATION' && this.geminiClient) {
                    console.warn('[ImageService] Fallback automático para Gemini...');
                    return this.generateWithGemini(prompt);
                }
                throw error;
            }
        }

        if (this.geminiClient) {
            return this.generateWithGemini(prompt);
        }

        throw new Error('Nenhum provedor de imagem configurado');
    }

    /**
     * Obtém a imagem em Base64
     */
    async getImageAsBase64(imageUrl: string): Promise<string> {
        if (imageUrl.startsWith('/temp/')) {
            // Arquivo local
            const filepath = path.join(this.tempDir, path.basename(imageUrl));
            const buffer = fs.readFileSync(filepath);
            return buffer.toString('base64');
        }

        // URL externa
        const response = await fetch(imageUrl);
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer).toString('base64');
    }

    /**
     * Lista provedores disponíveis
     */
    getAvailableProviders(): string[] {
        const providers: string[] = [];
        if (this.azureConfig) providers.push('azure-dalle');
        if (this.geminiClient) providers.push('gemini');
        return providers;
    }

    /**
     * Lista modelos disponíveis no Google AI (Debug)
     */
    async listAvailableModels() {
        if (!process.env.GEMINI_API_KEY) {
            return { error: 'Gemini API key not configured' };
        }
        try {
            const apiKey = process.env.GEMINI_API_KEY;

            // Usar fetch global (Node 18+)
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
            if (!response.ok) {
                return {
                    error: `API returned ${response.status} ${response.statusText}`,
                    details: await response.text()
                };
            }
            const data = await response.json();
            return data;
        } catch (error: any) {
            return { error: error.message, stack: error.stack };
        }
    }
}

// Singleton
let imageServiceInstance: ImageService | null = null;

export function getImageService(): ImageService {
    if (!imageServiceInstance) {
        imageServiceInstance = new ImageService();
    }
    return imageServiceInstance;
}
