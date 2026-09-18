// ==========================================================================
// badges.js — átomos visuais de status e prioridade, compartilhados pelas
// views. Antes cada tela montava o seu (`badgeDot`, spans de badge inline),
// o que fazia um ajuste de estilo precisar de N edições iguais.
// ==========================================================================
import { el, statusBadgeClass, priorityDotClass } from '../utils.js';

/** Selo colorido de status (tarefa, FUP ou agenda) — o rótulo vem do chamador. */
export function statusBadge(status, label) {
  return el('span', { class: `badge ${statusBadgeClass(status)}`, text: label || status });
}

/** Ponto colorido de prioridade seguido do rótulo. */
export function priorityTag(prioridade, label) {
  return el('span', { class: 'u-flex u-gap-2', style: 'align-items:center;' }, [
    el('span', { class: priorityDotClass(prioridade) }),
    label,
  ]);
}
