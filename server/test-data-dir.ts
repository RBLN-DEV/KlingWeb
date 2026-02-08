/**
 * Teste para data-dir.ts
 * Valida: getDataDir, ensureDataDir, writeFileAtomic, readJsonSafe
 */
import fs from 'fs';
import path from 'path';
import { DATA_DIR, ensureDataDir, writeFileAtomic, readJsonSafe } from './src/services/data-dir.js';

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

console.log('\n📂 === Testes do Data Dir ===\n');

// 1. DATA_DIR está definido
console.log('1. DATA_DIR');
assert(typeof DATA_DIR === 'string' && DATA_DIR.length > 0, `DATA_DIR definido: ${DATA_DIR}`);

// 2. ensureDataDir cria diretório
console.log('\n2. ensureDataDir');
ensureDataDir();
assert(fs.existsSync(DATA_DIR), 'DATA_DIR existe após ensureDataDir()');

// 3. writeFileAtomic
console.log('\n3. writeFileAtomic');
const testFile = path.join(DATA_DIR, '_test_atomic.json');
const testData = { foo: 'bar', ts: Date.now() };
writeFileAtomic(testFile, JSON.stringify(testData));
assert(fs.existsSync(testFile), 'arquivo criado por writeFileAtomic');
assert(!fs.existsSync(testFile + '.tmp'), 'arquivo .tmp removido (renomeado)');

// 4. readJsonSafe — arquivo válido
console.log('\n4. readJsonSafe');
const read = readJsonSafe<{ foo: string; ts: number }>(testFile);
assert(read !== null, 'readJsonSafe retorna objeto');
assert(read?.foo === 'bar', 'readJsonSafe dados corretos');

// 5. readJsonSafe — arquivo inexistente
console.log('\n5. readJsonSafe com arquivo inexistente');
const missing = readJsonSafe('/tmp/__nao_existe_xyz.json');
assert(missing === null, 'retorna null para arquivo inexistente');

// 6. readJsonSafe — JSON inválido
console.log('\n6. readJsonSafe com JSON inválido');
const badFile = path.join(DATA_DIR, '_test_bad.json');
fs.writeFileSync(badFile, '{not valid json!!!', 'utf-8');
const bad = readJsonSafe(badFile);
assert(bad === null, 'retorna null para JSON inválido');

// Cleanup
try { fs.unlinkSync(testFile); } catch {}
try { fs.unlinkSync(badFile); } catch {}

// Resumo
console.log(`\n${'='.repeat(40)}`);
console.log(`  Total: ${passed + failed} | ✅ Passed: ${passed} | ❌ Failed: ${failed}`);
console.log(`${'='.repeat(40)}\n`);

process.exit(failed > 0 ? 1 : 0);
