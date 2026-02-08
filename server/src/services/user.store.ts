import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, ensureDataDir, writeFileAtomic } from './data-dir.js';

export interface StoredUser {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    role: 'admin' | 'user';
    status: 'pending' | 'approved' | 'rejected';
    createdAt: string;
    updatedAt: string;
    approvedBy?: string;
    rejectedReason?: string;
}

export type PublicUser = Omit<StoredUser, 'passwordHash'>;

const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Admin padrão — criado automaticamente se nenhum admin existir
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@klingai.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2025';

function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password + 'klingai_salt_2025').digest('hex');
}

function readUsers(): StoredUser[] {
    ensureDataDir();
    if (!fs.existsSync(USERS_FILE)) {
        return [];
    }
    try {
        const data = fs.readFileSync(USERS_FILE, 'utf-8');
        return JSON.parse(data);
    } catch {
        return [];
    }
}

function writeUsers(users: StoredUser[]): void {
    ensureDataDir();
    writeFileAtomic(USERS_FILE, JSON.stringify(users, null, 2));
}

function toPublicUser(user: StoredUser): PublicUser {
    const { passwordHash: _, ...publicUser } = user;
    return publicUser;
}

/**
 * Garante que existe pelo menos um admin no sistema
 */
export function ensureDefaultAdmin(): void {
    const users = readUsers();
    const hasAdmin = users.some(u => u.role === 'admin');

    if (!hasAdmin) {
        const now = new Date().toISOString();
        const admin: StoredUser = {
            id: crypto.randomUUID(),
            name: 'Administrador',
            email: DEFAULT_ADMIN_EMAIL,
            passwordHash: hashPassword(DEFAULT_ADMIN_PASSWORD),
            role: 'admin',
            status: 'approved',
            createdAt: now,
            updatedAt: now,
        };
        users.push(admin);
        writeUsers(users);
        console.log(`[UserStore] Admin padrão criado: ${DEFAULT_ADMIN_EMAIL}`);
    }
}

/**
 * Registra um novo usuário (status: pending)
 */
export function registerUser(name: string, email: string, password: string): PublicUser {
    const users = readUsers();

    // Verificar email duplicado
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('Este email já está cadastrado');
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
        id: crypto.randomUUID(),
        name,
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
        role: 'user',
        status: 'pending',
        createdAt: now,
        updatedAt: now,
    };

    users.push(newUser);
    writeUsers(users);

    console.log(`[UserStore] Novo usuário registrado (pendente): ${email}`);
    return toPublicUser(newUser);
}

/**
 * Autentica o usuário (login)
 */
export function authenticateUser(email: string, password: string): PublicUser {
    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
        throw new Error('Email ou senha incorretos');
    }

    if (user.passwordHash !== hashPassword(password)) {
        throw new Error('Email ou senha incorretos');
    }

    return toPublicUser(user);
}

/**
 * Obtém um usuário pelo ID
 */
export function getUserById(id: string): PublicUser | null {
    const users = readUsers();
    const user = users.find(u => u.id === id);
    return user ? toPublicUser(user) : null;
}

/**
 * Lista todos os usuários (para admin)
 */
export function getAllUsers(): PublicUser[] {
    return readUsers().map(toPublicUser);
}

/**
 * Atualiza status de um usuário (aprovar/rejeitar)
 */
export function updateUserStatus(
    userId: string,
    status: 'approved' | 'rejected',
    adminId: string,
    rejectedReason?: string
): PublicUser {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === userId);

    if (idx === -1) {
        throw new Error('Usuário não encontrado');
    }

    users[idx].status = status;
    users[idx].updatedAt = new Date().toISOString();
    users[idx].approvedBy = adminId;
    if (rejectedReason) users[idx].rejectedReason = rejectedReason;

    writeUsers(users);
    console.log(`[UserStore] Usuário ${userId} atualizado para ${status}`);
    return toPublicUser(users[idx]);
}

/**
 * Atualiza role de um usuário
 */
export function updateUserRole(userId: string, role: 'admin' | 'user'): PublicUser {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === userId);

    if (idx === -1) {
        throw new Error('Usuário não encontrado');
    }

    users[idx].role = role;
    users[idx].updatedAt = new Date().toISOString();

    writeUsers(users);
    console.log(`[UserStore] Usuário ${userId} role atualizado para ${role}`);
    return toPublicUser(users[idx]);
}

/**
 * Remove um usuário
 */
export function deleteUser(userId: string): void {
    const users = readUsers();
    const idx = users.findIndex(u => u.id === userId);

    if (idx === -1) {
        throw new Error('Usuário não encontrado');
    }

    if (users[idx].role === 'admin') {
        const adminCount = users.filter(u => u.role === 'admin').length;
        if (adminCount <= 1) {
            throw new Error('Não é possível remover o último administrador');
        }
    }

    users.splice(idx, 1);
    writeUsers(users);
    console.log(`[UserStore] Usuário ${userId} removido`);
}

/**
 * Cria um usuário diretamente (admin criando user)
 */
export function createUser(
    name: string,
    email: string,
    password: string,
    role: 'admin' | 'user' = 'user',
    status: 'pending' | 'approved' = 'approved'
): PublicUser {
    const users = readUsers();

    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error('Este email já está cadastrado');
    }

    const now = new Date().toISOString();
    const newUser: StoredUser = {
        id: crypto.randomUUID(),
        name,
        email: email.toLowerCase(),
        passwordHash: hashPassword(password),
        role,
        status,
        createdAt: now,
        updatedAt: now,
    };

    users.push(newUser);
    writeUsers(users);

    console.log(`[UserStore] Usuário criado pelo admin: ${email} (${role}, ${status})`);
    return toPublicUser(newUser);
}
