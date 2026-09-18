// ==========================================================================
// email-generator.js — geração do e-mail executivo (C-level) a partir dos
// dados atuais do sistema. Nunca envia nada — apenas monta texto/HTML local.
// ==========================================================================
import * as store from './store.js';
import { escapeHtml, formatDateBR, todayISO, startOfWeekISO, endOfWeekISO, isOpenStatus, isOverdue, isWithinNextDays } from './utils.js';

function periodoRange(filters) {
  if (filters.periodo === 'semana') return { de: startOfWeekISO(), ate: endOfWeekISO(), label: 'Semana atual' };
  if (filters.periodo === 'personalizado' && filters.de && filters.ate) {
    return { de: filters.de, ate: filters.ate, label: `${formatDateBR(filters.de)} a ${formatDateBR(filters.ate)}` };
  }
  const hoje = todayISO();
  return { de: hoje, ate: hoje, label: `Hoje, ${formatDateBR(hoje)}` };
}

function withinPeriod(dateOnly, de, ate) {
  if (!dateOnly) return false;
  return dateOnly >= de && dateOnly <= ate;
}

function passesScopeFilters(item, filters, { colaboradorId } = {}) {
  if (filters.area && item.area !== filters.area) return false;
  if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
  // O filtro por colaborador só se aplica a itens que de fato têm colaborador vinculado (FUPs).
  // Tarefas (sem colaboradorId) não são descartadas por esse filtro.
  if (filters.colaboradorId && colaboradorId !== undefined && colaboradorId !== filters.colaboradorId) return false;
  if (filters.somenteAltaPrioridade && item.prioridade && !['urgente', 'alta'].includes(item.prioridade)) return false;
  return true;
}

function bullet(text, { responsavel, prazo } = {}) {
  const extras = [];
  if (responsavel) extras.push(`Responsável: ${responsavel}`);
  if (prazo) extras.push(`Prazo: ${formatDateBR(prazo)}`);
  return extras.length ? `${text} (${extras.join(' · ')})` : text;
}

/**
 * Monta o conteúdo do e-mail executivo com base nos filtros da tela.
 * filters: { periodo, de, ate, area, responsavel, colaboradorId,
 *            somenteAltaPrioridade, incluirConcluidos, incluirCancelados }
 */
