// ============================================================================
// Publication Repository — Azure Table Storage
// ============================================================================
// Tabela: Publications
// PartitionKey: userId
// RowKey: publication.id (UUID)
// ============================================================================

import {
    upsertEntity, getEntity, deleteEntity, queryEntities, queryByPartition
} from './table-storage.service.js';
import type { Publication, SocialProvider, PublicationStatus } from '../../types/social.types.js';

const TABLE = 'Publications';

interface PubEntity {
    partitionKey: string;
    rowKey: string;
    socialTokenId: string;
    provider: string;
    mediaType: string;
    mediaSourceId?: string;
    mediaUrl: string;
    caption: string;
    hashtags: string;          // JSON array
    status: string;
    providerMediaId?: string;
    providerPostId?: string;
    providerPostUrl?: string;
    error?: string;
    retryCount: number;
    maxRetries: number;
    nextRetryAt?: string;
    scheduledAt?: string;
    publishedAt?: string;
    createdAt: string;
    updatedAt: string;
}

function toEntity(pub: Publication): PubEntity {
    return {
        partitionKey: pub.userId,
        rowKey: pub.id,
        socialTokenId: pub.socialTokenId,
        provider: pub.provider,
        mediaType: pub.mediaType,
        mediaSourceId: pub.mediaSourceId,
        mediaUrl: pub.mediaUrl,
        caption: pub.caption,
        hashtags: JSON.stringify(pub.hashtags),
        status: pub.status,
        providerMediaId: pub.providerMediaId,
        providerPostId: pub.providerPostId,
        providerPostUrl: pub.providerPostUrl,
        error: pub.error,
        retryCount: pub.retryCount,
        maxRetries: pub.maxRetries,
        nextRetryAt: pub.nextRetryAt,
        scheduledAt: pub.scheduledAt,
        publishedAt: pub.publishedAt,
        createdAt: pub.createdAt,
        updatedAt: pub.updatedAt,
    };
}

function fromEntity(entity: PubEntity): Publication {
    return {
        id: entity.rowKey,
        userId: entity.partitionKey,
        socialTokenId: entity.socialTokenId,
        provider: entity.provider as SocialProvider,
        mediaType: entity.mediaType as any,
        mediaSourceId: entity.mediaSourceId,
        mediaUrl: entity.mediaUrl,
        caption: entity.caption,
        hashtags: safeJsonParse<string[]>(entity.hashtags, []),
        status: entity.status as PublicationStatus,
        providerMediaId: entity.providerMediaId,
        providerPostId: entity.providerPostId,
        providerPostUrl: entity.providerPostUrl,
        error: entity.error,
        retryCount: entity.retryCount ?? 0,
        maxRetries: entity.maxRetries ?? 3,
        nextRetryAt: entity.nextRetryAt,
        scheduledAt: entity.scheduledAt,
        publishedAt: entity.publishedAt,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
}

function safeJsonParse<T>(str: string | undefined, fallback: T): T {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

export async function dbGetAllPublications(): Promise<Publication[]> {
    const entities = await queryEntities<PubEntity>(TABLE);
    return entities.map(fromEntity);
}

export async function dbGetPublicationById(id: string): Promise<Publication | null> {
    const entities = await queryEntities<PubEntity>(TABLE, `RowKey eq '${id}'`);
    return entities.length > 0 ? fromEntity(entities[0]) : null;
}

export async function dbGetUserPublications(
    userId: string,
    filters?: { status?: string; provider?: string; limit?: number }
): Promise<Publication[]> {
    let filter = `PartitionKey eq '${userId}'`;
    if (filters?.status) filter += ` and status eq '${filters.status}'`;
    if (filters?.provider) filter += ` and provider eq '${filters.provider}'`;

    const entities = await queryEntities<PubEntity>(TABLE, filter, filters?.limit);
    return entities.map(fromEntity);
}

export async function dbGetPublishedPublications(): Promise<Publication[]> {
    const entities = await queryEntities<PubEntity>(
        TABLE,
        `status eq 'published'`
    );
    return entities.map(fromEntity);
}

export async function dbGetPublicationByProviderPostId(providerPostId: string): Promise<Publication | null> {
    const entities = await queryEntities<PubEntity>(
        TABLE,
        `providerPostId eq '${providerPostId}'`
    );
    return entities.length > 0 ? fromEntity(entities[0]) : null;
}

export async function dbGetPublicationByProviderMediaId(mediaId: string): Promise<Publication | null> {
    const entities = await queryEntities<PubEntity>(
        TABLE,
        `providerMediaId eq '${mediaId}'`
    );
    return entities.length > 0 ? fromEntity(entities[0]) : null;
}

export async function dbSavePublication(pub: Publication): Promise<void> {
    await upsertEntity(TABLE, toEntity(pub));
}

export async function dbDeletePublication(userId: string, id: string): Promise<boolean> {
    return deleteEntity(TABLE, userId, id);
}
