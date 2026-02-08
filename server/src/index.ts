// IMPORTANTE: carregar variáveis de ambiente ANTES de qualquer outro import
// Em ESM, imports são hoisted, então dotenv.config() precisa estar em um módulo separado
import './env.js';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import videoRoutes from './routes/video.routes.js';
import imageRoutes from './routes/image.routes.js';
import accountRoutes from './routes/account.routes.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import socialRoutes from './routes/social.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import { ensureDefaultAdmin } from './services/user.store.js';
import { socialQueue } from './services/social-queue.service.js';
import { registerPublishHandler } from './services/social-publish.handler.js';
import { engagementService } from './services/engagement.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir arquivos temporários (imagens geradas)
app.use('/temp', express.static(path.join(process.cwd(), 'temp_uploads')));

// Rotas da API
app.use('/api/video', videoRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/settings', settingsRoutes);

// Garantir admin padrão
ensureDefaultAdmin();

// Iniciar fila de processamento social
registerPublishHandler();
socialQueue.start();

// Iniciar serviço de coleta de métricas de engajamento
engagementService.start();

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        services: {
            kling: !!process.env.KLING_ACCESS_KEY,
            gemini: !!process.env.GEMINI_API_KEY,
            azureDalle: !!process.env.AZURE_DALLE_KEY,
            instagram: !!process.env.META_APP_ID,
            twitter: !!process.env.TWITTER_CLIENT_ID,
        },
    });
});

// Informações da API
app.get('/api/info', (_req: Request, res: Response) => {
    res.json({
        name: 'Kling Video Generation API',
        version: '1.0.0',
        endpoints: {
            video: {
                'POST /api/video/generate': 'Iniciar geração de vídeo',
                'GET /api/video/status/:id': 'Obter status de geração',
                'GET /api/video/list': 'Listar todas as gerações',
                'DELETE /api/video/:id': 'Remover uma geração',
            },
            image: {
                'POST /api/image/generate': 'Gerar uma imagem',
                'GET /api/image/:id': 'Obter uma imagem',
                'GET /api/image/': 'Listar todas as imagens',
                'DELETE /api/image/:id': 'Remover uma imagem',
                'GET /api/image/providers/list': 'Listar provedores disponíveis',
            },
        },
    });
});

// Em produção, servir o frontend estático
if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, '../../dist');
    app.use(express.static(distPath));

    // SPA fallback
    app.get('*', (_req: Request, res: Response) => {
        res.sendFile(path.join(distPath, 'index.html'));
    });
}

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server] Error:', err);

    res.status(500).json({
        success: false,
        error: err.message || 'Internal Server Error',
    });
});

// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint não encontrado',
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🎬 Kling Video Generation API Server                    ║
║                                                           ║
║   Server:  http://localhost:${PORT}                          ║
║   Health:  http://localhost:${PORT}/api/health               ║
║   Info:    http://localhost:${PORT}/api/info                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

    console.log('[Server] Serviços configurados:');
    console.log(`  - Kling API: ${process.env.KLING_ACCESS_KEY ? '✅' : '❌'}`);
    console.log(`  - Gemini:    ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
    console.log(`  - Azure DALL-E: ${process.env.AZURE_DALLE_KEY ? '✅' : '❌'}`);
});

export default app;
