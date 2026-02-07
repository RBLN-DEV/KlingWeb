/**
 * Este módulo deve ser importado ANTES de qualquer outro módulo
 * para garantir que as variáveis de ambiente estejam disponíveis.
 *
 * Em ESM, todos os imports são hoisted, então dotenv.config() no index.ts
 * roda DEPOIS dos módulos importados serem avaliados.
 * Este módulo resolve isso sendo o primeiro import.
 */
import dotenv from 'dotenv';
dotenv.config();
//# sourceMappingURL=env.js.map