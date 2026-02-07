export interface ImageGenerationResult {
    imageUrl: string;
    imageBase64?: string;
    filePath?: string;
    model: string;
}
export declare class ImageService {
    private geminiClient;
    private azureConfig;
    private tempDir;
    constructor();
    private initializeClients;
    /**
     * Gera imagem usando Azure DALL-E 3
     */
    generateWithAzureDalle(prompt: string, size?: '1024x1024' | '1024x1792' | '1792x1024'): Promise<ImageGenerationResult>;
    /**
     * Gera imagem usando Google Gemini (SDK @google/genai)
     * Modelos disponíveis: gemini-2.0-flash-exp-image-generation, gemini-2.5-flash-image
     */
    generateWithGemini(prompt: string): Promise<ImageGenerationResult>;
    /**
     * Gera imagem usando o provedor disponível
     * Com fallback automático se Azure falhar por política de conteúdo
     */
    generate(prompt: string, preferredProvider?: 'gemini' | 'azure-dalle'): Promise<ImageGenerationResult>;
    /**
     * Obtém a imagem em Base64
     */
    getImageAsBase64(imageUrl: string): Promise<string>;
    /**
     * Lista provedores disponíveis
     */
    getAvailableProviders(): string[];
    /**
     * Lista modelos disponíveis no Google AI (Debug)
     */
    listAvailableModels(): Promise<any>;
}
export declare function getImageService(): ImageService;
//# sourceMappingURL=image.service.d.ts.map