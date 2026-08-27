// ==========================================================================
// backup.js — exportação / importação / restauração de dados em JSON
// O arquivo em si é gerado/lido localmente (download do navegador, leitura
// de File local); os dados que ele lê/grava vêm do adapter ativo em
// js/database.js (Supabase em produção), que sim envia/recebe pela rede.
// ==========================================================================
import * as db from './database.js';
import { nowISO, todayISO, isWithinNextDays, isOverdue, downloadTextFile, getPreferences } from './utils.js';

const ID_PREFIXES = ['T', 'F', 'A', 'C', 'P'];

export async function exportAllData() {
  const [tasks, fups, agenda, collaborators, history, auditLog, meta] = await Promise.all([
    db.getAll('tasks'), db.getAll('fups'), db.getAll('agenda'),
    db.getAll('collaborators'), db.getAll('history'), db.getAll('auditLog'), db.getMeta(),
  ]);
  return {
    versaoEsquema: db.SCHEMA_VERSION,
    exportadoEm: nowISO(),
    configuracoes: safeGetPreferences(),
    colaboradores: collaborators,
    tarefas: tasks,
    fups,
    agenda,
    historico: history,
    logs: auditLog,
    meta: meta || null,
  };
}

function safeGetPreferences() {
  try { return getPreferences(); } catch { return {}; }
}

/** Exporta apenas os registros que atendem aos filtros informados. */
export async function exportFilteredData(filters = {}) {
  const full = await exportAllData();
  const match = (item, dateField) => {
    if (filters.area && item.area !== filters.area) return false;
    if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
    if (filters.colaboradorId && item.colaboradorId !== filters.colaboradorId) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.periodo && dateField) {
      const value = item[dateField];
      if (filters.periodo === 'hoje' && value !== todayISO()) return false;
      if (filters.periodo === 'proximos7' && !isWithinNextDays(value, 7)) return false;
      if (filters.periodo === 'atrasadas' && !isOverdue(item, dateField)) return false;
    }
    return true;
  };
  return {
    ...full,
    tarefas: full.tarefas.filter((t) => match(t, 'prazo')),
    fups: full.fups.filter((f) => match(f, 'proximoFupEm')),
    agenda: full.agenda.filter((a) => match(a, 'data')),
  };
}

/** Valida a estrutura mínima de um arquivo de backup antes de importar. */
export function validateBackupShape(json) {
  const errors = [];
  if (!json || typeof json !== 'object') errors.push('Arquivo inválido: não é um JSON válido.');
  else {
    if (typeof json.versaoEsquema !== 'number') errors.push('Campo "versaoEsquema" ausente ou inválido.');
    if (!json.exportadoEm) errors.push('Campo "exportadoEm" ausente.');
    for (const field of ['colaboradores', 'tarefas', 'fups', 'agenda', 'historico']) {
      if (!Array.isArray(json[field])) errors.push(`Campo "${field}" ausente ou não é uma lista.`);
    }
  }
  const valid = errors.length === 0;
  const summary = valid
    ? {
        colaboradores: json.colaboradores.length,
        tarefas: json.tarefas.length,
        fups: json.fups.length,
        agenda: json.agenda.length,
        historico: json.historico.length,
        logs: Array.isArray(json.logs) ? json.logs.length : 0,
        exportadoEm: json.exportadoEm,
        versaoEsquema: json.versaoEsquema,
      }
    : null;
  return { valid, errors, summary };
}

function extractNumber(id) {
  const match = /^[A-Z](\d+)$/.exec(id || '');
  return match ? Number(match[1]) : 0;
}

/** Recalcula os contadores de ID a partir dos dados, garantindo que nenhum ID seja reaproveitado. */
function recomputeCounters(data, previousCounters = {}) {
  const counters = { ...previousCounters };
  const scan = (list, letter) => {
    for (const item of list) counters[letter] = Math.max(counters[letter] || 0, extractNumber(item.id));
  };
  scan(data.tarefas, 'T');
  scan(data.fups, 'F');
  scan(data.agenda, 'A');
  scan(data.historico, 'C');
  scan(data.colaboradores, 'P');
  return counters;
}

/**
 * Importa um backup. Por padrão substitui todos os dados (mode: 'replace'),
 * após gerar automaticamente um arquivo de backup do estado atual. Também
 * suporta mode: 'merge' para mesclar (upsert) sem apagar o que já existe.
 */
export async function importBackupData(json, { mode = 'replace', autoBackup = true } = {}) {
  const validation = validateBackupShape(json);
  if (!validation.valid) {
    const err = new Error('Arquivo de backup inválido: ' + validation.errors.join(' '));
    err.validation = validation;
    throw err;
  }

  if (autoBackup && typeof document !== 'undefined') {
    try {
      const current = await exportAllData();
      const stamp = current.exportadoEm.replace(/[:.]/g, '-');
      downloadTextFile(`backup-automatico-antes-importacao-${stamp}.json`, JSON.stringify(current, null, 2), 'application/json');
    } catch (err) {
      console.warn('[backup] Não foi possível gerar o backup automático antes da importação.', err);
    }
  }

  if (mode === 'replace') {
    await db.clearAllStores();
    await db.putMany('collaborators', json.colaboradores);
    await db.putMany('tasks', json.tarefas);
    await db.putMany('fups', json.fups);
    await db.putMany('agenda', json.agenda);
    await db.putMany('history', json.historico);
    if (Array.isArray(json.logs)) await db.putMany('auditLog', json.logs);
    const counters = recomputeCounters(json, {});
    await db.saveMeta({ key: 'app', schemaVersion: db.SCHEMA_VERSION, counters, seeded: true, lastBackupAt: nowISO() });
  } else {
    const currentMeta = (await db.getMeta()) || { counters: {} };
    await db.putMany('collaborators', json.colaboradores);
    await db.putMany('tasks', json.tarefas);
    await db.putMany('fups', json.fups);
    await db.putMany('agenda', json.agenda);
    await db.putMany('history', json.historico);
    if (Array.isArray(json.logs)) await db.putMany('auditLog', json.logs);
    const counters = recomputeCounters(json, currentMeta.counters || {});
    await db.saveMeta({ ...currentMeta, key: 'app', counters, seeded: true, lastBackupAt: nowISO() });
  }

  await db.runDataMigrations();
  return validation.summary;
}
