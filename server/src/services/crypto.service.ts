// ============================================================================
// Serviço de Criptografia — AES-256-GCM para tokens OAuth
// ============================================================================
// Usa AES-256-GCM (Authenticated Encryption) para garantir confidencialidade
// e integridade dos tokens OAuth armazenados em disco.
// ============================================================================

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;       // 128 bits
const TAG_LENGTH = 16;      // 128 bits
const KEY_LENGTH = 32;      // 256 bits

/**
 * Obtém ou gera a chave de criptografia.
 * Em produção, SOCIAL_ENCRYPTION_KEY DEVE ser definida como env var (64 chars hex).
 * Se não definida, gera uma chave efêmera (tokens serão perdidos ao reiniciar).
 */
function getEncryptionKey(): Buffer {
    const envKey = process.env.SOCIAL_ENCRYPTION_KEY;

    if (envKey) {
        if (envKey.length !== 64) {
            console.warn('[Crypto] SOCIAL_ENCRYPTION_KEY deve ter 64 caracteres hex (256 bits). Usando hash da chave fornecida.');
            return crypto.createHash('sha256').update(envKey).digest();
        }
        return Buffer.from(envKey, 'hex');
    }

    // Gera chave derivada do SESSION_SECRET (fallback — não ideal para produção)
    const fallbackSecret = process.env.SESSION_SECRET || 'klingai_social_default_key_2025';
    console.warn('[Crypto] SOCIAL_ENCRYPTION_KEY não definida. Usando chave derivada do SESSION_SECRET.');
    return crypto.createHash('sha256').update(fallbackSecret).digest();
}

const encryptionKey = getEncryptionKey();

/**
 * Criptografa um texto usando AES-256-GCM
 * @returns String no formato: iv_hex:authTag_hex:ciphertext_hex
 */
export function encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, encryptionKey, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Descriptografa um texto criptografado com encrypt()
 * @param encryptedText String no formato iv_hex:authTag_hex:ciphertext_hex
 */
export function decrypt(encryptedText: string): string {
    if (!encryptedText || typeof encryptedText !== 'string') {
        throw new Error('Texto criptografado vazio ou inválido');
    }

    // Se o texto não parece criptografado, pode ser um token em texto puro (legado)
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        // Verificar se pode ser um token OAuth em texto puro (não criptografado)
        // Tokens Facebook/Instagram começam com 'EAA' ou são alfanuméricos longos
        if (encryptedText.startsWith('EAA') || (encryptedText.length > 20 && !encryptedText.includes(' '))) {
            console.warn('[Crypto] Token aparenta estar em texto puro (não criptografado). Retornando como está.');
            return encryptedText;
        }
        throw new Error(`Formato de texto criptografado inválido (${parts.length} partes, esperado 3). ` +
            'Isso pode ocorrer se a chave de criptografia (SOCIAL_ENCRYPTION_KEY) mudou entre deploys. ' +
            'Reconecte a conta social para gerar novos tokens.');
    }

    const [ivHex, authTagHex, ciphertext] = parts;

    // Validar formato hex dos componentes
    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== TAG_LENGTH * 2) {
        throw new Error(`Formato de texto criptografado inválido (iv=${ivHex.length}, tag=${authTagHex.length}). ` +
            'A chave de criptografia pode ter mudado. Reconecte a conta social.');
    }

    try {
        const iv = Buffer.from(ivHex, 'hex');
        const authTag = Buffer.from(authTagHex, 'hex');

        const decipher = crypto.createDecipheriv(ALGORITHM, encryptionKey, iv);
        decipher.setAuthTag(authTag);

        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    } catch (err: any) {
        if (err.message?.includes('Unsupported state') || err.code === 'ERR_OSSL_EVP_BAD_DECRYPT') {
            throw new Error('Falha na descriptografia: a chave de criptografia (SOCIAL_ENCRYPTION_KEY) provavelmente ' +
                'mudou desde que o token foi salvo. Reconecte a conta social para gerar novos tokens.');
        }
        throw err;
    }
}

/**
 * Tenta descriptografar, retornando null em caso de erro (sem throw).
 * Útil para migração e leitura tolerante a falhas.
 */
export function tryDecrypt(encryptedText: string): string | null {
    try {
        return decrypt(encryptedText);
    } catch (err: any) {
        console.warn('[Crypto] tryDecrypt falhou:', err.message);
        return null;
    }
}

/**
 * Verifica se um texto está criptografado (formato válido)
 */
export function isEncrypted(text: string): boolean {
    const parts = text.split(':');
    if (parts.length !== 3) return false;

    const [ivHex, authTagHex] = parts;
    return ivHex.length === IV_LENGTH * 2 && authTagHex.length === TAG_LENGTH * 2;
}

/**
 * Gera uma chave de criptografia aleatória (útil para setup inicial)
 * @returns String hex de 64 caracteres
 */
export function generateEncryptionKey(): string {
    return crypto.randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Gera um state token para OAuth (proteção CSRF)
 * @returns String hex aleatória de 32 caracteres
 */
export function generateOAuthState(): string {
    return crypto.randomBytes(16).toString('hex');
}

/**
 * Gera um code_verifier para PKCE (Twitter OAuth 2.0)
 * RFC 7636: 43–128 caracteres, [A-Z][a-z][0-9]-._~
 */
export function generatePKCEVerifier(): string {
    return crypto.randomBytes(32)
        .toString('base64url')
        .slice(0, 64);
}

/**
 * Gera o code_challenge a partir do code_verifier (PKCE S256)
 */
export function generatePKCEChallenge(verifier: string): string {
    return crypto.createHash('sha256')
        .update(verifier)
        .digest('base64url');
}
