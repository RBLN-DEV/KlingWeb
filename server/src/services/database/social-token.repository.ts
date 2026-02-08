// ============================================================================
// Social Token Repository — Azure Table Storage
// ============================================================================
// Tabela: SocialTokens
// PartitionKey: userId
// RowKey: token.id (UUID)
// ============================================================================

import {
    upsertEntity, getEntity, deleteEntity, queryEntities, queryByPartition
} from './table-storage.service.js';
import type { SocialToken, SocialProvider } from '../../types/social.types.js';

const TABLE = 'SocialTokens';

interface TokenEntity {
    partitionKey: string;
    rowKey: string;
    provider: string;
    providerUserId: string;
    providerUsername: string;
    profilePictureUrl?: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt: string;
    scopes: string;          // JSON string
    isActive: boolean;
    connectedAt: string;
    lastRefreshedAt: string;
    lastUsedAt?: string;
    metadata: string;         // JSON string
}

function toEntity(token: SocialToken): TokenEntity {
    return {
        partitionKey: token.userId,
        rowKey: token.id,
        provider: token.provider,
        providerUserId: token.providerUserId,
        providerUsername: token.providerUsername,
        profilePictureUrl: token.profilePictureUrl,
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        tokenExpiresAt: token.tokenExpiresAt,
        scopes: JSON.stringify(token.scopes),
        isActive: token.isActive,
        connectedAt: token.connectedAt,
        lastRefreshedAt: token.lastRefreshedAt,
        lastUsedAt: token.lastUsedAt,
        metadata: JSON.stringify(token.metadata),
    };
}

function fromEntity(entity: TokenEntity): SocialToken {
    return {
        id: entity.rowKey,
        userId: entity.partitionKey,
        provider: entity.provider as SocialProvider,
        providerUserId: entity.providerUserId,
        providerUsername: entity.providerUsername,
        profilePictureUrl: entity.profilePictureUrl,
        accessToken: entity.accessToken,
        refreshToken: entity.refreshToken,
        tokenExpiresAt: entity.tokenExpiresAt,
        scopes: safeJsonParse<string[]>(entity.scopes, []),
        isActive: entity.isActive,
        connectedAt: entity.connectedAt,
        lastRefreshedAt: entity.lastRefreshedAt,
        lastUsedAt: entity.lastUsedAt,
        metadata: safeJsonParse<SocialToken['metadata']>(entity.metadata, {}),
    };
}

function safeJsonParse<T>(str: string | undefined, fallback: T): T {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

export async function dbGetAllTokens(): Promise<SocialToken[]> {
    const entities = await queryEntities<TokenEntity>(TABLE);
    return entities.map(fromEntity);
}

export async function dbGetTokenById(id: string): Promise<SocialToken | null> {
    // Precisamos buscar sem partitionKey (pois não sabemos o userId)
    const entities = await queryEntities<TokenEntity>(TABLE, `RowKey eq '${id}'`);
    return entities.length > 0 ? fromEntity(entities[0]) : null;
}

export async function dbGetUserTokens(userId: string): Promise<SocialToken[]> {
    const entities = await queryByPartition<TokenEntity>(TABLE, userId);
    return entities.map(fromEntity);
}

export async function dbGetActiveUserTokens(userId: string): Promise<SocialToken[]> {
    const entities = await queryEntities<TokenEntity>(
        TABLE,
        `PartitionKey eq '${userId}' and isActive eq true`
    );
    return entities.map(fromEntity);
}

export async function dbGetUserProviderTokens(userId: string, provider: SocialProvider): Promise<SocialToken[]> {
    const entities = await queryEntities<TokenEntity>(
        TABLE,
        `PartitionKey eq '${userId}' and provider eq '${provider}' and isActive eq true`
    );
    return entities.map(fromEntity);
}

export async function dbSaveToken(token: SocialToken): Promise<void> {
    await upsertEntity(TABLE, toEntity(token));
}

export async function dbDeleteToken(userId: string, tokenId: string): Promise<boolean> {
    return deleteEntity(TABLE, userId, tokenId);
}

export async function dbGetTokensExpiringBefore(dateISO: string): Promise<SocialToken[]> {
    const entities = await queryEntities<TokenEntity>(
        TABLE,
        `isActive eq true and tokenExpiresAt le '${dateISO}'`
    );
    return entities.map(fromEntity);
}

export async function dbGetTokenStats(): Promise<Record<SocialProvider, { active: number; total: number }>> {
    const all = await queryEntities<TokenEntity>(TABLE);
    const stats: Record<SocialProvider, { active: number; total: number }> = {
        instagram: { active: 0, total: 0 },
        twitter: { active: 0, total: 0 },
    };
    for (const t of all) {
        const p = t.provider as SocialProvider;
        if (stats[p]) {
            stats[p].total++;
            if (t.isActive) stats[p].active++;
        }
    }
    return stats;
}
