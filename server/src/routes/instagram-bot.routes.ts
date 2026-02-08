// ============================================================================
// Instagram Bot Routes — API REST para todas as funcionalidades do bot
// ============================================================================

import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { JWT_SECRET } from './auth.routes.js';
import { getUserById } from '../services/user.store.js';
import { getUserTokensFull } from '../services/social-token.store.js';
import { InstagramBotService } from '../services/instagram-bot/instagram-bot.service.js';
import type { GrowthSessionType } from '../services/instagram-bot/types.js';

const router = Router();
const upload = multer({ dest: '/tmp/bot_uploads/' });

// ── Middleware de Auth ──────────────────────────────────────────────────────

function requireAuth(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Token não fornecido' });
        return;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        const user = getUserById(decoded.userId);

        if (!user || user.status !== 'approved') {
            res.status(403).json({ success: false, error: 'Acesso negado' });
            return;
        }

        (req as any).userId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido' });
    }
}

router.use(requireAuth);

// ── Helper: obter instância do bot ─────────────────────────────────────────

function getBot(req: Request): InstagramBotService {
    const userId = (req as any).userId;
    return InstagramBotService.getInstance(userId);
}

// ════════════════════════════════════════════════════════════════════════════
// STATUS & LOGIN
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/instagram-bot/status
 * Status do bot e configurações
 */
router.get('/status', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: bot.getStatus() });
}));

/**
 * POST /api/instagram-bot/login
 * Login automático usando SocialToken armazenado
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;
    const bot = getBot(req);

    try {
        await bot.autoLogin(userId);
        res.json({
            success: true,
            message: 'Bot autenticado com sucesso',
            data: bot.getStatus(),
        });
    } catch (error: any) {
        res.status(400).json({
            success: false,
            error: error.message,
        });
    }
}));

/**
 * POST /api/instagram-bot/login-direct
 * Login com credenciais (username/password)
 */
router.post('/login-direct', asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    if (!username || !password) {
        res.status(400).json({ success: false, error: 'username e password são obrigatórios' });
        return;
    }

    const bot = getBot(req);

    try {
        await bot.loginDirect(username, password);
        res.json({
            success: true,
            message: `Bot autenticado como @${username}`,
            data: bot.getStatus(),
        });
    } catch (error: any) {
        res.status(400).json({ success: false, error: error.message });
    }
}));

// ════════════════════════════════════════════════════════════════════════════
// CONFIG
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/instagram-bot/config
 * Retorna configuração atual
 */
router.get('/config', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: bot.getStatus().config });
}));

/**
 * PUT /api/instagram-bot/config
 * Atualiza configuração
 */
router.put('/config', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    bot.updateConfig(req.body);
    res.json({ success: true, data: bot.getStatus().config, message: 'Configuração atualizada' });
}));

// ════════════════════════════════════════════════════════════════════════════
// AÇÕES BÁSICAS
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/instagram-bot/like
 * Curtir um post
 */
router.post('/like', asyncHandler(async (req: Request, res: Response) => {
    const { mediaId } = req.body;
    if (!mediaId) {
        res.status(400).json({ success: false, error: 'mediaId é obrigatório' });
        return;
    }

    const bot = getBot(req);
    const ok = await bot.likePost(mediaId);
    res.json({ success: ok, message: ok ? 'Post curtido' : 'Falha ao curtir (rate limit ou erro)' });
}));

/**
 * POST /api/instagram-bot/comment
 * Comentar em um post
 */
router.post('/comment', asyncHandler(async (req: Request, res: Response) => {
    const { mediaId, text } = req.body;
    if (!mediaId || !text) {
        res.status(400).json({ success: false, error: 'mediaId e text são obrigatórios' });
        return;
    }

    const bot = getBot(req);
    const ok = await bot.commentPost(mediaId, text);
    res.json({ success: ok, message: ok ? 'Comentário enviado' : 'Falha ao comentar' });
}));

/**
 * POST /api/instagram-bot/follow
 * Seguir um usuário por username
 */
router.post('/follow', asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.body;
    if (!username) {
        res.status(400).json({ success: false, error: 'username é obrigatório' });
        return;
    }

    const bot = getBot(req);
    const ok = await bot.followUserByUsername(username);
    res.json({ success: ok, message: ok ? `Seguindo @${username}` : 'Falha ao seguir' });
}));