export async function generateExecutiveEmail(filters = {}) {
  const { de, ate, label } = periodoRange(filters);
  const [tasks, fups, collaborators] = await Promise.all([store.listTasks(), store.listFups(), store.listCollaborators()]);
  const history = await store.listHistory({ de, ate });
  const colaboradorNome = (id) => (collaborators.find((c) => c.id === id) || {}).nome || '';

  const scopedTasks = tasks.filter((t) => passesScopeFilters(t, filters));
  const scopedFups = fups.filter((f) => passesScopeFilters(f, filters, { colaboradorId: f.colaboradorId }));
  const scopedHistory = history.filter((h) => (!filters.area || h.area === filters.area) && (!filters.responsavel || h.responsavel === filters.responsavel));

  const concluidas = filters.incluirConcluidos === false ? [] : scopedHistory;
  const emAndamento = [
    ...scopedTasks.filter((t) => ['urgente', 'em_andamento', 'a_fazer', 'nao_iniciado', 'agendado'].includes(t.status)),
    ...scopedFups.filter((f) => ['urgente', 'em_andamento', 'a_fazer', 'nao_iniciado', 'nao_agendada'].includes(f.status)).map((f) => ({ ...f, titulo: f.assunto, colaborador: colaboradorNome(f.colaboradorId) })),
  ];
  const aguardandoRetorno = [
    ...scopedTasks.filter((t) => t.status === 'aguardando_retorno'),
    ...scopedFups.filter((f) => f.status === 'aguardando_retorno').map((f) => ({ ...f, titulo: f.assunto, colaborador: colaboradorNome(f.colaboradorId) })),
  ];
  const decisoes = [
    ...scopedTasks.filter((t) => t.status === 'a_confirmar'),
    ...scopedFups.filter((f) => f.status === 'a_confirmar').map((f) => ({ ...f, titulo: f.assunto, colaborador: colaboradorNome(f.colaboradorId) })),
  ];
  const riscos = [
    ...scopedTasks.filter((t) => isOpenStatus(t.status) && (isOverdue(t, 'prazo') || t.status === 'a_confirmar' || store.isUrgente(t))),
    ...scopedFups.filter((f) => isOpenStatus(f.status) && (isOverdue(f, 'proximoFupEm') || isOverdue(f, 'prazoFinal') || f.dependencia || store.isUrgente(f))).map((f) => ({ ...f, titulo: f.assunto, colaborador: colaboradorNome(f.colaboradorId) })),
  ];
  const prazosRelevantes = [
    ...scopedTasks.filter((t) => isOpenStatus(t.status) && (withinPeriod(t.prazo, de, ate) || isWithinNextDays(t.prazo, 7))),
    ...scopedFups.filter((f) => isOpenStatus(f.status) && (withinPeriod(f.prazoFinal, de, ate) || isWithinNextDays(f.prazoFinal, 7) || withinPeriod(f.proximoFupEm, de, ate) || isWithinNextDays(f.proximoFupEm, 7)))
      .map((f) => ({ ...f, titulo: f.assunto, prazo: f.prazoFinal || f.proximoFupEm })),
  ];
  const cancelados = filters.incluirCancelados
    ? [...scopedTasks.filter((t) => t.status === 'cancelado'), ...scopedFups.filter((f) => f.status === 'cancelado').map((f) => ({ ...f, titulo: f.assunto }))]
    : [];

  const proximosPassos = dedupText([...emAndamento, ...aguardandoRetorno].map((i) => i.proximaAcao).filter(Boolean)).slice(0, 8);

  const stats = {
    concluidas: concluidas.length,
    emAndamento: emAndamento.length,
    aguardandoRetorno: aguardandoRetorno.length,
    riscos: riscos.length,
  };

  const subject = `Status executivo — Atividades, riscos e próximos passos — ${label}`;
  const bodyText = buildPlainText({ label, stats, concluidas, emAndamento, aguardandoRetorno, riscos, proximosPassos, prazosRelevantes, decisoes, cancelados });
  const bodyHtml = buildHtml({ label, stats, concluidas, emAndamento, aguardandoRetorno, riscos, proximosPassos, prazosRelevantes, decisoes, cancelados });

  return { subject, bodyText, bodyHtml, stats, period: { de, ate, label } };
}

function dedupText(list) {
  return Array.from(new Set(list.map((t) => t.trim()).filter(Boolean)));
}

