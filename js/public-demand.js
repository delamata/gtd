// ==========================================================================
// public-demand.js — formulário público de demandas (demanda.html).
//
// Roda SEM login. Não importa js/app.js nem o store: não há sessão, e
// portanto nada deste banco pode ser lido daqui. O único acesso é a chamada
// da função submit_demand() do Postgres, que é SECURITY DEFINER e valida
// tudo de novo no servidor — a validação daqui é conveniência para quem
// preenche, não barreira de segurança (quem manda uma requisição direta
// pula este arquivo inteiro).
// ==========================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';
import { el, clearNode, PRIORIDADE_LABEL, todayISO } from './utils.js';
import { field, toOptions } from './components/forms.js';
import { logoMark } from './components/icons.js';
import { isNetworkError, probeBackend, describeBackendError } from './backend-errors.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const root = document.getElementById('demand-root');

function header() {
  return el('div', { class: 'public-page__brand' }, [
    el('div', { class: 'public-page__mark' }, [logoMark({ size: 40, boxed: true })]),
    el('div', {}, [
      el('h1', { class: 'public-page__title', text: 'Enviar uma demanda' }),
      el('p', { class: 'public-page__subtitle', text: 'Para André Delamata · Você não precisa fazer login' }),
    ]),
  ]);
}

function renderForm() {
  clearNode(root);

  const f = {
    titulo: field({ label: 'O que você precisa', name: 'titulo', full: true, placeholder: 'Resuma em uma linha' }),
    descricao: field({ label: 'Detalhes', name: 'descricao', type: 'textarea', full: true, placeholder: 'Contexto, o que já foi feito, o que você espera como resultado' }),
    solicitante: field({ label: 'Seu nome', name: 'solicitante', placeholder: 'Opcional' }),
    email: field({ label: 'Seu e-mail', name: 'email', type: 'email', placeholder: 'Opcional, para retorno' }),
    area: field({ label: 'Área / projeto', name: 'area', placeholder: 'Opcional' }),
    prioridadeSugerida: field({ label: 'Urgência na sua visão', name: 'prioridade', type: 'select', options: toOptions(PRIORIDADE_LABEL), value: 'media' }),
    prazoDesejado: field({ label: 'Precisa até', name: 'prazo', type: 'date', hint: '(opcional)' }),
  };
  f.descricao.input.rows = 6;
  f.prazoDesejado.input.min = todayISO();

  // Honeypot: invisível para gente, atraente para robô. Quem preencher
  // recebe um protocolo falso do servidor e nada é gravado.
  const trap = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
  const trapWrap = el('div', { class: 'u-visually-hidden' }, [
    el('label', { for: 'website', text: 'Não preencha este campo' }), trap,
  ]);
  trap.id = 'website';

  const alertHost = el('div');
  const submitBtn = el('button', { class: 'btn btn--primary', type: 'submit', style: 'width:100%;' }, ['Enviar demanda']);

  const form = el('form', { class: 'form-grid' }, [
    ...Object.values(f).map((x) => x.wrap), trapWrap, submitBtn,
  ]);

  function showAlert(titulo, detalhe) {
    clearNode(alertHost);
    alertHost.appendChild(el('div', { class: 'form-alert', role: 'alert' }, [
      el('strong', { text: titulo }),
      detalhe ? el('p', { class: 'form-alert__detail', text: detalhe }) : null,
    ]));
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const campo of Object.values(f)) campo.setError('');
    clearNode(alertHost);

    if (!f.titulo.value.trim()) { f.titulo.setError('Diga o que você precisa.'); f.titulo.input.focus(); return; }
    if (!f.descricao.value.trim()) { f.descricao.setError('Descreva a demanda.'); f.descricao.input.focus(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    try {
      const { data, error } = await supabase.rpc('submit_demand', {
        p_titulo: f.titulo.value,
        p_descricao: f.descricao.value,
        p_solicitante: f.solicitante.value,
        p_email: f.email.value,
        p_area: f.area.value,
        p_prioridade: f.prioridadeSugerida.value,
        p_prazo: f.prazoDesejado.value,
        p_trap: trap.value,
      });
      if (error) throw error;
      renderSuccess(data);
    } catch (err) {
      console.error('[demanda] falha ao enviar', err);
      const probe = isNetworkError(err) ? await probeBackend() : null;
      if (probe && !probe.reachable) {
        const { titulo, detalhe } = describeBackendError(err, probe);
        showAlert(titulo, detalhe);
      } else {
        // Erros de validação vêm da própria função do Postgres, em português.
        showAlert('Não foi possível enviar.', err.message || 'Tente novamente em alguns instantes.');
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Enviar demanda';
    }
  });

  root.appendChild(el('div', { class: 'card public-page__card' }, [header(), alertHost, form]));
  setTimeout(() => f.titulo.input.focus(), 30);
}

function renderSuccess(protocolo) {
  clearNode(root);
  root.appendChild(el('div', { class: 'card public-page__card' }, [
    header(),
    el('div', { class: 'public-page__success' }, [
      el('div', { class: 'public-page__protocol', text: protocolo || '—' }),
      el('p', {}, [el('strong', { text: 'Demanda registrada.' })]),
      el('p', { class: 'public-page__note', text: 'Guarde este número de protocolo. Você não receberá confirmação automática por e-mail — o retorno vem direto do André.' }),
      el('button', { class: 'btn btn--secondary', type: 'button', text: 'Enviar outra demanda', onClick: () => renderForm() }),
    ]),
  ]));
}

renderForm();
