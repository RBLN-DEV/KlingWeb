/**
 * Script para aprovar o usuário de teste e criar admin temporário
 */
import { getAllUsers, updateUserStatus, updateUserRole } from './src/services/user.store.js';

// Encontrar e aprovar o usuario test
const all = getAllUsers();
const user = all.find(u => u.email === 'testuser@test.com');
if (user) {
    updateUserStatus(user.id, 'approved');
    updateUserRole(user.id, 'admin');
    console.log('✅ Usuário testuser@test.com aprovado e promovido a admin');
    console.log('   ID:', user.id);
} else {
    console.log('❌ Usuário testuser@test.com não encontrado');
}

const allAfter = getAllUsers();
console.log(`\nTotal de usuários: ${allAfter.length}`);
allAfter.forEach(u => console.log(`  - ${u.email} [${u.role}/${u.status}]`));
