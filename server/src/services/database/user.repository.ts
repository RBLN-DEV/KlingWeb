// ============================================================================
// User Repository — Azure Table Storage
// ============================================================================
// Tabela: Users
// PartitionKey: "user" (partição única — poucos usuários)
// RowKey: user.id (UUID)
// ============================================================================

import {
    upsertEntity, getEntity, deleteEntity, queryEntities, queryByPartition
} from './table-storage.service.js';
import type { StoredUser } from '../user.store.js';

const TABLE = 'Users';
const PK = 'user';

interface UserEntity {
    partitionKey: string;
    rowKey: string;
    name: string;
    email: string;
    passwordHash: string;
    role: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    approvedBy?: string;
    rejectedReason?: string;
}

function toEntity(user: StoredUser): UserEntity {
    return {
        partitionKey: PK,
        rowKey: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        approvedBy: user.approvedBy,
        rejectedReason: user.rejectedReason,
    };
}

function fromEntity(entity: UserEntity): StoredUser {
    return {
        id: entity.rowKey,
        name: entity.name,
        email: entity.email,
        passwordHash: entity.passwordHash,
        role: entity.role as 'admin' | 'user',
        status: entity.status as 'pending' | 'approved' | 'rejected',
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
        approvedBy: entity.approvedBy,
        rejectedReason: entity.rejectedReason,
    };
}

export async function dbGetAllUsers(): Promise<StoredUser[]> {
    const entities = await queryByPartition<UserEntity>(TABLE, PK);
    return entities.map(fromEntity);
}

export async function dbGetUserById(id: string): Promise<StoredUser | null> {
    const entity = await getEntity<UserEntity>(TABLE, PK, id);
    return entity ? fromEntity(entity) : null;
}

export async function dbGetUserByEmail(email: string): Promise<StoredUser | null> {
    const entities = await queryEntities<UserEntity>(
        TABLE,
        `PartitionKey eq '${PK}' and email eq '${email.toLowerCase()}'`
    );
    return entities.length > 0 ? fromEntity(entities[0]) : null;
}

export async function dbSaveUser(user: StoredUser): Promise<void> {
    await upsertEntity(TABLE, toEntity(user));
}

export async function dbDeleteUser(id: string): Promise<boolean> {
    return deleteEntity(TABLE, PK, id);
}

export async function dbHasAdmin(): Promise<boolean> {
    const entities = await queryEntities<UserEntity>(
        TABLE,
        `PartitionKey eq '${PK}' and role eq 'admin'`
    );
    return entities.length > 0;
}

export async function dbCountAdmins(): Promise<number> {
    const entities = await queryEntities<UserEntity>(
        TABLE,
        `PartitionKey eq '${PK}' and role eq 'admin'`
    );
    return entities.length;
}
