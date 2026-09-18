// ==========================================================================
// store.js — camada de regras de negócio (CRUD, IDs, recorrência, seletores)
// Única camada que os "views" devem consultar. Toda escrita passa por aqui,
// garantindo auditoria, exclusão lógica e notificação de mudanças (pub/sub).
// ==========================================================================
import * as db from './database.js';
import { recordAudit, listAuditLog } from './audit.js';
import { makeTask, makeFup, makeAgendaItem, makeCollaborator, makeHistoryEntry, makeFupHistoryEntry, DEFAULT_COLLABORATOR_COLORS } from './models.js';
import { validateTask, validateFup, validateAgenda, validateCollaborator, sanitizeText } from './validators.js';
import {
  nowISO, todayISO, addDaysISO, addMonthsISO, diffDaysISO, isOverdue, isOpenStatus,
  isToday, isTomorrow, isThisWeek, isWithinNextDays, sortBy, deepClone, PRIORIDADE_ORDEM,
} from './utils.js';
import { SEED_COLLABORATORS, SEED_TASKS, SEED_FUPS, SEED_HISTORY } from '../data/seed-data.js';
import * as backup from './backup.js';

// ---------------------------------------------------------------------
// Pub/sub — views se inscrevem para re-renderizar após qualquer mutação
// ---------------------------------------------------------------------
const listeners = new Set();
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ---------------------------------------------------------------------
// Sincronização entre abas — o IndexedDB já é compartilhado pelo navegador,
// mas cada aba mantém sua própria lista de listeners em memória. O
// BroadcastChannel replica o evento de mutação para as demais abas da
// mesma origem, que então re-executam seus listeners (refresh) e voltam
// a consultar o banco — já atualizado. Não sincroniza entre navegadores
// ou dispositivos diferentes: isso exigiria um backend.
// ---------------------------------------------------------------------
const syncChannel = ('BroadcastChannel' in globalThis) ? new BroadcastChannel('gtd_delamata_sync') : null;
if (syncChannel) {
  syncChannel.onmessage = (event) => emit({ ...event.data, __fromOtherTab: true });
  // Em Node (usado pelos testes), um BroadcastChannel aberto mantém o
  // processo vivo. unref() existe só no Node e evita isso; navegadores não
  // têm esse método, então o guard acima cobre os dois ambientes.
  if (typeof syncChannel.unref === 'function') syncChannel.unref();
}

function emit(event) {
  for (const fn of listeners) {
    try { fn(event); } catch (err) { console.error('[store] erro em listener', err); }
  }
  if (syncChannel && !event.__fromOtherTab) {
    try { syncChannel.postMessage(event); } catch (err) { console.warn('[store] não foi possível sincronizar com outras abas', err); }
  }
}

// ---------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------
let remoteChangeWired = false;

export async function init() {
  await db.openDatabase();
  await db.runDataMigrations();
  // claimSeed() é atômico no backend: se duas abas/dispositivos fizerem o
  // primeiro login quase ao mesmo tempo, só uma delas "ganha" e semeia —
  // evita duplicar colaboradores/tarefas/FUPs de exemplo (ver claimSeed()
  // em cada adapter).
  if (await db.claimSeed()) {
    await seedInitialData();
  }
  // Mudanças feitas em OUTRO dispositivo/aba (Supabase Realtime; no-op no
  // adapter IndexedDB) chegam aqui e reaproveitam o mesmo pub/sub que já
  // notifica as views a re-consultar os dados. Guardado por flag para não
  // abrir uma segunda assinatura em caso de logout seguido de novo login.
  if (!remoteChangeWired) {
    remoteChangeWired = true;
    db.onRemoteChange(() => emit({ type: 'remote:sync' }));
  }
}

async function seedInitialData() {
  const nameToId = {};
  for (const c of SEED_COLLABORATORS) {
    const created = await createCollaborator(c);
    nameToId[c.nome] = created.id;
  }
  for (const t of SEED_TASKS) {
    await createTask(t);
  }
  for (const f of SEED_FUPS) {
    const { colaboradorNome, ...rest } = f;
    await createFup({ ...rest, colaboradorId: nameToId[colaboradorNome] || nameToId['A definir'] });
  }
  for (const h of SEED_HISTORY) {
    await seedHistoryEntry(h);
  }
  const meta = (await db.getMeta()) || { key: 'app', schemaVersion: db.SCHEMA_VERSION, counters: {} };
  meta.seeded = true;
  await db.saveMeta(meta);
  emit({ type: 'seed' });
}

async function seedHistoryEntry(data) {
  const id = await db.getNextId('C');
  const entry = makeHistoryEntry(id, { ...data, tipoOrigem: 'seed', idOrigem: '' });
  await db.putOne('history', entry);
  await recordAudit({ tipoAcao: 'criacao', tipoRegistro: 'history', idRegistro: id, valorNovo: entry });
  return entry;
}

// =======================================================================
// COLABORADORES
// =======================================================================
export async function listCollaborators({ includeInactive = true } = {}) {
  const all = await db.getAll('collaborators');
  return sortBy(
    all.filter((c) => !c.deletedFlag && (includeInactive || c.ativo)),
    (c) => c.nome
  );
}

