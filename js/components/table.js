// ==========================================================================
// table.js — tabela genérica ordenável, com seleção opcional para lote
// ==========================================================================
import { el, clearNode } from '../utils.js';

/**
 * columns: [{ key, label, sortable=true, render(row) => string|Node, className }]
 */
export function renderTable(container, opts) {
  const { columns, rows, getRowClass, onRowClick, sortState, onSort, selectable, selectedIds, onToggleSelect, onToggleSelectAll, emptyMessage = 'Nenhum item encontrado.' } = opts;
  clearNode(container);

  if (!rows.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [el('p', { text: emptyMessage })]));
    return;
  }

  const wrapper = el('div', { class: 'table-wrapper' });
  const table = el('table', { class: 'data-table' });
  const thead = el('thead');
  const trHead = el('tr');

  if (selectable) {
    const th = el('th', {});
    const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
    const cb = el('input', { type: 'checkbox', 'aria-label': 'Selecionar todos' });
    cb.checked = allSelected;
    cb.addEventListener('change', () => onToggleSelectAll(cb.checked));
    th.appendChild(cb);
    trHead.appendChild(th);
  }

  for (const col of columns) {
    const th = el('th', { text: col.label, tabindex: col.sortable === false ? undefined : '0' });
    if (col.sortable !== false) {
      if (sortState.key === col.key) th.classList.add(sortState.dir === 'asc' ? 'is-sorted-asc' : 'is-sorted');
      const trigger = () => onSort(col.key);
      th.addEventListener('click', trigger);
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger(); } });
    }
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr', { class: getRowClass ? getRowClass(row) : '' });
    if (selectable) {
      const td = el('td', {});
      const cb = el('input', { type: 'checkbox', 'aria-label': `Selecionar ${row.id}` });
      cb.checked = selectedIds.has(row.id);
      cb.addEventListener('change', () => onToggleSelect(row.id, cb.checked));
      td.appendChild(cb);
      tr.appendChild(td);
    }
    for (const col of columns) {
      const td = el('td', { class: col.className || '' });
      const content = col.render ? col.render(row) : row[col.key];
      if (content instanceof Node) td.appendChild(content);
      else td.textContent = content === undefined || content === null ? '' : content;
      tr.appendChild(td);
    }
    if (onRowClick) {
      tr.style.cursor = 'pointer';
      tr.addEventListener('click', (e) => {
        if (e.target.closest('button, input, a, select')) return;
        onRowClick(row);
      });
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

/** Alterna a direção de ordenação de um sortState mutável { key, dir }. */
export function nextSortState(sortState, key) {
  if (sortState.key !== key) return { key, dir: 'asc' };
  return { key, dir: sortState.dir === 'asc' ? 'desc' : 'asc' };
}
