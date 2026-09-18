// ==========================================================================
// views/settings.js — backup, restauração, dados de exemplo e auditoria
// ==========================================================================
import * as store from '../store.js';
import { el, downloadTextFile, formatDateTimeBR, nowISO, sortBy } from '../utils.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, modalFooter } from '../components/forms.js';
import { renderTable, nextSortState } from '../components/table.js';

let auditSort = { key: 'dataHora', dir: 'desc' };

const ACAO_LABEL = {
  criacao: 'Criação', edicao: 'Edição', conclusao: 'Conclusão', reabertura: 'Reabertura',
  cancelamento: 'Cancelamento', arquivamento: 'Arquivamento', desarquivamento: 'Desarquivamento', exclusao: 'Exclusão', restauracao_backup: 'Restauração de backup',
};

export async function render(root) {
  root.appendChild(el('div', { class: 'view-header' }, [
    el('div', {}, [el('h1', { class: 'view-title', text: 'Configurações' }), el('p', { class: 'view-subtitle', text: 'Backup, restauração e auditoria dos seus dados no Supabase.' })]),
  ]));

  root.appendChild(buildBackupSection());
  root.appendChild(buildDangerSection());
  const auditSection = el('section', { class: 'section' });
  root.appendChild(auditSection);

  async function refreshAudit() {
    renderAuditSection(auditSection, refreshAudit);
  }
  await refreshAudit();
  const unsubscribe = store.subscribe(refreshAudit);
  return unsubscribe;
}

function buildBackupSection() {
  const section = el('section', { class: 'section' });
  section.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: 'Backup e restauração' })]));
  const grid = el('div', { class: 'card-grid' });

  grid.appendChild(actionCard('Exportar tudo', 'Gera um arquivo JSON com todos os dados: colaboradores, tarefas, FUPs, agenda, histórico, logs e configurações.', 'Exportar backup completo', async () => {
    const data = await store.exportAll();
    downloadTextFile(`backup-gtd-${nowISO().replace(/[:.]/g, '-')}.json`, JSON.stringify(data, null, 2), 'application/json');
    showToast('Backup exportado.', { type: 'success' });
  }));

  grid.appendChild(actionCard('Exportar filtrado', 'Exporta apenas os registros de uma área/projeto específica.', 'Exportar dados filtrados', () => openFilteredExportDialog()));

  grid.appendChild(actionCard('Importar backup', 'Valida o arquivo, mostra um resumo e cria automaticamente um backup do estado atual antes de substituir os dados.', 'Selecionar arquivo JSON', () => openImportDialog()));

  grid.appendChild(actionCard('Restaurar dados de exemplo', 'Substitui os dados atuais pela carga inicial de demonstração (gera backup automático antes).', 'Restaurar exemplo', async () => {
    const ok = await confirmDialog({ title: 'Restaurar dados de exemplo', message: 'Isso substituirá todos os dados atuais pelos dados de exemplo. Um backup automático do estado atual será baixado antes. Deseja continuar?', danger: true });
    if (!ok) return;
    const snapshot = await store.resetToSeed();
    downloadTextFile(`backup-automatico-antes-restauracao-${nowISO().replace(/[:.]/g, '-')}.json`, JSON.stringify(snapshot, null, 2), 'application/json');
    showToast('Dados de exemplo restaurados.', { type: 'success' });
  }));

  section.appendChild(grid);
  return section;
}

function actionCard(title, description, buttonLabel, onClick) {
  return el('div', { class: 'card' }, [
    el('h3', { style: 'color:var(--color-navy);margin-bottom:6px;', text: title }),
    el('p', { class: 'u-muted', style: 'font-size:12px;margin-bottom:12px;min-height:36px;', text: description }),
    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', text: buttonLabel, onClick }),
  ]);
}

function buildDangerSection() {
  const section = el('section', { class: 'section' });
  section.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: 'Zona de risco' })]));
  const card = el('div', { class: 'card', style: 'border-color:var(--color-danger);' }, [
    el('h3', { style: 'color:var(--color-danger);margin-bottom:6px;', text: 'Limpar todos os dados' }),
    el('p', { class: 'u-muted', style: 'font-size:12px;margin-bottom:12px;', text: 'Remove todos os registros do computador (um backup automático é baixado antes). Esta ação exige confirmação reforçada.' }),
    el('button', { class: 'btn btn--danger btn--sm', type: 'button', text: 'Limpar todos os dados', onClick: () => openWipeDialog() }),
  ]);
  section.appendChild(card);
  return section;
}

function openFilteredExportDialog() {
  const area = field({ label: 'Área / projeto (opcional)', name: 'area', full: true });
  const responsavel = field({ label: 'Responsável (opcional)', name: 'responsavel', full: true });
  const periodo = field({ label: 'Período', name: 'periodo', type: 'select', options: [{ value: '', label: 'Todos' }, { value: 'hoje', label: 'Hoje' }, { value: 'proximos7', label: 'Próximos 7 dias' }, { value: 'atrasadas', label: 'Atrasadas' }], full: true });
  const body = el('div', { class: 'form-grid' }, [area.wrap, responsavel.wrap, periodo.wrap]);
  const save = async () => {
    const data = await store.exportFiltered({ area: area.value, responsavel: responsavel.value, periodo: periodo.value });
    downloadTextFile(`backup-filtrado-gtd-${nowISO().replace(/[:.]/g, '-')}.json`, JSON.stringify(data, null, 2), 'application/json');
    showToast('Exportação filtrada concluída.', { type: 'success' });
    modal.close();
  };
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save, saveLabel: 'Exportar' });
  const modal = openModal({ title: 'Exportar dados filtrados', size: 'sm', bodyNode: body, footerNode: footer, onCtrlEnter: save });
}