export async function getCollaborator(id) {
  return db.getOne('collaborators', id);
}

export async function createCollaborator(data) {
  const validation = validateCollaborator(data);
  if (!validation.valid) throw new ValidationError(validation.errors);
  const id = await db.getNextId('P');
  const cor = data.cor || DEFAULT_COLLABORATOR_COLORS[(await db.getAll('collaborators')).length % DEFAULT_COLLABORATOR_COLORS.length];
  const record = makeCollaborator(id, { ...data, cor });
  await db.putOne('collaborators', record);
  await recordAudit({ tipoAcao: 'criacao', tipoRegistro: 'collaborator', idRegistro: id, valorNovo: record });
  emit({ type: 'collaborator:create', record });
  return record;
}

export async function updateCollaborator(id, patch) {
  const current = await db.getOne('collaborators', id);
  if (!current) throw new Error('Colaborador não encontrado.');
  const merged = makeCollaborator(id, { ...current, ...patch, criadoEm: current.criadoEm });
  const validation = validateCollaborator(merged);
  if (!validation.valid) throw new ValidationError(validation.errors);
  await db.putOne('collaborators', merged);
  await recordAudit({ tipoAcao: 'edicao', tipoRegistro: 'collaborator', idRegistro: id, valorAnterior: current, valorNovo: merged });
  emit({ type: 'collaborator:update', record: merged });
  return merged;
}

export async function setCollaboratorActive(id, ativo) {
  const current = await db.getOne('collaborators', id);
  if (!current) throw new Error('Colaborador não encontrado.');
  const merged = { ...current, ativo };
  await db.putOne('collaborators', merged);
  await recordAudit({ tipoAcao: ativo ? 'edicao' : 'arquivamento', tipoRegistro: 'collaborator', idRegistro: id, valorAnterior: current, valorNovo: merged });
  emit({ type: 'collaborator:update', record: merged });
  return merged;
}

export async function collaboratorStats(id) {
  const fups = (await db.getAll('fups')).filter((f) => !f.deletedFlag && !f.arquivada && f.colaboradorId === id);
  const abertos = fups.filter((f) => isOpenStatus(f.status));
  const atrasados = abertos.filter((f) => isOverdue(f, 'proximoFupEm') || isOverdue(f, 'prazoFinal'));
  const aguardando = abertos.filter((f) => f.status === 'aguardando_retorno');
  return { totalAberto: abertos.length, atrasados: atrasados.length, aguardando: aguardando.length };
}

// =======================================================================
// TAREFAS
// =======================================================================

/**
 * Regra de visibilidade do arquivamento, comum a tarefas e FUPs: itens
 * arquivados somem de TODAS as listagens e agregações (dashboard, hoje,
 * foco do dia, busca global, e-mail executivo) porque todas elas passam
 * por listTasks()/listFups() sem filtro. Para vê-los é preciso pedir
 * explicitamente: `somenteArquivadas` (só os arquivados) ou
 * `includeArchived` (arquivados + ativos). Arquivar nunca apaga nada —
 * o registro continua no banco e pode ser desarquivado a qualquer momento.
 */
function matchesArchiveFilter(item, filters = {}) {
  if (filters.somenteArquivadas) return !!item.arquivada;
  if (filters.includeArchived) return true;
  return !item.arquivada;
}

