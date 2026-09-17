// ==========================================================================
// models.js — formas (shapes) canônicas e fábricas de entidades
// ==========================================================================
import { nowISO } from './utils.js';
import { sanitizeText, sanitizeTags } from './validators.js';

export const ID_PREFIXES = {
  task: 'T',
  fup: 'F',
  agenda: 'A',
  history: 'C',
  collaborator: 'P',
};

export function formatId(prefix, n) {
  return `${prefix}${String(n).padStart(3, '0')}`;
}

/** Cria o objeto de Tarefa completo, aplicando defaults e sanitização básica. */
export function makeTask(id, data = {}) {
  const ts = nowISO();
  return {
    id,
    titulo: sanitizeText(data.titulo, { maxLength: 200 }),
    area: sanitizeText(data.area, { maxLength: 120 }),
    responsavel: sanitizeText(data.responsavel, { maxLength: 120 }) || 'André',
    prioridade: data.prioridade || 'media',
    status: data.status || 'a_fazer',
    prazo: data.prazo || '',
    horario: data.horario || '',
    recorrencia: data.recorrencia || 'nenhuma',
    proximaAcao: sanitizeText(data.proximaAcao, { maxLength: 500 }),
    observacao: sanitizeText(data.observacao, { maxLength: 2000 }),
    tags: sanitizeTags(data.tags),
    criadoEm: data.criadoEm || ts,
    atualizadoEm: ts,
    concluidoEm: data.concluidoEm || '',
    origemId: data.origemId || '',
    arquivada: !!data.arquivada,
    deletedFlag: !!data.deletedFlag,
  };
}

/** Cria o objeto de FUP (Follow-up) completo. */
export function makeFup(id, data = {}) {
  const ts = nowISO();
  return {
    id,
    colaboradorId: data.colaboradorId || '',
    area: sanitizeText(data.area, { maxLength: 120 }),
    assunto: sanitizeText(data.assunto, { maxLength: 200 }),
    responsavel: sanitizeText(data.responsavel, { maxLength: 120 }) || 'André',
    prioridade: data.prioridade || 'media',
    status: data.status || 'a_fazer',
    proximoFupEm: data.proximoFupEm || '',
    prazoFinal: data.prazoFinal || '',
    proximaAcao: sanitizeText(data.proximaAcao, { maxLength: 500 }),
    dependencia: sanitizeText(data.dependencia, { maxLength: 500 }),
    observacao: sanitizeText(data.observacao, { maxLength: 2000 }),
    tags: sanitizeTags(data.tags),
    criadoEm: data.criadoEm || ts,
    atualizadoEm: ts,
    concluidoEm: data.concluidoEm || '',
    qtdCobrancas: data.qtdCobrancas || 0,
    ultimoContatoEm: data.ultimoContatoEm || '',
    historico: Array.isArray(data.historico) ? data.historico : [],
    arquivada: !!data.arquivada,
    deletedFlag: !!data.deletedFlag,
  };
}

/** Cria uma entrada de histórico dentro de um FUP (imutável após criada). */
export function makeFupHistoryEntry({ tipo, texto }) {
  return { data: nowISO(), tipo, texto: sanitizeText(texto, { maxLength: 1000 }) };
}

/** Cria o objeto de compromisso de Agenda. */
export function makeAgendaItem(id, data = {}) {
  const ts = nowISO();
  return {
    id,
    data: data.data || '',
    horaInicio: data.horaInicio || '',
    horaFim: data.horaFim || '',
    compromisso: sanitizeText(data.compromisso, { maxLength: 200 }),
    area: sanitizeText(data.area, { maxLength: 120 }),
    responsavel: sanitizeText(data.responsavel, { maxLength: 120 }) || 'André',
    status: data.status || 'agendado',
    preparacao: sanitizeText(data.preparacao, { maxLength: 500 }),
    observacao: sanitizeText(data.observacao, { maxLength: 2000 }),
    criadoEm: data.criadoEm || ts,
    atualizadoEm: ts,
    concluidoEm: data.concluidoEm || '',
    deletedFlag: !!data.deletedFlag,
  };
}

/** Cria o objeto de Colaborador. */
export function makeCollaborator(id, data = {}) {
  return {
    id,
    nome: sanitizeText(data.nome, { maxLength: 120 }),
    time: sanitizeText(data.time, { maxLength: 120 }),
    cargo: sanitizeText(data.cargo, { maxLength: 120 }),
    email: sanitizeText(data.email, { maxLength: 160 }),
    observacoes: sanitizeText(data.observacoes, { maxLength: 1000 }),
    ativo: data.ativo === undefined ? true : !!data.ativo,
    cor: data.cor || '#1E425F',
    criadoEm: data.criadoEm || nowISO(),
    deletedFlag: !!data.deletedFlag,
  };
}

/** Cria uma entrada permanente do histórico de conclusões. */
export function makeHistoryEntry(id, data = {}) {
  return {
    id,
    dataHora: data.dataHora || nowISO(),
    categoria: data.categoria, // 'tarefa' | 'fup' | 'agenda'
    area: sanitizeText(data.area, { maxLength: 120 }),
    atividade: sanitizeText(data.atividade, { maxLength: 300 }),
    responsavel: sanitizeText(data.responsavel, { maxLength: 120 }),
    resultado: sanitizeText(data.resultado, { maxLength: 2000 }),
    tipoOrigem: data.tipoOrigem, // 'task' | 'fup' | 'agenda'
    idOrigem: data.idOrigem,
    atualizadoEm: data.atualizadoEm || nowISO(),
    reaberto: !!data.reaberto,
  };
}

/** Cria um registro de auditoria (log de alterações). */
export function makeAuditEntry(id, { tipoAcao, tipoRegistro, idRegistro, valorAnterior, valorNovo }) {
  return {
    id,
    dataHora: nowISO(),
    tipoAcao, // criacao | edicao | conclusao | reabertura | cancelamento | arquivamento | desarquivamento | restauracao_backup
    tipoRegistro, // task | fup | agenda | collaborator | history | system
    idRegistro: idRegistro || '',
    valorAnterior: valorAnterior ? JSON.stringify(valorAnterior) : '',
    valorNovo: valorNovo ? JSON.stringify(valorNovo) : '',
  };
}

export const DEFAULT_COLLABORATOR_COLORS = ['#1E425F', '#122B40', '#8A5A00', '#1E7A3E', '#B3261E', '#5B4B8A', '#0E7C86'];