/**
 * POST /api/instagram-bot/unfollow
 * Unfollow por username
 */
router.post('/unfollow', asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.body;
    if (!username) {
        res.status(400).json({ success: false, error: 'username é obrigatório' });
        return;
    }

    const bot = getBot(req);
    const ok = await bot.unfollowUserByUsername(username);
    res.json({ success: ok, message: ok ? `Unfollow @${username}` : 'Falha ao unfollow' });
}));

/**
 * GET /api/instagram-bot/user/:username
 * Informações de um perfil
 */
router.get('/user/:username', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    const info = await bot.getUserInfo(req.params.username as string);
    if (!info) {
        res.status(404).json({ success: false, error: 'Usuário não encontrado' });
        return;
    }
    res.json({ success: true, data: info });
}));

/**
 * GET /api/instagram-bot/me
 * Informações do perfil autenticado
 */
router.get('/me', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    const info = await bot.getMyInfo();
    if (!info) {
        res.status(404).json({ success: false, error: 'Não autenticado' });
        return;
    }
    res.json({ success: true, data: info });
}));

// ════════════════════════════════════════════════════════════════════════════
// UPLOADS (foto/vídeo/story/reel)
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/instagram-bot/upload/photo
 * Upload de foto para o feed
 */
router.post('/upload/photo', upload.single('media'), asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ success: false, error: 'Arquivo (media) é obrigatório' });
        return;
    }

    const caption = req.body.caption || '';
    const bot = getBot(req);

    try {
        const buffer = fs.readFileSync(file.path);
        const result = await bot.uploadPhoto(buffer, caption);
        fs.unlinkSync(file.path);

        res.json({ success: result.success, data: result });
    } catch (error: any) {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/instagram-bot/upload/video
 * Upload de vídeo para o feed
 */
router.post('/upload/video', upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
]), asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const videoFile = files?.media?.[0];
    if (!videoFile) {
        res.status(400).json({ success: false, error: 'Arquivo de vídeo (media) é obrigatório' });
        return;
    }

    const caption = req.body.caption || '';
    const bot = getBot(req);

    try {
        const videoBuffer = fs.readFileSync(videoFile.path);
        const coverBuffer = files?.cover?.[0]
            ? fs.readFileSync(files.cover[0].path)
            : undefined;

        const result = await bot.uploadVideo(videoBuffer, caption, coverBuffer);

        // Limpar arquivos temp
        fs.unlinkSync(videoFile.path);
        if (files?.cover?.[0]?.path) fs.unlinkSync(files.cover[0].path);

        res.json({ success: result.success, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/instagram-bot/upload/story
 * Upload de foto para os Stories
 */
router.post('/upload/story', upload.single('media'), asyncHandler(async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
        res.status(400).json({ success: false, error: 'Arquivo (media) é obrigatório' });
        return;
    }

    const bot = getBot(req);

    try {
        const buffer = fs.readFileSync(file.path);
        const isVideo = file.mimetype?.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.originalname);

        const result = isVideo
            ? await bot.uploadStoryVideo(buffer)
            : await bot.uploadStoryPhoto(buffer);
        fs.unlinkSync(file.path);

        res.json({ success: result.success, data: result });
    } catch (error: any) {
        if (file.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
        res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/instagram-bot/upload/reel
 * Upload de Reel
 */
router.post('/upload/reel', upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
]), asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const videoFile = files?.media?.[0];
    if (!videoFile) {
        res.status(400).json({ success: false, error: 'Arquivo de vídeo (media) é obrigatório' });
        return;
    }

    const caption = req.body.caption || '';
    const bot = getBot(req);

    try {
        const videoBuffer = fs.readFileSync(videoFile.path);
        const coverBuffer = files?.cover?.[0]
            ? fs.readFileSync(files.cover[0].path)
            : undefined;

        const result = await bot.uploadReel(videoBuffer, caption, coverBuffer);

        fs.unlinkSync(videoFile.path);
        if (files?.cover?.[0]?.path) fs.unlinkSync(files.cover[0].path);

        res.json({ success: result.success, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
}));

// ════════════════════════════════════════════════════════════════════════════
// GROWTH ENGINE
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/instagram-bot/growth/session
 * Executar sessão de crescimento completa
 */
router.post('/growth/session', asyncHandler(async (req: Request, res: Response) => {
    const { type = 'balanced' } = req.body;

    if (!['aggressive', 'balanced', 'safe'].includes(type)) {
        res.status(400).json({ success: false, error: 'type deve ser: aggressive, balanced ou safe' });
        return;
    }

    const bot = getBot(req);

    try {
        const results = await bot.runGrowthSession(type as GrowthSessionType);
        res.json({ success: true, data: results, message: `Sessão ${type} concluída` });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/instagram-bot/growth/abort
 * Abortar sessão em andamento
 */
router.post('/growth/abort', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    bot.abortGrowthSession();
    res.json({ success: true, message: 'Sessão abortada' });
}));

/**
 * POST /api/instagram-bot/growth/like-hashtag
 * Curtir posts de uma hashtag
 */
router.post('/growth/like-hashtag', asyncHandler(async (req: Request, res: Response) => {
    const { hashtag, maxLikes = 30 } = req.body;
    if (!hashtag) {
        res.status(400).json({ success: false, error: 'hashtag é obrigatório' });
        return;
    }

    const bot = getBot(req);
    const result = await bot.growthEngine.likeByHashtag(hashtag, maxLikes);
    res.json({ success: true, data: result });
}));

/**
 * POST /api/instagram-bot/growth/comments
 * Comentários estratégicos
 */
router.post('/growth/comments', asyncHandler(async (req: Request, res: Response) => {
    const { maxComments = 10 } = req.body;
    const bot = getBot(req);
    const result = await bot.growthEngine.strategicCommenting(maxComments);
    res.json({ success: true, data: result });
}));

/**
 * POST /api/instagram-bot/growth/follow-hashtags
 * Follow usuários de hashtags
 */
router.post('/growth/follow-hashtags', asyncHandler(async (req: Request, res: Response) => {
    const { maxFollows = 20 } = req.body;
    const bot = getBot(req);
    const result = await bot.growthEngine.followFromHashtags(maxFollows);
    res.json({ success: true, data: result });
}));

/**
 * GET /api/instagram-bot/growth/stats
 * Estatísticas de crescimento (hoje e semanal)
 */
router.get('/growth/stats', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({
        success: true,
        data: {
            today: bot.growthEngine.getTodayReport(),
            weekly: bot.growthEngine.getWeeklyReport(),
        },
    });
}));

/**
 * GET /api/instagram-bot/growth/targets
 * Alvos de crescimento (influenciadores, concorrentes, hashtags)
 */
router.get('/growth/targets', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: bot.growthEngine.getTargets() });
}));