function matchesCommonFilters(item, filters, dateField) {
  if (!filters) return true;
  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (!statuses.includes(item.status)) return false;
  }
  if (filters.prioridade && item.prioridade !== filters.prioridade) return false;
  if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
  if (filters.area && item.area !== filters.area) return false;
  if (filters.colaboradorId && item.colaboradorId !== filters.colaboradorId) return false;
  if (filters.aguardandoRetorno && item.status !== 'aguardando_retorno') return false;
  if (filters.comBloqueio && !item.dependencia) return false;
  if (filters.concluidas === true && item.status !== 'concluido') return false;
  if (filters.canceladas === true && item.status !== 'cancelado') return false;
  if (filters.concluidas === false && item.status === 'concluido') return false;
  if (filters.canceladas === false && item.status === 'cancelado') return false;
  if (filters.tag && !(item.tags || []).includes(filters.tag)) return false;
  if (filters.periodo && dateField) {
    const value = item[dateField];
    if (filters.periodo === 'hoje' && !isToday(value)) return false;
    if (filters.periodo === 'amanha' && !isTomorrow(value)) return false;
    if (filters.periodo === 'semana' && !isThisWeek(value)) return false;
    if (filters.periodo === 'proximos7' && !isWithinNextDays(value, 7)) return false;
    if (filters.periodo === 'atrasadas' && !isOverdue(item, dateField)) return false;
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack = [item.id, item.titulo, item.assunto, item.area, item.responsavel, item.proximaAcao, item.observacao, item.compromisso, ...(item.tags || [])]
      .filter(Boolean)
      .join(' | ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

export async function listTasks(filters = {}) {
  const all = await db.getAll('tasks');
  const visible = all.filter((t) => !t.deletedFlag && matchesArchiveFilter(t, filters));
  return visible.filter((t) => matchesCommonFilters(t, filters, 'prazo'));
}

export async function getTask(id) {
  return db.getOne('tasks', id);
}

export async function createTask(data) {
  const validation = validateTask(data);
  if (!validation.valid) throw new ValidationError(validation.errors);
  const id = await db.getNextId('T');
  const record = makeTask(id, data);
  await db.putOne('tasks', record);
  await recordAudit({ tipoAcao: 'criacao', tipoRegistro: 'task', idRegistro: id, valorNovo: record });
  emit({ type: 'task:create', record });
  return record;
}

export async function updateTask(id, patch) {
  const current = await db.getOne('tasks', id);
  if (!current) throw new Error('Tarefa não encontrada.');
  const merged = makeTask(id, { ...current, ...patch, criadoEm: current.criadoEm, concluidoEm: current.concluidoEm, origemId: current.origemId });
  const validation = validateTask(merged);
  if (!validation.valid) throw new ValidationError(validation.errors);
  await db.putOne('tasks', merged);
  await recordAudit({ tipoAcao: 'edicao', tipoRegistro: 'task', idRegistro: id, valorAnterior: current, valorNovo: merged });
  emit({ type: 'task:update', record: merged });
  return merged;
}

function computeNextDate(baseDate, recorrencia) {
  if (!baseDate) return '';
  switch (recorrencia) {
    case 'diaria': return addDaysISO(baseDate, 1);
    case 'semanal': return addDaysISO(baseDate, 7);
    case 'quinzenal': return addDaysISO(baseDate, 14);
    case 'mensal': return addMonthsISO(baseDate, 1);
    case 'personalizada': return addDaysISO(baseDate, 7);
    default: return '';
  }
}

/**
 * Conclui uma tarefa. Se for recorrente e createNext !== false (padrão:
 * criar a próxima ocorrência), gera a próxima tarefa vinculada por
 * origemId, com novo ID — sem jamais apagar a conclusão anterior.
 */
export async function completeTask(id, { createNext = true, resultado = '' } = {}) {
  const current = await db.getOne('tasks', id);
  if (!current) throw new Error('Tarefa não encontrada.');
  const ts = nowISO();
  const updated = { ...current, status: 'concluido', concluidoEm: ts, atualizadoEm: ts };
  await db.putOne('tasks', updated);
  await recordAudit({ tipoAcao: 'conclusao', tipoRegistro: 'task', idRegistro: id, valorAnterior: current, valorNovo: updated });

  const historyId = await db.getNextId('C');
  const historyEntry = makeHistoryEntry(historyId, {
    categoria: 'tarefa', area: current.area, atividade: current.titulo, responsavel: current.responsavel,
    resultado: resultado || current.proximaAcao, tipoOrigem: 'task', idOrigem: id,
  });
  await db.putOne('history', historyEntry);

  let nextTask = null;
  if (current.recorrencia && current.recorrencia !== 'nenhuma' && createNext) {
    const nextId = await db.getNextId('T');
    nextTask = makeTask(nextId, {
      ...current, status: 'a_fazer', concluidoEm: '', origemId: id,
      prazo: computeNextDate(current.prazo || todayISO(), current.recorrencia),
    });
    await db.putOne('tasks', nextTask);
    await recordAudit({ tipoAcao: 'criacao', tipoRegistro: 'task', idRegistro: nextId, valorNovo: nextTask });
  }

  emit({ type: 'task:complete', record: updated, historyEntry, nextTask });
  return { task: updated, historyEntry, nextTask };
}

export async function cancelTask(id, motivo = '') {
  const current = await db.getOne('tasks', id);
  if (!current) throw new Error('Tarefa não encontrada.');
  const ts = nowISO();
  const updated = { ...current, status: 'cancelado', atualizadoEm: ts, observacao: motivo ? `${current.observacao}\n[Cancelada] ${motivo}`.trim() : current.observacao };
  await db.putOne('tasks', updated);
  await recordAudit({ tipoAcao: 'cancelamento', tipoRegistro: 'task', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'task:cancel', record: updated });
  return updated;
}

export async function reopenTask(id) {
  const current = await db.getOne('tasks', id);
  if (!current) throw new Error('Tarefa não encontrada.');
  const ts = nowISO();
  const updated = { ...current, status: 'a_fazer', concluidoEm: '', atualizadoEm: ts };
  await db.putOne('tasks', updated);
  await recordAudit({ tipoAcao: 'reabertura', tipoRegistro: 'task', idRegistro: id, valorAnterior: current, valorNovo: updated });
  await markHistoryReopened('task', id);
  emit({ type: 'task:reopen', record: updated });
  return updated;
}

export async function archiveTask(id) {
  const current = await db.getOne('tasks', id);
  if (!current) throw new Error('Tarefa não encontrada.');
  const updated = { ...current, arquivada: true, atualizadoEm: nowISO() };
  await db.putOne('tasks', updated);
  await recordAudit({ tipoAcao: 'arquivamento', tipoRegistro: 'task', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'task:archive', record: updated });
  return updated;
}

/** Traz a tarefa de volta às listagens normais (desfaz o arquivamento). */
export async function unarchiveTask(id) {
  const current = await db.getOne('tasks', id);
  if (!current) throw new Error('Tarefa não encontrada.');
  const updated = { ...current, arquivada: false, atualizadoEm: nowISO() };
  await db.putOne('tasks', updated);
  await recordAudit({ tipoAcao: 'desarquivamento', tipoRegistro: 'task', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'task:unarchive', record: updated });
  return updated;
}

// =======================================================================
// FUPs (Follow-ups)
// =======================================================================
export async function listFups(filters = {}) {
  const all = await db.getAll('fups');
  const visible = all.filter((f) => !f.deletedFlag && matchesArchiveFilter(f, filters));
  return visible.filter((f) => matchesCommonFilters(f, filters, 'proximoFupEm'));
}

export async function getFup(id) {
  return db.getOne('fups', id);
}

export async function createFup(data) {
  const validation = validateFup(data);
  if (!validation.valid) throw new ValidationError(validation.errors);
  const id = await db.getNextId('F');
  const record = makeFup(id, data);
  await db.putOne('fups', record);
  await recordAudit({ tipoAcao: 'criacao', tipoRegistro: 'fup', idRegistro: id, valorNovo: record });
  emit({ type: 'fup:create', record });
  return record;
}

export async function updateFup(id, patch) {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const merged = makeFup(id, { ...current, ...patch, criadoEm: current.criadoEm, concluidoEm: current.concluidoEm, historico: current.historico, qtdCobrancas: current.qtdCobrancas });
  const validation = validateFup(merged);
  if (!validation.valid) throw new ValidationError(validation.errors);
  await db.putOne('fups', merged);
  await recordAudit({ tipoAcao: 'edicao', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: merged });
  emit({ type: 'fup:update', record: merged });
  return merged;
}

export async function completeFup(id, { resultado = '' } = {}) {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const ts = nowISO();
  const historico = [...current.historico, makeFupHistoryEntry({ tipo: 'conclusao', texto: resultado || 'FUP concluído.' })];
  const updated = { ...current, status: 'concluido', concluidoEm: ts, atualizadoEm: ts, historico };
  await db.putOne('fups', updated);
  await recordAudit({ tipoAcao: 'conclusao', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: updated });

  const historyId = await db.getNextId('C');
  const historyEntry = makeHistoryEntry(historyId, {
    categoria: 'fup', area: current.area, atividade: current.assunto, responsavel: current.responsavel,
    resultado: resultado || current.proximaAcao, tipoOrigem: 'fup', idOrigem: id,
  });
  await db.putOne('history', historyEntry);

  emit({ type: 'fup:complete', record: updated, historyEntry });
  return { fup: updated, historyEntry };
}

export async function cancelFup(id, motivo = '') {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const ts = nowISO();
  const historico = [...current.historico, makeFupHistoryEntry({ tipo: 'cancelamento', texto: motivo || 'FUP cancelado.' })];
  const updated = { ...current, status: 'cancelado', atualizadoEm: ts, historico };
  await db.putOne('fups', updated);
  await recordAudit({ tipoAcao: 'cancelamento', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'fup:cancel', record: updated });
  return updated;
}

export async function reopenFup(id) {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const ts = nowISO();
  const historico = [...current.historico, makeFupHistoryEntry({ tipo: 'reabertura', texto: 'FUP reaberto.' })];
  const updated = { ...current, status: 'em_andamento', concluidoEm: '', atualizadoEm: ts, historico };
  await db.putOne('fups', updated);
  await recordAudit({ tipoAcao: 'reabertura', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: updated });
  await markHistoryReopened('fup', id);
  emit({ type: 'fup:reopen', record: updated });
  return updated;
}

/** Botão "Cobrei hoje": registra data/hora, incrementa contador de cobranças. */
export async function registerCobranca(id, { resposta = '' } = {}) {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const ts = nowISO();
  const texto = resposta ? `Cobrança registrada. Resposta recebida: ${resposta}` : 'Cobrança registrada hoje.';
  const historico = [...current.historico, makeFupHistoryEntry({ tipo: 'cobranca', texto })];
  const updated = { ...current, qtdCobrancas: (current.qtdCobrancas || 0) + 1, ultimoContatoEm: ts, atualizadoEm: ts, historico };
  await db.putOne('fups', updated);
  await recordAudit({ tipoAcao: 'edicao', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'fup:update', record: updated });
  return updated;
}

export async function setNextFupDate(id, date) {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const ts = nowISO();
  const historico = [...current.historico, makeFupHistoryEntry({ tipo: 'reagendamento', texto: `Próximo FUP alterado para ${date || '—'}.` })];
  const updated = { ...current, proximoFupEm: date, atualizadoEm: ts, historico };
  await db.putOne('fups', updated);
  await recordAudit({ tipoAcao: 'edicao', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'fup:update', record: updated });
  return updated;
}

export async function archiveFup(id) {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const ts = nowISO();
  const historico = [...current.historico, makeFupHistoryEntry({ tipo: 'arquivamento', texto: 'FUP arquivado.' })];
  const updated = { ...current, arquivada: true, atualizadoEm: ts, historico };
  await db.putOne('fups', updated);
  await recordAudit({ tipoAcao: 'arquivamento', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'fup:archive', record: updated });
  return updated;
}

/** Traz o FUP de volta às listagens normais (desfaz o arquivamento). */
export async function unarchiveFup(id) {
  const current = await db.getOne('fups', id);
  if (!current) throw new Error('FUP não encontrado.');
  const ts = nowISO();
  const historico = [...current.historico, makeFupHistoryEntry({ tipo: 'desarquivamento', texto: 'FUP desarquivado.' })];
  const updated = { ...current, arquivada: false, atualizadoEm: ts, historico };
  await db.putOne('fups', updated);
  await recordAudit({ tipoAcao: 'desarquivamento', tipoRegistro: 'fup', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'fup:unarchive', record: updated });
  return updated;
}

export async function getFupsByCollaborator(colaboradorId) {
  const all = await listFups();
  return all.filter((f) => f.colaboradorId === colaboradorId);
}

// =======================================================================
// AGENDA
// =======================================================================
export async function listAgenda(filters = {}) {
  const all = await db.getAll('agenda');
  const visible = all.filter((a) => !a.deletedFlag);
  const filtered = visible.filter((a) => matchesCommonFilters(a, filters, 'data'));
  return sortBy(filtered, (a) => `${a.data} ${a.horaInicio || '99:99'}`);
}

export async function getAgendaItem(id) {
  return db.getOne('agenda', id);
}

export async function createAgendaItem(data) {
  const validation = validateAgenda(data);
  if (!validation.valid) throw new ValidationError(validation.errors);
  const id = await db.getNextId('A');
  const record = makeAgendaItem(id, data);
  await db.putOne('agenda', record);
  await recordAudit({ tipoAcao: 'criacao', tipoRegistro: 'agenda', idRegistro: id, valorNovo: record });
  emit({ type: 'agenda:create', record });
  return record;
}

export async function updateAgendaItem(id, patch) {
  const current = await db.getOne('agenda', id);
  if (!current) throw new Error('Compromisso não encontrado.');
  const merged = makeAgendaItem(id, { ...current, ...patch, criadoEm: current.criadoEm, concluidoEm: current.concluidoEm });
  const validation = validateAgenda(merged);
  if (!validation.valid) throw new ValidationError(validation.errors);
  await db.putOne('agenda', merged);
  await recordAudit({ tipoAcao: 'edicao', tipoRegistro: 'agenda', idRegistro: id, valorAnterior: current, valorNovo: merged });
  emit({ type: 'agenda:update', record: merged });
  return merged;
}

export async function completeAgendaItem(id, resultado = '') {
  const current = await db.getOne('agenda', id);
  if (!current) throw new Error('Compromisso não encontrado.');
  const ts = nowISO();
  const updated = { ...current, status: 'concluido', concluidoEm: ts, atualizadoEm: ts };
  await db.putOne('agenda', updated);
  await recordAudit({ tipoAcao: 'conclusao', tipoRegistro: 'agenda', idRegistro: id, valorAnterior: current, valorNovo: updated });

  const historyId = await db.getNextId('C');
  const historyEntry = makeHistoryEntry(historyId, {
    categoria: 'agenda', area: current.area, atividade: current.compromisso, responsavel: current.responsavel,
    resultado: resultado || current.preparacao, tipoOrigem: 'agenda', idOrigem: id,
  });
  await db.putOne('history', historyEntry);

  emit({ type: 'agenda:complete', record: updated, historyEntry });
  return { item: updated, historyEntry };
}

export async function cancelAgendaItem(id) {
  const current = await db.getOne('agenda', id);
  if (!current) throw new Error('Compromisso não encontrado.');
  const updated = { ...current, status: 'cancelado', atualizadoEm: nowISO() };
  await db.putOne('agenda', updated);
  await recordAudit({ tipoAcao: 'cancelamento', tipoRegistro: 'agenda', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'agenda:cancel', record: updated });
  return updated;
}

export async function reopenAgendaItem(id) {
  const current = await db.getOne('agenda', id);
  if (!current) throw new Error('Compromisso não encontrado.');
  const updated = { ...current, status: 'agendado', concluidoEm: '', atualizadoEm: nowISO() };
  await db.putOne('agenda', updated);
  await recordAudit({ tipoAcao: 'reabertura', tipoRegistro: 'agenda', idRegistro: id, valorAnterior: current, valorNovo: updated });
  await markHistoryReopened('agenda', id);
  emit({ type: 'agenda:reopen', record: updated });
  return updated;
}

/** Marca conflitos de horário: retorna os mesmos itens com `_conflict: true` quando sobrepõem. */
export function annotateConflicts(items) {
  const active = items.filter((i) => i.status !== 'cancelado' && i.horaInicio && i.horaFim);
  const sorted = sortBy(active, (i) => i.horaInicio);
  const conflictIds = new Set();
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (sorted[j].horaInicio < sorted[i].horaFim) {
        conflictIds.add(sorted[i].id);
        conflictIds.add(sorted[j].id);
      } else break;
    }
  }
  return items.map((i) => ({ ...i, _conflict: conflictIds.has(i.id) }));
}

