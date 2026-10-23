// ==========================================================================
// views/login.js — tela de autenticação (e-mail/senha via Supabase Auth).
// Renderizada por js/app.js no lugar do app-shell enquanto não há sessão.
// Não há cadastro público aqui de propósito: o app fica exposto na
// internet, e o usuário cria a própria conta pelo painel do Supabase
// (Authentication → Users → Add user). Ver README.md.
// ==========================================================================
import { supabase } from '../supabaseClient.js';
import { SUPABASE_DASHBOARD_URL } from '../supabase-config.js';
import { probeBackend, isNetworkError, describeBackendError } from '../backend-errors.js';
import { el, clearNode } from '../utils.js';
import { field } from '../components/forms.js';
import { showToast } from '../components/toast.js';

/** Renderiza a tela de login em `root`. Chama `onSuccess()` após autenticar. */
export function renderLogin(root, { onSuccess }) {
  clearNode(root);

  const emailField = field({ label: 'E-mail', name: 'email', type: 'email', full: true });
  const passwordField = field({ label: 'Senha', name: 'senha', type: 'password', full: true });

  const submitBtn = el('button', { class: 'btn btn--primary', type: 'submit', style: 'width:100%;margin-top:8px;' }, ['Entrar']);
  const forgotBtn = el('button', { class: 'login-screen__forgot', type: 'button' }, ['Esqueci minha senha']);

  const alertHost = el('div');

  const form = el('form', { class: 'form-grid' }, [
    emailField.wrap,
    passwordField.wrap,
    submitBtn,
  ]);

  /** Mostra o diagnóstico de forma persistente (não some sozinho como o toast). */
  function showAlert({ titulo, detalhe, comoResolver }) {
    clearNode(alertHost);
    const corpo = [el('strong', { text: titulo })];
    if (detalhe) corpo.push(el('p', { class: 'form-alert__detail', text: detalhe }));
    if (comoResolver && comoResolver.length) {
      corpo.push(el('ul', { class: 'form-alert__steps' }, comoResolver.map((passo) => el('li', { text: passo }))));
      corpo.push(el('a', { class: 'form-alert__link', href: SUPABASE_DASHBOARD_URL, target: '_blank', rel: 'noopener', text: 'Abrir o painel do Supabase' }));
    }
    alertHost.appendChild(el('div', { class: 'form-alert', role: 'alert' }, corpo));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    emailField.setError('');
    passwordField.setError('');
    if (!emailField.value.trim()) { emailField.setError('Informe o e-mail.'); return; }
    if (!passwordField.value) { passwordField.setError('Informe a senha.'); return; }

    clearNode(alertHost);
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailField.value.trim(), password: passwordField.value });
      if (error) throw error;
      onSuccess();
    } catch (err) {
      console.error('[login] falha ao autenticar', err);
      // Erro de rede não é culpa da senha: antes de qualquer mensagem,
      // descobre se o backend sequer está no ar.
      const probe = isNetworkError(err) ? await probeBackend() : null;
      const diagnostico = describeBackendError(err, probe);
      if (diagnostico.comoResolver.length) showAlert(diagnostico);
      else showToast(diagnostico.titulo, { type: 'danger' });
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  });

  forgotBtn.addEventListener('click', async () => {
    const email = emailField.value.trim();
    if (!email) { emailField.setError('Informe o e-mail para receber o link de redefinição.'); return; }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      showToast('Se o e-mail existir, enviamos um link de redefinição de senha.', { type: 'success' });
    } catch (err) {
      console.error('[login] falha ao pedir redefinição de senha', err);
      const probe = isNetworkError(err) ? await probeBackend() : null;
      const diagnostico = describeBackendError(err, probe);
      if (diagnostico.comoResolver.length) showAlert(diagnostico);
      else showToast(diagnostico.titulo, { type: 'danger' });
    }
  });

  const card = el('div', { class: 'card login-screen__card' }, [
    el('div', { class: 'login-screen__brand' }, [
      el('div', { class: 'login-screen__brand-mark', 'aria-hidden': 'true', text: 'GT' }),
      el('div', {}, [
        el('div', { class: 'login-screen__title', text: 'GTD Executivo' }),
        el('div', { class: 'login-screen__subtitle', text: 'André Delamata' }),
      ]),
    ]),
    alertHost,
    form,
    forgotBtn,
  ]);

  root.appendChild(el('div', { class: 'login-screen' }, [card]));
  setTimeout(() => emailField.input.focus(), 20);
}
