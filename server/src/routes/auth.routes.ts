import { Router, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import {
    registerUser,
    authenticateUser,
    getUserById,
} from '../services/user.store.js';

const router = Router();

// Secret para tokens JWT de sessão (diferente do JWT da Kling API)
const JWT_SECRET = process.env.SESSION_SECRET || 'klingai_session_secret_2025';
const TOKEN_EXPIRY = '7d';

/**
 * Gera token JWT de sessão para o usuário
 */
function generateSessionToken(userId: string, role: string): string {
    return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * POST /api/auth/register
 * Registra novo usuário (status: pending — precisa aprovação do admin)
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        res.status(400).json({ success: false, error: 'Nome, email e senha são obrigatórios' });
        return;
    }

    if (password.length < 6) {
        res.status(400).json({ success: false, error: 'A senha deve ter pelo menos 6 caracteres' });
        return;
    }

    try {
        const user = registerUser(name, email, password);
        const token = generateSessionToken(user.id, user.role);

        res.status(201).json({
            success: true,
            data: { user, token },
            message: 'Conta criada com sucesso. Aguarde a aprovação de um administrador.',
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao registrar';
        res.status(400).json({ success: false, error: msg });
    }
}));

/**
 * POST /api/auth/login
 * Login do usuário
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body;

    if (!email || !password) {
        res.status(400).json({ success: false, error: 'Email e senha são obrigatórios' });
        return;
    }

    try {
        const user = authenticateUser(email, password);
        const token = generateSessionToken(user.id, user.role);

        res.json({
            success: true,
            data: { user, token },
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro no login';
        res.status(401).json({ success: false, error: msg });
    }
}));

/**
 * GET /api/auth/me
 * Obtém dados do usuário autenticado
 */
router.get('/me', asyncHandler(async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Token não fornecido' });
        return;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        const user = getUserById(decoded.userId);

        if (!user) {
            res.status(404).json({ success: false, error: 'Usuário não encontrado' });
            return;
        }

        res.json({ success: true, data: user });
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }
}));

export default router;
export { JWT_SECRET };