/** Calcula janelas livres entre compromissos ativos dentro do horário comercial informado. */
export function freeWindows(items, { start = '08:00', end = '19:00' } = {}) {
  const active = sortBy(items.filter((i) => i.status !== 'cancelado' && i.horaInicio && i.horaFim), (i) => i.horaInicio);
  const windows = [];
  let cursor = start;
  for (const item of active) {
    if (item.horaInicio > cursor) windows.push({ inicio: cursor, fim: item.horaInicio });
    if (item.horaFim > cursor) cursor = item.horaFim;
  }
  if (cursor < end) windows.push({ inicio: cursor, fim: end });
  return windows.filter((w) => w.inicio < w.fim);
}

export async function convertPrepToTask(agendaId) {
  const item = await db.getOne('agenda', agendaId);
  if (!item) throw new Error('Compromisso não encontrado.');
  const titulo = item.preparacao ? sanitizeText(item.preparacao, { maxLength: 200 }) : `Preparar: ${item.compromisso}`;
  return createTask({
    titulo, area: item.area, responsavel: item.responsavel, prioridade: 'media',
    status: 'a_fazer', prazo: item.data, proximaAcao: item.preparacao,
  });
}

// =======================================================================
// HISTÓRICO (conclusões)
// =======================================================================
export async function listHistory(filters = {}) {
  const all = await db.getAll('history');
  return sortBy(
    all.filter((h) => {
      if (filters.categoria && h.categoria !== filters.categoria) return false;
      if (filters.area && h.area !== filters.area) return false;
      if (filters.responsavel && h.responsavel !== filters.responsavel) return false;
      if (filters.de && h.dataHora.slice(0, 10) < filters.de) return false;
      if (filters.ate && h.dataHora.slice(0, 10) > filters.ate) return false;
      if (filters.search) {
        const q = filters.search.toLowerCase();
        if (!`${h.id} ${h.atividade} ${h.area} ${h.responsavel} ${h.resultado}`.toLowerCase().includes(q)) return false;
      }
      return true;
    }),
    (h) => h.dataHora,
    'desc'
  );
}

