// ==========================================================================
// router.js — roteamento por hash (#/dashboard, #/hoje, ...), sem frameworks
// ==========================================================================
import { clearNode, el } from './utils.js';
import { isNetworkError, probeBackend, describeBackendError } from './backend-errors.js';

const routes = new Map();
let currentCleanup = null;
let rootEl = null;
let onNavigate = null;

export function registerRoute(path, renderFn) {
  routes.set(path, renderFn);
}

export function onRouteChange(fn) {
  onNavigate = fn;
}

export function navigate(path) {
  if (location.hash === path) render();
  else location.hash = path;
}

export function currentPath() {
  return (location.hash || '#/dashboard').split('?')[0];
}

async function render() {
  const hash = location.hash || '#/dashboard';
  const [path, queryStr] = hash.split('?');
  const renderFn = routes.get(path) || routes.get('#/dashboard');

  if (currentCleanup) {
    try { currentCleanup(); } catch (err) { console.error('[router] erro ao limpar view anterior', err); }
    currentCleanup = null;
  }
  if (!rootEl) return;
  clearNode(rootEl);
  const params = Object.fromEntries(new URLSearchParams(queryStr || ''));
  try {
    const cleanup = await renderFn(rootEl, params);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    // Sem isto, qualquer consulta que falhe deixa a tela em branco e mandar
    // o erro só para o console — que ninguém abre — vira "o app sumiu".
    console.error('[router] erro ao renderizar view', path, err);
    await renderErrorState(rootEl, err, path);
  }
  if (onNavigate) onNavigate(path);
}

/** Painel de erro no lugar da view que não conseguiu montar. */
async function renderErrorState(root, err, path) {
  const probe = isNetworkError(err) ? await probeBackend() : null;
  const { titulo, detalhe, comoResolver } = describeBackendError(err, probe);
  clearNode(root);
  root.appendChild(el('div', { class: 'empty-state' }, [
    el('p', {}, [el('strong', { text: `Não foi possível carregar esta tela. ${titulo}` })]),
    detalhe ? el('p', { class: 'form-alert__detail', text: detalhe }) : null,
    comoResolver.length
      ? el('ul', { class: 'form-alert__steps', style: 'text-align:left;display:inline-block;' },
          comoResolver.map((passo) => el('li', { text: passo })))
      : null,
    el('div', { style: 'margin-top:12px;' }, [
      el('button', {
        class: 'btn btn--primary btn--sm', type: 'button', text: 'Tentar novamente',
        onClick: () => render(),
      }),
    ]),
  ]));
}

export function start(root) {
  rootEl = root;
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/dashboard';
  render();
}
