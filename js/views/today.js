// ==========================================================================
// views/today.js — visão operacional "Hoje": tarefas, FUPs, agenda e atrasos
// ==========================================================================
import * as store from '../store.js';
import { el, formatDateBR, formatDateTimeBR, addDaysISO, todayISO, isOverdue, TASK_STATUS_LABEL, FUP_STATUS_LABEL, PRIORIDADE_LABEL, AGENDA_STATUS_LABEL, statusBadgeClass, priorityDotClass } from '../utils.js';
import { icon } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, toOptions, modalFooter } from '../components/forms.js';
import { openTaskForm } from './tasks.js';
import { openFupForm } from './fups.js';

let selected = new Set(); // "task:T001" | "fup:F001"

export async function render(root) {
  root.appendChild(el('div', { class: 'view-header' }, [
    el('div', {}, [el('h1', { class: 'view-title', text: 'Hoje' }), el('p', { class: 'view-subtitle', style: 'text-transform:capitalize;', text: new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }) })]),
  ]));

  const bulkHost = el('div');
  const overdueHost = el('section', { class: 'section' });
  const columnsHost = el('div', { class: 'today-columns' });
  root.appendChild(bulkHost);
  root.appendChild(overdueHost);
  root.appendChild(columnsHost);

  async function refresh() {
    const data = await store.getTodayItems();
    renderBulkBar(bulkHost, refresh);
    renderOverdue(overdueHost, data.atrasados, refresh);
    renderColumns(columnsHost, data, refresh);
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function renderBulkBar(container, refresh) {
  container.innerHTML = '';
  if (!selected.size) return;
  container.appendChild(el('div', { class: 'bulk-bar' }, [
    el('span', {}, [el('span', { class: 'bulk-bar__count', text: String(selected.size) }), ' item(ns) selecionado(s)']),
    el('button', { class: 'btn btn--sm btn--secondary', type: 'button', text: 'Concluir selecionados', onClick: async () => {
      for (const key of selected) {
        const [kind, id] = key.split(':');
        if (kind === 'task') await store.completeTask(id, { createNext: true });
        else await store.completeFup(id, {});
      }
      selected.clear(); showToast('Itens concluídos.', { type: 'success' }); refresh();
    } }),
    el('button', { class: 'btn btn--sm btn--secondary', type: 'button', text: 'Adiar para amanhã', onClick: async () => {
      for (const key of selected) {
        const [kind, id] = key.split(':');
        if (kind === 'task') { const t = await store.getTask(id); await store.updateTask(id, { prazo: addDaysISO(t.prazo || todayISO(), 1) }); }
        else { const f = await store.getFup(id); await store.setNextFupDate(id, addDaysISO(f.proximoFupEm || todayISO(), 1)); }
      }
      selected.clear(); showToast('Itens adiados para amanhã.'); refresh();
    } }),
    el('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: 'Limpar seleção', onClick: () => { selected.clear(); refresh(); } }),
  ]));
}

function renderOverdue(container, items, refresh) {
  container.innerHTML = '';
  if (!items.length) return;
  container.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: `Itens atrasados (${items.length})` })]));
  const list = el('div', { class: 'item-list' });
  for (const item of items) list.appendChild(buildItemRow(item, refresh, { overdue: true }));
  container.appendChild(list);
}

function renderColumns(container, data, refresh) {
  container.innerHTML = '';
  container.appendChild(buildColumn('Tarefas de hoje', data.tasks, (t) => buildItemRow({ type: 'task', ...t, _label: t.titulo, _date: t.prazo }, refresh)));
  container.appendChild(buildColumn('FUPs de hoje', data.fups, (f) => buildItemRow({ type: 'fup', ...f, _label: f.assunto, _date: f.proximoFupEm || f.prazoFinal }, refresh)));
  container.appendChild(buildAgendaColumn(data.agenda));
  container.appendChild(buildConcluidasColumn(data.concluidasHoje));
}

function buildColumn(title, items, rowBuilder) {
  const section = el('section', { class: 'section' }, [el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: `${title} (${items.length})` })])]);
  if (!items.length) { section.appendChild(el('div', { class: 'empty-state' }, [el('p', { text: 'Nada por aqui. Bom trabalho!' })])); return section; }
  const list = el('div', { class: 'item-list' });
  for (const item of items) list.appendChild(rowBuilder(item));
  section.appendChild(list);
  return section;
}

function buildAgendaColumn(items) {
  const section = el('section', { class: 'section' }, [el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: `Agenda do dia (${items.length})` })])]);
  if (!items.length) { section.appendChild(el('div', { class: 'empty-state' }, [el('p', { text: 'Nenhum compromisso hoje.' })])); return section; }
  const list = el('div', { class: 'item-list' });
  for (const a of items) {
    list.appendChild(el('div', { class: `item-row${a._conflict ? ' item-row--overdue' : ''}` }, [
      el('div', { class: 'item-row__main' }, [
        el('div', { class: 'item-row__title', text: `${a.horaInicio || '--:--'} · ${a.compromisso}` }),
        el('div', { class: 'item-row__meta' }, [el('span', { class: `badge ${statusBadgeClass(a.status)}`, text: AGENDA_STATUS_LABEL[a.status] }), a._conflict ? el('span', { class: 'badge badge--danger', text: 'Conflito' }) : null]),
      ]),
      el('div', { class: 'item-row__actions' }, [
        a.status !== 'concluido' && a.status !== 'cancelado'
          ? el('button', { class: 'btn btn--icon btn--sm btn--ghost', 'aria-label': 'Concluir', onClick: async () => { await store.completeAgendaItem(a.id); showToast('Compromisso concluído.', { type: 'success' }); } }, [icon('completed', { size: 15 })])
          : null,
      ]),
    ]));
  }
  section.appendChild(list);
  return section;
}

