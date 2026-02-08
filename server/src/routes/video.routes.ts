import { Router, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getKlingService } from '../services/kling.service.js';
import { getStorageService } from '../services/storage.service.js';
import { VideoGenerationResponse, ApiResponse } from '../types/index.js';
import { DATA_DIR } from '../services/data-dir.js';
import { isTableStorageAvailable } from '../services/database/table-storage.service.js';
import {
    dbGetAllVideoTasks, dbGetVideoTask, dbSaveVideoTask, dbDeleteVideoTask,
    type VideoTaskRecord,
} from '../services/database/video-task.repository.js';

const router = Router();

// Configurar multer para upload de vídeos de referência
// Em produção, usar /home/temp_videos para persistência; em dev, usar CWD
const TEMP_VIDEO_DIR = process.env.NODE_ENV === 'production' && fs.existsSync('/home')
    ? '/home/temp_videos'
    : path.join(process.cwd(), 'temp_videos');
if (!fs.existsSync(TEMP_VIDEO_DIR)) {
    fs.mkdirSync(TEMP_VIDEO_DIR, { recursive: true });
}

const videoStorage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_VIDEO_DIR),
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname) || '.mp4';
        cb(null, `${uuidv4()}${ext}`);
    },
});

const uploadVideo = multer({
    storage: videoStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos de vídeo são permitidos'));
        }
    },
});

// Store de tarefas — com persistência em Table Storage + fallback in-memory
const tasksStore = new Map<string, VideoGenerationResponse>();
function useDb(): boolean {
    return isTableStorageAvailable();
}

// Persistir tarefa no DB (async, fire-and-forget)
function persistTask(task: VideoGenerationResponse): void {
    if (useDb()) {
        const record: VideoTaskRecord = {
            id: task.id,
            taskId: task.taskId || '',
            title: task.title,
            status: task.status,
            progress: task.progress,
            statusMessage: task.statusMessage || '',
            thumbnailUrl: task.thumbnailUrl,
            videoUrl: task.videoUrl,
            error: task.error,
            createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : String(task.createdAt),
            updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : String(task.updatedAt),
        };
        dbSaveVideoTask(record).catch(err =>
            console.error('[VideoRoute] Erro ao salvar task no DB:', err.message)
        );
    }
}

/**
 * Inicializa tarefas do Table Storage (carrega para o Map in-memory)
 */
export async function initVideoTasksStore(): Promise<void> {
    if (!useDb()) return;
    try {
        const tasks = await dbGetAllVideoTasks();
        for (const t of tasks) {
            tasksStore.set(t.id, {
                id: t.id,
                taskId: t.taskId,
                title: t.title,
                status: t.status as any,
                progress: t.progress,
                statusMessage: t.statusMessage,
                thumbnailUrl: t.thumbnailUrl,
                videoUrl: t.videoUrl,
                error: t.error,
                createdAt: new Date(t.createdAt),
                updatedAt: new Date(t.updatedAt),
            });
        }
        console.log(`[VideoRoute] ${tasks.length} video tasks restauradas do Table Storage`);
    } catch (err: any) {
        console.error('[VideoRoute] Erro ao restaurar tasks do DB:', err.message);
    }
}

/**
 * POST /api/video/generate
 * Inicia geração de vídeo
 */
router.post('/generate', asyncHandler(async (req: Request, res: Response) => {
    const {
        imageUrl,
        imageBase64,
        referenceVideoUrl,
        prompt,
        negativePrompt,
        config,
        title
    } = req.body;

    if (!imageUrl && !imageBase64) {
        res.status(400).json({
            success: false,
            error: 'imageUrl ou imageBase64 é obrigatório',
        } as ApiResponse<null>);
        return;
    }

    if (!title) {
        res.status(400).json({
            success: false,
            error: 'title é obrigatório',
        } as ApiResponse<null>);
        return;
    }

    console.log(`[VideoRoute] Geração solicitada:`);
    console.log(`  - title: ${title}`);
    console.log(`  - imageUrl: ${imageUrl ? imageUrl.substring(0, 80) + '...' : '(nenhum)'}`);
    console.log(`  - imageBase64: ${imageBase64 ? imageBase64.substring(0, 40) + '...' : '(nenhum)'}`);
    console.log(`  - referenceVideoUrl: ${referenceVideoUrl || '(nenhum)'}`);
    console.log(`  - config: ${JSON.stringify(config)}`);
    console.log(`  - prompt: ${prompt || '(vazio)'}`);
    console.log(`  - MODO: ${referenceVideoUrl ? 'MOTION CONTROL' : 'IMAGE-TO-VIDEO'}`);


    const id = uuidv4();
    const now = new Date();

    // Criar registro inicial
    const task: VideoGenerationResponse = {
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
            persistTask(task);

            const videoUrl = await klingService.generateVideo(
                imageInput!,
                {
                    referenceVideoUrl,
                    prompt,
                    negativePrompt,
                    config,
                },
                (status, progress) => {
                    task.progress = progress;
                    task.statusMessage = status === 'processing'
                        ? `Processando... ${progress}%`
                        : status;
                    task.updatedAt = new Date();
                }
            );

            task.status = 'completed';
            task.progress = 100;
            task.statusMessage = 'Vídeo gerado com sucesso!';
            task.videoUrl = videoUrl;
            task.updatedAt = new Date();
            persistTask(task);

            console.log(`[VideoRoute] Tarefa ${id} concluída: ${videoUrl}`);
        } catch (error) {
            task.status = 'failed';
            task.error = error instanceof Error ? error.message : 'Erro desconhecido';
            task.statusMessage = 'Falha na geração';
            task.updatedAt = new Date();
            persistTask(task);

            console.error(`[VideoRoute] Tarefa ${id} falhou:`, error);
        }
    })();

    // Retornar imediatamente com ID para polling
    res.status(202).json({
        success: true,
        data: task,
        message: 'Geração iniciada. Use GET /api/video/status/:id para acompanhar.',
    } as ApiResponse<VideoGenerationResponse>);
}));

