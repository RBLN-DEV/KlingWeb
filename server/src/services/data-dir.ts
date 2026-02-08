// ============================================================================
// Data Directory — Diretório centralizado para persistência de dados
// ============================================================================
// Em produção no Azure App Service, /home é o único diretório persistente.
// Com WEBSITES_ENABLE_APP_SERVICE_STORAGE=true, /home persiste entre restarts.
// Em dev, usa ./data relativo ao CWD.
// ============================================================================

import fs from 'fs';
import path from 'path';

/**
 * Retorna o diretório de dados persistente.
 * - Produção (Azure): /home/data  (persistente com WEBSITES_ENABLE_APP_SERVICE_STORAGE=true)
 * - Dev: ./data (relativo ao CWD)
 * - Docker sem /home: /app/data (fallback)
 */
export function getDataDir(): string {
    // 1. Variável de ambiente explícita tem prioridade
    if (process.env.DATA_DIR) {
        return process.env.DATA_DIR;
    }
    // 2. Produção no Azure App Service: /home é o único volume persistente
    if (process.env.NODE_ENV === 'production') {
        // Verificar se /home existe e é gravável
        if (fs.existsSync('/home')) {
            try {
                const testDir = '/home/data';
                fs.mkdirSync(testDir, { recursive: true });
                // Testar escrita
                const testFile = path.join(testDir, '.write_test');
                fs.writeFileSync(testFile, 'ok', 'utf-8');
                fs.unlinkSync(testFile);
                return testDir;
            } catch (err: any) {
                console.warn(`[DataDir] /home existe mas não é gravável: ${err.message}`);
            }
        }
        // Fallback para /app/data em containers
        if (fs.existsSync('/app')) {
            return '/app/data';
        }
    }
    return path.join(process.cwd(), 'data');
}

export const DATA_DIR = getDataDir();

/**
 * Garante que o DATA_DIR exista.
 */
export function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        try {
            fs.mkdirSync(DATA_DIR, { recursive: true });
            console.log(`[DataDir] Diretório criado: ${DATA_DIR}`);
        } catch (err: any) {
            console.error(`[DataDir] ERRO ao criar diretório ${DATA_DIR}: ${err.message}`);
            // Tentar CWD como último fallback
            const fallback = path.join(process.cwd(), 'data');
            if (!fs.existsSync(fallback)) {
                fs.mkdirSync(fallback, { recursive: true });
            }
            console.warn(`[DataDir] Usando fallback: ${fallback}`);
        }
    }
}

/**
 * Escrita atômica: grava em .tmp e renomeia (evita corrupção se crash).
 */
export function writeFileAtomic(filePath: string, data: string): void {
    ensureDataDir();
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, data, 'utf-8');
    fs.renameSync(tmp, filePath);
}

/**
 * Leitura segura de JSON. Retorna null se arquivo não existe ou é inválido.
 */
export function readJsonSafe<T>(filePath: string): T | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

// Log do diretório ao importar
console.log(`[DataDir] Usando diretório de dados: ${DATA_DIR}`);
