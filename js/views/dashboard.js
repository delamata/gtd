// ==========================================================================
// views/dashboard.js — painel executivo com indicadores e foco do dia
// ==========================================================================
import * as store from '../store.js';
import { el, formatDateBR, todayISO, TASK_STATUS_LABEL, FUP_STATUS_LABEL, AGENDA_STATUS_LABEL, PRIORIDADE_LABEL, statusBadgeClass, priorityDotClass } from '../utils.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';
import { navigate } from '../router.js';
import { buildDonutChart, buildHorizontalBarChart, buildVerticalBarChart, buildLegend, PRIORITY_COLORS, STATUS_COLORS, PALETTE } from '../dashboard.js';
import { openTaskForm } from './tasks.js';
import { openFupForm } from './fups.js';

export async function render(root) {
  root.appendChild(el('div', { class: 'view-header' }, [
    el('div', {}, [el('h1', { class: 'view-title', text: 'Dashboard' }), el('p', { class: 'view-subtitle', text: 'Visão executiva atualizada em tempo real.' })]),
  ]));

  const cardsHost = el('div', { class: 'card-grid' });
  const twoCol = el('div', { class: 'two-col' });
  const leftCol = el('div');
  const rightCol = el('div');
  twoCol.appendChild(leftCol);
  twoCol.appendChild(rightCol);
  const chartsHost = el('div', { class: 'card-grid', style: 'grid-template-columns:repeat(auto-fit,minmax(260px,1fr));' });

  root.appendChild(cardsHost);
  root.appendChild(twoCol);
  root.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: 'Indicadores visuais' })]));
  root.appendChild(chartsHost);

  async function refresh() {
    const [stats, focus, byCollaborator, upcoming] = await Promise.all([
      store.getDashboardStats(), store.getFocusOfDay(), store.getFupsByCollaboratorSummary(), store.getUpcoming7Days(),
    ]);
    renderCards(cardsHost, stats);
    renderFocus(leftCol, focus, refresh);
    renderAgendaToday(leftCol, stats.agendaHoje, refresh);
    renderByCollaborator(rightCol, byCollaborator);
    renderUpcoming(rightCol, upcoming);
    renderCharts(chartsHost, stats);
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function renderCards(container, stats) {
  container.innerHTML = '';
  const cards = [
    { label: 'Tarefas abertas', value: stats.tarefasAbertas, tone: '', route: '#/tarefas' },
    { label: 'FUPs abertos', value: stats.fupsAbertos, tone: '', route: '#/fups' },
    { label: 'Itens para hoje', value: stats.itensHoje, tone: 'accent', route: '#/hoje' },
    { label: 'Atrasados', value: stats.atrasados, tone: 'danger', route: '#/hoje' },
    { label: 'Alta prioridade', value: stats.altaPrioridade, tone: 'warning', route: '#/tarefas' },
    { label: 'Aguardando retorno', value: stats.aguardandoRetorno, tone: 'warning', route: '#/fups' },
    { label: 'Agenda de hoje', value: stats.agendaHoje.length, tone: '', route: '#/agenda' },
    { label: 'Concluídas hoje', value: stats.concluidasHoje, tone: 'success', route: '#/concluidas' },
    { label: 'Concluídas na semana', value: stats.concluidasSemana, tone: 'success', route: '#/concluidas' },
    { label: 'FUPs sem atualização 7d+', value: stats.fupsSemAtualizacao7d, tone: 'warning', route: '#/fups' },
  ];
  for (const c of cards) {
    container.appendChild(el('div', { class: `stat-card${c.tone ? ' stat-card--' + c.tone : ''}`, onClick: () => navigate(c.route) }, [
      el('div', { class: 'stat-card__label', text: c.label }),
      el('div', { class: 'stat-card__value', text: String(c.value) }),
    ]));
  }
}

function renderFocus(container, focus, refresh) {
  let section = container.querySelector('[data-section="focus"]');
  if (!section) { section = el('section', { class: 'section', dataset: { section: 'focus' } }); container.appendChild(section); }
  section.innerHTML = '';
  section.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: 'Foco do dia' })]));
  if (!focus.length) { section.appendChild(el('div', { class: 'empty-state' }, [el('p', { text: 'Sem itens urgentes no momento.' })])); return; }
  const list = el('div', { class: 'item-list' });
  for (const item of focus) {
    const isTask = item.type === 'task';
    list.appendChild(el('div', { class: 'item-row' }, [
      el('div', { class: 'item-row__main' }, [
        el('div', { class: 'item-row__title' }, [el('button', { type: 'button', text: `${item.id} · ${item._label}`, onClick: () => (isTask ? openTaskForm(item, refresh) : openFupForm(item, refresh)) })]),
        el('div', { class: 'item-row__meta' }, [
          el('span', { class: priorityDotClass(item.prioridade) }),
          el('span', { text: PRIORIDADE_LABEL[item.prioridade] }),
          item._date ? el('span', { text: `Prazo: ${formatDateBR(item._date)}` }) : null,
          el('span', { class: `badge ${statusBadgeClass(item.status)}`, text: (isTask ? TASK_STATUS_LABEL : FUP_STATUS_LABEL)[item.status] }),
        ]),
      ]),
    ]));
  }
  section.appendChild(list);
}

