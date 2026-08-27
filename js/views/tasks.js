// ==========================================================================
// views/tasks.js — lista de tarefas, criação/edição, conclusão e recorrência
// ==========================================================================
import * as store from '../store.js';
import { el, formatDateBR, isOverdue, TASK_STATUS_LABEL, PRIORIDADE_LABEL, RECORRENCIA_LABEL, statusBadgeClass, priorityDotClass, getSessionFilters, saveSessionFilters, sortBy } from '../utils.js';
import { icon } from '../components/icons.js';
import { openModal, closeActiveModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, checkboxField, toOptions, modalFooter, tagsToInputValue } from '../components/forms.js';
import { renderTable, nextSortState } from '../components/table.js';

const FILTER_KEY = 'tasks';
let sortState = { key: 'prazo', dir: 'asc' };
let selectedIds = new Set();

export async function render(root) {
  const filters = getSessionFilters(FILTER_KEY);
  root.appendChild(buildHeader());
  const filterBar = el('div', { class: 'filter-bar' });
  root.appendChild(filterBar);
  const bulkBar = el('div');
  root.appendChild(bulkBar);
  const tableHost = el('div');
  root.appendChild(tableHost);

  async function refresh() {
    const areas = await distinctAreas();
    const responsaveis = await distinctResponsaveis();
    renderFilterBar(filterBar, filters, areas, responsaveis, () => { saveSessionFilters(FILTER_KEY, filters); refresh(); });
    let rows = await store.listTasks(filters);
    rows = sortRows(rows);
    renderBulkBar(bulkBar, refresh);
    renderTable(tableHost, {
      columns: buildColumns(refresh),
      rows,
      selectable: true,
      selectedIds,
      onToggleSelect: (id, checked) => { checked ? selectedIds.add(id) : selectedIds.delete(id); renderBulkBar(bulkBar, refresh); tableHost.querySelectorAll('tr').forEach(()=>{}); },
      onToggleSelectAll: (checked) => { rows.forEach((r) => (checked ? selectedIds.add(r.id) : selectedIds.delete(r.id))); refresh(); },
      getRowClass: (r) => (isOverdue(r, 'prazo') ? 'is-overdue' : ''),
      onRowClick: (r) => openTaskForm(r, refresh),
      sortState,
      onSort: (key) => { sortState = nextSortState(sortState, key); refresh(); },
      emptyMessage: 'Nenhuma tarefa encontrada com os filtros atuais.',
    });
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function buildHeader() {
  const header = el('div', { class: 'view-header' });
  header.appendChild(el('div', {}, [el('h1', { class: 'view-title', text: 'Tarefas' }), el('p', { class: 'view-subtitle', text: 'Gerencie tarefas, prioridades e prazos.' })]));
  header.appendChild(el('div', { class: 'view-actions' }, [el('button', { class: 'btn btn--primary', onClick: () => openTaskForm(null, () => {}) }, [icon('plus'), 'Nova tarefa'])]));
  return header;
}

async function distinctAreas() {
  const all = await store.listTasks({});
  return Array.from(new Set(all.map((t) => t.area).filter(Boolean))).sort();
}
async function distinctResponsaveis() {
  const all = await store.listTasks({});
  return Array.from(new Set(all.map((t) => t.responsavel).filter(Boolean))).sort();
}

function renderFilterBar(container, filters, areas, responsaveis, onChange) {
  container.innerHTML = '';
  const chips = [
    ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['proximos7', 'Próximos 7 dias'], ['atrasadas', 'Atrasadas'],
  ];
  for (const [value, label] of chips) {
    const chip = el('button', { class: `filter-chip${filters.periodo === value ? ' is-active' : ''}`, type: 'button', text: label, onClick: () => { filters.periodo = filters.periodo === value ? '' : value; onChange(); } });
    container.appendChild(chip);
  }

  const search = el('input', { type: 'search', placeholder: 'Buscar por título, área, tag...' });
  search.value = filters.search || '';
  search.addEventListener('input', () => { filters.search = search.value; onChange(); });
  container.appendChild(search);

  container.appendChild(makeSelect('Status', filters, 'status', [{ value: '', label: 'Todos os status' }, ...toOptions(TASK_STATUS_LABEL)], onChange));
  container.appendChild(makeSelect('Prioridade', filters, 'prioridade', [{ value: '', label: 'Todas as prioridades' }, ...toOptions(PRIORIDADE_LABEL)], onChange));
  container.appendChild(makeSelect('Responsável', filters, 'responsavel', [{ value: '', label: 'Todos os responsáveis' }, ...responsaveis.map((r) => ({ value: r, label: r }))], onChange));
  container.appendChild(makeSelect('Área', filters, 'area', [{ value: '', label: 'Todas as áreas' }, ...areas.map((a) => ({ value: a, label: a }))], onChange));

  const clear = el('button', { class: 'btn btn--ghost btn--sm filter-bar__clear', type: 'button', text: 'Limpar filtros', onClick: () => { for (const k of Object.keys(filters)) delete filters[k]; onChange(); } });
  container.appendChild(clear);
}

function makeSelect(label, filters, key, options, onChange) {
  const select = el('select', { 'aria-label': label });
  for (const opt of options) select.appendChild(el('option', { value: opt.value, text: opt.label, selected: (filters[key] || '') === opt.value || undefined }));
  select.value = filters[key] || '';
  select.addEventListener('change', () => { filters[key] = select.value; onChange(); });
  return select;
}

function sortRows(rows) {
  const keyFn = {
    id: (r) => r.id, titulo: (r) => r.titulo, area: (r) => r.area, responsavel: (r) => r.responsavel,
    prioridade: (r) => ({ alta: 0, media: 1, baixa: 2 }[r.prioridade] ?? 9), status: (r) => r.status, prazo: (r) => r.prazo || '9999',
  }[sortState.key] || ((r) => r.prazo || '9999');
  return sortBy(rows, keyFn, sortState.dir);
}

function renderBulkBar(container, refresh) {
  container.innerHTML = '';
  if (!selectedIds.size) return;
  const bar = el('div', { class: 'bulk-bar' }, [
    el('span', {}, [el('span', { class: 'bulk-bar__count', text: String(selectedIds.size) }), ' selecionada(s)']),
    el('button', { class: 'btn btn--sm btn--secondary', type: 'button', text: 'Concluir selecionadas', onClick: async () => {
      for (const id of selectedIds) await store.completeTask(id, { createNext: true });
      selectedIds.clear(); showToast('Tarefas concluídas.', { type: 'success' }); refresh();
    } }),
    el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Cancelar selecionadas', onClick: async () => {
      const ok = await confirmDialog({ title: 'Cancelar tarefas', message: `Confirma o cancelamento de ${selectedIds.size} tarefa(s)?`, danger: true });
      if (!ok) return;
      for (const id of selectedIds) await store.cancelTask(id);
      selectedIds.clear(); showToast('Tarefas canceladas.'); refresh();
    } }),
    el('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: 'Limpar seleção', onClick: () => { selectedIds.clear(); refresh(); } }),
  ]);
  container.appendChild(bar);
}

