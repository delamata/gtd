// ==========================================================================
// app.js — ponto de entrada: monta o shell (sidebar/topbar), registra rotas
// e liga os atalhos globais. Dados em Supabase — requer autenticação e internet.
// ==========================================================================
import * as store from './store.js';
import * as db from './database.js';
import * as router from './router.js';
import { supabase } from './supabaseClient.js';
import { renderLogin } from './views/login.js';
import { el, clearNode, formatDateLong, todayISO, getPreferences, savePreferences, downloadTextFile, nowISO } from './utils.js';
import { icon } from './components/icons.js';
import { showToast } from './components/toast.js';

import * as dashboardView from './views/dashboard.js';
import * as todayView from './views/today.js';
import * as tasksView from './views/tasks.js';
import * as fupsView from './views/fups.js';
import * as agendaView from './views/agenda.js';
import * as collaboratorsView from './views/collaborators.js';
import * as completedView from './views/completed.js';
import * as emailView from './views/email.js';
import * as settingsView from './views/settings.js';

const NAV_ITEMS = [
  { route: '#/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { route: '#/hoje', label: 'Hoje', icon: 'today' },
  { route: '#/tarefas', label: 'Tarefas', icon: 'tasks' },
  { route: '#/fups', label: 'FUPs', icon: 'fups' },
  { route: '#/agenda', label: 'Agenda', icon: 'agenda' },
  { route: '#/colaboradores', label: 'Colaboradores', icon: 'collaborators' },
  { route: '#/concluidas', label: 'Concluídas', icon: 'completed' },
  { route: '#/email', label: 'E-mail executivo', icon: 'email' },
  { route: '#/configuracoes', label: 'Configurações', icon: 'settings' },
];

let appWired = false; // garante que sidebar/topbar/rotas/atalhos só sejam montados uma vez

async function bootstrap() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await startApp();
  else showLoginScreen();

  // Sessão expirada ou "Sair" clicado: volta para a tela de login.
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      document.getElementById('app-shell').style.display = 'none';
      showLoginScreen();
    }
  });
}

function showLoginScreen() {
  document.getElementById('app-shell').style.display = 'none';
  const authRoot = document.getElementById('auth-root');
  renderLogin(authRoot, { onSuccess: () => { clearNode(authRoot); startApp(); } });
}

async function startApp() {
  clearNode(document.getElementById('auth-root'));
  document.getElementById('app-shell').style.display = '';

  try {
    await db.useSupabase(supabase);
    await store.init();
  } catch (err) {
    console.error('[app] Falha ao conectar ao Supabase', err);
    const root = document.getElementById('view-root');
    clearNode(root);
    root.appendChild(
      el('div', { class: 'empty-state' }, [el('p', { text: 'Não foi possível conectar ao banco de dados. Verifique sua conexão com a internet e recarregue a página.' })])
    );
    return;
  }

  if (!appWired) {
    appWired = true;
    buildSidebar();
    buildTopbar();
    registerRoutes();
    router.onRouteChange((path) => highlightNav(path));
    router.start(document.getElementById('view-root'));
    store.subscribe(() => updateOverdueBadge());
    bindGlobalShortcuts();
  } else {
    // Reautenticação (login → sair → login de novo) na mesma sessão de página:
    // a UI já está montada, só força a view atual a buscar dados de novo.
    router.navigate(router.currentPath());
  }
  updateOverdueBadge();
}

function buildSidebar() {
  const nav = document.getElementById('sidebar-nav');
  clearNode(nav);
  for (const item of NAV_ITEMS) {
    const a = el('a', { href: item.route, class: 'nav-item', dataset: { route: item.route } }, [
      icon(item.icon, { size: 18 }),
      el('span', { class: 'nav-item__label', text: item.label }),
    ]);
    if (item.route === '#/hoje') a.appendChild(el('span', { class: 'nav-item__badge', id: 'nav-overdue-badge', style: 'display:none;' }));
    nav.appendChild(a);
  }

  const prefs = getPreferences();
  const shell = document.getElementById('app-shell');
  shell.classList.toggle('is-sidebar-collapsed', !!prefs.sidebarCollapsed);
  const toggleBtn = document.getElementById('sidebar-toggle');
  clearNode(toggleBtn);
  toggleBtn.appendChild(icon('menu', { size: 16 }));
  toggleBtn.addEventListener('click', () => {
    const collapsed = !shell.classList.contains('is-sidebar-collapsed');
    shell.classList.toggle('is-sidebar-collapsed', collapsed);
    savePreferences({ sidebarCollapsed: collapsed });
  });
}

