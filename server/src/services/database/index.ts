// ============================================================================
// Database Module — Barrel export + inicialização
// ============================================================================
// Ponto de entrada central para todos os repositórios de banco de dados.
// Em produção com AZURE_STORAGE_CONNECTION_STRING: usa Azure Table Storage.
// Em dev ou sem connection string: mantém fallback em JSON (data-dir.ts).
// ============================================================================

export { isTableStorageAvailable, initializeAllTables } from './table-storage.service.js';

// Repositories
export * from './user.repository.js';
export * from './social-token.repository.js';
export * from './publication.repository.js';
export * from './engagement.repository.js';
export * from './queue.repository.js';
export * from './settings.repository.js';
export * from './video-task.repository.js';
