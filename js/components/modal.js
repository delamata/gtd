// ==========================================================================
// modal.js — modal genérico (formulários, confirmações) com foco e teclado
// ==========================================================================
import { el } from '../utils.js';
import { icon } from './icons.js';

let activeModal = null;

/**
 * Abre um modal. Fecha com Esc, clique fora ou botão de fechar.
 * `onCtrlEnter`, se informado, é chamado quando o usuário pressiona Ctrl+Enter
 * dentro do modal (usado para salvar formulários rapidamente).
 */
export function openModal({ title, size = 'md', bodyNode, footerNode, onClose, onCtrlEnter, closeOnEsc = true }) {
  if (activeModal) activeModal.close();

  const overlay = el('div', { class: 'modal-overlay' });
  const modal = el('div', { class: `modal modal--${size}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  const closeBtn = el('button', { class: 'btn btn--icon btn--ghost', type: 'button', 'aria-label': 'Fechar', onClick: () => close() }, [icon('close')]);
  const header = el('div', { class: 'modal__header' }, [el('h2', { class: 'modal__title', text: title }), closeBtn]);
  const body = el('div', { class: 'modal__body' }, [bodyNode]);

  modal.appendChild(header);
  modal.appendChild(body);
  if (footerNode) modal.appendChild(footerNode);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let closed = false;
  function onKeydown(e) {
    if (e.key === 'Escape' && closeOnEsc) { e.preventDefault(); close(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onCtrlEnter) { e.preventDefault(); onCtrlEnter(); }
  }
  function onOverlayClick(e) { if (e.target === overlay) close(); }
  document.addEventListener('keydown', onKeydown, true);
  overlay.addEventListener('mousedown', onOverlayClick);

  function close(result) {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    if (activeModal === api) activeModal = null;
    if (onClose) onClose(result);
  }

  const api = { close, overlay, modal, bodyEl: body };
  activeModal = api;

  setTimeout(() => {
    const focusable = modal.querySelector('input, select, textarea, button:not([aria-label="Fechar"])');
    (focusable || closeBtn).focus();
  }, 20);

  return api;
}

export function closeActiveModal() {
  if (activeModal) activeModal.close();
}

/** Confirmação padronizada (substitui window.confirm nativo, mantém o visual do sistema). */
export function confirmDialog({ title = 'Confirmar ação', message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (!settled) { settled = true; resolve(value); } };

    const body = el('div', {}, [el('p', { text: message })]);
    const footer = el('div', { class: 'modal__footer' });
    footer.appendChild(el('button', { class: 'btn btn--secondary', type: 'button', text: cancelLabel, onClick: () => modalApi.close() }));
    footer.appendChild(
      el('button', {
        class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`,
        type: 'button',
        text: confirmLabel,
        onClick: () => { finish(true); modalApi.close(); },
      })
    );

    const modalApi = openModal({ title, size: 'sm', bodyNode: body, footerNode: footer, onClose: () => finish(false) });
  });
}