function highlightNav(path) {
  document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('is-active', n.dataset.route === path));
}

function buildTopbar() {
  const dateEl = document.getElementById('topbar-date');
  clearNode(dateEl);
  dateEl.appendChild(document.createTextNode('Hoje é '));
  dateEl.appendChild(el('strong', { text: formatDateLong(todayISO()) }));

  const searchBox = document.querySelector('.topbar__search');
  searchBox.insertBefore(icon('search', { size: 16 }), searchBox.firstChild);
  const searchInput = document.getElementById('global-search-trigger');
  searchInput.addEventListener('focus', (e) => { e.target.blur(); openSearchPanel(); });
  searchInput.addEventListener('click', () => openSearchPanel());

  const actions = document.getElementById('topbar-actions');
  clearNode(actions);

  actions.appendChild(buildNovaAtividadeDropdown());

  actions.appendChild(el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: async () => { const { openFupForm } = fupsView; await openFupForm(null, () => router.navigate('#/fups')); } }, [icon('fups', { size: 15 }), 'Novo FUP']));

  const overdueBtn = el('button', { class: 'btn btn--icon btn--ghost', type: 'button', id: 'topbar-overdue', 'aria-label': 'Itens vencidos', title: 'Itens vencidos', onClick: () => router.navigate('#/hoje') }, [icon('bell', { size: 17 })]);
  actions.appendChild(overdueBtn);

  actions.appendChild(el('button', { class: 'btn btn--icon btn--secondary', type: 'button', 'aria-label': 'Backup rápido', title: 'Exportar backup completo', onClick: async () => {
    const data = await store.exportAll();
    downloadTextFile(`backup-gtd-${nowISO().replace(/[:.]/g, '-')}.json`, JSON.stringify(data, null, 2), 'application/json');
    showToast('Backup exportado.', { type: 'success' });
  } }, [icon('download', { size: 17 })]));

  const logoutBtn = el('button', { class: 'btn btn--ghost btn--sm', type: 'button', title: 'Sair da conta', onClick: async () => { await supabase.auth.signOut(); } }, ['Sair']);
  actions.appendChild(logoutBtn);
  supabase.auth.getUser().then(({ data }) => {
    if (data && data.user) logoutBtn.title = `Sair (${data.user.email})`;
  }).catch(() => {});
}

function buildNovaAtividadeDropdown() {
  const dropdown = el('div', { class: 'dropdown' });
  const trigger = el('button', { class: 'btn btn--primary btn--sm', type: 'button', onClick: (e) => { e.stopPropagation(); dropdown.classList.toggle('is-open'); } }, [icon('plus', { size: 15 }), 'Nova atividade']);
  const menu = el('div', { class: 'dropdown__menu' }, [
    menuItem('tasks', 'Nova tarefa', async () => { const { openTaskForm } = tasksView; openTaskForm(null, () => router.navigate('#/tarefas')); }),
    menuItem('fups', 'Novo FUP', async () => { const { openFupForm } = fupsView; await openFupForm(null, () => router.navigate('#/fups')); }),
    menuItem('agenda', 'Novo compromisso', () => { const { openAgendaForm } = agendaView; openAgendaForm(null, () => router.navigate('#/agenda')); }),
    menuItem('collaborators', 'Novo colaborador', () => { const { openCollaboratorForm } = collaboratorsView; openCollaboratorForm(null, () => router.navigate('#/colaboradores')); }),
  ]);
  dropdown.appendChild(trigger);
  dropdown.appendChild(menu);
  document.addEventListener('click', () => dropdown.classList.remove('is-open'));
  return dropdown;
}