function buildConcluidasColumn(items) {
  const section = el('section', { class: 'section' }, [el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: `Concluídas hoje (${items.length})` })])]);
  if (!items.length) { section.appendChild(el('div', { class: 'empty-state' }, [el('p', { text: 'Nenhuma conclusão registrada hoje ainda.' })])); return section; }
  const list = el('div', { class: 'item-list' });
  for (const h of items) {
    list.appendChild(el('div', { class: 'item-row' }, [
      el('div', { class: 'item-row__main' }, [el('div', { class: 'item-row__title', text: h.atividade }), el('div', { class: 'item-row__meta', text: `${formatDateTimeBR(h.dataHora)} · ${h.responsavel || ''}` })]),
    ]));
  }
  section.appendChild(list);
  return section;
}

function buildItemRow(item, refresh, { overdue = false } = {}) {
  const key = `${item.type}:${item.id}`;
  const isTask = item.type === 'task';
  const checkbox = el('input', { type: 'checkbox' });
  checkbox.checked = selected.has(key);
  checkbox.addEventListener('change', () => { checkbox.checked ? selected.add(key) : selected.delete(key); refresh(); });

  const statusMap = isTask ? TASK_STATUS_LABEL : FUP_STATUS_LABEL;
  const statusSelect = el('select', { 'aria-label': 'Status' });
  for (const opt of toOptions(statusMap)) statusSelect.appendChild(el('option', { value: opt.value, text: opt.label, selected: opt.value === item.status || undefined }));
  statusSelect.addEventListener('change', async () => {
    if (statusSelect.value === 'concluido') { statusSelect.value = item.status; await quickComplete(item); refresh(); return; }
    if (isTask) await store.updateTask(item.id, { status: statusSelect.value });
    else await store.updateFup(item.id, { status: statusSelect.value });
    showToast(`Status de ${item.id} atualizado.`);
  });

  const prioritySelect = el('select', { 'aria-label': 'Prioridade' });
  for (const opt of toOptions(PRIORIDADE_LABEL)) prioritySelect.appendChild(el('option', { value: opt.value, text: opt.label, selected: opt.value === item.prioridade || undefined }));
  prioritySelect.addEventListener('change', async () => {
    if (isTask) await store.updateTask(item.id, { prioridade: prioritySelect.value });
    else await store.updateFup(item.id, { prioridade: prioritySelect.value });
    showToast(`Prioridade de ${item.id} atualizada.`);
  });

  const row = el('div', { class: `item-row${overdue ? ' item-row--overdue' : ''}` }, [
    checkbox,
    el('div', { class: 'item-row__main' }, [
      el('div', { class: 'item-row__title' }, [el('button', { type: 'button', onClick: () => (isTask ? openTaskForm(item, refresh) : openFupForm(item, refresh)), text: `${item.id} · ${item._label}` })]),
      el('div', { class: 'item-row__meta' }, [
        el('span', { class: priorityDotClass(item.prioridade) }),
        el('span', { text: PRIORIDADE_LABEL[item.prioridade] }),
        item._date ? el('span', { text: `Prazo: ${formatDateBR(item._date)}` }) : null,
        item.responsavel ? el('span', { text: item.responsavel }) : null,
      ]),
    ]),
    el('div', { class: 'item-row__actions' }, [
      statusSelect,
      prioritySelect,
      iconBtn('clock', 'Adiar para amanhã', async () => {
        if (isTask) await store.updateTask(item.id, { prazo: addDaysISO(item._date || todayISO(), 1) });
        else await store.setNextFupDate(item.id, addDaysISO(item._date || todayISO(), 1));
        showToast(`${item.id} adiado para amanhã.`);
      }),
      iconBtn('completed', 'Concluir', async () => { await quickComplete(item); refresh(); }),
      iconBtn('edit', 'Observação rápida', () => openQuickNote(item, isTask, refresh)),
    ]),
  ]);
  return row;
}

async function quickComplete(item) {
  if (item.type === 'task') {
    const { nextTask } = await store.completeTask(item.id, { createNext: true });
    showToast(nextTask ? `${item.id} concluída. Próxima: ${nextTask.id}.` : `${item.id} concluída.`, { type: 'success', undo: () => store.reopenTask(item.id) });
  } else {
    await store.completeFup(item.id, {});
    showToast(`${item.id} concluído.`, { type: 'success', undo: () => store.reopenFup(item.id) });
  }
}

function iconBtn(name, label, onClick) {
  return el('button', { class: 'btn btn--icon btn--sm btn--ghost', type: 'button', 'aria-label': label, title: label, onClick }, [icon(name, { size: 15 })]);
}

function openQuickNote(item, isTask, refresh) {
  const noteField = field({ label: 'Observação', name: 'observacao', type: 'textarea', value: item.observacao, full: true });
  const body = el('div', { class: 'form-grid' }, [noteField.wrap]);
  const save = async () => {
    if (isTask) await store.updateTask(item.id, { observacao: noteField.value });
    else await store.updateFup(item.id, { observacao: noteField.value });
    modal.close();
    showToast('Observação registrada.', { type: 'success' });
    refresh();
  };
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save });
  const modal = openModal({ title: `Observação — ${item.id}`, size: 'sm', bodyNode: body, footerNode: footer, onCtrlEnter: save });
}