export async function correctHistoryObservation(id, novaObservacao) {
  const current = await db.getOne('history', id);
  if (!current) throw new Error('Registro de histórico não encontrado.');
  const updated = { ...current, resultado: sanitizeText(novaObservacao, { maxLength: 2000 }), atualizadoEm: nowISO() };
  await db.putOne('history', updated);
  await recordAudit({ tipoAcao: 'edicao', tipoRegistro: 'history', idRegistro: id, valorAnterior: current, valorNovo: updated });
  emit({ type: 'history:update', record: updated });
  return updated;
}

export async function reopenFromHistory(historyId) {
  const h = await db.getOne('history', historyId);
  if (!h) throw new Error('Registro de histórico não encontrado.');
  if (h.tipoOrigem === 'task') await reopenTask(h.idOrigem);
  else if (h.tipoOrigem === 'fup') await reopenFup(h.idOrigem);
  else if (h.tipoOrigem === 'agenda') await reopenAgendaItem(h.idOrigem);
  else throw new Error('Este registro não possui atividade de origem para reabrir.');
  return db.getOne('history', historyId);
}

async function markHistoryReopened(tipoOrigem, idOrigem) {
  const all = await db.getAll('history');
  const related = all.filter((h) => h.tipoOrigem === tipoOrigem && h.idOrigem === idOrigem && !h.reaberto);
  for (const h of related) {
    const updated = { ...h, reaberto: true, atualizadoEm: nowISO() };
    await db.putOne('history', updated);
    await recordAudit({ tipoAcao: 'reabertura', tipoRegistro: 'history', idRegistro: h.id, valorAnterior: h, valorNovo: updated });
  }
}

