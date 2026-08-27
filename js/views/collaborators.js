// ==========================================================================
// views/collaborators.js — cadastro de colaboradores e indicadores de FUPs
// ==========================================================================
import * as store from '../store.js';
import { el } from '../utils.js';
import { icon } from '../components/icons.js';
import { openModal, confirmDialog } from '../components/modal.js';
import { showToast } from '../components/toast.js';
import { field, checkboxField, modalFooter } from '../components/forms.js';
import { navigate } from '../router.js';
import { DEFAULT_COLLABORATOR_COLORS } from '../models.js';

export async function render(root) {
  root.appendChild(buildHeader());
  const filterBar = el('div', { class: 'filter-bar' });
  root.appendChild(filterBar);
  const grid = el('div', { class: 'card-grid', style: 'grid-template-columns:repeat(auto-fit,minmax(280px,1fr));' });
  root.appendChild(grid);

  let showInactive = true;

  async function refresh() {
    filterBar.innerHTML = '';
    filterBar.appendChild(el('button', { class: `filter-chip${showInactive ? ' is-active' : ''}`, type: 'button', text: 'Mostrar inativos', onClick: () => { showInactive = !showInactive; refresh(); } }));

    const collaborators = await store.listCollaborators({ includeInactive: showInactive });
    grid.innerHTML = '';
    if (!collaborators.length) {
      grid.appendChild(el('div', { class: 'empty-state' }, [icon('collaborators', { size: 32 }), el('p', { text: 'Nenhum colaborador cadastrado.' })]));
    }
    for (const c of collaborators) {
      const stats = await store.collaboratorStats(c.id);
      grid.appendChild(buildCard(c, stats, refresh));
    }
  }

  const unsubscribe = store.subscribe(refresh);
  await refresh();
  return unsubscribe;
}

function buildHeader() {
  const header = el('div', { class: 'view-header' });
  header.appendChild(el('div', {}, [el('h1', { class: 'view-title', text: 'Colaboradores' }), el('p', { class: 'view-subtitle', text: 'Cadastro de colaboradores e times parceiros vinculados a FUPs.' })]));
  header.appendChild(el('div', { class: 'view-actions' }, [el('button', { class: 'btn btn--primary', onClick: () => openCollaboratorForm(null, () => {}) }, [icon('plus'), 'Novo colaborador'])]));
  return header;
}

function buildCard(c, stats, refresh) {
  const card = el('div', { class: 'card', style: `border-left:4px solid ${c.cor};${c.ativo ? '' : 'opacity:.6;'}` });
  const head = el('div', { class: 'u-flex', style: 'justify-content:space-between;align-items:flex-start;' }, [
    el('div', {}, [
      el('div', { style: 'font-weight:600;font-size:15px;color:var(--color-navy);', text: c.nome }),
      el('div', { class: 'u-muted', style: 'font-size:12px;', text: [c.cargo, c.time].filter(Boolean).join(' · ') || '—' }),
    ]),
    el('span', { class: `badge ${c.ativo ? 'badge--success' : 'badge--neutral'}`, text: c.ativo ? 'Ativo' : 'Inativo' }),
  ]);
  card.appendChild(head);

  const statsRow = el('div', { class: 'u-flex u-gap-2', style: 'margin-top:12px;flex-wrap:wrap;' }, [
    statPill('Abertos', stats.totalAberto, 'badge--info'),
    statPill('Atrasados', stats.atrasados, stats.atrasados ? 'badge--danger' : 'badge--neutral'),
    statPill('Aguardando', stats.aguardando, stats.aguardando ? 'badge--warning' : 'badge--neutral'),
  ]);
  card.appendChild(statsRow);

  if (c.email) card.appendChild(el('div', { class: 'u-muted', style: 'font-size:12px;margin-top:8px;', text: c.email }));
  if (c.observacoes) card.appendChild(el('div', { style: 'font-size:12px;margin-top:6px;', text: c.observacoes }));

  const actions = el('div', { class: 'u-flex u-gap-2', style: 'margin-top:14px;' }, [
    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', text: 'Ver FUPs', onClick: () => navigate(`#/fups?colaboradorId=${c.id}`) }),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Editar', onClick: () => openCollaboratorForm(c, refresh) }),
    el('button', { class: `btn btn--sm ${c.ativo ? 'btn--danger' : 'btn--secondary'}`, type: 'button', text: c.ativo ? 'Inativar' : 'Reativar', onClick: async () => {
      if (c.ativo) {
        const ok = await confirmDialog({ title: 'Inativar colaborador', message: `Inativar "${c.nome}"? Os FUPs vinculados permanecem no histórico.`, danger: true });
        if (!ok) return;
      }
      await store.setCollaboratorActive(c.id, !c.ativo);
      showToast(`Colaborador ${c.ativo ? 'inativado' : 'reativado'}.`, { undo: () => store.setCollaboratorActive(c.id, c.ativo) });
    } }),
  ]);
  card.appendChild(actions);
  return card;
}

