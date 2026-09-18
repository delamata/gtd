// ==========================================================================
// views/fups.js — lista de FUPs (follow-ups), cobranças e histórico
// ==========================================================================
import * as store from '../store.js';
import { el, formatDateBR, formatDateTimeBR, isOverdue, diffDaysISO, todayISO, FUP_STATUS_LABEL, PRIORIDADE_LABEL, PRIORIDADE_ORDEM, getSessionFilters, saveSessionFilters, sortBy } from '../utils.js';
import { icon, iconButton } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, toOptions, filterSelect, modalFooter, tagsToInputValue } from '../components/forms.js';
import { statusBadge as buildStatusBadge, priorityTag } from '../components/badges.js';
import { renderTable, nextSortState } from '../components/table.js';

const FILTER_KEY = 'fups';
let sortState = { key: 'proximoFupEm', dir: 'asc' };
let selectedIds = new Set();

export async function render(root, params = {}) {
  const filters = getSessionFilters(FILTER_KEY);
  if (params.colaboradorId) filters.colaboradorId = params.colaboradorId;

  root.appendChild(buildHeader());
  const filterBar = el('div', { class: 'filter-bar' });
  root.appendChild(filterBar);
  const bulkBar = el('div');
  root.appendChild(bulkBar);
  const tableHost = el('div');
  root.appendChild(tableHost);

  async function refresh() {
    const collaborators = await store.listCollaborators();
    const areas = Array.from(new Set((await store.listFups({ includeArchived: true })).map((f) => f.area).filter(Boolean))).sort();
    renderFilterBar(filterBar, filters, collaborators, areas, () => { saveSessionFilters(FILTER_KEY, filters); refresh(); });
    let rows = await store.listFups(filters);
    if (filters.stale) rows = rows.filter(isStale);
    rows = sortRows(rows);
    renderBulkBar(bulkBar, refresh, !!filters.somenteArquivadas);
    renderTable(tableHost, {
      columns: buildColumns(collaborators, refresh),
      rows,
      selectable: true,
      selectedIds,
      onToggleSelect: (id, checked) => { checked ? selectedIds.add(id) : selectedIds.delete(id); refresh(); },
      onToggleSelectAll: (checked) => { rows.forEach((r) => (checked ? selectedIds.add(r.id) : selectedIds.delete(r.id))); refresh(); },
      getRowClass: (r) => [isOverdue(r, 'proximoFupEm') || isOverdue(r, 'prazoFinal') ? 'is-overdue' : '', r.arquivada ? 'is-archived' : ''].filter(Boolean).join(' '),
      onRowClick: (r) => openFupForm(r, refresh),
      sortState,
      onSort: (key) => { sortState = nextSortState(sortState, key); refresh(); },
      emptyMessage: filters.somenteArquivadas ? 'Nenhum FUP arquivado.' : 'Nenhum FUP encontrado com os filtros atuais.',
    });
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function buildHeader() {
  const header = el('div', { class: 'view-header' });
  header.appendChild(el('div', {}, [el('h1', { class: 'view-title', text: 'FUPs' }), el('p', { class: 'view-subtitle', text: 'Follow-ups com colaboradores e times parceiros.' })]));
  header.appendChild(el('div', { class: 'view-actions' }, [el('button', { class: 'btn btn--primary', onClick: () => openFupForm(null, () => {}) }, [icon('plus'), 'Novo FUP'])]));
  return header;
}

function renderFilterBar(container, filters, collaborators, areas, onChange) {
  container.innerHTML = '';
  const chips = [['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['proximos7', 'Próximos 7 dias'], ['atrasadas', 'Atrasadas']];
  for (const [value, label] of chips) {
    container.appendChild(el('button', { class: `filter-chip${filters.periodo === value ? ' is-active' : ''}`, type: 'button', text: label, onClick: () => { filters.periodo = filters.periodo === value ? '' : value; onChange(); } }));
  }
  const staleChip = el('button', { class: `filter-chip${filters.stale ? ' is-active' : ''}`, type: 'button', text: 'Sem atualização há 7+ dias', onClick: () => { filters.stale = !filters.stale; onChange(); } });
  container.appendChild(staleChip);
  // Arquivados somem de todas as listagens: este chip é a única porta de
  // entrada para eles, e quando ligado a tela mostra SOMENTE os arquivados.
  container.appendChild(el('button', { class: `filter-chip${filters.somenteArquivadas ? ' is-active' : ''}`, type: 'button', text: 'Arquivados', onClick: () => { filters.somenteArquivadas = !filters.somenteArquivadas; selectedIds.clear(); onChange(); } }));

  const search = el('input', { type: 'search', placeholder: 'Buscar por assunto, colaborador, tag...' });
  search.value = filters.search || '';
  search.addEventListener('input', () => { filters.search = search.value; onChange(); });
  container.appendChild(search);

  container.appendChild(filterSelect({ label: 'Status', filters, key: 'status', options: [{ value: '', label: 'Todos os status' }, ...toOptions(FUP_STATUS_LABEL)], onChange }));
  container.appendChild(filterSelect({ label: 'Prioridade', filters, key: 'prioridade', options: [{ value: '', label: 'Todas as prioridades' }, ...toOptions(PRIORIDADE_LABEL)], onChange }));
  container.appendChild(filterSelect({ label: 'Colaborador', filters, key: 'colaboradorId', options: [{ value: '', label: 'Todos os colaboradores' }, ...collaborators.map((c) => ({ value: c.id, label: c.nome }))], onChange }));
  container.appendChild(filterSelect({ label: 'Área', filters, key: 'area', options: [{ value: '', label: 'Todas as áreas' }, ...areas.map((a) => ({ value: a, label: a }))], onChange }));

  container.appendChild(el('button', { class: 'btn btn--ghost btn--sm filter-bar__clear', type: 'button', text: 'Limpar filtros', onClick: () => { for (const k of Object.keys(filters)) delete filters[k]; onChange(); } }));
}

function sortRows(rows) {
  const keyFn = {
    id: (r) => r.id, assunto: (r) => r.assunto, prioridade: (r) => PRIORIDADE_ORDEM[r.prioridade] ?? 9,
    status: (r) => r.status, proximoFupEm: (r) => r.proximoFupEm || '9999', qtdCobrancas: (r) => r.qtdCobrancas,
  }[sortState.key] || ((r) => r.proximoFupEm || '9999');
  return sortBy(rows, keyFn, sortState.dir);
}

function isStale(fup) {
  return diffDaysISO(fup.atualizadoEm.slice(0, 10), todayISO()) > 7;
}

function renderBulkBar(container, refresh, showingArchived = false) {
  container.innerHTML = '';
  if (!selectedIds.size) return;
  container.appendChild(el('div', { class: 'bulk-bar' }, [
    el('span', {}, [el('span', { class: 'bulk-bar__count', text: String(selectedIds.size) }), ' selecionado(s)']),
    el('button', { class: 'btn btn--sm btn--secondary', type: 'button', text: 'Concluir selecionados', onClick: async () => { for (const id of selectedIds) await store.completeFup(id, {}); selectedIds.clear(); showToast('FUPs concluídos.', { type: 'success' }); refresh(); } }),
    el('button', { class: 'btn btn--sm btn--danger', type: 'button', text: 'Cancelar selecionados', onClick: async () => {
      const ok = await confirmDialog({ title: 'Cancelar FUPs', message: `Confirma o cancelamento de ${selectedIds.size} FUP(s)?`, danger: true });
      if (!ok) return;
      for (const id of selectedIds) await store.cancelFup(id);
      selectedIds.clear(); showToast('FUPs cancelados.'); refresh();
    } }),
    el('button', { class: 'btn btn--sm btn--secondary', type: 'button', text: showingArchived ? 'Desarquivar selecionados' : 'Arquivar selecionados', onClick: async () => {
      const ids = Array.from(selectedIds);
      for (const id of ids) await (showingArchived ? store.unarchiveFup(id) : store.archiveFup(id));
      selectedIds.clear();
      showToast(showingArchived ? 'FUPs desarquivados.' : 'FUPs arquivados.', {
        undo: () => Promise.all(ids.map((id) => (showingArchived ? store.archiveFup(id) : store.unarchiveFup(id)))),
      });
      refresh();
    } }),
    el('button', { class: 'btn btn--sm btn--ghost', type: 'button', text: 'Limpar seleção', onClick: () => { selectedIds.clear(); refresh(); } }),
  ]));
}

function buildColumns(collaborators, refresh) {
  const nameOf = (id) => (collaborators.find((c) => c.id === id) || {}).nome || '—';
  return [
    { key: 'id', label: 'ID', className: 'col-id', render: (r) => (r.arquivada ? el('span', {}, [r.id, ' ', el('span', { class: 'badge badge--neutral', text: 'Arquivado' })]) : r.id) },
    { key: 'colaboradorId', label: 'Colaborador', render: (r) => nameOf(r.colaboradorId) },
    { key: 'assunto', label: 'Assunto / entrega' },
    { key: 'prioridade', label: 'Prioridade', render: (r) => priorityTag(r.prioridade, PRIORIDADE_LABEL[r.prioridade]) },
    { key: 'status', label: 'Status', render: (r) => statusBadge(r) },
    { key: 'proximoFupEm', label: 'Próximo FUP', render: (r) => dateWithStale(r) },
    { key: 'qtdCobrancas', label: 'Cobranças', render: (r) => String(r.qtdCobrancas || 0) },
    { key: 'acoes', label: 'Ações', sortable: false, render: (r) => rowActions(r, refresh) },
  ];
}

function statusBadge(fup) {
  return buildStatusBadge(fup.status, FUP_STATUS_LABEL[fup.status]);
}

function dateWithStale(fup) {
  const wrap = el('span', {}, [formatDateBR(fup.proximoFupEm)]);
  if (isStale(fup)) wrap.appendChild(el('span', { class: 'badge badge--warning', style: 'margin-left:6px;', text: 'Sem retorno 7d+' }));
  return wrap;
}

function rowActions(fup, refresh) {
  const wrap = el('div', { class: 'item-row__actions' });
  if (fup.status !== 'concluido' && fup.status !== 'cancelado') {
    wrap.appendChild(iconButton('bell', 'Cobrei hoje', async (e) => { e.stopPropagation(); await handleCobranca(fup); }));
    wrap.appendChild(iconButton('completed', 'Concluir', (e) => { e.stopPropagation(); handleComplete(fup); }));
    wrap.appendChild(iconButton('close', 'Cancelar', (e) => { e.stopPropagation(); handleCancel(fup); }));
  } else {
    wrap.appendChild(iconButton('undo', 'Reabrir', async (e) => { e.stopPropagation(); await store.reopenFup(fup.id); showToast(`FUP ${fup.id} reaberto.`); }));
  }
  if (fup.arquivada) {
    wrap.appendChild(iconButton('upload', 'Desarquivar', async (e) => {
      e.stopPropagation();
      await store.unarchiveFup(fup.id);
      showToast(`FUP ${fup.id} desarquivado.`, { undo: () => store.archiveFup(fup.id) });
      refresh();
    }));
  } else {
    wrap.appendChild(iconButton('archive', 'Arquivar', async (e) => {
      e.stopPropagation();
      await store.archiveFup(fup.id);
      showToast(`FUP ${fup.id} arquivado.`, { undo: () => store.unarchiveFup(fup.id) });
      refresh();
    }));
  }
  wrap.appendChild(iconButton('edit', 'Editar', (e) => { e.stopPropagation(); openFupForm(fup, refresh); }));
  return wrap;
}

async function handleCobranca(fup) {
  const resposta = field({ label: 'Resposta recebida (opcional)', name: 'resposta', type: 'textarea', full: true });
  const proximo = field({ label: 'Nova data do próximo FUP (opcional)', name: 'proximo', type: 'date', value: fup.proximoFupEm });
  const body = el('div', { class: 'form-grid' }, [resposta.wrap, proximo.wrap]);
  const save = async () => {
    await store.registerCobranca(fup.id, { resposta: resposta.value });
    if (proximo.value && proximo.value !== fup.proximoFupEm) await store.setNextFupDate(fup.id, proximo.value);
    modal.close();
    showToast(`Cobrança registrada em ${fup.id}.`, { type: 'success' });
  };
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save, saveLabel: 'Registrar cobrança' });
  const modal = openModal({ title: `Cobrei hoje — ${fup.id}`, size: 'sm', bodyNode: body, footerNode: footer, onCtrlEnter: save });
}

async function handleComplete(fup) {
  const resultado = field({ label: 'Resultado da conclusão', name: 'resultado', type: 'textarea', full: true, placeholder: 'Opcional' });
  const body = el('div', { class: 'form-grid' }, [resultado.wrap]);
  const save = async () => {
    const { fup: updated } = await store.completeFup(fup.id, { resultado: resultado.value });
    modal.close();
    showToast(`FUP ${updated.id} concluído.`, { type: 'success', undo: () => store.reopenFup(updated.id) });
  };
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save, saveLabel: 'Concluir FUP' });
  const modal = openModal({ title: `Concluir FUP ${fup.id}`, size: 'sm', bodyNode: body, footerNode: footer, onCtrlEnter: save });
}