function renderAgendaToday(container, agenda, refresh) {
  let section = container.querySelector('[data-section="agenda"]');
  if (!section) { section = el('section', { class: 'section', dataset: { section: 'agenda' } }); container.appendChild(section); }
  section.innerHTML = '';
  section.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: `Agenda de hoje (${agenda.length})` })]));
  if (!agenda.length) { section.appendChild(el('div', { class: 'empty-state' }, [el('p', { text: 'Nenhum compromisso hoje.' })])); return; }
  const hasConflict = agenda.some((a) => a._conflict);
  if (hasConflict) section.appendChild(el('div', { class: 'conflict-banner' }, [icon('alert', { size: 15 }), 'Compromissos sobrepostos hoje.']));
  const list = el('div', { class: 'item-list' });
  for (const a of agenda) {
    list.appendChild(el('div', { class: `item-row${a._conflict ? ' item-row--overdue' : ''}` }, [
      el('div', { class: 'item-row__main' }, [
        el('div', { class: 'item-row__title', text: `${a.horaInicio || '--:--'} · ${a.compromisso}` }),
        el('div', { class: 'item-row__meta' }, [el('span', { class: `badge ${statusBadgeClass(a.status)}`, text: AGENDA_STATUS_LABEL[a.status] })]),
      ]),
      el('div', { class: 'item-row__actions' }, [
        a.status !== 'concluido' && a.status !== 'cancelado'
          ? el('button', { class: 'btn btn--icon btn--sm btn--ghost', 'aria-label': 'Concluir', onClick: async () => { await store.completeAgendaItem(a.id); showToast('Compromisso concluído.', { type: 'success' }); } }, [icon('completed', { size: 15 })])
          : null,
      ]),
    ]));
  }
  section.appendChild(list);
}

