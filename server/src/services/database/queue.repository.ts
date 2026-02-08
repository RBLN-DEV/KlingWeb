// ============================================================================
// Social Queue Repository — Azure Table Storage
// ============================================================================
// Tabela: SocialQueue
// PartitionKey: "queue" (partição única para fila)
// RowKey: job.id (UUID)
// ============================================================================

import {
    upsertEntity, getEntity, deleteEntity, queryEntities
} from './table-storage.service.js';
import type { QueueJob, QueueJobType, QueueJobPriority, QueueJobStatus, SocialProvider } from '../../types/social.types.js';

const TABLE = 'SocialQueue';
const PK = 'queue';

interface QueueEntity {
    partitionKey: string;
    rowKey: string;
    publicationId?: string;
    tokenId?: string;
    type: string;
    priority: string;
    provider: string;
    scheduledAt: string;
    attempts: number;
    maxAttempts: number;
    status: string;
    error?: string;
    data?: string;             // JSON
    createdAt: string;
    processedAt?: string;
    completedAt?: string;
}

function toEntity(job: QueueJob): QueueEntity {
    return {
        partitionKey: PK,
        rowKey: job.id,
        publicationId: job.publicationId,
        tokenId: job.tokenId,
        type: job.type,
        priority: job.priority,
        provider: job.provider,
        scheduledAt: job.scheduledAt,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        status: job.status,
        error: job.error,
        data: job.data ? JSON.stringify(job.data) : undefined,
        createdAt: job.createdAt,
        processedAt: job.processedAt,
        completedAt: job.completedAt,
    };
}

function fromEntity(entity: QueueEntity): QueueJob {
    return {
        id: entity.rowKey,
        publicationId: entity.publicationId,
        tokenId: entity.tokenId,
        type: entity.type as QueueJobType,
        priority: entity.priority as QueueJobPriority,
        provider: entity.provider as SocialProvider,
        scheduledAt: entity.scheduledAt,
        attempts: entity.attempts ?? 0,
        maxAttempts: entity.maxAttempts ?? 3,
        status: entity.status as QueueJobStatus,
        error: entity.error,
        data: safeJsonParse<Record<string, unknown>>(entity.data, undefined),
        createdAt: entity.createdAt,
        processedAt: entity.processedAt,
        completedAt: entity.completedAt,
    };
}

function safeJsonParse<T>(str: string | undefined, fallback: T | undefined): T | undefined {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

export async function dbGetAllJobs(): Promise<QueueJob[]> {
    const entities = await queryEntities<QueueEntity>(TABLE);
    return entities.map(fromEntity);
}

export async function dbGetJobById(id: string): Promise<QueueJob | null> {
    const entity = await getEntity<QueueEntity>(TABLE, PK, id);
    return entity ? fromEntity(entity) : null;
}

export async function dbSaveJob(job: QueueJob): Promise<void> {
    await upsertEntity(TABLE, toEntity(job));
}

export async function dbDeleteJob(id: string): Promise<boolean> {
    return deleteEntity(TABLE, PK, id);
}

export async function dbGetJobsByPublication(publicationId: string): Promise<QueueJob[]> {
    const entities = await queryEntities<QueueEntity>(
        TABLE,
        `PartitionKey eq '${PK}' and publicationId eq '${publicationId}'`
    );
    return entities.map(fromEntity);
}

export async function dbGetPendingJobs(): Promise<QueueJob[]> {
    const entities = await queryEntities<QueueEntity>(
        TABLE,
        `PartitionKey eq '${PK}' and status eq 'pending'`
    );
    return entities.map(fromEntity);
}

export async function dbGetJobsByStatus(status: QueueJobStatus): Promise<QueueJob[]> {
    const entities = await queryEntities<QueueEntity>(
        TABLE,
        `PartitionKey eq '${PK}' and status eq '${status}'`
    );
    return entities.map(fromEntity);
}

/**
 * Remove jobs completados/mortos mais antigos que cutoffDate
 */
export async function dbCleanOldJobs(cutoffDate: string): Promise<number> {
    const entities = await queryEntities<QueueEntity>(TABLE);
    let removed = 0;

    for (const e of entities) {
        if ((e.status === 'completed' || e.status === 'dead')) {
            const completedAt = e.completedAt || e.processedAt || e.createdAt;
            if (new Date(completedAt) < new Date(cutoffDate)) {
                await deleteEntity(TABLE, PK, e.rowKey);
                removed++;
            }
        }
    }

    return removed;
}
