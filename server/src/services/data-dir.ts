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
 * - Produção (Azure): /home/data
 * - Dev: ./data (relativo ao CWD)
 */
export function getDataDir(): string {
    if (process.env.NODE_ENV === 'production' && fs.existsSync('/home')) {
        return '/home/data';
    }
    return path.join(process.cwd(), 'data');
}

export const DATA_DIR = getDataDir();

/**
 * Garante que o DATA_DIR exista.
 */
export function ensureDataDir(): void {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        console.log(`[DataDir] Diretório criado: ${DATA_DIR}`);
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