/**
 * POST /api/video/upload
 * Upload de vídeo de referência → Azure Blob Storage (com fallback local)
 */
router.post('/upload', uploadVideo.single('video'), asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
        res.status(400).json({
            success: false,
            error: 'Nenhum arquivo de vídeo enviado',
        } as ApiResponse<null>);
        return;
    }

    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
    let videoUrl: string;
    let storage: 'blob' | 'local' = 'local';

    // Tentar usar Azure Blob Storage
    if (process.env.AZURE_STORAGE_CONNECTION_STRING) {
        try {
            const storageService = getStorageService();
            const ext = path.extname(req.file.originalname) || '.mp4';
            const blobName = `${uuidv4()}${ext}`;

            // Ler o arquivo salvo pelo multer e upload para Blob
            const fileBuffer = fs.readFileSync(req.file.path);
            videoUrl = await storageService.uploadVideo(blobName, fileBuffer, req.file.mimetype);
            storage = 'blob';

            // Remover arquivo local temporário (já está no Blob)
            fs.unlinkSync(req.file.path);

            // Limpeza assíncrona de blobs antigos
            storageService.cleanupOldBlobs(2).catch(() => {});

            console.log(`[VideoRoute] Vídeo enviado para Blob Storage: ${blobName} (${fileSizeMB}MB)`);
        } catch (error) {
            console.error('[VideoRoute] Erro no Blob Storage, usando fallback local:', error);
            // Fallback: usar arquivo local
            const protocol = req.get('x-forwarded-proto') || req.protocol;
            const host = req.get('host');
            videoUrl = `${protocol}://${host}/api/video/temp-video/${req.file.filename}`;
        }
    } else {
        // Sem Blob Storage configurado: usar arquivo local
        const protocol = req.get('x-forwarded-proto') || req.protocol;
        const host = req.get('host');
        videoUrl = `${protocol}://${host}/api/video/temp-video/${req.file.filename}`;
        console.log(`[VideoRoute] Vídeo salvo localmente: ${req.file.filename} (${fileSizeMB}MB)`);
    }

    console.log(`[VideoRoute] URL pública (${storage}): ${videoUrl}`);

    // Limpar arquivos locais antigos
    try {
        const files = fs.readdirSync(TEMP_VIDEO_DIR);
        const oneHourAgo = Date.now() - 3600000;
        for (const f of files) {
            const fp = path.join(TEMP_VIDEO_DIR, f);
            const stat = fs.statSync(fp);
            if (stat.mtimeMs < oneHourAgo) {
                fs.unlinkSync(fp);
            }
        }
    } catch (_e) { /* ignorar */ }

    res.json({
        success: true,
        data: { videoUrl, filename: req.file.filename, storage },
        message: `Vídeo de referência carregado via ${storage === 'blob' ? 'Azure Blob Storage' : 'disco local'}`,
    });
}));

/**
 * GET /api/video/temp-video/:filename
 * Serve vídeo de referência temporário
 */
router.get('/temp-video/:filename', (req: Request, res: Response) => {
    const filename = req.params.filename as string;
    // Sanitizar filename para evitar path traversal
    const safeName = path.basename(filename);
    const filePath = path.join(TEMP_VIDEO_DIR, safeName);

    if (!fs.existsSync(filePath)) {
        res.status(404).json({ success: false, error: 'Vídeo não encontrado' });
        return;
    }

    res.sendFile(filePath);
});

/**
 * GET /api/video/status/:id
 * Obtém status de uma geração
 */
router.get('/status/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const task = tasksStore.get(id);

    if (!task) {
        res.status(404).json({
            success: false,
            error: 'Tarefa não encontrada',
        } as ApiResponse<null>);
        return;
    }

    res.json({
        success: true,
        data: task,
    } as ApiResponse<VideoGenerationResponse>);
}));

/**
 * GET /api/video/list
 * Lista todas as gerações
 */
router.get('/list', asyncHandler(async (_req: Request, res: Response) => {
    const tasks = Array.from(tasksStore.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
        success: true,
        data: tasks,
    } as ApiResponse<VideoGenerationResponse[]>);
}));

/**
 * DELETE /api/video/:id
 * Remove uma geração
 */
router.delete('/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    if (tasksStore.has(id)) {
        tasksStore.delete(id);
        if (useDb()) {
            dbDeleteVideoTask(id).catch(() => {});
        }
        res.json({
            success: true,
            message: 'Tarefa removida',
        } as ApiResponse<null>);
    } else {
        res.status(404).json({
            success: false,
            error: 'Tarefa não encontrada',
        } as ApiResponse<null>);
    }
}));

export default router;
