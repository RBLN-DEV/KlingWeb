import { Router, Request, Response, NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
import {
    getAllUsers,
    updateUserStatus,
    updateUserRole,
    deleteUser,
    createUser,
    getUserById,
} from '../services/user.store.js';
import { JWT_SECRET } from './auth.routes.js';

const router = Router();

/**
 * Middleware: verifica se é admin autenticado
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
        res.status(401).json({ success: false, error: 'Token não fornecido' });
        return;
    }

    try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };

        // Verificar no banco se ainda é admin
        const user = getUserById(decoded.userId);
        if (!user) {
            res.status(401).json({ success: false, error: 'Sessão expirada. Faça login novamente.', code: 'SESSION_EXPIRED' });
            return;
        }
        if (user.role !== 'admin') {
            res.status(403).json({ success: false, error: 'Acesso negado. Requer permissão de administrador.' });
            return;
        }

        // Guardar o userId no request para uso nas rotas
        (req as any).adminId = decoded.userId;
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Token inválido ou expirado' });
    }
}

// Aplicar middleware em todas as rotas deste router
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * Lista todos os usuários
 */
router.get('/users', asyncHandler(async (_req: Request, res: Response) => {
    const users = getAllUsers();
    res.json({ success: true, data: users });
}));

/**
 * POST /api/admin/users
 * Cria um novo usuário (admin cria diretamente, já aprovado)
 */
router.post('/users', asyncHandler(async (req: Request, res: Response) => {
    const { name, email, password, role = 'user' } = req.body;

    if (!name || !email || !password) {
        res.status(400).json({ success: false, error: 'Nome, email e senha são obrigatórios' });
        return;
    }

    try {
        const user = createUser(name, email, password, role, 'approved');
        res.status(201).json({
            success: true,
            data: user,
            message: 'Usuário criado com sucesso',
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao criar usuário';
        res.status(400).json({ success: false, error: msg });
    }
}));

/**
 * PATCH /api/admin/users/:id/status
 * Aprovar ou rejeitar um usuário
 */
router.patch('/users/:id/status', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { status, rejectedReason } = req.body;
    const adminId = (req as any).adminId;

    if (!status || !['approved', 'rejected'].includes(status)) {
        res.status(400).json({ success: false, error: 'Status deve ser "approved" ou "rejected"' });
        return;
    }

    try {
        const user = updateUserStatus(id, status, adminId, rejectedReason);
        res.json({
            success: true,
            data: user,
            message: `Usuário ${status === 'approved' ? 'aprovado' : 'rejeitado'} com sucesso`,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao atualizar status';
        res.status(400).json({ success: false, error: msg });
    }
}));

/**
 * PATCH /api/admin/users/:id/role
 * Alterar role do usuário (user ↔ admin)
 */
router.patch('/users/:id/role', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { role } = req.body;

    if (!role || !['admin', 'user'].includes(role)) {
        res.status(400).json({ success: false, error: 'Role deve ser "admin" ou "user"' });
        return;
    }

    try {
        const user = updateUserRole(id, role);
        res.json({
            success: true,
            data: user,
            message: `Role atualizado para ${role}`,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao atualizar role';
        res.status(400).json({ success: false, error: msg });
    }
}));

/**
 * DELETE /api/admin/users/:id
 * Remover um usuário
 */
router.delete('/users/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    try {
        deleteUser(id);
        res.json({
            success: true,
            message: 'Usuário removido com sucesso',
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : 'Erro ao remover usuário';
        res.status(400).json({ success: false, error: msg });
    }
}));

export default router;