function buildPlainText({ label, stats, concluidas, emAndamento, aguardandoRetorno, riscos, proximosPassos, prazosRelevantes, decisoes, cancelados }) {
  const lines = [];
  lines.push('Olá,');
  lines.push('');
  lines.push(`Segue o resumo executivo das principais atividades do período: ${label}.`);
  lines.push('');
  lines.push('Resumo executivo');
  lines.push(`• ${stats.concluidas} atividade(s) concluída(s).`);
  lines.push(`• ${stats.emAndamento} atividade(s) em andamento.`);
  lines.push(`• ${stats.aguardandoRetorno} FUP(s)/tarefa(s) aguardando retorno.`);
  lines.push(`• ${stats.riscos} item(ns) com risco ou atraso.`);
  lines.push('');

  addSection(lines, 'Principais entregas', concluidas.map((h) => bullet(`${h.atividade}${h.resultado ? ` — ${h.resultado}` : ''}`, { responsavel: h.responsavel })));
  addSection(lines, 'Em andamento', emAndamento.map((i) => bullet(i.titulo, { responsavel: i.colaborador || i.responsavel, prazo: i.prazo })));
  addSection(lines, 'FUPs aguardando retorno', aguardandoRetorno.map((i) => bullet(i.titulo, { responsavel: i.colaborador || i.responsavel, prazo: i.prazoFinal || i.proximoFupEm })));
  addSection(lines, 'Riscos e bloqueios', riscos.map((i) => bullet(`${i.titulo}${i.dependencia ? ` — Dependência: ${i.dependencia}` : ''}`, { responsavel: i.colaborador || i.responsavel, prazo: i.prazo || i.prazoFinal || i.proximoFupEm })));
  addSection(lines, 'Próximos passos', proximosPassos);
  addSection(lines, 'Prazos relevantes', prazosRelevantes.map((i) => bullet(i.titulo, { responsavel: i.responsavel, prazo: i.prazo })));
  addSection(lines, 'Decisões ou apoios necessários', decisoes.map((i) => bullet(i.titulo, { responsavel: i.colaborador || i.responsavel })));
  if (cancelados.length) addSection(lines, 'Itens cancelados no período', cancelados.map((i) => i.titulo));

  lines.push('Atenciosamente,');
  lines.push('André');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function addSection(lines, title, items) {
  if (!items || !items.length) return;
  lines.push(title);
  for (const item of items) lines.push(`• ${item}`);
  lines.push('');
}

function buildHtml({ label, stats, concluidas, emAndamento, aguardandoRetorno, riscos, proximosPassos, prazosRelevantes, decisoes, cancelados }) {
  const ul = (items, mapFn) => (items && items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(mapFn(i))}</li>`).join('')}</ul>` : '<p><em>Nenhum item no período.</em></p>');
  const section = (title, html) => `<h3 style="color:#122B40;font-size:15px;margin:18px 0 6px;">${escapeHtml(title)}</h3>${html}`;

  let html = '';
  html += `<p>Olá,</p><p>Segue o resumo executivo das principais atividades do período: <strong>${escapeHtml(label)}</strong>.</p>`;
  html += section('Resumo executivo', `<ul>
    <li>${stats.concluidas} atividade(s) concluída(s).</li>
    <li>${stats.emAndamento} atividade(s) em andamento.</li>
    <li>${stats.aguardandoRetorno} FUP(s)/tarefa(s) aguardando retorno.</li>
    <li>${stats.riscos} item(ns) com risco ou atraso.</li>
  </ul>`);
  html += section('Principais entregas', ul(concluidas, (h) => bullet(`${h.atividade}${h.resultado ? ` — ${h.resultado}` : ''}`, { responsavel: h.responsavel })));
  html += section('Em andamento', ul(emAndamento, (i) => bullet(i.titulo, { responsavel: i.colaborador || i.responsavel, prazo: i.prazo })));
  html += section('FUPs aguardando retorno', ul(aguardandoRetorno, (i) => bullet(i.titulo, { responsavel: i.colaborador || i.responsavel, prazo: i.prazoFinal || i.proximoFupEm })));
  html += section('Riscos e bloqueios', ul(riscos, (i) => bullet(`${i.titulo}${i.dependencia ? ` — Dependência: ${i.dependencia}` : ''}`, { responsavel: i.colaborador || i.responsavel, prazo: i.prazo || i.prazoFinal || i.proximoFupEm })));
  html += section('Próximos passos', ul(proximosPassos, (t) => t));
  html += section('Prazos relevantes', ul(prazosRelevantes, (i) => bullet(i.titulo, { responsavel: i.responsavel, prazo: i.prazo })));
  html += section('Decisões ou apoios necessários', ul(decisoes, (i) => bullet(i.titulo, { responsavel: i.colaborador || i.responsavel })));
  if (cancelados.length) html += section('Itens cancelados no período', ul(cancelados, (i) => i.titulo));
  html += '<p>Atenciosamente,<br>André</p>';
  return html;
}
