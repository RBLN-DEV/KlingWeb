// ============================================================================
// Video Tasks Repository — Azure Table Storage
// ============================================================================
// Tabela: VideoTasks
// PartitionKey: "task"
// RowKey: task.id (UUID)
//
// Persiste as tarefas de geração de vídeo que antes eram in-memory Map.
// ============================================================================

import {
    upsertEntity, getEntity, deleteEntity, queryEntities
} from './table-storage.service.js';

const TABLE = 'VideoTasks';
const PK = 'task';

export interface VideoTaskRecord {
    id: string;
    taskId: string;
    title: string;
    status: string;
    progress: number;
    statusMessage: string;
    thumbnailUrl?: string;
    videoUrl?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

interface TaskEntity {
    partitionKey: string;
    rowKey: string;
    taskId: string;
    title: string;
    status: string;
    progress: number;
    statusMessage: string;
    thumbnailUrl?: string;
    videoUrl?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

function toEntity(task: VideoTaskRecord): TaskEntity {
    return {
        partitionKey: PK,
        rowKey: task.id,
        taskId: task.taskId,
        title: task.title,
        status: task.status,
        progress: task.progress,
        statusMessage: task.statusMessage,
        thumbnailUrl: task.thumbnailUrl,
        videoUrl: task.videoUrl,
        error: task.error,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
    };
}

function fromEntity(entity: TaskEntity): VideoTaskRecord {
    return {
        id: entity.rowKey,
        taskId: entity.taskId || '',
        title: entity.title,
        status: entity.status,
        progress: entity.progress ?? 0,
        statusMessage: entity.statusMessage || '',
        thumbnailUrl: entity.thumbnailUrl,
        videoUrl: entity.videoUrl,
        error: entity.error,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
    };
}

export async function dbGetAllVideoTasks(): Promise<VideoTaskRecord[]> {
    const entities = await queryEntities<TaskEntity>(TABLE);
    return entities.map(fromEntity);
}

export async function dbGetVideoTask(id: string): Promise<VideoTaskRecord | null> {
    const entity = await getEntity<TaskEntity>(TABLE, PK, id);
    return entity ? fromEntity(entity) : null;
}

export async function dbSaveVideoTask(task: VideoTaskRecord): Promise<void> {
    await upsertEntity(TABLE, toEntity(task));
}

export async function dbDeleteVideoTask(id: string): Promise<boolean> {
    return deleteEntity(TABLE, PK, id);
}
