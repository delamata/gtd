// ==========================================================================
// toast.js — mensagens de sucesso/erro com opção de "desfazer"
// ==========================================================================
let container = null;

function ensureContainer() {
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('role', 'status');
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Exibe uma notificação temporária.
 * opts.type: 'default' | 'success' | 'danger'
 * opts.undo: função opcional chamada ao clicar em "Desfazer".
 */
export function showToast(message, opts = {}) {
  const { type = 'default', duration = 5000, undo } = opts;
  const c = ensureContainer();
  const toast = document.createElement('div');
  toast.className = `toast${type === 'success' ? ' toast--success' : ''}${type === 'danger' ? ' toast--danger' : ''}`;

  const text = document.createElement('span');
  text.textContent = message;
  toast.appendChild(text);

  if (undo) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast__undo';
    btn.textContent = 'Desfazer';
    btn.addEventListener('click', () => {
      undo();
      toast.remove();
    });
    toast.appendChild(btn);
  }

  c.appendChild(toast);
  const timer = setTimeout(() => toast.remove(), duration);
  toast.addEventListener('mouseenter', () => clearTimeout(timer));
  return toast;
}
