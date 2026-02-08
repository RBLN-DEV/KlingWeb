// ============================================================================
// Social Token Store — CRUD de tokens OAuth com persistência JSON
// ============================================================================
// Segue o mesmo padrão de user.store.ts: leitura/escrita atômica em JSON.
// Tokens sensíveis (accessToken, refreshToken) são criptografados em repouso.
// ============================================================================

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { encrypt, decrypt } from './crypto.service.js';
import type { SocialToken, PublicSocialToken, SocialProvider } from '../types/social.types.js';
import { DATA_DIR, ensureDataDir, writeFileAtomic } from './data-dir.js';
import { isTableStorageAvailable } from './database/table-storage.service.js';
import {
    dbGetAllTokens, dbGetTokenById, dbGetUserTokens as dbGetUserTokensRepo,
    dbGetActiveUserTokens, dbGetUserProviderTokens, dbSaveToken,
    dbDeleteToken, dbGetTokensExpiringBefore, dbGetTokenStats as dbGetTokenStatsRepo,
} from './database/social-token.repository.js';

const TOKENS_FILE = path.join(DATA_DIR, 'social-tokens.json');

// Avaliação lazy para dar tempo do env carregar
function useDb(): boolean {
    return isTableStorageAvailable();
}

// Cache local para leitura sync
let tokensCache: SocialToken[] | null = null;

// ── Helpers de Persistência ────────────────────────────────────────────────

function readTokensFromFile(): SocialToken[] {
    ensureDataDir();
    if (!fs.existsSync(TOKENS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(TOKENS_FILE, 'utf-8'));
    } catch {
        console.error('[SocialTokenStore] Erro ao ler tokens, retornando array vazio');
        return [];
    }
}

function writeTokensToFile(tokens: SocialToken[]): void {
    ensureDataDir();
    const tempFile = TOKENS_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(tokens, null, 2), 'utf-8');
    fs.renameSync(tempFile, TOKENS_FILE);
}

function readTokens(): SocialToken[] {
    if (tokensCache) return [...tokensCache];
    const tokens = readTokensFromFile();
    tokensCache = tokens;
    return [...tokens];
}

function writeTokens(tokens: SocialToken[]): void {
    tokensCache = [...tokens];
    writeTokensToFile(tokens);
    if (useDb()) {
        Promise.all(tokens.map(t => dbSaveToken(t))).catch(err =>
            console.error('[SocialTokenStore] Erro ao gravar no Table Storage:', err.message)
        );
    }
}

/**
 * Inicializa o store: carrega do DB ou migra JSON→DB
 */
export async function initTokenStore(): Promise<void> {
    if (useDb()) {
        try {
            const dbTokens = await dbGetAllTokens();
            if (dbTokens.length > 0) {
                tokensCache = dbTokens;
                console.log(`[SocialTokenStore] ${dbTokens.length} tokens carregados do Table Storage`);
            } else {
                const fileTokens = readTokensFromFile();
                if (fileTokens.length > 0) {
                    console.log(`[SocialTokenStore] Migrando ${fileTokens.length} tokens de JSON → Table Storage...`);
                    for (const t of fileTokens) await dbSaveToken(t);
                    tokensCache = fileTokens;
                    console.log('[SocialTokenStore] Migração concluída.');
                } else {
                    tokensCache = [];
                }
            }
        } catch (err: any) {
            console.error('[SocialTokenStore] Fallback JSON:', err.message);
            tokensCache = readTokensFromFile();
        }
    } else {
        tokensCache = readTokensFromFile();
    }
}

/**
 * Remove dados sensíveis para retorno ao frontend
 */
function toPublicToken(token: SocialToken): PublicSocialToken {
    const { accessToken: _, refreshToken: __, metadata, ...rest } = token;
    return {
        ...rest,
        metadata: {
            instagramBusinessAccountId: metadata.instagramBusinessAccountId,
            facebookPageId: metadata.facebookPageId,
        },
    };
}

