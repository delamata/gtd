// ==========================================================================
// validators.js — sanitização e validação de dados digitados pelo usuário
// ==========================================================================

/**
 * Remove marcações HTML e caracteres de controle de uma string, e limita o
 * tamanho. Nunca inserimos o resultado via innerHTML sem escape adicional —
 * isso é uma segunda camada de defesa contra injeção.
 */
export function sanitizeText(value, { maxLength = 500 } = {}) {
  if (value === null || value === undefined) return '';
  let str = String(value);
  // remove tags HTML/scripts
  str = str.replace(/<[^>]*>/g, '');
  // remove caracteres de controle exceto quebras de linha/tab
  str = str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  str = str.trim();
  if (maxLength && str.length > maxLength) str = str.slice(0, maxLength);
  return str;
}

/** Sanitiza uma lista de tags: minúsculas, sem espaços extras, sem duplicadas. */
export function sanitizeTags(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  const clean = list
    .map((t) => sanitizeText(t, { maxLength: 40 }).toLowerCase())
    .filter(Boolean);
  return Array.from(new Set(clean)).slice(0, 20);
}

/** Valida e-mail simples (opcional — string vazia é válida). */
export function isValidEmail(value) {
  if (!value) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Valida data ISO YYYY-MM-DD. */
export function isValidISODate(value) {
  if (!value) return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Valida horário HH:mm. */
export function isValidTime(value) {
  if (!value) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

const TASK_STATUS = new Set(['urgente', 'a_fazer', 'em_andamento', 'aguardando_retorno', 'a_confirmar', 'nao_iniciado', 'agendado', 'concluido', 'cancelado']);
const FUP_STATUS = new Set(['urgente', 'a_fazer', 'em_andamento', 'aguardando_retorno', 'a_confirmar', 'nao_iniciado', 'nao_agendada', 'concluido', 'cancelado']);
const AGENDA_STATUS = new Set(['agendado', 'sem_atualizacao', 'em_andamento', 'concluido', 'cancelado']);
const PRIORIDADES = new Set(['urgente', 'alta', 'media', 'baixa']);
const RECORRENCIAS = new Set(['nenhuma', 'diaria', 'semanal', 'quinzenal', 'mensal', 'personalizada']);

function baseResult() {
  return { valid: true, errors: {} };
}
function fail(result, field, message) {
  result.valid = false;
  result.errors[field] = message;
}

export function validateTask(data) {
  const r = baseResult();
  if (!sanitizeText(data.titulo, { maxLength: 200 })) fail(r, 'titulo', 'Informe um título.');
  if (data.prioridade && !PRIORIDADES.has(data.prioridade)) fail(r, 'prioridade', 'Prioridade inválida.');
  if (data.status && !TASK_STATUS.has(data.status)) fail(r, 'status', 'Status inválido.');
  if (data.recorrencia && !RECORRENCIAS.has(data.recorrencia)) fail(r, 'recorrencia', 'Recorrência inválida.');
  if (data.prazo && !isValidISODate(data.prazo)) fail(r, 'prazo', 'Data inválida.');
  if (data.horario && !isValidTime(data.horario)) fail(r, 'horario', 'Horário inválido.');
  return r;
}

export function validateFup(data) {
  const r = baseResult();
  if (!sanitizeText(data.assunto, { maxLength: 200 })) fail(r, 'assunto', 'Informe o assunto ou entrega acompanhada.');
  if (!data.colaboradorId) fail(r, 'colaboradorId', 'Selecione um colaborador.');
  if (data.prioridade && !PRIORIDADES.has(data.prioridade)) fail(r, 'prioridade', 'Prioridade inválida.');
  if (data.status && !FUP_STATUS.has(data.status)) fail(r, 'status', 'Status inválido.');
  if (data.proximoFupEm && !isValidISODate(data.proximoFupEm)) fail(r, 'proximoFupEm', 'Data inválida.');
  if (data.prazoFinal && !isValidISODate(data.prazoFinal)) fail(r, 'prazoFinal', 'Data inválida.');
  return r;
}

export function validateAgenda(data) {
  const r = baseResult();
  if (!sanitizeText(data.compromisso, { maxLength: 200 })) fail(r, 'compromisso', 'Informe o compromisso.');
  if (!data.data || !isValidISODate(data.data)) fail(r, 'data', 'Informe uma data válida.');
  if (data.status && !AGENDA_STATUS.has(data.status)) fail(r, 'status', 'Status inválido.');
  if (data.horaInicio && !isValidTime(data.horaInicio)) fail(r, 'horaInicio', 'Horário inválido.');
  if (data.horaFim && !isValidTime(data.horaFim)) fail(r, 'horaFim', 'Horário inválido.');
  if (data.horaInicio && data.horaFim && data.horaFim < data.horaInicio) {
    fail(r, 'horaFim', 'O término deve ser após o início.');
  }
  return r;
}

export function validateCollaborator(data) {
  const r = baseResult();
  if (!sanitizeText(data.nome, { maxLength: 120 })) fail(r, 'nome', 'Informe o nome.');
  if (data.email && !isValidEmail(data.email)) fail(r, 'email', 'E-mail inválido.');
  return r;
}