/**
 * PUT /api/instagram-bot/growth/targets
 * Atualizar alvos de crescimento
 */
router.put('/growth/targets', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    bot.growthEngine.updateTargets(req.body);
    res.json({ success: true, data: bot.growthEngine.getTargets(), message: 'Alvos atualizados' });
}));

/**
 * POST /api/instagram-bot/growth/add-influencer
 * Adicionar influenciador alvo
 */
router.post('/growth/add-influencer', asyncHandler(async (req: Request, res: Response) => {
    const { username, niche } = req.body;
    if (!username) {
        res.status(400).json({ success: false, error: 'username é obrigatório' });
        return;
    }

    const bot = getBot(req);
    bot.growthEngine.addInfluencer(username, niche || '');
    res.json({ success: true, message: `@${username} adicionado como influenciador alvo` });
}));

// ════════════════════════════════════════════════════════════════════════════
// FOLLOWERS MANAGER
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/instagram-bot/followers/stats
 * Estatísticas de seguidores
 */
router.get('/followers/stats', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: bot.followersManager.getStats() });
}));

/**
 * POST /api/instagram-bot/followers/clean
 * Limpar não-seguidores (unfollow em massa)
 */
router.post('/followers/clean', asyncHandler(async (req: Request, res: Response) => {
    const { maxUnfollows = 50, daysBefore = 2 } = req.body;
    const bot = getBot(req);
    const count = await bot.followersManager.cleanNonFollowers(maxUnfollows, daysBefore);
    res.json({ success: true, data: { unfollowed: count }, message: `${count} unfollows realizados` });
}));

/**
 * GET /api/instagram-bot/followers/whitelist
 * Listar whitelist
 */
router.get('/followers/whitelist', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: [...bot.followersManager.whitelist] });
}));

/**
 * POST /api/instagram-bot/followers/whitelist
 * Adicionar à whitelist
 */
