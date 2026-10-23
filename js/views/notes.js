// ==========================================================================
// views/notes.js — Anotações: a etapa de CAPTURA do GTD.
//
// A tela existe para o momento da reunião: um campo só, foco automático,
// Ctrl+Enter salva. Nada de decidir prazo, prioridade ou responsável ali —
// isso é o processamento, que vem depois, quando a anotação (ou uma linha
// dela) vira tarefa.
// ==========================================================================
import * as store from '../store.js';
import { el, clearNode, formatDateBR, todayISO, getSessionFilters, saveSessionFilters } from '../utils.js';
import { icon, iconButton } from '../components/icons.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, toOptions, filterSelect, modalFooter, tagsToInputValue } from '../components/forms.js';
import { openTaskForm } from './tasks.js';

const FILTER_KEY = 'notes';

export async function render(root) {
  const filters = getSessionFilters(FILTER_KEY);
  if (filters.pendentes === undefined) filters.pendentes = true; // a caixa de entrada abre no que falta processar

  root.appendChild(buildHeader());
  const captureHost = el('div');
  const filterBar = el('div', { class: 'filter-bar' });
  const listHost = el('div');
  root.appendChild(captureHost);
  root.appendChild(filterBar);
  root.appendChild(listHost);

  async function refresh() {
    const collaborators = await store.listCollaborators();
    const areas = Array.from(new Set((await store.listNotes({ includeArchived: true })).map((n) => n.area).filter(Boolean))).sort();
    renderFilterBar(filterBar, filters, collaborators, areas, () => { saveSessionFilters(FILTER_KEY, filters); refresh(); });
    const notes = await store.listNotes(filters);
    await renderList(listHost, notes, collaborators, refresh);
  }

  renderCapture(captureHost, () => refresh());
  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function buildHeader() {
  return el('div', { class: 'view-header' }, [
    el('div', {}, [
      el('h1', { class: 'view-title', text: 'Anotações' }),
      el('p', { class: 'view-subtitle', text: 'Capture agora, decida depois: anote a reunião e transforme em tarefa quando for processar.' }),
    ]),
  ]);
}

// ---------------------------------------------------------------------
// Captura rápida
// ---------------------------------------------------------------------
function renderCapture(container, onSaved) {
  clearNode(container);

  const texto = el('textarea', {
    id: 'note-capture',
    rows: 4,
    placeholder: 'Anote a reunião. Uma ideia por linha — depois cada linha pode virar uma tarefa.\nCtrl+Enter para salvar.',
    'aria-label': 'Nova anotação',
  });

  const detalhes = el('div', { class: 'note-capture__details', hidden: true });
  const f = {
    data: field({ label: 'Data', name: 'note-data', type: 'date', value: todayISO() }),
    participantes: field({ label: 'Participantes', name: 'note-participantes', placeholder: 'Opcional' }),
    area: field({ label: 'Área / projeto', name: 'note-area', placeholder: 'Opcional' }),
    tags: field({ label: 'Tags (separadas por vírgula)', name: 'note-tags', placeholder: 'Opcional' }),
  };
  const grid = el('div', { class: 'form-grid' }, Object.values(f).map((x) => x.wrap));
  detalhes.appendChild(grid);

  // O select de colaborador é montado em separado: depende de dados.
  const colaboradorHost = el('div', { class: 'form-field' });
  grid.insertBefore(colaboradorHost, f.participantes.wrap);
  store.listCollaborators().then((lista) => {
    colaboradorHost.appendChild(el('label', { for: 'f-note-colaborador', text: 'Com quem (opcional)' }));
    const select = el('select', { id: 'f-note-colaborador' });
    select.appendChild(el('option', { value: '', text: '—' }));
    for (const c of lista) select.appendChild(el('option', { value: c.id, text: c.nome }));
    colaboradorHost.appendChild(select);
    colaboradorHost.dataset.ready = '1';
  });

  const toggle = el('button', { class: 'btn btn--ghost btn--sm', type: 'button' }, [icon('filter', { size: 14 }), 'Detalhes']);
  toggle.addEventListener('click', () => {
    detalhes.hidden = !detalhes.hidden;
    toggle.setAttribute('aria-expanded', String(!detalhes.hidden));
  });

  const salvar = el('button', { class: 'btn btn--primary', type: 'button' }, [icon('plus', { size: 15 }), 'Salvar anotação']);

  async function save() {
    if (!texto.value.trim()) { texto.focus(); return; }
    salvar.disabled = true;
    try {
      const select = colaboradorHost.querySelector('select');
      const note = await store.createNote({
        texto: texto.value,
        data: f.data.value || todayISO(),
        participantes: f.participantes.value,
        area: f.area.value,
        tags: f.tags.value.split(','),
        colaboradorId: select ? select.value : '',
      });
      texto.value = '';
      f.participantes.value = '';
      f.tags.value = '';
      showToast(`Anotação ${note.id} salva.`, { type: 'success', undo: () => store.deleteNote(note.id) });
      texto.focus();
      onSaved();
    } catch (err) {
      showToast(err.name === 'ValidationError' ? 'Escreva a anotação antes de salvar.' : 'Erro ao salvar a anotação.', { type: 'danger' });
    } finally {
      salvar.disabled = false;
    }
  }

  texto.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); save(); }
  });
  salvar.addEventListener('click', save);

  container.appendChild(el('section', { class: 'card note-capture' }, [
    texto,
    detalhes,
    el('div', { class: 'note-capture__actions' }, [toggle, salvar]),
  ]));
  setTimeout(() => texto.focus(), 30);
}