function openImportDialog() {
  const fileInput = el('input', { type: 'file', accept: 'application/json,.json' });
  const summaryHost = el('div', { style: 'margin-top:12px;' });
  const modeField = field({ label: 'Modo de importação', name: 'modo', type: 'select', options: [{ value: 'replace', label: 'Substituir todos os dados' }, { value: 'merge', label: 'Mesclar com os dados atuais' }], full: true });
  const body = el('div', { class: 'form-grid' }, [el('div', { class: 'form-field--full' }, [el('label', { text: 'Arquivo de backup (.json)' }), fileInput]), modeField.wrap, summaryHost]);

  let parsed = null;
  fileInput.addEventListener('change', async () => {
    summaryHost.innerHTML = '';
    const fileObj = fileInput.files[0];
    if (!fileObj) return;
    try {
      const text = await fileObj.text();
      const json = JSON.parse(text);
      const validation = store.validateBackupShape(json);
      if (!validation.valid) {
        summaryHost.appendChild(el('div', { class: 'badge badge--danger', style: 'display:block;padding:8px;', text: validation.errors.join(' ') }));
        parsed = null;
        return;
      }
      parsed = json;
      const s = validation.summary;
      summaryHost.appendChild(el('div', { class: 'card', style: 'background:var(--surface-2);' }, [
        el('strong', { text: 'Resumo do arquivo:' }),
        el('ul', { style: 'margin-top:6px;padding-left:18px;font-size:13px;' }, [
          el('li', { text: `${s.colaboradores} colaborador(es)` }),
          el('li', { text: `${s.tarefas} tarefa(s)` }),
          el('li', { text: `${s.fups} FUP(s)` }),
          el('li', { text: `${s.agenda} compromisso(s)` }),
          el('li', { text: `${s.historico} registro(s) de histórico` }),
          el('li', { text: `Exportado em: ${formatDateTimeBR(s.exportadoEm)}` }),
        ]),
      ]));
    } catch {
      summaryHost.appendChild(el('div', { class: 'badge badge--danger', style: 'display:block;padding:8px;', text: 'Não foi possível ler o arquivo (JSON inválido).' }));
      parsed = null;
    }
  });

  const save = async () => {
    if (!parsed) { showToast('Selecione um arquivo de backup válido.', { type: 'danger' }); return; }
    const ok = await confirmDialog({ title: 'Confirmar importação', message: modeField.value === 'replace' ? 'Todos os dados atuais serão substituídos. Um backup automático será baixado antes. Deseja continuar?' : 'Os dados do arquivo serão mesclados com os dados atuais. Deseja continuar?', danger: true });
    if (!ok) return;
    try {
      await store.importBackup(parsed, { mode: modeField.value });
      showToast('Backup importado com sucesso.', { type: 'success' });
      modal.close();
    } catch (err) {
      showToast(err.message || 'Erro ao importar backup.', { type: 'danger' });
    }
  };
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save, saveLabel: 'Importar' });
  const modal = openModal({ title: 'Importar backup', size: 'md', bodyNode: body, footerNode: footer, onCtrlEnter: save });
}

function openWipeDialog() {
  const confirmField = field({ label: 'Digite CONFIRMAR para habilitar a limpeza', name: 'confirmacao', full: true });
  const body = el('div', { class: 'form-grid' }, [el('p', { class: 'form-field--full', text: 'Esta ação remove todos os registros do computador. Um backup automático será baixado antes de prosseguir.' }), confirmField.wrap]);
  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save, saveLabel: 'Limpar tudo', cancelLabel: 'Cancelar' });
  footer.querySelector('.btn--primary').classList.replace('btn--primary', 'btn--danger');
  footer.querySelector('.btn--danger').disabled = true;
  confirmField.input.addEventListener('input', () => { footer.querySelector('.btn--danger').disabled = confirmField.value.trim().toUpperCase() !== 'CONFIRMAR'; });

  async function save() {
    if (confirmField.value.trim().toUpperCase() !== 'CONFIRMAR') return;
    const snapshot = await store.wipeAll();
    downloadTextFile(`backup-automatico-antes-limpeza-${nowISO().replace(/[:.]/g, '-')}.json`, JSON.stringify(snapshot, null, 2), 'application/json');
    showToast('Todos os dados foram removidos.', { type: 'success' });
    modal.close();
  }
  const modal = openModal({ title: 'Limpar todos os dados', size: 'sm', bodyNode: body, footerNode: footer });
}

async function renderAuditSection(container, refresh) {
  container.innerHTML = '';
  container.appendChild(el('div', { class: 'section__header' }, [el('span', { class: 'section__title', text: 'Log de auditoria' })]));
  const rows = sortBy(await store.listAuditLog(), (r) => r.dataHora, auditSort.dir === 'desc' ? 'desc' : 'asc');
  const tableHost = el('div');
  container.appendChild(tableHost);
  renderTable(tableHost, {
    columns: [
      { key: 'dataHora', label: 'Data/hora', render: (r) => formatDateTimeBR(r.dataHora) },
      { key: 'tipoAcao', label: 'Ação', render: (r) => ACAO_LABEL[r.tipoAcao] || r.tipoAcao },
      { key: 'tipoRegistro', label: 'Registro' },
      { key: 'idRegistro', label: 'ID', className: 'col-id' },
    ],
    rows: rows.slice(0, 300),
    sortState: auditSort,
    onSort: (key) => { auditSort = nextSortState(auditSort, key); refresh(); },
    emptyMessage: 'Nenhuma ação registrada ainda.',
  });
  if (rows.length > 300) container.appendChild(el('p', { class: 'u-muted', style: 'font-size:12px;margin-top:8px;', text: `Mostrando os 300 registros mais recentes de ${rows.length}.` }));
}
