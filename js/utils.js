// ==========================================================================
// utils.js — funções puras auxiliares (datas, formatação, DOM seguro, etc.)
// ==========================================================================

/** Retorna a data de hoje no formato ISO (YYYY-MM-DD), fuso local. */
export function todayISO() {
  return toISODate(new Date());
}

/** Converte um objeto Date para YYYY-MM-DD respeitando o fuso local. */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Retorna timestamp ISO completo (usado em criadoEm/atualizadoEm/histórico). */
export function nowISO() {
  return new Date().toISOString();
}

/** Converte 'YYYY-MM-DD' em Date local às 00:00 (evita bug de fuso UTC). */
export function parseISODate(isoDate) {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Formata 'YYYY-MM-DD' para 'DD/MM/AAAA'. */
export function formatDateBR(isoDate) {
  if (!isoDate) return '—';
  const dt = parseISODate(isoDate);
  if (!dt || isNaN(dt)) return '—';
  return dt.toLocaleDateString('pt-BR');
}

/** Formata um timestamp ISO completo para 'DD/MM/AAAA HH:mm'. */
export function formatDateTimeBR(iso) {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt)) return '—';
  return dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** Formata data por extenso, ex: 'terça-feira, 26 de agosto de 2026'. */
export function formatDateLong(isoDate) {
  const dt = isoDate ? parseISODate(isoDate) : new Date();
  if (!dt || isNaN(dt)) return '';
  return dt.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

/** Soma dias a uma data ISO e retorna nova data ISO. */
export function addDaysISO(isoDate, days) {
  const dt = parseISODate(isoDate) || new Date();
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

/** Soma meses a uma data ISO e retorna nova data ISO (mantém o dia quando possível). */
export function addMonthsISO(isoDate, months) {
  const dt = parseISODate(isoDate) || new Date();
  dt.setMonth(dt.getMonth() + months);
  return toISODate(dt);
}

/** Diferença em dias inteiros entre duas datas ISO (b - a). */
export function diffDaysISO(isoA, isoB) {
  const a = parseISODate(isoA);
  const b = parseISODate(isoB);
  if (!a || !b) return NaN;
  return Math.round((b - a) / 86400000);
}

/** Retorna true se a data ISO for anterior a hoje. */
export function isPastDate(isoDate) {
  if (!isoDate) return false;
  return isoDate < todayISO();
}

/** Retorna true se a data ISO for hoje. */
export function isToday(isoDate) {
  return isoDate === todayISO();
}

/** Retorna true se a data ISO for amanhã. */
export function isTomorrow(isoDate) {
  return isoDate === addDaysISO(todayISO(), 1);
}

/** Retorna true se a data ISO estiver dentro dos próximos N dias (inclusive hoje). */
export function isWithinNextDays(isoDate, n) {
  if (!isoDate) return false;
  const diff = diffDaysISO(todayISO(), isoDate);
  return diff >= 0 && diff <= n;
}

/** Início (segunda-feira) da semana corrente, formato ISO. */
export function startOfWeekISO(isoDate = todayISO()) {
  const dt = parseISODate(isoDate);
  const day = dt.getDay(); // 0 = domingo
  const diff = day === 0 ? -6 : 1 - day;
  dt.setDate(dt.getDate() + diff);
  return toISODate(dt);
}

/** Fim (domingo) da semana corrente, formato ISO. */
export function endOfWeekISO(isoDate = todayISO()) {
  return addDaysISO(startOfWeekISO(isoDate), 6);
}

/** Retorna true se a data ISO está na semana corrente. */
export function isThisWeek(isoDate) {
  if (!isoDate) return false;
  return isoDate >= startOfWeekISO() && isoDate <= endOfWeekISO();
}

const STATUS_CONCLUIDOS = new Set(['concluido', 'cancelado']);

/** Um item está "aberto" se seu status não é concluído nem cancelado. */
export function isOpenStatus(status) {
  return !STATUS_CONCLUIDOS.has(status);
}

/**
 * Um item está atrasado se possui data limite anterior a hoje e ainda está aberto.
 * dateField pode ser prazo, proximoFupEm ou data (agenda).
 */
export function isOverdue(item, dateField) {
  if (!item || !isOpenStatus(item.status)) return false;
  const date = item[dateField];
  return isPastDate(date);
}

/** Debounce simples. */
export function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/** Agrupa um array por uma função-chave. */
export function groupBy(arr, keyFn) {
  const map = new Map();
  for (const item of arr) {
    const key = keyFn(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/** Ordena (nova cópia) por uma função-chave, com direção. */
export function sortBy(arr, keyFn, dir = 'asc') {
  const copy = [...arr];
  copy.sort((a, b) => {
    const va = keyFn(a);
    const vb = keyFn(b);
    if (va === vb) return 0;
    if (va === null || va === undefined || va === '') return 1;
    if (vb === null || vb === undefined || vb === '') return -1;
    const cmp = va > vb ? 1 : -1;
    return dir === 'asc' ? cmp : -cmp;
  });
  return copy;
}

/** Escapa texto para inserção segura em innerHTML (defesa em profundidade). */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Cria um elemento DOM com atributos e filhos, sem usar innerHTML (seguro por padrão). */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') { for (const [dk, dv] of Object.entries(value)) node.dataset[dk] = dv; }
    else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

/** Remove todos os filhos de um nó. */
export function clearNode(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Gera um download local de um arquivo de texto (sem servidor externo). */
export function downloadTextFile(filename, content, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copia texto para a área de transferência (com fallback). */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/** Trunca texto com reticências. */
export function truncate(str, max = 80) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

/** Compara dois horários HH:mm (retorna -1, 0, 1). */
export function compareTime(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Deep clone via JSON (suficiente para os dados planos deste app). */
export function deepClone(obj) {
  return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
}

/** Gera um id de correlação curto para uso em UI (não usado como ID de negócio). */
export function uiId() {
  return 'ui-' + Math.random().toString(36).slice(2, 10);
}

export const PRIORIDADE_LABEL = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const PRIORIDADE_ORDEM = { alta: 0, media: 1, baixa: 2 };

export const TASK_STATUS_LABEL = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  aguardando_retorno: 'Aguardando retorno',
  a_confirmar: 'A confirmar',
  nao_iniciado: 'Não iniciado',
  agendado: 'Agendado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const FUP_STATUS_LABEL = {
  a_fazer: 'A fazer',
  em_andamento: 'Em andamento',
  aguardando_retorno: 'Aguardando retorno',
  a_confirmar: 'A confirmar',
  nao_iniciado: 'Não iniciado',
  nao_agendada: 'Não agendada',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const AGENDA_STATUS_LABEL = {
  agendado: 'Agendado',
  sem_atualizacao: 'Sem atualização',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const RECORRENCIA_LABEL = {
  nenhuma: 'Não recorrente',
  diaria: 'Diária',
  semanal: 'Semanal',
  quinzenal: 'Quinzenal',
  mensal: 'Mensal',
  personalizada: 'Personalizada',
};

/** Classe visual (badge) para um status, unificando tarefas/FUPs/agenda. */
export function statusBadgeClass(status) {
  if (status === 'concluido') return 'badge--success';
  if (status === 'cancelado') return 'badge--neutral';
  if (status === 'aguardando_retorno' || status === 'a_confirmar' || status === 'nao_agendada') return 'badge--warning';
  if (status === 'em_andamento' || status === 'agendado') return 'badge--info';
  return 'badge--neutral';
}

export function priorityDotClass(prioridade) {
  return `priority-dot priority-dot--${prioridade || 'media'}`;
}

// --------------------------------------------------------------------
// Preferências visuais (localStorage) — nunca dados profissionais aqui.
// --------------------------------------------------------------------
const PREFS_KEY = 'gtd_prefs_v1';
const DEFAULT_PREFS = { sidebarCollapsed: false, lastView: '#/dashboard', filters: {} };

export function getPreferences() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_PREFS };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePreferences(patch) {
  const merged = { ...getPreferences(), ...patch };
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(merged)); } catch { /* localStorage indisponível */ }
  return merged;
}

/** Filtros persistentes durante a sessão (sessionStorage), por view. */
export function getSessionFilters(viewKey) {
  try {
    const raw = sessionStorage.getItem('gtd_filters_' + viewKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
export function saveSessionFilters(viewKey, filters) {
  try { sessionStorage.setItem('gtd_filters_' + viewKey, JSON.stringify(filters)); } catch { /* ignore */ }
}