function buildColumns(refresh) {
  return [
    { key: 'id', label: 'ID', className: 'col-id' },
    { key: 'titulo', label: 'Título', render: (r) => r.titulo },
    { key: 'area', label: 'Área' },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'prioridade', label: 'Prioridade', render: (r) => badgeDot(r.prioridade, PRIORIDADE_LABEL[r.prioridade]) },
    { key: 'status', label: 'Status', render: (r) => statusSelect(r, 'task', refresh) },
    { key: 'prazo', label: 'Prazo', render: (r) => formatDateBR(r.prazo) },
    { key: 'recorrencia', label: 'Recorrência', render: (r) => RECORRENCIA_LABEL[r.recorrencia] || '—' },
    { key: 'acoes', label: 'Ações', sortable: false, render: (r) => rowActions(r, refresh) },
  ];
}

function badgeDot(prioridade, label) {
  return el('span', { class: 'u-flex u-gap-2', style: 'align-items:center;' }, [el('span', { class: priorityDotClass(prioridade) }), label]);
}

function statusSelect(task, kind, refresh) {
  const select = el('select', { 'aria-label': 'Status', class: 'mono' });
  for (const opt of toOptions(TASK_STATUS_LABEL)) select.appendChild(el('option', { value: opt.value, text: opt.label, selected: opt.value === task.status || undefined }));
  select.addEventListener('click', (e) => e.stopPropagation());
  select.addEventListener('change', async () => {
    if (select.value === 'concluido') { select.value = task.status; await handleComplete(task, refresh); return; }
    if (select.value === 'cancelado') { select.value = task.status; await handleCancel(task, refresh); return; }
    const previous = { ...task };
    await store.updateTask(task.id, { status: select.value });
    showToast(`Status de ${task.id} atualizado.`, { undo: () => store.updateTask(task.id, { status: previous.status }) });
  });
  return select;
}

function rowActions(task, refresh) {
  const wrap = el('div', { class: 'item-row__actions' });
  if (task.status !== 'concluido' && task.status !== 'cancelado') {
    wrap.appendChild(iconBtn('completed', 'Concluir', (e) => { e.stopPropagation(); handleComplete(task, refresh); }));
    wrap.appendChild(iconBtn('close', 'Cancelar', (e) => { e.stopPropagation(); handleCancel(task, refresh); }));
  } else {
    wrap.appendChild(iconBtn('undo', 'Reabrir', async (e) => { e.stopPropagation(); await store.reopenTask(task.id); showToast(`Tarefa ${task.id} reaberta.`); }));
  }
  wrap.appendChild(iconBtn('edit', 'Editar', (e) => { e.stopPropagation(); openTaskForm(task, refresh); }));
  return wrap;
}

function iconBtn(name, label, onClick) {
  return el('button', { class: 'btn btn--icon btn--sm btn--ghost', type: 'button', 'aria-label': label, title: label, onClick }, [icon(name, { size: 15 })]);
}