// =======================================================================
// AUDITORIA
// =======================================================================
export { listAuditLog };

// =======================================================================
// SELETORES / AGREGAÇÕES (Dashboard, Hoje, Foco do dia...)
// =======================================================================
export async function getOverdueItems() {
  const [tasks, fups, agenda] = await Promise.all([listTasks(), listFups(), listAgenda()]);
  const items = [];
  for (const t of tasks) if (isOverdue(t, 'prazo')) items.push({ type: 'task', ...t, _label: t.titulo, _date: t.prazo });
  for (const f of fups) {
    if (isOverdue(f, 'proximoFupEm') || isOverdue(f, 'prazoFinal')) items.push({ type: 'fup', ...f, _label: f.assunto, _date: f.prazoFinal || f.proximoFupEm });
  }
  for (const a of agenda) if (isOverdue(a, 'data')) items.push({ type: 'agenda', ...a, _label: a.compromisso, _date: a.data });
  return sortBy(items, (i) => i._date);
}

export async function getTodayItems() {
  const [tasks, fups, agenda, history] = await Promise.all([listTasks(), listFups(), listAgenda(), listHistory()]);
  return {
    tasks: tasks.filter((t) => isOpenStatus(t.status) && isToday(t.prazo)),
    fups: fups.filter((f) => isOpenStatus(f.status) && (isToday(f.proximoFupEm) || isToday(f.prazoFinal))),
    agenda: annotateConflicts(agenda.filter((a) => isToday(a.data))),
    concluidasHoje: history.filter((h) => h.dataHora.slice(0, 10) === todayISO()),
    atrasados: await getOverdueItems(),
  };
}