// ── CRUD Operations ────────────────────────────────────────────────────────

/**
 * Salva um novo token OAuth (após callback de autenticação)
 */
export function saveSocialToken(
    userId: string,
    provider: SocialProvider,
    data: {
        providerUserId: string;
        providerUsername: string;
        profilePictureUrl?: string;
        accessToken: string;
        refreshToken?: string;
        tokenExpiresAt: string;
        scopes: string[];
        metadata?: SocialToken['metadata'];
    }
): PublicSocialToken {
    const tokens = readTokens();

    // Se já existe token ativo do mesmo provider + user, desativa o anterior
    const existingIdx = tokens.findIndex(
        t => t.userId === userId
            && t.provider === provider
            && t.providerUserId === data.providerUserId
            && t.isActive
    );

    if (existingIdx !== -1) {
        tokens[existingIdx].isActive = false;
        console.log(`[SocialTokenStore] Token anterior desativado para ${provider}/${data.providerUsername}`);
    }

    const now = new Date().toISOString();
    const newToken: SocialToken = {
        id: crypto.randomUUID(),
        userId,
        provider,
        providerUserId: data.providerUserId,
        providerUsername: data.providerUsername,
        profilePictureUrl: data.profilePictureUrl,
        accessToken: encrypt(data.accessToken),
        refreshToken: data.refreshToken ? encrypt(data.refreshToken) : undefined,
        tokenExpiresAt: data.tokenExpiresAt,
        scopes: data.scopes,
        isActive: true,
        connectedAt: now,
        lastRefreshedAt: now,
        metadata: data.metadata || {},
    };

    tokens.push(newToken);
    writeTokens(tokens);

    console.log(`[SocialTokenStore] Token salvo: ${provider}/@${data.providerUsername} para user ${userId}`);
    return toPublicToken(newToken);
}

/**
 * Obtém um token pelo ID (com dados sensíveis descriptografados)
 */
export function getTokenById(tokenId: string): SocialToken | null {
    const tokens = readTokens();
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return null;

    try {
        return {
            ...token,
            accessToken: decrypt(token.accessToken),
            refreshToken: token.refreshToken ? decrypt(token.refreshToken) : undefined,
        };
    } catch (err: any) {
        console.error(`[SocialTokenStore] Erro ao descriptografar token ${tokenId}: ${err.message}`);
        console.error('[SocialTokenStore] Isso geralmente indica que SOCIAL_ENCRYPTION_KEY mudou desde que o token foi salvo.');
        console.error('[SocialTokenStore] O usuário precisará reconectar a conta social.');
        // Retornar token com dados criptografados originais para que o erro
        // seja capturado no momento do uso (ex: ao chamar API do Instagram)
        // em vez de falhar silenciosamente aqui
        return {
            ...token,
            accessToken: '__DECRYPT_FAILED__',
            refreshToken: token.refreshToken ? '__DECRYPT_FAILED__' : undefined,
            _decryptError: err.message,
        } as SocialToken & { _decryptError?: string };
    }
}

/**
 * Obtém um token pelo ID (versão pública, sem dados sensíveis)
 */
export function getPublicTokenById(tokenId: string): PublicSocialToken | null {
    const tokens = readTokens();
    const token = tokens.find(t => t.id === tokenId);
    return token ? toPublicToken(token) : null;
}

/**
 * Lista todos os tokens ativos de um usuário (versão pública)
 */
export function getUserTokens(userId: string): PublicSocialToken[] {
    const tokens = readTokens();
    return tokens
        .filter(t => t.userId === userId && t.isActive)
        .map(toPublicToken);
}

/**
 * Lista todos os tokens completos de um usuário (uso interno apenas — inclui metadata)
 */
export function getUserTokensFull(userId: string): SocialToken[] {
    const tokens = readTokens();
    return tokens.filter(t => t.userId === userId && t.isActive);
}

/**
 * Lista tokens ativos de um usuário para um provider específico
 */