// ---------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------
function renderFilterBar(container, filters, collaborators, areas, onChange) {
  clearNode(container);

  const chip = (label, ativo, onClick) =>
    el('button', { class: `filter-chip${ativo ? ' is-active' : ''}`, type: 'button', text: label, onClick });

  container.appendChild(chip('A processar', filters.pendentes === true, () => {
    filters.pendentes = filters.pendentes === true ? undefined : true;
    onChange();
  }));
  container.appendChild(chip('Já processadas', filters.pendentes === false, () => {
    filters.pendentes = filters.pendentes === false ? undefined : false;
    onChange();
  }));
  for (const [valor, label] of [['hoje', 'Hoje'], ['semana', 'Esta semana']]) {
    container.appendChild(chip(label, filters.periodo === valor, () => {
      filters.periodo = filters.periodo === valor ? '' : valor;
      onChange();
    }));
  }
  container.appendChild(chip('Arquivadas', !!filters.somenteArquivadas, () => {
    filters.somenteArquivadas = !filters.somenteArquivadas;
    onChange();
  }));

  const busca = el('input', { type: 'search', placeholder: 'Buscar no texto, participantes, tag...' });
  busca.value = filters.search || '';
  busca.addEventListener('input', () => { filters.search = busca.value; onChange(); });
  container.appendChild(busca);

  container.appendChild(filterSelect({
    label: 'Com quem', filters, key: 'colaboradorId',
    options: [{ value: '', label: 'Qualquer pessoa' }, ...collaborators.map((c) => ({ value: c.id, label: c.nome }))],
    onChange,
  }));
  container.appendChild(filterSelect({
    label: 'Área', filters, key: 'area',
    options: [{ value: '', label: 'Todas as áreas' }, ...areas.map((a) => ({ value: a, label: a }))],
    onChange,
  }));
  container.appendChild(el('button', {
    class: 'btn btn--ghost btn--sm filter-bar__clear', type: 'button', text: 'Limpar filtros',
    onClick: () => { for (const k of Object.keys(filters)) delete filters[k]; onChange(); },
  }));
}

// ---------------------------------------------------------------------
// Lista
// ---------------------------------------------------------------------
async function renderList(container, notes, collaborators, refresh) {
  clearNode(container);
  if (!notes.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Nenhuma anotação aqui. Escreva acima para capturar a primeira.' }),
    ]));
    return;
  }
  const nomeDe = (id) => (collaborators.find((c) => c.id === id) || {}).nome || '';
  for (const note of notes) {
    container.appendChild(await noteCard(note, nomeDe, refresh));
  }
}

/** As linhas da anotação — cada uma pode virar uma tarefa por conta própria. */
function noteLines(texto) {
  return String(texto || '').split('\n').map((l) => l.replace(/^[-*•\s]+/, '').trim()).filter(Boolean);
}