router.post('/followers/whitelist', asyncHandler(async (req: Request, res: Response) => {
    const { username } = req.body;
    if (!username) {
        res.status(400).json({ success: false, error: 'username é obrigatório' });
        return;
    }

    const bot = getBot(req);
    bot.followersManager.addToWhitelist(username);
    res.json({ success: true, message: `@${username} adicionado à whitelist` });
}));

/**
 * DELETE /api/instagram-bot/followers/whitelist/:username
 * Remover da whitelist
 */
router.delete('/followers/whitelist/:username', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    bot.followersManager.removeFromWhitelist(req.params.username as string);
    res.json({ success: true, message: `@${req.params.username} removido da whitelist` });
}));

// ════════════════════════════════════════════════════════════════════════════
// CONTENT SCHEDULER
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/instagram-bot/scheduler/posts
 * Listar posts agendados
 */
router.get('/scheduler/posts', asyncHandler(async (req: Request, res: Response) => {
    const { all } = req.query;
    const bot = getBot(req);
    const posts = all === 'true' ? bot.contentScheduler.listAll() : bot.contentScheduler.listScheduled();
    res.json({ success: true, data: posts });
}));

/**
 * POST /api/instagram-bot/scheduler/schedule
 * Agendar um post
 */
router.post('/scheduler/schedule', asyncHandler(async (req: Request, res: Response) => {
    const { mediaPath, caption, hashtags, scheduledTime, contentType } = req.body;
    if (!mediaPath) {
        res.status(400).json({ success: false, error: 'mediaPath é obrigatório' });
        return;
    }

    const bot = getBot(req);
    const id = bot.contentScheduler.schedulePost({
        mediaPath,
        caption,
        hashtags,
        scheduledTime,
        contentType,
    });

    res.json({ success: true, data: { postId: id }, message: 'Post agendado' });
}));

/**
 * DELETE /api/instagram-bot/scheduler/posts/:id
 * Cancelar post agendado
 */
router.delete('/scheduler/posts/:id', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    const ok = bot.contentScheduler.cancelPost(req.params.id as string);
    if (!ok) {
        res.status(404).json({ success: false, error: 'Post não encontrado ou já publicado' });
        return;
    }
    res.json({ success: true, message: 'Post cancelado' });
}));

/**
 * POST /api/instagram-bot/scheduler/daemon/start
 * Iniciar daemon de auto-postagem
 */
router.post('/scheduler/daemon/start', asyncHandler(async (req: Request, res: Response) => {
    const { intervalMs = 300000 } = req.body;
    const bot = getBot(req);
    bot.contentScheduler.startDaemon(intervalMs);
    res.json({ success: true, message: 'Daemon de auto-postagem iniciado' });
}));

/**
 * POST /api/instagram-bot/scheduler/daemon/stop
 * Parar daemon
 */
router.post('/scheduler/daemon/stop', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    bot.contentScheduler.stopDaemon();
    res.json({ success: true, message: 'Daemon parado' });
}));

/**
 * GET /api/instagram-bot/scheduler/daemon/status
 * Status do daemon
 */
router.get('/scheduler/daemon/status', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: { running: bot.contentScheduler.isDaemonRunning() } });
}));

/**
 * POST /api/instagram-bot/scheduler/generate-caption
 * Gerar caption automática
 */
router.post('/scheduler/generate-caption', asyncHandler(async (req: Request, res: Response) => {
    const { topic = 'engajamento', style = 'engagement' } = req.body;
    const bot = getBot(req);
    const caption = bot.contentScheduler.generateCaption(topic, style);
    res.json({ success: true, data: { caption } });
}));

// ════════════════════════════════════════════════════════════════════════════
// ANALYTICS ENGINE
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/instagram-bot/analytics/report
 * Relatório completo de analytics
 */
router.get('/analytics/report', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: bot.analyticsEngine.generateReport() });
}));

/**
 * GET /api/instagram-bot/analytics/best-times
 * Melhores horários para postar
 */
router.get('/analytics/best-times', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    res.json({ success: true, data: bot.analyticsEngine.exportBestTimes() });
}));

/**
 * GET /api/instagram-bot/analytics/optimal-schedule
 * Agenda ótima para posts
 */
