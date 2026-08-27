// ==========================================================================
// views/agenda.js — agenda diária/semanal, conflitos e janelas livres
// ==========================================================================
import * as store from '../store.js';
import { el, todayISO, addDaysISO, formatDateBR, formatDateLong, startOfWeekISO, AGENDA_STATUS_LABEL, statusBadgeClass, groupBy, sortBy } from '../utils.js';
import { icon } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, toOptions, modalFooter } from '../components/forms.js';

let currentDate = todayISO();
let viewMode = 'dia';

export async function render(root) {
  root.appendChild(buildHeader());
  const controls = el('div', { class: 'filter-bar' });
  root.appendChild(controls);
  const content = el('div');
  root.appendChild(content);

  async function refresh() {
    renderControls(controls, refresh);
    if (viewMode === 'dia') await renderDay(content, currentDate, refresh);
    else await renderWeek(content, refresh);
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function buildHeader() {
  const header = el('div', { class: 'view-header' });
  header.appendChild(el('div', {}, [el('h1', { class: 'view-title', text: 'Agenda' }), el('p', { class: 'view-subtitle', text: 'Compromissos, conflitos de horário e janelas livres.' })]));
  header.appendChild(el('div', { class: 'view-actions' }, [el('button', { class: 'btn btn--primary', onClick: () => openAgendaForm(null, () => {}) }, [icon('plus'), 'Novo compromisso'])]));
  return header;
}

function renderControls(container, refresh) {
  container.innerHTML = '';
  const prevIcon = icon('chevron-right', { size: 15 });
  prevIcon.style.transform = 'scaleX(-1)';
  container.appendChild(el('button', { class: 'btn btn--icon btn--secondary btn--sm', 'aria-label': 'Dia anterior', onClick: () => { currentDate = addDaysISO(currentDate, viewMode === 'dia' ? -1 : -7); refresh(); } }, [prevIcon]));
  container.appendChild(el('button', { class: 'btn btn--secondary btn--sm', text: 'Hoje', onClick: () => { currentDate = todayISO(); refresh(); } }));
  container.appendChild(el('button', { class: 'btn btn--icon btn--secondary btn--sm', 'aria-label': 'Próximo dia', onClick: () => { currentDate = addDaysISO(currentDate, viewMode === 'dia' ? 1 : 7); refresh(); } }, [icon('chevron-right', { size: 15 })]));
  container.appendChild(el('span', { class: 'u-muted', style: 'margin-left:8px;text-transform:capitalize;', text: viewMode === 'dia' ? formatDateLong(currentDate) : `Semana de ${formatDateBR(startOfWeekISO(currentDate))}` }));
  const spacer = el('span', { style: 'margin-left:auto;' });
  container.appendChild(spacer);
  container.appendChild(el('button', { class: `filter-chip${viewMode === 'dia' ? ' is-active' : ''}`, type: 'button', text: 'Diária', onClick: () => { viewMode = 'dia'; refresh(); } }));
  container.appendChild(el('button', { class: `filter-chip${viewMode === 'semana' ? ' is-active' : ''}`, type: 'button', text: 'Semanal', onClick: () => { viewMode = 'semana'; refresh(); } }));
}

async function renderDay(container, dateISO, refresh) {
  container.innerHTML = '';
  const all = await store.listAgenda({});
  let items = all.filter((a) => a.data === dateISO);
  items = store.annotateConflicts(items);
  items = sortBy(items, (a) => a.horaInicio || '99:99');

  const hasConflict = items.some((i) => i._conflict);
  if (hasConflict) container.appendChild(el('div', { class: 'conflict-banner' }, [icon('alert', { size: 15 }), 'Há compromissos com horários sobrepostos nesta data.']));

  if (!items.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [icon('agenda', { size: 32 }), el('p', { text: 'Nenhum compromisso nesta data.' })]));
  } else {
    const list = el('div', { class: 'agenda-list' });
    const windows = store.freeWindows(items);
    const merged = mergeItemsAndWindows(items, windows);
    for (const entry of merged) {
      if (entry.kind === 'window') {
        list.appendChild(el('div', { class: 'agenda-slot' }, [el('div', { class: 'agenda-slot__time', text: `${entry.inicio}–${entry.fim}` }), el('div', { class: 'agenda-slot__card' }, [el('div', { class: 'free-window', text: 'Janela livre' })])]));
      } else {
        list.appendChild(agendaSlot(entry, refresh));
      }
    }
    container.appendChild(list);
  }
}

