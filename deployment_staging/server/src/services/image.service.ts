import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';


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

        // Diretório para arquivos temporários
        this.tempDir = path.join(process.cwd(), 'temp_uploads');
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

        // Diretório para arquivos temporários
        this.tempDir = path.join(process.cwd(), 'temp_uploads');
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

        return {
            imageUrl: data.data[0].url,
            model: 'azure-dalle',
        };
    }

    /**
     * Gera imagem usando Google Gemini (SDK @google/genai)
     * Modelos suportados: gemini-2.5-flash-image, gemini-3-pro-image-preview
     */
    async generateWithGemini(prompt: string): Promise<ImageGenerationResult> {
        if (!this.geminiClient) {
            throw new Error('Gemini não configurado');
        }

        console.log('[ImageService] Gerando imagem com Gemini (novo SDK)...');

        try {
            // Usar o novo SDK @google/genai com models.generateContent
            const modelName = 'gemini-2.5-flash-preview-image-generation';
            console.log(`[ImageService] Usando modelo: ${modelName}`);

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

                            console.log('[ImageService] Imagem Gemini gerada:', filepath);

                            return {
                                imageUrl: `/temp/${filename}`,
                                imageBase64: imageData,
                                filePath: filepath,
                                model: 'gemini',
                            };
                        }
                    }
                }
            }

            throw new Error('Nenhuma imagem gerada pelo Gemini. Verifique se o modelo suporta geração de imagens.');
        } catch (error: any) {
            console.error('[ImageService] Erro Gemini:', error?.message || error);
            // Tratar erros específicos do Gemini
            if (error?.message?.includes('not found') || error?.message?.includes('404')) {
                throw new Error(`Modelo Gemini não encontrado. Verifique se o modelo está disponível para sua API key.`);
            }
            if (error?.message?.includes('SAFETY') || error?.message?.includes('safety')) {
                throw new Error('Gemini bloqueou o prompt por políticas de segurança. Tente modificar a descrição.');
            }
            throw error;
        }
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