function menuItem(iconName, label, onClick) {
  return el('button', { class: 'dropdown__item', type: 'button', onClick: (e) => { e.stopPropagation(); onClick(); document.querySelectorAll('.dropdown.is-open').forEach((d) => d.classList.remove('is-open')); } }, [icon(iconName, { size: 16 }), label]);
}

async function updateOverdueBadge() {
  const overdue = await store.getOverdueItems();
  const navBadge = document.getElementById('nav-overdue-badge');
  const topbarBtn = document.getElementById('topbar-overdue');
  if (navBadge) {
    if (overdue.length) { navBadge.textContent = String(overdue.length); navBadge.style.display = ''; }
    else navBadge.style.display = 'none';
  }
  if (topbarBtn) {
    const existingDot = topbarBtn.querySelector('.btn__dot');
    if (existingDot) existingDot.remove();
    if (overdue.length) topbarBtn.appendChild(el('span', { class: 'btn__dot' }));
  }
}

function registerRoutes() {
  router.registerRoute('#/dashboard', dashboardView.render);
  router.registerRoute('#/hoje', todayView.render);
  router.registerRoute('#/tarefas', tasksView.render);
  router.registerRoute('#/fups', fupsView.render);
  router.registerRoute('#/agenda', agendaView.render);
  router.registerRoute('#/colaboradores', collaboratorsView.render);
  router.registerRoute('#/concluidas', completedView.render);
  router.registerRoute('#/email', emailView.render);
  router.registerRoute('#/configuracoes', settingsView.render);
}

// --------------------------------------------------------------------
// Busca global (Ctrl+K)
// --------------------------------------------------------------------
let searchPanelEl = null;

function openSearchPanel() {
  if (searchPanelEl) return;
  const overlay = el('div', { class: 'search-panel' });
  const box = el('div', { class: 'search-panel__box' });
  const input = el('input', { type: 'search', class: 'search-panel__input', placeholder: 'Buscar por ID, título, área, responsável, colaborador, tag...' });
  const results = el('div', { class: 'search-panel__results' });
  box.appendChild(input);
  box.appendChild(results);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  searchPanelEl = overlay;

  let activeIndex = -1;
  let items = [];

  async function runSearch() {
    items = await store.globalSearch(input.value);
    clearNode(results);
    activeIndex = items.length ? 0 : -1;
    if (!input.value.trim()) { results.appendChild(el('div', { class: 'search-panel__result', text: 'Digite para buscar em tarefas, FUPs, agenda e colaboradores.' })); return; }
    if (!items.length) { results.appendChild(el('div', { class: 'search-panel__result', text: 'Nenhum resultado encontrado.' })); return; }
    items.forEach((item, idx) => {
      const row = el('div', { class: `search-panel__result${idx === activeIndex ? ' is-active' : ''}`, onClick: () => goTo(item) }, [
        el('div', {}, [el('div', { style: 'font-weight:600;font-size:13px;', text: item.label }), el('div', { class: 'u-muted', style: 'font-size:12px;', text: item.sublabel || '' })]),
      ]);
      results.appendChild(row);
    });
  }

  function goTo(item) {
    close();
    router.navigate(item.route);
  }

  function close() {
    document.removeEventListener('keydown', onKeydown, true);
    overlay.remove();
    searchPanelEl = null;
  }

  function onKeydown(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(items.length - 1, activeIndex + 1); highlightActive(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); highlightActive(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (items[activeIndex]) goTo(items[activeIndex]); }
  }
  function highlightActive() {
    [...results.children].forEach((c, idx) => c.classList.toggle('is-active', idx === activeIndex));
  }

  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKeydown, true);
  input.addEventListener('input', runSearch);
  runSearch();
  setTimeout(() => input.focus(), 20);
}

function bindGlobalShortcuts() {
  document.addEventListener('keydown', (e) => {
    const isCtrlK = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k';
    if (isCtrlK) { e.preventDefault(); openSearchPanel(); }
  });
}

bootstrap();
