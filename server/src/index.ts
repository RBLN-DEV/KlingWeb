// IMPORTANTE: carregar variáveis de ambiente ANTES de qualquer outro import
// Em ESM, imports são hoisted, então dotenv.config() precisa estar em um módulo separado
import './env.js';

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import videoRoutes from './routes/video.routes.js';
import imageRoutes from './routes/image.routes.js';
import accountRoutes from './routes/account.routes.js';
import authRoutes from './routes/auth.routes.js';
import adminRoutes from './routes/admin.routes.js';
import socialRoutes from './routes/social.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import instagramBotRoutes from './routes/instagram-bot.routes.js';
import decodoProxyRoutes from './routes/decodo-proxy.routes.js';
import { ensureDefaultAdmin, initUserStore } from './services/user.store.js';
import { initTokenStore } from './services/social-token.store.js';
import { socialQueue } from './services/social-queue.service.js';
import { registerPublishHandler } from './services/social-publish.handler.js';
import { engagementService } from './services/engagement.service.js';
import { isTableStorageAvailable, initializeAllTables } from './services/database/table-storage.service.js';
import { initPublicationsStore } from './routes/social-publish.routes.js';
import { initVideoTasksStore } from './routes/video.routes.js';
import { initProxyFromDb } from './routes/settings.routes.js';

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

// Servir arquivos temporários (imagens geradas) — path persistente em produção
function getTempUploadsDir(): string {
    if (process.env.NODE_ENV === 'production') {
        try {
            const homeDir = '/home/temp_uploads';
            fs.mkdirSync(homeDir, { recursive: true });
            fs.accessSync(homeDir, fs.constants.W_OK);
            return homeDir;
        } catch {
            const appDir = '/app/temp_uploads';
            fs.mkdirSync(appDir, { recursive: true });
            return appDir;
        }
    }
    return path.join(process.cwd(), 'temp_uploads');
}
const TEMP_UPLOADS_DIR = getTempUploadsDir();
if (!fs.existsSync(TEMP_UPLOADS_DIR)) {
    fs.mkdirSync(TEMP_UPLOADS_DIR, { recursive: true });
}
app.use('/temp', express.static(TEMP_UPLOADS_DIR));

// Rotas da API
app.use('/api/video', videoRoutes);
app.use('/api/image', imageRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/instagram-bot', instagramBotRoutes);
app.use('/api/decodo', decodoProxyRoutes);

// Garantir admin padrão
ensureDefaultAdmin();

// ── Inicialização do Banco de Dados (Azure Table Storage) ──────────────────
async function initializeDatabase(): Promise<void> {
    if (isTableStorageAvailable()) {
        console.log('[Server] 🗄️  Azure Table Storage detectado — inicializando banco de dados...');
        try {
            await initializeAllTables();
            // Migrar dados de JSON → Table Storage (em paralelo)
            await Promise.all([
                initUserStore(),
                initTokenStore(),
                initPublicationsStore(),
                socialQueue.initFromDb(),
                engagementService.initFromDb(),
                initVideoTasksStore(),
                initProxyFromDb(),
            ]);
            console.log('[Server] ✅ Banco de dados inicializado — todos os dados persistentes no Azure Table Storage');
        } catch (error: any) {
            console.error('[Server] ⚠️  Erro ao inicializar Table Storage (usando fallback JSON):', error.message);
        }
    } else {
        console.log('[Server] 📁 Sem Table Storage configurado — usando persistência em JSON');
        await initUserStore();
    }
}

// Inicializar DB e depois iniciar fila e serviços
initializeDatabase().then(() => {
    // Iniciar fila de processamento social
    registerPublishHandler();
    socialQueue.start();

    // Iniciar serviço de coleta de métricas de engajamento
    engagementService.start();
}).catch(err => {
    console.error('[Server] Erro fatal na inicialização:', err);
    // Iniciar mesmo assim com fallback
    registerPublishHandler();
    socialQueue.start();
    engagementService.start();
});

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.2.0',
        database: isTableStorageAvailable() ? 'Azure Table Storage' : 'JSON (fallback)',
        services: {
            kling: !!process.env.KLING_ACCESS_KEY,
            gemini: !!process.env.GEMINI_API_KEY,
            azureDalle: !!process.env.AZURE_DALLE_KEY,
            instagram: !!process.env.META_APP_ID,
            twitter: !!process.env.TWITTER_CLIENT_ID,
            tableStorage: isTableStorageAvailable(),
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

    // ── Warnings de configuração ───────────────────────────────────
    if (!process.env.SOCIAL_ENCRYPTION_KEY) {
        console.warn('[Server] ⚠️  SOCIAL_ENCRYPTION_KEY não definida! Usando chave derivada do SESSION_SECRET.');
        console.warn('[Server]    Se o SESSION_SECRET mudar, tokens OAuth existentes ficarão ilegíveis.');
        console.warn('[Server]    Defina SOCIAL_ENCRYPTION_KEY=<64 chars hex> para persistência segura.');
    }
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'klingai_session_secret_2025') {
        console.warn('[Server] ⚠️  SESSION_SECRET está usando valor padrão! Defina um valor seguro em produção.');
    }
    if (process.env.HTTPS_PROXY || process.env.INSTAGRAM_PROXY) {
        const proxyUrl = process.env.HTTPS_PROXY || process.env.INSTAGRAM_PROXY;
        console.log(`[Server] 🌐 Proxy configurado: ${proxyUrl?.replace(/\/\/([^:]+):[^@]+@/, '//***:***@')}`);
        console.log('[Server]    Se ocorrerem erros de certificado, verifique se o proxy está válido.');
    }
    if (!isTableStorageAvailable()) {
        console.warn('[Server] ⚠️  Azure Table Storage não configurado. Dados serão salvos em JSON local.');
        console.warn('[Server]    Em produção, defina AZURE_STORAGE_CONNECTION_STRING para persistência confiável.');
    }
});

export default app;
