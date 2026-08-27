// ==========================================================================
// views/completed.js — histórico permanente de conclusões
// ==========================================================================
import * as store from '../store.js';
import { el, formatDateTimeBR, getSessionFilters, saveSessionFilters, sortBy } from '../utils.js';
import { icon } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, modalFooter } from '../components/forms.js';
import { renderTable, nextSortState } from '../components/table.js';

const FILTER_KEY = 'completed';
let sortState = { key: 'dataHora', dir: 'desc' };

const CATEGORIA_LABEL = { tarefa: 'Tarefa', fup: 'FUP', agenda: 'Agenda' };

export async function render(root) {
  const filters = getSessionFilters(FILTER_KEY);
  root.appendChild(el('div', { class: 'view-header' }, [
    el('div', {}, [el('h1', { class: 'view-title', text: 'Concluídas' }), el('p', { class: 'view-subtitle', text: 'Histórico permanente — nada aqui é apagado, apenas registrado.' })]),
  ]));
  const filterBar = el('div', { class: 'filter-bar' });
  root.appendChild(filterBar);
  const tableHost = el('div');
  root.appendChild(tableHost);

  async function refresh() {
    const all = await store.listHistory({});
    const areas = Array.from(new Set(all.map((h) => h.area).filter(Boolean))).sort();
    const responsaveis = Array.from(new Set(all.map((h) => h.responsavel).filter(Boolean))).sort();
    renderFilterBar(filterBar, filters, areas, responsaveis, () => { saveSessionFilters(FILTER_KEY, filters); refresh(); });

    let rows = await store.listHistory(filters);
    rows = sortRows(rows);
    renderTable(tableHost, {
      columns: buildColumns(refresh),
      rows,
      sortState,
      onSort: (key) => { sortState = nextSortState(sortState, key); refresh(); },
      emptyMessage: 'Nenhuma conclusão encontrada para os filtros selecionados.',
    });
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function renderFilterBar(container, filters, areas, responsaveis, onChange) {
  container.innerHTML = '';
  const de = el('input', { type: 'date', 'aria-label': 'De' });
  de.value = filters.de || '';
  de.addEventListener('change', () => { filters.de = de.value; onChange(); });
  const ate = el('input', { type: 'date', 'aria-label': 'Até' });
  ate.value = filters.ate || '';
  ate.addEventListener('change', () => { filters.ate = ate.value; onChange(); });
  container.appendChild(el('span', { class: 'u-muted', text: 'Período:' }));
  container.appendChild(de);
  container.appendChild(ate);

  container.appendChild(makeSelect('Categoria', filters, 'categoria', [{ value: '', label: 'Todas as categorias' }, ...Object.entries(CATEGORIA_LABEL).map(([value, label]) => ({ value, label }))], onChange));
  container.appendChild(makeSelect('Área', filters, 'area', [{ value: '', label: 'Todas as áreas' }, ...areas.map((a) => ({ value: a, label: a }))], onChange));
  container.appendChild(makeSelect('Responsável', filters, 'responsavel', [{ value: '', label: 'Todos os responsáveis' }, ...responsaveis.map((r) => ({ value: r, label: r }))], onChange));

  const search = el('input', { type: 'search', placeholder: 'Buscar...' });
  search.value = filters.search || '';
  search.addEventListener('input', () => { filters.search = search.value; onChange(); });
  container.appendChild(search);

  container.appendChild(el('button', { class: 'btn btn--ghost btn--sm filter-bar__clear', type: 'button', text: 'Limpar filtros', onClick: () => { for (const k of Object.keys(filters)) delete filters[k]; onChange(); } }));
}

function makeSelect(label, filters, key, options, onChange) {
  const select = el('select', { 'aria-label': label });
  for (const opt of options) select.appendChild(el('option', { value: opt.value, text: opt.label, selected: (filters[key] || '') === opt.value || undefined }));
  select.value = filters[key] || '';
  select.addEventListener('change', () => { filters[key] = select.value; onChange(); });
  return select;
}

function sortRows(rows) {
  const keyFn = { id: (r) => r.id, dataHora: (r) => r.dataHora, categoria: (r) => r.categoria, area: (r) => r.area, atividade: (r) => r.atividade, responsavel: (r) => r.responsavel }[sortState.key] || ((r) => r.dataHora);
  return sortBy(rows, keyFn, sortState.dir);
}

function buildColumns(refresh) {
  return [
    { key: 'id', label: 'ID', className: 'col-id' },
    { key: 'dataHora', label: 'Data/Hora', render: (r) => formatDateTimeBR(r.dataHora) },
    { key: 'categoria', label: 'Categoria', render: (r) => CATEGORIA_LABEL[r.categoria] || r.categoria },
    { key: 'area', label: 'Área' },
    { key: 'atividade', label: 'Atividade', render: (r) => el('span', {}, [r.atividade, r.reaberto ? el('span', { class: 'badge badge--warning', style: 'margin-left:6px;', text: 'Reaberta' }) : null]) },
    { key: 'responsavel', label: 'Responsável' },
    { key: 'resultado', label: 'Resultado' },
    { key: 'acoes', label: 'Ações', sortable: false, render: (r) => rowActions(r, refresh) },
  ];
}

function rowActions(entry, refresh) {
  const wrap = el('div', { class: 'item-row__actions' });
  wrap.appendChild(iconBtn('edit', 'Corrigir observação', () => openCorrectionForm(entry, refresh)));
  if (entry.tipoOrigem !== 'seed') {
    wrap.appendChild(iconBtn('undo', 'Reabrir item de origem', async () => {
      const ok = await confirmDialog({ title: 'Reabrir item de origem', message: `Reabrir "${entry.atividade}"? A conclusão permanece registrada no histórico.` });
      if (!ok) return;
      try {
        await store.reopenFromHistory(entry.id);
        showToast('Item de origem reaberto.', { type: 'success' });
      } catch (err) {
        showToast(err.message || 'Não foi possível reabrir.', { type: 'danger' });
      }
    }));
  }
  return wrap;
}

function iconBtn(name, label, onClick) {
  return el('button', { class: 'btn btn--icon btn--sm btn--ghost', type: 'button', 'aria-label': label, title: label, onClick }, [icon(name, { size: 15 })]);
}

function openCorrectionForm(entry, refresh) {
  const obs = field({ label: 'Observação / resultado', name: 'resultado', type: 'textarea', value: entry.resultado, full: true, hint: '(apenas a observação pode ser corrigida)' });
  const body = el('div', { class: 'form-grid' }, [obs.wrap]);
  const save = async () => {
    await store.correctHistoryObservation(entry.id, obs.value);
    modal.close();
    showToast(`Observação de ${entry.id} corrigida.`, { type: 'success' });
    refresh();
  };
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save });
  const modal = openModal({ title: `Corrigir observação — ${entry.id}`, size: 'sm', bodyNode: body, footerNode: footer, onCtrlEnter: save });
}
