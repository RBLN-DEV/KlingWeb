// ============================================================================
// Settings Repository — Azure Table Storage
// ============================================================================
// Tabela: Settings
// PartitionKey: "config"
// RowKey: chave da configuração (ex: "proxy")
// ============================================================================

import {
    upsertEntity, getEntity, queryEntities
} from './table-storage.service.js';

const TABLE = 'Settings';
const PK = 'config';

interface SettingsEntity {
    partitionKey: string;
    rowKey: string;
    value: string;             // JSON do objeto de configuração
    updatedAt: string;
    updatedBy: string;
}

export interface ProxyConfig {
    enabled: boolean;
    proxyUrl: string;
    updatedAt: string;
    updatedBy: string;
}

export async function dbGetSetting<T>(key: string): Promise<T | null> {
    const entity = await getEntity<SettingsEntity>(TABLE, PK, key);
    if (!entity) return null;
    try {
        return JSON.parse(entity.value) as T;
    } catch {
        return null;
    }
}

export async function dbSaveSetting<T>(key: string, value: T, updatedBy: string = 'system'): Promise<void> {
    await upsertEntity(TABLE, {
        partitionKey: PK,
        rowKey: key,
        value: JSON.stringify(value),
        updatedAt: new Date().toISOString(),
        updatedBy,
    });
}

export async function dbGetProxyConfig(): Promise<ProxyConfig | null> {
    return dbGetSetting<ProxyConfig>('proxy');
}

export async function dbSaveProxyConfig(config: ProxyConfig): Promise<void> {
    await dbSaveSetting('proxy', config, config.updatedBy);
}
