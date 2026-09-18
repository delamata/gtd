// ==========================================================================
// views/email.js — geração do e-mail executivo (C-level)
// ==========================================================================
import * as store from '../store.js';
import { generateExecutiveEmail } from '../email-generator.js';
import { el, downloadTextFile, copyToClipboard, todayISO } from '../utils.js';
import { icon } from '../components/icons.js';
import { showToast } from '../components/toast.js';

const filters = { periodo: 'hoje', de: todayISO(), ate: todayISO(), area: '', responsavel: '', colaboradorId: '', somenteAltaPrioridade: false, incluirConcluidos: true, incluirCancelados: false };
let format = 'texto'; // 'texto' | 'html'
let current = null;
let manualEdit = false;
let manualSubject = '';
let manualBody = '';

export async function render(root) {
  root.appendChild(el('div', { class: 'view-header' }, [
    el('div', {}, [el('h1', { class: 'view-title', text: 'E-mail executivo' }), el('p', { class: 'view-subtitle', text: 'Gere um resumo C-level a partir dos dados atuais. Nada é enviado automaticamente.' })]),
  ]));

  const layout = el('div', { class: 'two-col' });
  const filtersCard = el('div', { class: 'card' });
  const previewCard = el('div', { class: 'card' });
  layout.appendChild(filtersCard);
  layout.appendChild(previewCard);
  root.appendChild(layout);

  const collaborators = await store.listCollaborators();
  const areas = Array.from(new Set((await store.listTasks({})).map((t) => t.area).filter(Boolean).concat((await store.listFups({})).map((f) => f.area).filter(Boolean)))).sort();
  const responsaveis = Array.from(new Set((await store.listTasks({})).map((t) => t.responsavel).filter(Boolean))).sort();

  buildFiltersCard(filtersCard, collaborators, areas, responsaveis, () => generateAndRender(previewCard));
  await generateAndRender(previewCard);

  const unsubscribe = store.subscribe(() => { if (!manualEdit) generateAndRender(previewCard); });
  return unsubscribe;
}

function buildFiltersCard(container, collaborators, areas, responsaveis, onChange) {
  container.innerHTML = '';
  container.appendChild(el('h3', { style: 'margin-bottom:12px;color:var(--color-navy);', text: 'Filtros do período' }));
  const grid = el('div', { class: 'form-grid' });

  grid.appendChild(selectField('Período', 'periodo', [{ value: 'hoje', label: 'Hoje' }, { value: 'semana', label: 'Semana atual' }, { value: 'personalizado', label: 'Período personalizado' }], filters.periodo, (v) => { filters.periodo = v; renderCustomDates(); onChange(); }));

  const customWrap = el('div', { class: 'form-field--full', style: 'display:none;' });
  const de = dateField('De', filters.de, (v) => { filters.de = v; onChange(); });
  const ate = dateField('Até', filters.ate, (v) => { filters.ate = v; onChange(); });
  customWrap.appendChild(el('div', { class: 'form-grid' }, [de, ate]));
  function renderCustomDates() { customWrap.style.display = filters.periodo === 'personalizado' ? '' : 'none'; }
  renderCustomDates();

  grid.appendChild(selectField('Área / projeto', 'area', [{ value: '', label: 'Todas' }, ...areas.map((a) => ({ value: a, label: a }))], filters.area, (v) => { filters.area = v; onChange(); }));
  grid.appendChild(selectField('Responsável', 'responsavel', [{ value: '', label: 'Todos' }, ...responsaveis.map((r) => ({ value: r, label: r }))], filters.responsavel, (v) => { filters.responsavel = v; onChange(); }));
  grid.appendChild(selectField('Colaborador', 'colaboradorId', [{ value: '', label: 'Todos' }, ...collaborators.map((c) => ({ value: c.id, label: c.nome }))], filters.colaboradorId, (v) => { filters.colaboradorId = v; onChange(); }));

  grid.appendChild(checkbox('Somente urgente / alta prioridade', filters.somenteAltaPrioridade, (v) => { filters.somenteAltaPrioridade = v; onChange(); }));
  grid.appendChild(checkbox('Incluir itens concluídos', filters.incluirConcluidos, (v) => { filters.incluirConcluidos = v; onChange(); }));
  grid.appendChild(checkbox('Incluir itens cancelados', filters.incluirCancelados, (v) => { filters.incluirCancelados = v; onChange(); }));

  container.appendChild(grid);
  container.appendChild(customWrap);
}

function selectField(label, name, options, value, onChange) {
  const wrap = el('div', { class: 'form-field' });
  wrap.appendChild(el('label', { text: label }));
  const select = el('select', {});
  for (const opt of options) select.appendChild(el('option', { value: opt.value, text: opt.label, selected: opt.value === value || undefined }));
  select.addEventListener('change', () => onChange(select.value));
  wrap.appendChild(select);
  return wrap;
}