async function handleCancel(fup) {
  const ok = await confirmDialog({ title: 'Cancelar FUP', message: `Tem certeza que deseja cancelar "${fup.assunto}"?`, danger: true });
  if (!ok) return;
  await store.cancelFup(fup.id);
  showToast(`FUP ${fup.id} cancelado.`, { undo: () => store.reopenFup(fup.id) });
}

export async function openFupForm(existing, onSaved) {
  const isEdit = !!existing;
  const collaborators = await store.listCollaborators();
  const f = {
    colaboradorId: field({ label: 'Colaborador / time', name: 'colaboradorId', type: 'select', options: collaborators.map((c) => ({ value: c.id, label: c.nome })), value: existing?.colaboradorId, full: true }),
    area: field({ label: 'Área / projeto', name: 'area', value: existing?.area }),
    responsavel: field({ label: 'Responsável pela ação', name: 'responsavel', value: existing?.responsavel || 'André' }),
    assunto: field({ label: 'Assunto / entrega acompanhada', name: 'assunto', value: existing?.assunto, full: true }),
    prioridade: field({ label: 'Prioridade', name: 'prioridade', type: 'select', options: toOptions(PRIORIDADE_LABEL), value: existing?.prioridade || 'media' }),
    status: field({ label: 'Status', name: 'status', type: 'select', options: toOptions(FUP_STATUS_LABEL), value: existing?.status || 'a_fazer' }),
    proximoFupEm: field({ label: 'Data do próximo FUP', name: 'proximoFupEm', type: 'date', value: existing?.proximoFupEm }),
    prazoFinal: field({ label: 'Prazo final', name: 'prazoFinal', type: 'date', value: existing?.prazoFinal }),
    proximaAcao: field({ label: 'Próxima ação', name: 'proximaAcao', type: 'textarea', value: existing?.proximaAcao, full: true }),
    dependencia: field({ label: 'Dependência / bloqueio', name: 'dependencia', type: 'textarea', value: existing?.dependencia, full: true }),
    observacao: field({ label: 'Observação', name: 'observacao', type: 'textarea', value: existing?.observacao, full: true }),
    tags: field({ label: 'Tags (separadas por vírgula)', name: 'tags', value: tagsToInputValue(existing?.tags), full: true }),
  };
  const body = el('div', { class: 'form-grid' }, Object.values(f).map((x) => x.wrap));

  if (isEdit && existing.historico && existing.historico.length) {
    const histWrap = el('div', { class: 'form-field--full' }, [
      el('label', { text: `Histórico de atualizações (${existing.historico.length})` }),
      el('div', { class: 'scrollbox' }, sortBy(existing.historico, (h) => h.data, 'desc').map((h) => el('div', { class: 'item-row', style: 'margin-bottom:6px;' }, [
        el('div', { class: 'item-row__main' }, [el('div', { class: 'item-row__title', text: h.texto }), el('div', { class: 'item-row__meta', text: `${formatDateTimeBR(h.data)} · ${h.tipo}` })]),
      ]))),
    ]);
    body.appendChild(histWrap);
  }

  const save = async () => {
    const payload = {
      colaboradorId: f.colaboradorId.value, area: f.area.value, responsavel: f.responsavel.value, assunto: f.assunto.value,
      prioridade: f.prioridade.value, status: f.status.value, proximoFupEm: f.proximoFupEm.value, prazoFinal: f.prazoFinal.value,
      proximaAcao: f.proximaAcao.value, dependencia: f.dependencia.value, observacao: f.observacao.value, tags: f.tags.value.split(','),
    };
    try {
      let record;
      if (isEdit) { const previous = { ...existing }; record = await store.updateFup(existing.id, payload); showToast(`FUP ${record.id} atualizado.`, { undo: () => store.updateFup(record.id, previous) }); }
      else { record = await store.createFup(payload); showToast(`FUP ${record.id} criado.`, { type: 'success' }); }
      modal.close();
      if (onSaved) onSaved(record);
    } catch (err) {
      if (err.name === 'ValidationError') for (const [k, msg] of Object.entries(err.errors)) f[k] && f[k].setError(msg);
      else showToast('Erro ao salvar FUP.', { type: 'danger' });
    }
  };

  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save });
  const modal = openModal({ title: isEdit ? `Editar FUP ${existing.id}` : 'Novo FUP', size: 'lg', bodyNode: body, footerNode: footer, onCtrlEnter: save });
  return modal;
}