function statPill(label, value, badgeClass) {
  return el('span', { class: `badge ${badgeClass}` }, [`${label}: ${value}`]);
}

export function openCollaboratorForm(existing, onSaved) {
  const isEdit = !!existing;
  const f = {
    nome: field({ label: 'Nome', name: 'nome', value: existing?.nome, full: true }),
    time: field({ label: 'Time / área', name: 'time', value: existing?.time }),
    cargo: field({ label: 'Cargo / função', name: 'cargo', value: existing?.cargo }),
    email: field({ label: 'E-mail (opcional)', name: 'email', type: 'email', value: existing?.email }),
    observacoes: field({ label: 'Observações', name: 'observacoes', type: 'textarea', value: existing?.observacoes, full: true }),
  };
  const ativoField = checkboxField({ label: 'Colaborador ativo', name: 'ativo', checked: existing ? existing.ativo : true });

  let selectedColor = existing?.cor || DEFAULT_COLLABORATOR_COLORS[0];
  const swatches = el('div', { class: 'color-swatches' });
  for (const color of DEFAULT_COLLABORATOR_COLORS) {
    const dot = el('button', { type: 'button', class: `color-swatch${color === selectedColor ? ' is-selected' : ''}`, style: `background:${color};`, 'aria-label': `Cor ${color}`, onClick: () => {
      selectedColor = color;
      swatches.querySelectorAll('.color-swatch').forEach((s) => s.classList.remove('is-selected'));
      dot.classList.add('is-selected');
    } });
    swatches.appendChild(dot);
  }
  const colorField = el('div', { class: 'form-field form-field--full' }, [el('label', { text: 'Cor de identificação' }), swatches]);

  const body = el('div', { class: 'form-grid' }, [...Object.values(f).map((x) => x.wrap), colorField, el('div', { class: 'form-field--full' }, [ativoField.wrap])]);

  const save = async () => {
    const payload = { nome: f.nome.value, time: f.time.value, cargo: f.cargo.value, email: f.email.value, observacoes: f.observacoes.value, ativo: ativoField.value, cor: selectedColor };
    try {
      let record;
      if (isEdit) { const previous = { ...existing }; record = await store.updateCollaborator(existing.id, payload); showToast(`Colaborador ${record.id} atualizado.`, { undo: () => store.updateCollaborator(record.id, previous) }); }
      else { record = await store.createCollaborator(payload); showToast(`Colaborador ${record.id} criado.`, { type: 'success' }); }
      modal.close();
      if (onSaved) onSaved(record);
    } catch (err) {
      if (err.name === 'ValidationError') for (const [k, msg] of Object.entries(err.errors)) f[k] && f[k].setError(msg);
      else showToast('Erro ao salvar colaborador.', { type: 'danger' });
    }
  };

  const footer = modalFooter({ onCancel: () => modal.close(), onSave: save });
  const modal = openModal({ title: isEdit ? `Editar colaborador ${existing.id}` : 'Novo colaborador', size: 'md', bodyNode: body, footerNode: footer, onCtrlEnter: save });
  return modal;
}
