// ==========================================================================
// views/login.js — tela de autenticação (e-mail/senha via Supabase Auth).
// Renderizada por js/app.js no lugar do app-shell enquanto não há sessão.
// Não há cadastro público aqui de propósito: o app fica exposto na
// internet, e o usuário cria a própria conta pelo painel do Supabase
// (Authentication → Users → Add user). Ver README.md.
// ==========================================================================
import { supabase } from '../supabaseClient.js';
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

  const form = el('form', { class: 'form-grid' }, [
    emailField.wrap,
    passwordField.wrap,
    submitBtn,
  ]);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    emailField.setError('');
    passwordField.setError('');
    if (!emailField.value.trim()) { emailField.setError('Informe o e-mail.'); return; }
    if (!passwordField.value) { passwordField.setError('Informe a senha.'); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailField.value.trim(), password: passwordField.value });
      if (error) throw error;
      onSuccess();
    } catch (err) {
      showToast(err.message === 'Invalid login credentials' ? 'E-mail ou senha incorretos.' : (err.message || 'Não foi possível entrar.'), { type: 'danger' });
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
      showToast(err.message || 'Não foi possível enviar o e-mail de redefinição.', { type: 'danger' });
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
    form,
    forgotBtn,
  ]);

  root.appendChild(el('div', { class: 'login-screen' }, [card]));
  setTimeout(() => emailField.input.focus(), 20);
}