export function getUserProviderTokens(userId: string, provider: SocialProvider): PublicSocialToken[] {
    const tokens = readTokens();
    return tokens
        .filter(t => t.userId === userId && t.provider === provider && t.isActive)
        .map(toPublicToken);
}

/**
 * Atualiza o access_token (após refresh)
 */
export function updateTokenCredentials(
    tokenId: string,
    newAccessToken: string,
    newRefreshToken?: string,
    newExpiresAt?: string
): PublicSocialToken {
    const tokens = readTokens();
    const idx = tokens.findIndex(t => t.id === tokenId);

    if (idx === -1) {
        throw new Error('Token não encontrado');
    }

    tokens[idx].accessToken = encrypt(newAccessToken);
    if (newRefreshToken) {
        tokens[idx].refreshToken = encrypt(newRefreshToken);
    }
    if (newExpiresAt) {
        tokens[idx].tokenExpiresAt = newExpiresAt;
    }
    tokens[idx].lastRefreshedAt = new Date().toISOString();

    writeTokens(tokens);
    console.log(`[SocialTokenStore] Token ${tokenId} atualizado (refresh)`);
    return toPublicToken(tokens[idx]);
}

/**
 * Marca o token como usado (atualiza lastUsedAt)
 */
export function markTokenUsed(tokenId: string): void {
    const tokens = readTokens();
    const idx = tokens.findIndex(t => t.id === tokenId);
    if (idx !== -1) {
        tokens[idx].lastUsedAt = new Date().toISOString();
        writeTokens(tokens);
    }
}

/**
 * Desativa um token (desconectar conta)
 */
export function deactivateToken(tokenId: string, userId: string): void {
    const tokens = readTokens();
    const idx = tokens.findIndex(t => t.id === tokenId && t.userId === userId);

    if (idx === -1) {
        throw new Error('Token não encontrado ou não pertence ao usuário');
    }

    tokens[idx].isActive = false;
    writeTokens(tokens);
    console.log(`[SocialTokenStore] Token ${tokenId} desativado`);
}

/**
 * Remove permanentemente um token
 */
export function deleteToken(tokenId: string, userId: string): void {
    const tokens = readTokens();
    const idx = tokens.findIndex(t => t.id === tokenId && t.userId === userId);

    if (idx === -1) {
        throw new Error('Token não encontrado ou não pertence ao usuário');
    }

    tokens.splice(idx, 1);
    writeTokens(tokens);
    console.log(`[SocialTokenStore] Token ${tokenId} removido permanentemente`);
}

/**
 * Obtém tokens que precisam de refresh (expirando em X dias)
 * Usado pelo job de refresh automático
 */
export function getTokensNeedingRefresh(withinDays: number = 7): SocialToken[] {
    const tokens = readTokens();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + withinDays);

    return tokens
        .filter(t => {
            if (!t.isActive) return false;
            const expiresAt = new Date(t.tokenExpiresAt);
            return expiresAt <= threshold;
        })
        .map(t => {
            try {
                return {
                    ...t,
                    accessToken: decrypt(t.accessToken),
                    refreshToken: t.refreshToken ? decrypt(t.refreshToken) : undefined,
                } as SocialToken;
            } catch (err: any) {
                console.error(`[SocialTokenStore] Erro ao descriptografar token ${t.id} para refresh: ${err.message}`);
                return null;
            }
        })
        .filter((t): t is SocialToken => t !== null);
}

/**
 * Obtém contagem de tokens por provider (para dashboard admin)
 */
export function getTokenStats(): Record<SocialProvider, { active: number; total: number }> {
    const tokens = readTokens();
    const stats: Record<SocialProvider, { active: number; total: number }> = {
        instagram: { active: 0, total: 0 },
        twitter: { active: 0, total: 0 },
    };

    for (const token of tokens) {
        stats[token.provider].total++;
        if (token.isActive) stats[token.provider].active++;
    }

    return stats;
}
