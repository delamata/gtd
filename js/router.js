// ==========================================================================
// router.js — roteamento por hash (#/dashboard, #/hoje, ...), sem frameworks
// ==========================================================================
import { clearNode } from './utils.js';

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
    console.error('[router] erro ao renderizar view', path, err);
  }
  if (onNavigate) onNavigate(path);
}

export function start(root) {
  rootEl = root;
  window.addEventListener('hashchange', render);
  if (!location.hash) location.hash = '#/dashboard';
  render();
}
