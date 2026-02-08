import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { DATA_DIR, ensureDataDir, writeFileAtomic } from './data-dir.js';
import { isTableStorageAvailable } from './database/table-storage.service.js';
import {
    dbGetAllUsers, dbGetUserById, dbGetUserByEmail,
    dbSaveUser, dbDeleteUser, dbHasAdmin, dbCountAdmins,
} from './database/user.repository.js';

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
const useDb = isTableStorageAvailable();

// Admin padrão — criado automaticamente se nenhum admin existir
const DEFAULT_ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@klingai.com';
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@2025';

function hashPassword(password: string): string {
    return crypto.createHash('sha256').update(password + 'klingai_salt_2025').digest('hex');
}

// ── JSON Fallback (dev / sem Table Storage) ────────────────────────────────

function readUsersFromFile(): StoredUser[] {
    ensureDataDir();
    if (!fs.existsSync(USERS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
    } catch { return []; }
}

function writeUsersToFile(users: StoredUser[]): void {
    ensureDataDir();
    writeFileAtomic(USERS_FILE, JSON.stringify(users, null, 2));
}

// ── Hybrid helpers (Table Storage ou JSON) ─────────────────────────────────

async function readUsersAsync(): Promise<StoredUser[]> {
    if (useDb) return dbGetAllUsers();
    return readUsersFromFile();
}

async function findUserByEmailAsync(email: string): Promise<StoredUser | null> {
    if (useDb) return dbGetUserByEmail(email);
    const users = readUsersFromFile();
    return users.find(u => u.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findUserByIdAsync(id: string): Promise<StoredUser | null> {
    if (useDb) return dbGetUserById(id);
    const users = readUsersFromFile();
    return users.find(u => u.id === id) || null;
}

async function saveUserAsync(user: StoredUser): Promise<void> {
    if (useDb) {
        await dbSaveUser(user);
        return;
    }
    const users = readUsersFromFile();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) users[idx] = user; else users.push(user);
    writeUsersToFile(users);
}

async function removeUserAsync(userId: string): Promise<void> {
    if (useDb) {
        await dbDeleteUser(userId);
        return;
    }
    const users = readUsersFromFile();
    const idx = users.findIndex(u => u.id === userId);
    if (idx >= 0) { users.splice(idx, 1); writeUsersToFile(users); }
}

function toPublicUser(user: StoredUser): PublicUser {
    const { passwordHash: _, ...publicUser } = user;
    return publicUser;
}

// ── SYNC wrappers (compatibilidade com código existente que chama sync) ────
// Todas as funções mantêm a assinatura sync mas fazem fire-and-forget DB write
// e usam cache local para leitura imediata.

// Cache local — populado no startup pela migração/init
let usersCache: StoredUser[] | null = null;

function readUsers(): StoredUser[] {
    if (usersCache) return [...usersCache];
    // Fallback sync (primeira chamada antes do init)
    const users = readUsersFromFile();
    usersCache = users;
    return [...users];
}

function writeUsers(users: StoredUser[]): void {
    usersCache = [...users];
    // Gravar no JSON (fallback/backup)
    writeUsersToFile(users);
    // Gravar no DB (async, fire-and-forget com log de erro)
    if (useDb) {
        // Upsert each user
        Promise.all(users.map(u => dbSaveUser(u))).catch(err =>
            console.error('[UserStore] Erro ao gravar no Table Storage:', err.message)
        );
    }
}

/**
 * Inicializa o store: carrega dados do DB para cache e faz migração JSON→DB
 */
export async function initUserStore(): Promise<void> {
    if (useDb) {
        try {
            const dbUsers = await dbGetAllUsers();
            if (dbUsers.length > 0) {
                usersCache = dbUsers;
                console.log(`[UserStore] ${dbUsers.length} usuários carregados do Table Storage`);
            } else {
                // Migrar JSON existente para DB
                const fileUsers = readUsersFromFile();
                if (fileUsers.length > 0) {
                    console.log(`[UserStore] Migrando ${fileUsers.length} usuários de JSON → Table Storage...`);
                    for (const u of fileUsers) await dbSaveUser(u);
                    usersCache = fileUsers;
                    console.log('[UserStore] Migração concluída.');
                } else {
                    usersCache = [];
                }
            }
        } catch (err: any) {
            console.error('[UserStore] Fallback JSON — erro no Table Storage:', err.message);
            usersCache = readUsersFromFile();
        }
    } else {
        usersCache = readUsersFromFile();
    }
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

    // Remover do DB async
    if (useDb) {
        dbDeleteUser(userId).catch(err =>
            console.error('[UserStore] Erro ao remover do Table Storage:', err.message)
        );
    }

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
