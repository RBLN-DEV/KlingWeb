// ============================================================================
// Engagement Metrics Repository — Azure Table Storage
// ============================================================================
// Tabela: EngagementMetrics
// PartitionKey: publicationId
// RowKey: snapshot.id (UUID)
// ============================================================================

import {
    upsertEntity, getEntity, deleteEntity, queryEntities, queryByPartition
} from './table-storage.service.js';
import type { EngagementSnapshot, EngagementMetrics, ProviderSpecificMetrics, SocialProvider } from '../../types/social.types.js';

const TABLE = 'EngagementMetrics';

interface MetricsEntity {
    partitionKey: string;
    rowKey: string;
    provider: string;
    providerPostId: string;
    metrics: string;            // JSON
    providerMetrics: string;    // JSON
    collectedAt: string;
    collectionMethod: string;
}

function toEntity(snapshot: EngagementSnapshot): MetricsEntity {
    return {
        partitionKey: snapshot.publicationId,
        rowKey: snapshot.id,
        provider: snapshot.provider,
        providerPostId: snapshot.providerPostId,
        metrics: JSON.stringify(snapshot.metrics),
        providerMetrics: JSON.stringify(snapshot.providerMetrics),
        collectedAt: snapshot.collectedAt,
        collectionMethod: snapshot.collectionMethod,
    };
}

function fromEntity(entity: MetricsEntity): EngagementSnapshot {
    return {
        id: entity.rowKey,
        publicationId: entity.partitionKey,
        provider: entity.provider as SocialProvider,
        providerPostId: entity.providerPostId,
        metrics: safeJsonParse<EngagementMetrics>(entity.metrics, {
            likes: 0, comments: 0, shares: 0, saves: 0,
            impressions: 0, reach: 0, engagementRate: 0,
        }),
        providerMetrics: safeJsonParse<ProviderSpecificMetrics>(entity.providerMetrics, {}),
        collectedAt: entity.collectedAt,
        collectionMethod: entity.collectionMethod as 'webhook' | 'polling',
    };
}

function safeJsonParse<T>(str: string | undefined, fallback: T): T {
    if (!str) return fallback;
    try { return JSON.parse(str); } catch { return fallback; }
}

export async function dbGetSnapshotsByPublication(publicationId: string): Promise<EngagementSnapshot[]> {
    const entities = await queryByPartition<MetricsEntity>(TABLE, publicationId);
    return entities.map(fromEntity);
}

export async function dbGetLatestSnapshot(publicationId: string): Promise<EngagementSnapshot | null> {
    const snapshots = await dbGetSnapshotsByPublication(publicationId);
    if (snapshots.length === 0) return null;
    snapshots.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());
    return snapshots[0];
}

export async function dbSaveSnapshot(snapshot: EngagementSnapshot): Promise<void> {
    await upsertEntity(TABLE, toEntity(snapshot));
}

export async function dbDeleteSnapshot(publicationId: string, snapshotId: string): Promise<boolean> {
    return deleteEntity(TABLE, publicationId, snapshotId);
}

export async function dbGetAllSnapshots(): Promise<EngagementSnapshot[]> {
    const entities = await queryEntities<MetricsEntity>(TABLE);
    return entities.map(fromEntity);
}

/**
 * Remove snapshots mais antigos que cutoffDate para uma publicação,
 * mantendo no máximo maxPerPublication
 */
export async function dbCleanOldSnapshots(
    cutoffDate: string,
    maxPerPublication: number = 500
): Promise<number> {
    const all = await queryEntities<MetricsEntity>(TABLE);
    
    // Agrupar por publicação
    const byPub = new Map<string, MetricsEntity[]>();
    for (const e of all) {
        const existing = byPub.get(e.partitionKey) || [];
        existing.push(e);
        byPub.set(e.partitionKey, existing);
    }

    let removed = 0;
    for (const [pubId, entities] of byPub) {
        // Ordenar por collectedAt desc
        entities.sort((a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime());

        for (let i = 0; i < entities.length; i++) {
            const e = entities[i];
            // Remover se: mais antigo que cutoff OU excede o limite por publicação
            if (i >= maxPerPublication || new Date(e.collectedAt) < new Date(cutoffDate)) {
                await deleteEntity(TABLE, e.partitionKey, e.rowKey);
                removed++;
            }
        }
    }

    return removed;
}