async function noteCard(note, nomeDe, refresh) {
  const tarefas = await store.getNoteTasks(note.id);
  const pendente = !note.processadoEm;

  const meta = [
    el('span', { text: formatDateBR(note.data) }),
    note.colaboradorId ? el('span', { text: `· ${nomeDe(note.colaboradorId)}` }) : null,
    note.participantes ? el('span', { text: `· ${note.participantes}` }) : null,
    note.area ? el('span', { text: `· ${note.area}` }) : null,
  ];

  const linhas = noteLines(note.texto);
  const corpo = el('div', { class: 'note-card__lines' }, linhas.map((linha) =>
    el('div', { class: 'note-line' }, [
      el('span', { class: 'note-line__text', text: linha }),
      iconButton('plus', 'Criar tarefa com esta linha', () => criarTarefa(note, refresh, linha)),
    ])
  ));

  const acoes = el('div', { class: 'item-row__actions' }, [
    el('button', { class: 'btn btn--sm btn--secondary', type: 'button', onClick: () => criarTarefa(note, refresh) }, [icon('tasks', { size: 14 }), 'Criar tarefa']),
    pendente
      ? iconButton('completed', 'Marcar como processada', async () => {
          await store.markNoteProcessed(note.id, true);
          showToast(`Anotação ${note.id} marcada como processada.`, { undo: () => store.markNoteProcessed(note.id, false) });
        })
      : iconButton('undo', 'Reabrir (marcar como a processar)', async () => {
          await store.markNoteProcessed(note.id, false);
          showToast(`Anotação ${note.id} voltou para a caixa de entrada.`);
        }),
    iconButton('edit', 'Editar', () => openNoteForm(note, refresh)),
    note.arquivada
      ? iconButton('upload', 'Desarquivar', async () => {
          await store.unarchiveNote(note.id);
          showToast(`Anotação ${note.id} desarquivada.`, { undo: () => store.archiveNote(note.id) });
        })
      : iconButton('archive', 'Arquivar', async () => {
          await store.archiveNote(note.id);
          showToast(`Anotação ${note.id} arquivada.`, { undo: () => store.unarchiveNote(note.id) });
        }),
    iconButton('trash', 'Excluir', async () => {
      const ok = await confirmDialog({ title: 'Excluir anotação', message: `Excluir "${note.titulo}"? As tarefas já geradas continuam existindo.`, danger: true });
      if (!ok) return;
      await store.deleteNote(note.id);
      showToast(`Anotação ${note.id} excluída.`);
    }),
  ]);

  return el('section', { class: `card note-card${note.arquivada ? ' is-archived' : ''}` }, [
    el('div', { class: 'note-card__head' }, [
      el('div', {}, [
        el('div', { class: 'note-card__title', text: note.titulo }),
        el('div', { class: 'item-row__meta' }, meta),
      ]),
      el('span', { class: `badge ${pendente ? 'badge--warning' : 'badge--success'}`, text: pendente ? 'A processar' : 'Processada' }),
    ]),
    corpo,
    note.tags.length ? el('div', { class: 'note-card__tags' }, note.tags.map((t) => el('span', { class: 'badge badge--neutral', text: t }))) : null,
    tarefas.length
      ? el('div', { class: 'note-card__tasks' }, [
          el('span', { class: 'note-card__tasks-label', text: 'Tarefas geradas:' }),
          ...tarefas.map((t) => el('span', { class: 'badge badge--info', text: `${t.id} · ${t.titulo}` })),
        ])
      : null,
    acoes,
  ]);
}

/**
 * Abre o formulário comum de tarefas já preenchido pela anotação e, quando a
 * tarefa é criada, guarda o vínculo. A tarefa passa pelo mesmo caminho de
 * sempre (store.createTask) — aqui só se escolhe o ponto de partida.
 */
function criarTarefa(note, refresh, linha = null) {
  const titulo = (linha || note.titulo || '').slice(0, 200);
  const observacao = [`Origem: anotação ${note.id} (${formatDateBR(note.data)})`, note.texto].filter(Boolean).join('\n\n');
  openTaskForm(
    null,
    async (task) => {
      await store.linkNoteToTask(note.id, task.id);
      showToast(`Tarefa ${task.id} criada a partir de ${note.id}.`, { type: 'success' });
      refresh();
    },
    {
      prefill: { titulo, observacao, area: note.area, tags: note.tags },
      title: `Nova tarefa a partir de ${note.id}`,
    }
  );
}

export async function openNoteForm(existing, onSaved) {
  const collaborators = await store.listCollaborators();
  const f = {
    titulo: field({ label: 'Título', name: 'n-titulo', value: existing?.titulo, hint: '(em branco usa a primeira linha)', full: true }),
    data: field({ label: 'Data', name: 'n-data', type: 'date', value: existing?.data }),
    colaboradorId: field({ label: 'Com quem', name: 'n-colaborador', type: 'select', value: existing?.colaboradorId, options: [{ value: '', label: '—' }, ...collaborators.map((c) => ({ value: c.id, label: c.nome }))] }),
    participantes: field({ label: 'Participantes', name: 'n-participantes', value: existing?.participantes }),
    area: field({ label: 'Área / projeto', name: 'n-area', value: existing?.area }),
    texto: field({ label: 'Anotação', name: 'n-texto', type: 'textarea', value: existing?.texto, full: true }),
    tags: field({ label: 'Tags (separadas por vírgula)', name: 'n-tags', value: tagsToInputValue(existing?.tags), full: true }),
  };
  f.texto.input.rows = 10;
  const body = el('div', { class: 'form-grid' }, Object.values(f).map((x) => x.wrap));

  const save = async () => {
    const payload = {
      titulo: f.titulo.value, data: f.data.value, colaboradorId: f.colaboradorId.value,
      participantes: f.participantes.value, area: f.area.value, texto: f.texto.value,
      tags: f.tags.value.split(','),
    };
    try {
      const record = existing ? await store.updateNote(existing.id, payload) : await store.createNote(payload);
      modal.close();
      showToast(`Anotação ${record.id} ${existing ? 'atualizada' : 'criada'}.`, { type: 'success' });
      if (onSaved) onSaved(record);
    } catch (err) {
      if (err.name === 'ValidationError') for (const [k, msg] of Object.entries(err.errors)) f[k] && f[k].setError(msg);
      else showToast('Erro ao salvar a anotação.', { type: 'danger' });
    }
  };

  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save });
  const modal = openModal({
    title: existing ? `Editar anotação ${existing.id}` : 'Nova anotação',
    size: 'lg', bodyNode: body, footerNode: footer, onCtrlEnter: save,
  });
  return modal;
}