function mergeItemsAndWindows(items, windows) {
  const entries = [...items.map((i) => ({ kind: 'item', ...i })), ...windows.map((w) => ({ kind: 'window', ...w, horaInicio: w.inicio }))];
  return sortBy(entries, (e) => e.horaInicio || '99:99');
}

function agendaSlot(item, refresh) {
  const time = item.horaInicio ? `${item.horaInicio}${item.horaFim ? '–' + item.horaFim : ''}` : 'Sem horário';
  const card = el('div', { class: `item-row${item._conflict ? ' item-row--overdue' : ''}` }, [
    el('div', { class: 'item-row__main' }, [
      el('div', { class: 'item-row__title' }, [el('button', { type: 'button', onClick: () => openAgendaForm(item, refresh), text: item.compromisso })]),
      el('div', { class: 'item-row__meta' }, [
        el('span', { class: `badge ${statusBadgeClass(item.status)}`, text: AGENDA_STATUS_LABEL[item.status] || item.status }),
        item.area ? el('span', { text: item.area }) : null,
        item.responsavel ? el('span', { text: item.responsavel }) : null,
        item._conflict ? el('span', { class: 'badge badge--danger', text: 'Conflito de horário' }) : null,
      ]),
    ]),
    el('div', { class: 'item-row__actions' }, actionsFor(item, refresh)),
  ]);
  return el('div', { class: 'agenda-slot' }, [el('div', { class: 'agenda-slot__time', text: time }), el('div', { class: 'agenda-slot__card' }, [card])]);
}

function actionsFor(item, refresh) {
  const actions = [];
  if (item.status !== 'concluido' && item.status !== 'cancelado') {
    actions.push(iconBtn('completed', 'Concluir', async () => { await store.completeAgendaItem(item.id); showToast(`Compromisso ${item.id} concluído.`, { type: 'success', undo: () => store.reopenAgendaItem(item.id) }); }));
    actions.push(iconBtn('close', 'Cancelar', async () => {
      const ok = await confirmDialog({ title: 'Cancelar compromisso', message: `Cancelar "${item.compromisso}"?`, danger: true });
      if (!ok) return;
      await store.cancelAgendaItem(item.id);
      showToast(`Compromisso ${item.id} cancelado.`, { undo: () => store.reopenAgendaItem(item.id) });
    }));
    if (item.preparacao) actions.push(iconBtn('arrow-right', 'Transformar preparação em tarefa', async () => { const t = await store.convertPrepToTask(item.id); showToast(`Tarefa ${t.id} criada a partir da preparação.`, { type: 'success' }); }));
  } else {
    actions.push(iconBtn('undo', 'Reabrir', async () => { await store.reopenAgendaItem(item.id); showToast(`Compromisso ${item.id} reaberto.`); }));
  }
  actions.push(iconBtn('edit', 'Editar', () => openAgendaForm(item, refresh)));
  return actions;
}

function iconBtn(name, label, onClick) {
  return el('button', { class: 'btn btn--icon btn--sm btn--ghost', type: 'button', 'aria-label': label, title: label, onClick }, [icon(name, { size: 15 })]);
}

