import { Router, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { v4 as uuidv4 } from 'uuid';
import { getImageService } from '../services/image.service.js';
import { ImageGenerationResponse, ApiResponse } from '../types/index.js';

const router = Router();

// Store de imagens em memória (em produção, usar Redis/DB)
const imagesStore = new Map<string, ImageGenerationResponse>();

// Initialize imageService once for all routes that need it
const imageService = getImageService();

/**
 * POST /api/image/generate
 * Gera uma nova imagem
 */
// Debug: Listar modelos disponíveis
router.get('/debug-models', asyncHandler(async (_req, res) => {
    try {
        const models = await imageService.listAvailableModels();
        res.json({ success: true, data: models });
    } catch (error: any) {
        console.error('[ImageRoute] Erro ao listar modelos:', error);
        res.status(500).json({ success: false, error: error.message });
    }
}));

router.post('/generate', asyncHandler(async (req: Request, res: Response) => {
    const { prompt, model, aspectRatio, quality } = req.body;

    if (!prompt) {
        res.status(400).json({
            success: false,
            error: 'prompt é obrigatório',
        } as ApiResponse<null>);
        return;
    }

    const imageService = getImageService();
    const id = uuidv4();

    try {
        console.log(`[ImageRoute] Gerando imagem: "${prompt.substring(0, 50)}..."`);

        const result = await imageService.generate(prompt, model);

        const image: ImageGenerationResponse = {
            id,
            prompt,
            imageUrl: result.imageUrl,
            imageBase64: result.imageBase64,
            status: 'completed',
            model: result.model,
            createdAt: new Date(),
        };

        imagesStore.set(id, image);

        console.log(`[ImageRoute] Imagem ${id} gerada com sucesso`);

        res.json({
            success: true,
            data: image,
        } as ApiResponse<ImageGenerationResponse>);
    } catch (error) {
        console.error('[ImageRoute] Erro na geração:', error);

        // Determinar mensagem de erro amigável
        let errorMessage = 'Erro desconhecido';
        let statusCode = 500;

        if (error instanceof Error) {
            if (error.message === 'CONTENT_POLICY_VIOLATION') {
                errorMessage = 'O prompt contém conteúdo que não pode ser processado pelo Azure DALL-E. Tente modificar a descrição para ser menos explícita.';
                statusCode = 400;
            } else if (error.message.includes('Nenhum provedor')) {
                errorMessage = 'Serviço de geração de imagens não está configurado no servidor.';
                statusCode = 503;
            } else {
                errorMessage = error.message;
            }
        }

        const failedImage: ImageGenerationResponse = {
            id,
            prompt,
            imageUrl: '',
            status: 'failed',
            model: model || 'unknown',
            createdAt: new Date(),
            error: errorMessage,
        };

        imagesStore.set(id, failedImage);

        res.status(statusCode).json({
            success: false,
            data: failedImage,
            error: errorMessage,
        } as ApiResponse<ImageGenerationResponse>);
    }
}));

/**
 * GET /api/image/:id
 * Obtém uma imagem específica
 */
router.get('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const image = imagesStore.get(id);

    if (!image) {
        res.status(404).json({
            success: false,
            error: 'Imagem não encontrada',
        } as ApiResponse<null>);
        return;
    }

    res.json({
        success: true,
        data: image,
    } as ApiResponse<ImageGenerationResponse>);
}));

/**
 * GET /api/image/list
 * Lista todas as imagens
 */
router.get('/', asyncHandler(async (_req: Request, res: Response) => {
    const images = Array.from(imagesStore.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
        success: true,
        data: images,
    } as ApiResponse<ImageGenerationResponse[]>);
}));

/**
 * DELETE /api/image/:id
 * Remove uma imagem
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (imagesStore.has(id)) {
        imagesStore.delete(id);
        res.json({
            success: true,
            message: 'Imagem removida',
        } as ApiResponse<null>);
    } else {
        res.status(404).json({
            success: false,
            error: 'Imagem não encontrada',
        } as ApiResponse<null>);
    }
}));

/**
 * GET /api/image/providers
 * Lista provedores disponíveis
 */
router.get('/providers/list', asyncHandler(async (_req: Request, res: Response) => {
    const imageService = getImageService();

    res.json({
        success: true,
        data: imageService.getAvailableProviders(),
    } as ApiResponse<string[]>);
}));

export default router;