/**
 * "Urgente" existe em dois eixos independentes: como status (o item está
 * pegando fogo agora) e como prioridade (é o mais importante da fila).
 * Qualquer um dos dois torna o item urgente para efeito de contagem e
 * de destaque nas telas.
 */
export function isUrgente(item) {
  return item.status === 'urgente' || item.prioridade === 'urgente';
}

function focusScore(item, dateField) {
  let score = 0;
  if (item.status === 'urgente') score += 8;
  if (item.prioridade === 'urgente') score += 7;
  if (item.prioridade === 'alta') score += 5;
  if (isOverdue(item, dateField)) score += 4;
  if (isToday(item[dateField])) score += 3;
  if (item.dependencia) score += 2;
  if (item.status === 'aguardando_retorno') score += 2;
  if (dateField === 'proximoFupEm' && item.proximoFupEm) score += 1;
  return score;
}

export async function getFocusOfDay(limit = 5) {
  const [tasks, fups] = await Promise.all([listTasks(), listFups()]);
  const openTasks = tasks.filter((t) => isOpenStatus(t.status)).map((t) => ({ type: 'task', ...t, _label: t.titulo, _date: t.prazo, _score: focusScore(t, 'prazo') }));
  const openFups = fups.filter((f) => isOpenStatus(f.status)).map((f) => ({ type: 'fup', ...f, _label: f.assunto, _date: f.proximoFupEm || f.prazoFinal, _score: focusScore(f, 'proximoFupEm') }));
  const pool = [...openTasks, ...openFups].filter((i) => i._score > 0 || i._date);
  const sorted = pool.sort((a, b) => b._score - a._score || (a._date || '9999').localeCompare(b._date || '9999'));
  return sorted.slice(0, limit);
}

export async function getUpcoming7Days() {
  const [tasks, fups, agenda] = await Promise.all([listTasks(), listFups(), listAgenda()]);
  return {
    tasks: tasks.filter((t) => isOpenStatus(t.status) && isWithinNextDays(t.prazo, 7)),
    fups: fups.filter((f) => isOpenStatus(f.status) && (isWithinNextDays(f.proximoFupEm, 7) || isWithinNextDays(f.prazoFinal, 7))),
    agenda: agenda.filter((a) => isOpenStatus(a.status) && isWithinNextDays(a.data, 7)),
  };
}

export async function getFupsByCollaboratorSummary() {
  const [collaborators, fups] = await Promise.all([listCollaborators(), listFups()]);
  return collaborators.map((c) => {
    const mine = fups.filter((f) => f.colaboradorId === c.id);
    const abertos = mine.filter((f) => isOpenStatus(f.status));
    const atrasados = abertos.filter((f) => isOverdue(f, 'proximoFupEm') || isOverdue(f, 'prazoFinal'));
    const aguardando = abertos.filter((f) => f.status === 'aguardando_retorno');
    const proximo = sortBy(abertos.filter((f) => f.proximoFupEm), (f) => f.proximoFupEm)[0];
    const critico = sortBy(atrasados.length ? atrasados : abertos, (f) => -(PRIORIDADE_ORDEM[f.prioridade] ?? 9) * -1)
      .sort((a, b) => (PRIORIDADE_ORDEM[a.prioridade] ?? 9) - (PRIORIDADE_ORDEM[b.prioridade] ?? 9))[0];
    return { colaborador: c, totalAberto: abertos.length, atrasados: atrasados.length, aguardando: aguardando.length, proximoFup: proximo ? proximo.proximoFupEm : '', itemMaisCritico: critico ? critico.assunto : '' };
  });
}