async function renderWeek(container, refresh) {
  container.innerHTML = '';
  const start = startOfWeekISO(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDaysISO(start, i));
  const all = await store.listAgenda({});
  const grid = el('div', { class: 'today-columns' });
  for (const day of days) {
    let items = sortBy(all.filter((a) => a.data === day), (a) => a.horaInicio || '99:99');
    items = store.annotateConflicts(items);
    const col = el('div', { class: 'section' }, [
      el('div', { class: 'section__header' }, [el('span', { class: 'section__title', style: 'text-transform:capitalize;', text: new Date(day + 'T00:00:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }) })]),
    ]);
    if (!items.length) col.appendChild(el('p', { class: 'u-muted', style: 'font-size:12px;', text: 'Sem compromissos.' }));
    else {
      const list = el('div', { class: 'item-list' });
      for (const item of items) {
        list.appendChild(el('div', { class: `item-row${item._conflict ? ' item-row--overdue' : ''}` }, [
          el('div', { class: 'item-row__main' }, [
            el('div', { class: 'item-row__title' }, [el('button', { type: 'button', onClick: () => openAgendaForm(item, refresh), text: `${item.horaInicio || '--:--'} · ${item.compromisso}` })]),
            el('div', { class: 'item-row__meta' }, [el('span', { class: `badge ${statusBadgeClass(item.status)}`, text: AGENDA_STATUS_LABEL[item.status] })]),
          ]),
        ]));
      }
      col.appendChild(list);
    }
    grid.appendChild(col);
  }
  container.appendChild(grid);
}

export function openAgendaForm(existing, onSaved) {
  const isEdit = !!existing;
  const f = {
    data: field({ label: 'Data', name: 'data', type: 'date', value: existing?.data || currentDate }),
    horaInicio: field({ label: 'Horário de início', name: 'horaInicio', type: 'time', value: existing?.horaInicio }),
    horaFim: field({ label: 'Horário de término', name: 'horaFim', type: 'time', value: existing?.horaFim }),
    compromisso: field({ label: 'Compromisso', name: 'compromisso', value: existing?.compromisso, full: true }),
    area: field({ label: 'Área / projeto', name: 'area', value: existing?.area }),
    responsavel: field({ label: 'Responsável', name: 'responsavel', value: existing?.responsavel || 'André' }),
    status: field({ label: 'Status', name: 'status', type: 'select', options: toOptions(AGENDA_STATUS_LABEL), value: existing?.status || 'agendado' }),
    preparacao: field({ label: 'Preparação / próxima ação', name: 'preparacao', type: 'textarea', value: existing?.preparacao, full: true }),
    observacao: field({ label: 'Observação', name: 'observacao', type: 'textarea', value: existing?.observacao, full: true }),
  };
  const body = el('div', { class: 'form-grid' }, Object.values(f).map((x) => x.wrap));

  const save = async () => {
    const payload = { data: f.data.value, horaInicio: f.horaInicio.value, horaFim: f.horaFim.value, compromisso: f.compromisso.value, area: f.area.value, responsavel: f.responsavel.value, status: f.status.value, preparacao: f.preparacao.value, observacao: f.observacao.value };
    try {
      let record;
      if (isEdit) { const previous = { ...existing }; record = await store.updateAgendaItem(existing.id, payload); showToast(`Compromisso ${record.id} atualizado.`, { undo: () => store.updateAgendaItem(record.id, previous) }); }
      else { record = await store.createAgendaItem(payload); showToast(`Compromisso ${record.id} criado.`, { type: 'success' }); }
      modal.close();
      if (onSaved) onSaved(record);
    } catch (err) {
      if (err.name === 'ValidationError') for (const [k, msg] of Object.entries(err.errors)) f[k] && f[k].setError(msg);
      else showToast('Erro ao salvar compromisso.', { type: 'danger' });
    }
  };

  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save });
  const modal = openModal({ title: isEdit ? `Editar compromisso ${existing.id}` : 'Novo compromisso', size: 'lg', bodyNode: body, footerNode: footer, onCtrlEnter: save });
  return modal;
}
