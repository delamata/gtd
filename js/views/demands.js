// ==========================================================================
// views/demands.js — triagem das demandas recebidas pela página pública.
//
// Demanda não é tarefa: é um pedido de terceiro esperando decisão. Daqui ela
// vira tarefa (aceita), é recusada com um motivo registrado, ou é arquivada.
// A criação acontece fora daqui, sem login — ver js/public-demand.js.
// ==========================================================================
import * as store from '../store.js';
import { el, clearNode, formatDateTimeBR, formatDateBR, PRIORIDADE_LABEL, priorityDotClass, getSessionFilters, saveSessionFilters } from '../utils.js';
import { icon, iconButton } from '../components/icons.js';
import { confirmDialog, openModal } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, filterSelect, modalFooter, toOptions } from '../components/forms.js';
import { openTaskForm } from './tasks.js';

const FILTER_KEY = 'demands';

const STATUS_LABEL = { nova: 'Nova', em_triagem: 'Em triagem', aceita: 'Aceita', recusada: 'Recusada' };
const STATUS_BADGE = { nova: 'badge--warning', em_triagem: 'badge--info', aceita: 'badge--success', recusada: 'badge--neutral' };

export async function render(root) {
  const filters = getSessionFilters(FILTER_KEY);

  root.appendChild(buildHeader());
  const filterBar = el('div', { class: 'filter-bar' });
  const listHost = el('div');
  root.appendChild(filterBar);
  root.appendChild(listHost);

  async function refresh() {
    const areas = Array.from(new Set((await store.listDemands({ includeArchived: true })).map((d) => d.area).filter(Boolean))).sort();
    renderFilterBar(filterBar, filters, areas, () => { saveSessionFilters(FILTER_KEY, filters); refresh(); });
    const demandas = await store.listDemands(filters);
    await renderList(listHost, demandas, refresh);
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function buildHeader() {
  const link = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}demanda.html`;
  return el('div', { class: 'view-header' }, [
    el('div', {}, [
      el('h1', { class: 'view-title', text: 'Demandas' }),
      el('p', { class: 'view-subtitle', text: 'Pedidos recebidos pelo formulário público, aguardando triagem.' }),
    ]),
    el('div', { class: 'view-actions' }, [
      el('a', { class: 'btn btn--secondary btn--sm', href: 'demanda.html', target: '_blank', rel: 'noopener' }, [icon('link', { size: 14 }), 'Abrir o formulário']),
      el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: async () => {
        const { copyToClipboard } = await import('../utils.js');
        const ok = await copyToClipboard(link);
        showToast(ok ? 'Link do formulário copiado — é só enviar para a equipe.' : 'Não foi possível copiar o link.', { type: ok ? 'success' : 'danger' });
      } }, [icon('copy', { size: 14 }), 'Copiar link']),
    ]),
  ]);
}

function renderFilterBar(container, filters, areas, onChange) {
  clearNode(container);
  const chip = (label, ativo, onClick) =>
    el('button', { class: `filter-chip${ativo ? ' is-active' : ''}`, type: 'button', text: label, onClick });

  for (const [valor, label] of Object.entries(STATUS_LABEL)) {
    container.appendChild(chip(label, filters.status === valor, () => {
      filters.status = filters.status === valor ? '' : valor;
      onChange();
    }));
  }
  container.appendChild(chip('Arquivadas', !!filters.somenteArquivadas, () => {
    filters.somenteArquivadas = !filters.somenteArquivadas;
    onChange();
  }));

  const busca = el('input', { type: 'search', placeholder: 'Buscar por título, solicitante, texto...' });
  busca.value = filters.search || '';
  busca.addEventListener('input', () => { filters.search = busca.value; onChange(); });
  container.appendChild(busca);

  container.appendChild(filterSelect({
    label: 'Urgência sugerida', filters, key: 'prioridadeSugerida',
    options: [{ value: '', label: 'Qualquer urgência' }, ...toOptions(PRIORIDADE_LABEL)], onChange,
  }));
  container.appendChild(filterSelect({
    label: 'Área', filters, key: 'area',
    options: [{ value: '', label: 'Todas as áreas' }, ...areas.map((a) => ({ value: a, label: a }))], onChange,
  }));
  container.appendChild(el('button', {
    class: 'btn btn--ghost btn--sm filter-bar__clear', type: 'button', text: 'Limpar filtros',
    onClick: () => { for (const k of Object.keys(filters)) delete filters[k]; onChange(); },
  }));
}

async function renderList(container, demandas, refresh) {
  clearNode(container);
  if (!demandas.length) {
    container.appendChild(el('div', { class: 'empty-state' }, [
      el('p', { text: 'Nenhuma demanda com os filtros atuais. Envie o link do formulário para a equipe começar a usar.' }),
    ]));
    return;
  }
  for (const d of demandas) container.appendChild(await demandCard(d, refresh));
}

async function demandCard(demand, refresh) {
  const tarefas = await store.getDemandTasks(demand.id);
  const pendente = demand.status === 'nova' || demand.status === 'em_triagem';

  const identificacao = [
    demand.solicitante || 'Sem identificação',
    demand.email ? `· ${demand.email}` : '',
    demand.area ? `· ${demand.area}` : '',
  ].filter(Boolean).join(' ');

  const acoes = el('div', { class: 'item-row__actions' }, [
    pendente ? el('button', { class: 'btn btn--sm btn--secondary', type: 'button', onClick: () => aceitar(demand, refresh) }, [icon('tasks', { size: 14 }), 'Aceitar e criar tarefa']) : null,
    pendente ? el('button', { class: 'btn btn--sm btn--ghost', type: 'button', onClick: () => recusar(demand, refresh) }, [icon('close', { size: 14 }), 'Recusar']) : null,
    demand.arquivada
      ? iconButton('upload', 'Desarquivar', async () => {
          await store.unarchiveDemand(demand.id);
          showToast(`Demanda ${demand.id} desarquivada.`, { undo: () => store.archiveDemand(demand.id) });
        })
      : iconButton('archive', 'Arquivar', async () => {
          await store.archiveDemand(demand.id);
          showToast(`Demanda ${demand.id} arquivada.`, { undo: () => store.unarchiveDemand(demand.id) });
        }),
    iconButton('trash', 'Excluir (spam)', async () => {
      const ok = await confirmDialog({ title: 'Excluir demanda', message: `Excluir "${demand.titulo}"? Use para spam que passe pelo formulário público.`, danger: true });
      if (!ok) return;
      await store.deleteDemand(demand.id);
      showToast(`Demanda ${demand.id} excluída.`);
    }),
  ]);

  return el('section', { class: `card demand-card${demand.arquivada ? ' is-archived' : ''}` }, [
    el('div', { class: 'demand-card__head' }, [
      el('div', {}, [
        el('div', { class: 'demand-card__title', text: `${demand.id} · ${demand.titulo}` }),
        el('div', { class: 'item-row__meta', text: identificacao }),
      ]),
      el('div', { class: 'demand-card__badges' }, [
        el('span', { class: `badge ${STATUS_BADGE[demand.status] || 'badge--neutral'}`, text: STATUS_LABEL[demand.status] || demand.status }),
        el('span', { class: 'u-flex u-gap-2', style: 'align-items:center;' }, [
          el('span', { class: priorityDotClass(demand.prioridadeSugerida) }),
          el('span', { text: PRIORIDADE_LABEL[demand.prioridadeSugerida] || '—' }),
        ]),
      ]),
    ]),
    el('p', { class: 'demand-card__text', text: demand.descricao }),
    el('div', { class: 'item-row__meta' }, [
      el('span', { text: `Recebida em ${formatDateTimeBR(demand.criadoEm)}` }),
      demand.prazoDesejado ? el('span', { text: ` · Pedido para ${formatDateBR(demand.prazoDesejado)}` }) : null,
    ]),
    demand.respostaInterna ? el('p', { class: 'demand-card__answer', text: `Decisão registrada: ${demand.respostaInterna}` }) : null,
    tarefas.length
      ? el('div', { class: 'note-card__tasks' }, [
          el('span', { class: 'note-card__tasks-label', text: 'Tarefas geradas:' }),
          ...tarefas.map((t) => el('span', { class: 'badge badge--info', text: `${t.id} · ${t.titulo}` })),
        ])
      : null,
    acoes,
  ]);
}

function aceitar(demand, refresh) {
  const observacao = [
    `Demanda ${demand.id}`,
    demand.solicitante ? `Solicitante: ${demand.solicitante}${demand.email ? ` (${demand.email})` : ''}` : null,
    demand.prazoDesejado ? `Prazo pedido: ${formatDateBR(demand.prazoDesejado)}` : null,
    '',
    demand.descricao,
  ].filter((l) => l !== null).join('\n');

  openTaskForm(
    null,
    async (task) => {
      await store.linkDemandToTask(demand.id, task.id);
      showToast(`Tarefa ${task.id} criada a partir da demanda ${demand.id}.`, { type: 'success' });
      refresh();
    },
    {
      prefill: {
        titulo: demand.titulo,
        observacao,
        area: demand.area,
        prioridade: demand.prioridadeSugerida,
        prazo: demand.prazoDesejado,
      },
      title: `Aceitar demanda ${demand.id}`,
    }
  );
}

function recusar(demand, refresh) {
  const motivo = field({ label: 'Motivo da recusa', name: 'motivo', type: 'textarea', full: true, placeholder: 'Fica registrado aqui para você poder responder o solicitante.' });
  const body = el('div', { class: 'form-grid' }, [motivo.wrap]);
  const save = async () => {
    await store.rejectDemand(demand.id, motivo.value);
    modal.close();
    showToast(`Demanda ${demand.id} recusada.`);
    refresh();
  };
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save, saveLabel: 'Recusar demanda' });
  const modal = openModal({ title: `Recusar demanda ${demand.id}`, size: 'sm', bodyNode: body, footerNode: footer, onCtrlEnter: save });
}