export async function getDashboardStats() {
  const [tasks, fups, agenda, history] = await Promise.all([listTasks(), listFups(), listAgenda(), listHistory()]);
  const openTasks = tasks.filter((t) => isOpenStatus(t.status));
  const openFups = fups.filter((f) => isOpenStatus(f.status));
  const overdue = await getOverdueItems();
  const today = todayISO();
  const weekStart = todayISO().slice(0, 8); // apenas para leitura visual, não usado em comparação
  return {
    tarefasAbertas: openTasks.length,
    fupsAbertos: openFups.length,
    itensHoje: openTasks.filter((t) => isToday(t.prazo)).length + openFups.filter((f) => isToday(f.proximoFupEm) || isToday(f.prazoFinal)).length + agenda.filter((a) => isToday(a.data) && isOpenStatus(a.status)).length,
    atrasados: overdue.length,
    urgentes: [...openTasks, ...openFups].filter(isUrgente).length,
    altaPrioridade: openTasks.filter((t) => t.prioridade === 'alta').length + openFups.filter((f) => f.prioridade === 'alta').length,
    aguardandoRetorno: openFups.filter((f) => f.status === 'aguardando_retorno').length + openTasks.filter((t) => t.status === 'aguardando_retorno').length,
    agendaHoje: annotateConflicts(agenda.filter((a) => isToday(a.data))),
    concluidasHoje: history.filter((h) => h.dataHora.slice(0, 10) === today).length,
    concluidasSemana: history.filter((h) => isThisWeek(h.dataHora.slice(0, 10))).length,
    fupsSemAtualizacao7d: openFups.filter((f) => diffDaysISO(f.atualizadoEm.slice(0, 10), today) > 7).length,
    distribuicaoStatusTarefas: countBy(tasks, 'status'),
    distribuicaoPrioridade: countBy([...openTasks, ...openFups], 'prioridade'),
    conclusoesUltimos7Dias: last7DaysCounts(history),
    atrasadosPorArea: countBy(overdue, '_areaLabel', (i) => i.area || 'Sem área'),
  };
}

function countBy(list, field, mapper) {
  const out = {};
  for (const item of list) {
    const key = mapper ? mapper(item) : item[field] || 'não definido';
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function last7DaysCounts(history) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const day = addDaysISO(todayISO(), -i);
    days.push({ dia: day, total: history.filter((h) => h.dataHora.slice(0, 10) === day).length });
  }
  return days;
}

export async function globalSearch(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim().toLowerCase();
  const [tasks, fups, agenda, collaborators] = await Promise.all([listTasks(), listFups(), listAgenda(), listCollaborators()]);
  const results = [];
  const test = (str) => str && String(str).toLowerCase().includes(q);
  for (const t of tasks) {
    if (test(t.id) || test(t.titulo) || test(t.area) || test(t.responsavel) || test(t.proximaAcao) || test(t.observacao) || (t.tags || []).some(test)) {
      results.push({ type: 'task', id: t.id, label: `${t.id} · ${t.titulo}`, sublabel: t.area, route: '#/tarefas' });
    }
  }
  for (const f of fups) {
    const colaborador = collaborators.find((c) => c.id === f.colaboradorId);
    if (test(f.id) || test(f.assunto) || test(f.area) || test(f.responsavel) || test(f.proximaAcao) || test(f.observacao) || test(colaborador && colaborador.nome) || (f.tags || []).some(test)) {
      results.push({ type: 'fup', id: f.id, label: `${f.id} · ${f.assunto}`, sublabel: colaborador ? colaborador.nome : '', route: '#/fups' });
    }
  }
  for (const a of agenda) {
    if (test(a.id) || test(a.compromisso) || test(a.area) || test(a.responsavel) || test(a.preparacao) || test(a.observacao)) {
      results.push({ type: 'agenda', id: a.id, label: `${a.id} · ${a.compromisso}`, sublabel: a.data, route: '#/agenda' });
    }
  }
  for (const c of collaborators) {
    if (test(c.id) || test(c.nome) || test(c.time) || test(c.cargo)) {
      results.push({ type: 'collaborator', id: c.id, label: `${c.id} · ${c.nome}`, sublabel: c.time, route: '#/colaboradores' });
    }
  }
  return results.slice(0, 30);
}

// =======================================================================
// BACKUP
// =======================================================================
export async function exportAll() {
  return backup.exportAllData();
}
export async function exportFiltered(filters) {
  return backup.exportFilteredData(filters);
}
export async function importBackup(json, opts) {
  const result = await backup.importBackupData(json, opts);
  emit({ type: 'backup:import' });
  return result;
}
export function validateBackupShape(json) {
  return backup.validateBackupShape(json);
}

export async function resetToSeed() {
  const snapshot = await backup.exportAllData();
  await db.clearAllStores();
  await seedInitialData();
  await recordAudit({ tipoAcao: 'restauracao_backup', tipoRegistro: 'system', idRegistro: 'seed', valorAnterior: null, valorNovo: 'seed-data' });
  emit({ type: 'reset' });
  return snapshot;
}

export async function wipeAll() {
  const snapshot = await backup.exportAllData();
  await db.clearAllStores();
  await db.saveMeta({ key: 'app', schemaVersion: db.SCHEMA_VERSION, counters: {}, seeded: true, lastBackupAt: '' });
  await recordAudit({ tipoAcao: 'restauracao_backup', tipoRegistro: 'system', idRegistro: 'wipe', valorAnterior: null, valorNovo: 'empty' });
  emit({ type: 'reset' });
  return snapshot;
}

// =======================================================================
// Erros
// =======================================================================
export class ValidationError extends Error {
  constructor(errors) {
    super('Dados inválidos.');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
