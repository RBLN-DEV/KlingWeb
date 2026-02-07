import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import { v4 as uuidv4 } from 'uuid';
import { getKlingService } from '../services/kling.service.js';
const router = Router();
// Store de tarefas em memória (em produção, usar Redis/DB)
const tasksStore = new Map();
/**
 * POST /api/video/generate
 * Inicia geração de vídeo
 */
router.post('/generate', asyncHandler(async (req, res) => {
    const { imageUrl, imageBase64, referenceVideoUrl, prompt, negativePrompt, config, title } = req.body;
    if (!imageUrl && !imageBase64) {
        res.status(400).json({
            success: false,
            error: 'imageUrl ou imageBase64 é obrigatório',
        });
        return;
    }
    if (!title) {
        res.status(400).json({
            success: false,
            error: 'title é obrigatório',
        });
        return;
    }
    const id = uuidv4();
    const now = new Date();
    // Criar registro inicial
    const task = {
        id,
        taskId: '',
        title,
        status: 'pending',
        progress: 0,
        statusMessage: 'Iniciando geração...',
        thumbnailUrl: imageUrl || (imageBase64 ? `data:image/png;base64,${imageBase64.substring(0, 100)}...` : undefined),
        createdAt: now,
        updatedAt: now,
    };
    tasksStore.set(id, task);
    // Iniciar geração em background
    const klingService = getKlingService();
    const imageInput = imageBase64 || imageUrl;
    // Processar em background
    (async () => {
        try {
            task.status = 'processing';
            task.statusMessage = 'Enviando para Kling API...';
            task.updatedAt = new Date();
            const videoUrl = await klingService.generateVideo(imageInput, {
                referenceVideoUrl,
                prompt,
                negativePrompt,
                config,
            }, (status, progress) => {
                task.progress = progress;
                task.statusMessage = status === 'processing'
                    ? `Processando... ${progress}%`
                    : status;
                task.updatedAt = new Date();
            });
            task.status = 'completed';
            task.progress = 100;
            task.statusMessage = 'Vídeo gerado com sucesso!';
            task.videoUrl = videoUrl;
            task.updatedAt = new Date();
            console.log(`[VideoRoute] Tarefa ${id} concluída: ${videoUrl}`);
        }
        catch (error) {
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : 'Erro desconhecido';
            task.statusMessage = 'Falha na geração';
            task.updatedAt = new Date();
            console.error(`[VideoRoute] Tarefa ${id} falhou:`, error);
        }
    })();
    // Retornar imediatamente com ID para polling
    res.status(202).json({
        success: true,
        data: task,
        message: 'Geração iniciada. Use GET /api/video/status/:id para acompanhar.',
    });
}));
/**
 * GET /api/video/status/:id
 * Obtém status de uma geração
 */
router.get('/status/:id', asyncHandler(async (req, res) => {
    const id = req.params.id;
    const task = tasksStore.get(id);
    if (!task) {
        res.status(404).json({
            success: false,
            error: 'Tarefa não encontrada',
        });
        return;
    }
    res.json({
        success: true,
        data: task,
    });
}));
/**
 * GET /api/video/list
 * Lista todas as gerações
 */
router.get('/list', asyncHandler(async (_req, res) => {
    const tasks = Array.from(tasksStore.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({
        success: true,
        data: tasks,
    });
}));
/**
 * DELETE /api/video/:id
 * Remove uma geração
 */
router.delete('/:id', asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (tasksStore.has(id)) {
        tasksStore.delete(id);
        res.json({
            success: true,
            message: 'Tarefa removida',
        });
    }
    else {
        res.status(404).json({
            success: false,
            error: 'Tarefa não encontrada',
        });
    }
}));
export default router;
//# sourceMappingURL=video.routes.js.map