function renderByCollaborator(container, rows) {
  let section = container.querySelector('[data-section="collab"]');
  if (!section) { section = el('section', { class: 'section', dataset: { section: 'collab' } }); container.appendChild(section); }
  section.innerHTML = '';
  section.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: 'FUPs por colaborador' })]));
  const wrap = el('div', { class: 'table-wrapper' });
  const table = el('table', { class: 'data-table' });
  table.appendChild(el('thead', {}, [el('tr', {}, ['Colaborador', 'Abertos', 'Atrasados', 'Aguardando', 'Próx. FUP', 'Item crítico'].map((h) => el('th', { text: h })))]));
  const tbody = el('tbody');
  for (const r of rows) {
    tbody.appendChild(el('tr', { style: 'cursor:pointer;', onClick: () => navigate(`#/fups?colaboradorId=${r.colaborador.id}`) }, [
      el('td', { text: r.colaborador.nome }),
      el('td', { text: String(r.totalAberto) }),
      el('td', {}, [r.atrasados ? el('span', { class: 'badge badge--danger', text: String(r.atrasados) }) : '0']),
      el('td', {}, [r.aguardando ? el('span', { class: 'badge badge--warning', text: String(r.aguardando) }) : '0']),
      el('td', { text: r.proximoFup ? formatDateBR(r.proximoFup) : '—' }),
      el('td', { text: r.itemMaisCritico || '—' }),
    ]));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  section.appendChild(wrap);
}

function renderUpcoming(container, upcoming) {
  let section = container.querySelector('[data-section="upcoming"]');
  if (!section) { section = el('section', { class: 'section', dataset: { section: 'upcoming' } }); container.appendChild(section); }
  section.innerHTML = '';
  const total = upcoming.tasks.length + upcoming.fups.length + upcoming.agenda.length;
  section.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: `Próximos 7 dias (${total})` })]));
  if (!total) { section.appendChild(el('div', { class: 'empty-state' }, [el('p', { text: 'Nada previsto para os próximos 7 dias.' })])); return; }
  const list = el('div', { class: 'item-list scrollbox' });
  for (const t of upcoming.tasks) list.appendChild(miniRow(`T · ${t.titulo}`, t.prazo));
  for (const f of upcoming.fups) list.appendChild(miniRow(`F · ${f.assunto}`, f.prazoFinal || f.proximoFupEm));
  for (const a of upcoming.agenda) list.appendChild(miniRow(`A · ${a.compromisso}`, a.data));
  section.appendChild(list);
}

function miniRow(label, date) {
  return el('div', { class: 'item-row' }, [el('div', { class: 'item-row__main' }, [el('div', { class: 'item-row__title', text: label }), el('div', { class: 'item-row__meta', text: `Prazo: ${formatDateBR(date)}` })])]);
}

function renderCharts(container, stats) {
  container.innerHTML = '';
  container.appendChild(chartCard('Distribuição por status', () => {
    const segments = Object.entries(stats.distribuicaoStatusTarefas).map(([key, value], i) => ({ label: TASK_STATUS_LABEL[key] || key, value, color: STATUS_COLORS[key] || ['#122B40', '#1E425F', '#8A5A00'][i % 3] }));
    return [buildDonutChart(segments), buildLegend(segments)];
  }));
  container.appendChild(chartCard('Distribuição por prioridade', () => {
    const segments = Object.entries(stats.distribuicaoPrioridade).map(([key, value]) => ({ label: PRIORIDADE_LABEL[key] || key, value, color: PRIORITY_COLORS[key] || '#B7C6D1' }));
    return [buildDonutChart(segments), buildLegend(segments)];
  }));
  container.appendChild(chartCard('Conclusões — últimos 7 dias', () => {
    const items = stats.conclusoesUltimos7Dias.map((d) => ({ label: formatDateBR(d.dia).slice(0, 5), value: d.total, color: d.dia === todayISO() ? '#FFD400' : '#1E425F' }));
    return [buildVerticalBarChart(items)];
  }));
  container.appendChild(chartCard('Itens atrasados por área', () => {
    const entries = Object.entries(stats.atrasadosPorArea);
    if (!entries.length) return [el('p', { class: 'u-muted', text: 'Nenhum item atrasado.' })];
    const items = entries.map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
    return [buildHorizontalBarChart(items)];
  }));
}

function chartCard(title, buildContent) {
  const card = el('div', { class: 'card chart-card' }, [el('div', { class: 'section__title', style: 'font-size:13px;', text: title })]);
  for (const node of buildContent()) card.appendChild(node);
  return card;
}
