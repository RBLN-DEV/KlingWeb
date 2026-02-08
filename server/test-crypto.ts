/**
 * Teste unitário para crypto.service.ts
 * Valida: encrypt/decrypt, tryDecrypt, formatos inválidos, tokens plain
 */
import { encrypt, decrypt, tryDecrypt, isEncrypted, generateEncryptionKey } from './src/services/crypto.service.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string) {
    if (condition) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.error(`  ❌ ${name}`);
        failed++;
    }
}

console.log('\n🔐 === Testes do Crypto Service ===\n');

// 1. Encrypt + Decrypt roundtrip
console.log('1. Encrypt/Decrypt roundtrip');
const original = 'EAAxxxxxxx_test_token_123456';
const encrypted = encrypt(original);
assert(typeof encrypted === 'string', 'encrypt retorna string');
assert(encrypted.split(':').length === 3, 'formato iv:tag:cipher');
const decrypted = decrypt(encrypted);
assert(decrypted === original, `decrypt recupera original (${decrypted === original})`);

// 2. isEncrypted
console.log('\n2. isEncrypted');
assert(isEncrypted(encrypted) === true, 'encrypted é detectado');
assert(isEncrypted('plain-text-token') === false, 'texto puro não é detectado');
assert(isEncrypted('EAAxxxxxxxxx') === false, 'token OAuth não é detectado');

// 3. Decrypt com token plain (começa com EAA)
console.log('\n3. Decrypt de token plain (EAA...)');
const plainToken = 'EAA1234567890abcdefgh';
const result = decrypt(plainToken);
assert(result === plainToken, 'retorna token plain inalterado');

// 4. Decrypt com token alfanumérico longo (legado)
console.log('\n4. Decrypt de token alfanumérico longo (legado)');
const longToken = 'abcdef1234567890abcdef1234567890';
const result2 = decrypt(longToken);
assert(result2 === longToken, 'retorna token legado inalterado');

// 5. Decrypt com formato inválido (2 partes)
console.log('\n5. Decrypt com formato inválido');
try {
    decrypt('only:two');
    assert(false, 'deveria lançar erro para 2 partes');
} catch (err: any) {
    assert(err.message.includes('inválido') || err.message.includes('Formato'), `lança erro correto: ${err.message.slice(0, 80)}`);
}

// 6. Decrypt com string vazia
console.log('\n6. Decrypt com string vazia');
try {
    decrypt('');
    assert(false, 'deveria lançar erro para string vazia');
} catch (err: any) {
    assert(err.message.includes('vazio') || err.message.includes('inválido'), 'lança erro para vazio');
}

// 7. Decrypt com 3 partes mas formato errado (iv curto)
console.log('\n7. Decrypt com 3 partes mas iv de tamanho errado');
try {
    decrypt('aabb:ccdd:eeff');
    assert(false, 'deveria lançar erro para iv curto');
} catch (err: any) {
    assert(err.message.includes('inválido') || err.message.includes('Formato'), 'lança erro para formato de iv errado');
}

// 8. tryDecrypt — sucesso
console.log('\n8. tryDecrypt com texto válido');
const tryResult = tryDecrypt(encrypted);
assert(tryResult === original, 'tryDecrypt retorna valor descriptografado');

// 9. tryDecrypt — falha retorna null
console.log('\n9. tryDecrypt com texto inválido');
const tryResult2 = tryDecrypt('lixo:curto');
assert(tryResult2 === null, 'tryDecrypt retorna null para formato inválido');

// 10. generateEncryptionKey
console.log('\n10. generateEncryptionKey');
const key = generateEncryptionKey();
assert(key.length === 64, 'chave tem 64 caracteres hex');
assert(/^[0-9a-f]+$/.test(key), 'chave é hexadecimal válida');

// Resumo
console.log(`\n${'='.repeat(40)}`);
console.log(`  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