function dateField(label, value, onChange) {
  const wrap = el('div', { class: 'form-field' });
  wrap.appendChild(el('label', { text: label }));
  const input = el('input', { type: 'date' });
  input.value = value || '';
  input.addEventListener('change', () => onChange(input.value));
  wrap.appendChild(input);
  return wrap;
}

function checkbox(label, checked, onChange) {
  const wrap = el('div', { class: 'checkbox-field form-field--full' });
  const input = el('input', { type: 'checkbox' });
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  wrap.appendChild(input);
  wrap.appendChild(el('label', { text: label }));
  return wrap;
}

async function generateAndRender(previewCard) {
  current = await generateExecutiveEmail(filters);
  if (!manualEdit) { manualSubject = current.subject; manualBody = format === 'html' ? current.bodyHtml : current.bodyText; }
  renderPreview(previewCard);
}

function renderPreview(container) {
  container.innerHTML = '';
  const toolbar = el('div', { class: 'filter-bar', style: 'margin-bottom:12px;' }, [
    el('button', { class: `filter-chip${format === 'texto' ? ' is-active' : ''}`, type: 'button', text: 'Texto simples', onClick: () => { format = 'texto'; manualEdit = false; renderPreview(container); } }),
    el('button', { class: `filter-chip${format === 'html' ? ' is-active' : ''}`, type: 'button', text: 'HTML', onClick: () => { format = 'html'; manualEdit = false; renderPreview(container); } }),
  ]);
  container.appendChild(toolbar);

  const subjectField = el('div', { class: 'form-field' }, [el('label', { text: 'Assunto' })]);
  const subjectInput = el('input', { type: 'text' });
  subjectInput.value = manualSubject || (current ? current.subject : '');
  subjectInput.addEventListener('input', () => { manualEdit = true; manualSubject = subjectInput.value; });
  subjectField.appendChild(subjectInput);
  container.appendChild(subjectField);

  const toField = el('div', { class: 'form-field' }, [el('label', { text: 'Destinatários' })]);
  const toInput = el('input', { type: 'text', placeholder: 'ex.: diretoria@empresa.com' });
  toField.appendChild(toInput);
  container.appendChild(toField);

  const bodyField = el('div', { class: 'form-field' }, [el('label', { text: 'Corpo do e-mail (editável)' })]);
  const bodyArea = el('textarea', { rows: 18, style: 'min-height:340px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;' });
  bodyArea.value = manualEdit ? manualBody : (format === 'html' ? current.bodyHtml : current.bodyText);
  bodyArea.addEventListener('input', () => { manualEdit = true; manualBody = bodyArea.value; });
  bodyField.appendChild(bodyArea);
  container.appendChild(bodyField);

  const actions = el('div', { class: 'view-actions', style: 'margin-top:12px;flex-wrap:wrap;' }, [
    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => copyText(subjectInput.value, 'Assunto copiado.') }, [icon('copy', { size: 14 }), 'Copiar assunto']),
    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => copyText(bodyArea.value, 'E-mail copiado.') }, [icon('copy', { size: 14 }), 'Copiar e-mail']),
    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => downloadTextFile(fileName('txt'), format === 'html' ? htmlToPlain(bodyArea.value) : bodyArea.value, 'text/plain;charset=utf-8') }, [icon('download', { size: 14 }), 'Baixar como TXT']),
    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => downloadTextFile(fileName('html'), wrapHtmlDocument(subjectInput.value, format === 'html' ? bodyArea.value : bodyArea.value.replace(/\n/g, '<br>')), 'text/html;charset=utf-8') }, [icon('download', { size: 14 }), 'Baixar como HTML']),
    el('a', { class: 'btn btn--accent btn--sm', href: buildMailto(toInput.value, subjectInput.value, format === 'html' ? htmlToPlain(bodyArea.value) : bodyArea.value) }, [icon('send', { size: 14 }), 'Abrir no aplicativo de e-mail']),
  ]);
  container.appendChild(actions);

  if (current) {
    container.appendChild(el('p', { class: 'u-muted', style: 'font-size:12px;margin-top:10px;', text: `${current.stats.concluidas} concluída(s) · ${current.stats.emAndamento} em andamento · ${current.stats.aguardandoRetorno} aguardando retorno · ${current.stats.riscos} risco(s)/atraso(s).` }));
  }
}

function fileName(ext) {
  return `email-executivo-${todayISO()}.${ext}`;
}

function htmlToPlain(html) {
  // Remoção simples de marcações para gerar uma versão em texto puro (sem parsing/execução de HTML).
  return html.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function wrapHtmlDocument(subject, bodyHtml) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(subject)}</title></head><body style="font-family:Arial,Helvetica,sans-serif;color:#16232E;max-width:680px;margin:0 auto;">${bodyHtml}</body></html>`;
}

function buildMailto(to, subject, body) {
  const params = new URLSearchParams({ subject, body });
  return `mailto:${encodeURIComponent(to || '')}?${params.toString()}`;
}

async function copyText(text, message) {
  const ok = await copyToClipboard(text);
  showToast(ok ? message : 'Não foi possível copiar automaticamente.', { type: ok ? 'success' : 'danger' });
}