async function handleComplete(task, refresh) {
  await openCompleteDialog(task);
  refresh();
}

async function handleCancel(task, refresh) {
  const ok = await confirmDialog({ title: 'Cancelar tarefa', message: `Tem certeza que deseja cancelar "${task.titulo}"? Cancelamentos não contam como conclusão.`, danger: true });
  if (!ok) return;
  await store.cancelTask(task.id);
  showToast(`Tarefa ${task.id} cancelada.`, { undo: () => store.reopenTask(task.id) });
  refresh();
}

function openCompleteDialog(task) {
  return new Promise((resolve) => {
    const resultadoField = field({ label: 'Resultado / observação da conclusão', name: 'resultado', type: 'textarea', full: true, placeholder: 'Opcional' });
    const body = el('div', { class: 'form-grid' }, [resultadoField.wrap]);
    let createNextField = null;
    if (task.recorrencia && task.recorrencia !== 'nenhuma') {
      createNextField = checkboxField({ label: 'Criar a próxima ocorrência automaticamente', name: 'createNext', checked: true });
      body.appendChild(el('div', { class: 'form-field--full' }, [createNextField.wrap]));
    }
    const save = async () => {
      const { task: updated, nextTask } = await store.completeTask(task.id, {
        createNext: createNextField ? createNextField.value : true,
        resultado: resultadoField.value,
      });
      modal.close();
      showToast(nextTask ? `Tarefa ${updated.id} concluída. Próxima ocorrência: ${nextTask.id}.` : `Tarefa ${updated.id} concluída.`, { type: 'success', undo: () => store.reopenTask(updated.id) });
      resolve(updated);
    };
    const footer = modalFooter({ onCancel: () => modal.close(), onSave: save, saveLabel: 'Concluir tarefa' });
    const modal = openModal({ title: `Concluir tarefa ${task.id}`, size: 'sm', bodyNode: body, footerNode: footer, onCtrlEnter: save, onClose: () => resolve(null) });
  });
}

export function openTaskForm(existing, onSaved) {
  const isEdit = !!existing;
  const f = {
    titulo: field({ label: 'Título', name: 'titulo', value: existing?.titulo, full: true }),
    area: field({ label: 'Área / projeto', name: 'area', value: existing?.area }),
    responsavel: field({ label: 'Responsável', name: 'responsavel', value: existing?.responsavel || 'André' }),
    prioridade: field({ label: 'Prioridade', name: 'prioridade', type: 'select', options: toOptions(PRIORIDADE_LABEL), value: existing?.prioridade || 'media' }),
    status: field({ label: 'Status', name: 'status', type: 'select', options: toOptions(TASK_STATUS_LABEL), value: existing?.status || 'a_fazer' }),
    prazo: field({ label: 'Data limite', name: 'prazo', type: 'date', value: existing?.prazo }),
    horario: field({ label: 'Horário (opcional)', name: 'horario', type: 'time', value: existing?.horario }),
    recorrencia: field({ label: 'Recorrência', name: 'recorrencia', type: 'select', options: toOptions(RECORRENCIA_LABEL), value: existing?.recorrencia || 'nenhuma' }),
    proximaAcao: field({ label: 'Próxima ação', name: 'proximaAcao', type: 'textarea', value: existing?.proximaAcao, full: true }),
    observacao: field({ label: 'Observação', name: 'observacao', type: 'textarea', value: existing?.observacao, full: true }),
    tags: field({ label: 'Tags (separadas por vírgula)', name: 'tags', value: tagsToInputValue(existing?.tags), full: true }),
  };
  const body = el('div', { class: 'form-grid' }, Object.values(f).map((x) => x.wrap));

  const save = async () => {
    const payload = {
      titulo: f.titulo.value, area: f.area.value, responsavel: f.responsavel.value, prioridade: f.prioridade.value,
      status: f.status.value, prazo: f.prazo.value, horario: f.horario.value, recorrencia: f.recorrencia.value,
      proximaAcao: f.proximaAcao.value, observacao: f.observacao.value, tags: f.tags.value.split(','),
    };
    try {
      let record;
      if (isEdit) { const previous = { ...existing }; record = await store.updateTask(existing.id, payload); showToast(`Tarefa ${record.id} atualizada.`, { undo: () => store.updateTask(record.id, previous) }); }
      else { record = await store.createTask(payload); showToast(`Tarefa ${record.id} criada.`, { type: 'success', undo: () => store.archiveTask(record.id) }); }
      modal.close();
      if (onSaved) onSaved(record);
    } catch (err) {
      if (err.name === 'ValidationError') for (const [k, msg] of Object.entries(err.errors)) f[k] && f[k].setError(msg);
      else showToast('Erro ao salvar tarefa.', { type: 'danger' });
    }
  };

  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save });
  const modal = openModal({ title: isEdit ? `Editar tarefa ${existing.id}` : 'Nova tarefa', size: 'lg', bodyNode: body, footerNode: footer, onCtrlEnter: save });
  return modal;
}
