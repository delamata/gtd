// ==========================================================================
// forms.js — construtores de campos de formulário reutilizáveis
// ==========================================================================
import { el } from '../utils.js';

/** Cria um campo de formulário (texto, data, hora, número, select ou textarea). */
export function field({ label, name, type = 'text', value = '', options = [], hint = '', full = false, placeholder = '' }) {
  const wrap = el('div', { class: `form-field${full ? ' form-field--full' : ''}` });
  wrap.appendChild(el('label', { for: `f-${name}` }, [label, hint ? el('span', { class: 'hint', text: ` ${hint}` }) : null]));

  let input;
  if (type === 'select') {
    input = el('select', { id: `f-${name}`, name });
    for (const opt of options) {
      const optionEl = el('option', { value: opt.value, text: opt.label });
      if (String(opt.value) === String(value)) optionEl.selected = true;
      input.appendChild(optionEl);
    }
  } else if (type === 'textarea') {
    input = el('textarea', { id: `f-${name}`, name, placeholder, rows: 3 });
    input.value = value || '';
  } else {
    input = el('input', { id: `f-${name}`, name, type, placeholder });
    input.value = value || '';
  }
  wrap.appendChild(input);
  const err = el('div', { class: 'form-field__error' });
  wrap.appendChild(err);

  return {
    wrap,
    input,
    get value() { return input.type === 'checkbox' ? input.checked : input.value; },
    set value(v) { input.value = v; },
    setError(msg) { wrap.classList.toggle('has-error', !!msg); err.textContent = msg || ''; },
  };
}

export function checkboxField({ label, name, checked = false }) {
  const wrap = el('div', { class: 'checkbox-field' });
  const input = el('input', { type: 'checkbox', id: `f-${name}`, name });
  input.checked = checked;
  wrap.appendChild(input);
  wrap.appendChild(el('label', { for: `f-${name}`, text: label }));
  return { wrap, input, get value() { return input.checked; } };
}

/** Monta um <select> simples de opções [{value,label}]. */
export function toOptions(map) {
  return Object.entries(map).map(([value, label]) => ({ value, label }));
}

/** Rodapé padrão de modal com hint de atalhos + botões cancelar/salvar. */
export function modalFooter({ onCancel, onSave, saveLabel = 'Salvar', cancelLabel = 'Cancelar', extra = [] }) {
  const footer = el('div', { class: 'modal__footer' });
  footer.appendChild(el('span', { class: 'modal__footer-hint', text: 'Ctrl+Enter para salvar · Esc para fechar' }));
  for (const node of extra) footer.appendChild(node);
  footer.appendChild(el('button', { type: 'button', class: 'btn btn--secondary', text: cancelLabel, onClick: onCancel }));
  footer.appendChild(el('button', { type: 'button', class: 'btn btn--primary', text: saveLabel, onClick: onSave }));
  return footer;
}

export function tagsToInputValue(tags) {
  return (tags || []).join(', ');
}
