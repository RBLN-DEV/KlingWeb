// ============================================================================
// Azure Table Storage Service — Camada de acesso ao banco de dados
// ============================================================================
// Encapsula todas as operações CRUD com Azure Table Storage.
// Em dev sem connection string, faz fallback para JSON em disco.
//
// Tabelas criadas automaticamente:
//  - Users, SocialTokens, Publications, EngagementMetrics, SocialQueue, Settings, VideoTasks, ImageTasks
// ============================================================================

import { TableClient, TableServiceClient, odata } from '@azure/data-tables';

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';

// Cache de TableClients
const tableClients = new Map<string, TableClient>();

/**
 * Verifica se Azure Table Storage está disponível
 */
export function isTableStorageAvailable(): boolean {
    return !!CONNECTION_STRING;
}

/**
 * Obtém (ou cria) um TableClient para a tabela especificada.
 * Cria a tabela automaticamente se não existir.
 */
export async function getTableClient(tableName: string): Promise<TableClient> {
    if (tableClients.has(tableName)) {
        return tableClients.get(tableName)!;
    }

    const client = TableClient.fromConnectionString(CONNECTION_STRING, tableName, {
        allowInsecureConnection: false,
    });

    // Criar tabela se não existir
    try {
        await client.createTable();
        console.log(`[TableStorage] Tabela "${tableName}" criada.`);
    } catch (error: any) {
        // 409 = tabela já existe (esperado)
        if (error.statusCode !== 409) {
            console.error(`[TableStorage] Erro ao criar tabela "${tableName}":`, error.message);
            throw error;
        }
    }

    tableClients.set(tableName, client);
    return client;
}

/**
 * Inicializa todas as tabelas necessárias
 */
export async function initializeAllTables(): Promise<void> {
    const tables = [
        'Users',
        'SocialTokens',
        'Publications',
        'EngagementMetrics',
        'SocialQueue',
        'Settings',
        'VideoTasks',
        'ImageTasks',
    ];

    console.log('[TableStorage] Inicializando tabelas...');

    for (const table of tables) {
        await getTableClient(table);
    }

    console.log(`[TableStorage] ${tables.length} tabelas prontas.`);
}

// ── Helpers Genéricos para CRUD ────────────────────────────────────────────

/**
 * Insere ou atualiza uma entidade (upsert)
 */
export async function upsertEntity(
    tableName: string,
    entity: { partitionKey: string; rowKey: string; [key: string]: any }
): Promise<void> {
    const client = await getTableClient(tableName);
    await client.upsertEntity(entity as any, 'Replace');
}

/**
 * Obtém uma entidade por partitionKey + rowKey
 */
export async function getEntity<T>(
    tableName: string,
    partitionKey: string,
    rowKey: string
): Promise<T | null> {
    const client = await getTableClient(tableName);
    try {
        const entity = await client.getEntity(partitionKey, rowKey);
        return entity as unknown as T;
    } catch (error: any) {
        if (error.statusCode === 404) return null;
        throw error;
    }
}

/**
 * Remove uma entidade
 */
export async function deleteEntity(
    tableName: string,
    partitionKey: string,
    rowKey: string
): Promise<boolean> {
    const client = await getTableClient(tableName);
    try {
        await client.deleteEntity(partitionKey, rowKey);
        return true;
    } catch (error: any) {
        if (error.statusCode === 404) return false;
        throw error;
    }
}

/**
 * Lista todas as entidades com um filtro OData
 */
export async function queryEntities<T>(
    tableName: string,
    filter?: string,
    maxResults?: number
): Promise<T[]> {
    const client = await getTableClient(tableName);
    const results: T[] = [];

    const options: any = {};
    if (filter) options.queryOptions = { filter };

    for await (const entity of client.listEntities(options)) {
        results.push(entity as unknown as T);
        if (maxResults && results.length >= maxResults) break;
    }

    return results;
}

/**
 * Lista entidades por partitionKey
 */
export async function queryByPartition<T>(
    tableName: string,
    partitionKey: string
): Promise<T[]> {
    return queryEntities<T>(tableName, odata`PartitionKey eq ${partitionKey}`);
}

/**
 * Conta entidades que satisfazem um filtro
 */
export async function countEntities(
    tableName: string,
    filter?: string
): Promise<number> {
    const entities = await queryEntities(tableName, filter);
    return entities.length;
}
