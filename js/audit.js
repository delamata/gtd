// ==========================================================================
// audit.js — log local de auditoria (criação, edição, conclusão, etc.)
// ==========================================================================
import { putOne, getAll, getNextId } from './database.js';
import { makeAuditEntry } from './models.js';
import { sortBy } from './utils.js';

/**
 * Registra uma entrada de auditoria. Chamado internamente pelo store.js em
 * toda operação relevante (criação, edição, conclusão, reabertura,
 * cancelamento, arquivamento, restauração de backup).
 */
export async function recordAudit({ tipoAcao, tipoRegistro, idRegistro, valorAnterior, valorNovo }) {
  const seq = await getNextId('L'); // L = log (não é um ID de negócio, apenas chave interna)
  const entry = makeAuditEntry(seq, { tipoAcao, tipoRegistro, idRegistro, valorAnterior, valorNovo });
  await putOne('auditLog', entry);
  return entry;
}

export async function listAuditLog({ tipoRegistro, idRegistro, tipoAcao } = {}) {
  let all = await getAll('auditLog');
  if (tipoRegistro) all = all.filter((e) => e.tipoRegistro === tipoRegistro);
  if (idRegistro) all = all.filter((e) => e.idRegistro === idRegistro);
  if (tipoAcao) all = all.filter((e) => e.tipoAcao === tipoAcao);
  return sortBy(all, (e) => e.dataHora, 'desc');
}