router.get('/analytics/optimal-schedule', asyncHandler(async (req: Request, res: Response) => {
    const postsPerDay = parseInt(req.query.postsPerDay as string, 10) || 2;
    const bot = getBot(req);
    res.json({ success: true, data: bot.analyticsEngine.getOptimalSchedule(postsPerDay) });
}));

/**
 * POST /api/instagram-bot/analytics/analyze-performance
 * Analisar performance dos posts recentes
 */
router.post('/analytics/analyze-performance', asyncHandler(async (req: Request, res: Response) => {
    const { numPosts = 9 } = req.body;
    const bot = getBot(req);
    const data = await bot.analyticsEngine.analyzePostPerformance(numPosts);
    res.json({ success: true, data });
}));

/**
 * GET /api/instagram-bot/analytics/activity
 * Atividade de seguidores (estimativa)
 */
router.get('/analytics/activity', asyncHandler(async (req: Request, res: Response) => {
    const bot = getBot(req);
    const activity = bot.analyticsEngine.analyzeFollowerActivity();
    res.json({ success: true, data: activity });
}));

// ════════════════════════════════════════════════════════════════════════════
// PUBLICAÇÃO INTEGRADA (URL → Instagram)
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/instagram-bot/publish
 * Publicar mídia a partir de URL (integração com Gallery/VideoGeneration)
 * Body: { mediaUrl, caption, destination: 'feed'|'story'|'reel', mediaType?: 'image'|'video' }
 */
router.post('/publish', asyncHandler(async (req: Request, res: Response) => {
    const { mediaUrl, caption, destination, mediaType } = req.body;

    if (!mediaUrl) {
        res.status(400).json({ success: false, error: 'mediaUrl é obrigatório' });
        return;
    }
    if (!destination || !['feed', 'story', 'reel'].includes(destination)) {
        res.status(400).json({ success: false, error: 'destination deve ser feed, story ou reel' });
        return;
    }

    const userId = (req as any).userId;
    const bot = getBot(req);

    // Auto-login se não estiver logado
    if (!bot.getStatus().isLoggedIn) {
        try {
            console.log('[Publish] Bot não logado, executando auto-login...');
            await bot.autoLogin(userId);
            console.log('[Publish] Auto-login OK');
        } catch (loginErr: any) {
            res.status(401).json({
                success: false,
                error: `Conta Instagram não conectada. Vá em Social Hub e conecte sua conta. (${loginErr.message})`,
                needsLogin: true,
            });
            return;
        }
    }

    try {
        const result = await bot.publishFromUrl({
            mediaUrl,
            caption: caption || '',
            destination: destination as 'feed' | 'story' | 'reel',
            mediaType: mediaType as 'image' | 'video' | undefined,
        });
        res.json(result);
    } catch (error: any) {
        console.error('[InstagramBot] Publish from URL error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
}));

/**
 * POST /api/instagram-bot/publish/batch
 * Publicar múltiplas mídias em sequência
 * Body: { items: [{ mediaUrl, caption, destination, mediaType }] }
 */
router.post('/publish/batch', asyncHandler(async (req: Request, res: Response) => {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ success: false, error: 'items array é obrigatório' });
        return;
    }

    if (items.length > 10) {
        res.status(400).json({ success: false, error: 'Máximo de 10 itens por batch' });
        return;
    }

    const userId = (req as any).userId;
    const bot = getBot(req);

    // Auto-login se não estiver logado
    if (!bot.getStatus().isLoggedIn) {
        try {
            await bot.autoLogin(userId);
        } catch (loginErr: any) {
            res.status(401).json({
                success: false,
                error: `Conta Instagram não conectada. Vá em Social Hub e conecte sua conta. (${loginErr.message})`,
                needsLogin: true,
            });
            return;
        }
    }

    const results: any[] = [];

    for (const item of items) {
        try {
            // Delay entre publicações para evitar rate limiting
            if (results.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 30000)); // 30s entre posts
            }

            const result = await bot.publishFromUrl({
                mediaUrl: item.mediaUrl,
                caption: item.caption || '',
                destination: item.destination || 'feed',
                mediaType: item.mediaType,
            });
            results.push({ ...result, mediaUrl: item.mediaUrl });
        } catch (error: any) {
            results.push({ success: false, error: error.message, mediaUrl: item.mediaUrl });
        }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
        success: successCount > 0,
        data: {
            total: items.length,
            successful: successCount,
            failed: items.length - successCount,
            results,
        },
    });
}));

export default router;
