// ==========================================================================
// backend-errors.js — diagnóstico de falhas de comunicação com o backend.
//
// Quando o Supabase não responde, o navegador entrega só um TypeError com
// a mensagem "Failed to fetch". Isso não diz nada a quem está usando o app
// e, pior, não distingue três situações muito diferentes: o projeto está
// pausado, você está sem internet, ou a senha está errada. Este módulo
// transforma esse erro cru em um diagnóstico acionável.
//
// Sem dependência de CDN de propósito (ver supabase-config.js) — é lógica
// pura, coberta por tests/backend-errors.test.mjs.
// ==========================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase-config.js';

/**
 * Distingue falha de REDE (a requisição nem chegou ao destino) de falha de
 * NEGÓCIO (o servidor respondeu recusando). Os navegadores não padronizam
 * essa mensagem: Chrome diz "Failed to fetch", Safari "Load failed",
 * Firefox "NetworkError when attempting to fetch resource".
 */
export function isNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError') return true;
  const msg = String(err.message || '').toLowerCase();
  if (msg.includes('failed to fetch') || msg.includes('networkerror')
    || msg.includes('load failed') || msg.includes('fetch failed')) return true;
  // TypeError só conta como rede se não houver mensagem reconhecível de
  // negócio — um TypeError de bug no código não deve virar "sem conexão".
  return err.name === 'TypeError' && !msg;
}

/**
 * Verifica se o projeto Supabase está no ar, batendo no endpoint público de
 * health. Qualquer resposta HTTP — inclusive 401 ou 404 — significa que o
 * servidor existe e respondeu; só uma exceção indica inalcançável.
 */
export async function probeBackend({ timeoutMs = 8000, fetchImpl = globalThis.fetch } = {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { reachable: false, reason: 'offline' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetchImpl(`${SUPABASE_URL}/auth/v1/health`, {
      signal: controller.signal,
      headers: { apikey: SUPABASE_ANON_KEY },
    });
    return { reachable: true };
  } catch (err) {
    return { reachable: false, reason: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * O código espera uma tabela ou coluna que o banco não tem — quase sempre
 * porque supabase/schema.sql não foi rodado depois de uma atualização.
 * Vale a pena separar esse caso: a mensagem crua do Postgres não diz a
 * quem a lê o que fazer, e a correção é sempre a mesma.
 */
export function isSchemaOutOfDate(err) {
  if (!err) return false;
  const code = String(err.code || '');
  // 42P01 tabela inexistente · 42703 coluna inexistente (Postgres)
  // PGRST20x: o PostgREST não achou a tabela/coluna no cache de esquema
  if (code === '42P01' || code === '42703' || /^PGRST20\d$/.test(code)) return true;
  const msg = String(err.message || '').toLowerCase();
  return /relation .* does not exist/.test(msg)
    || /column .* does not exist/.test(msg)
    || /could not find the .* (table|column)/.test(msg)
    || msg.includes('schema cache');
}

const MENSAGENS_CONHECIDAS = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Este e-mail ainda não foi confirmado.',
  'User not found': 'Não existe conta com este e-mail.',
};

/**
 * Traduz um erro do Supabase (ou da rede) em `{ titulo, detalhe,
 * comoResolver[] }`. Quem chama decide onde mostrar: `comoResolver` cheio
 * pede um banner persistente (o usuário precisa ler e agir); vazio cabe
 * num toast.
 *
 * `probe` é o resultado de probeBackend(), quando o chamador já sondou.
 */
export function describeBackendError(err, probe = null) {
  if (probe && probe.reason === 'offline') {
    return {
      titulo: 'Sem conexão com a internet.',
      detalhe: 'O navegador está offline.',
      comoResolver: ['Reconecte-se à rede e tente novamente.'],
    };
  }
  if (probe && !probe.reachable) {
    return {
      titulo: 'O servidor de dados não respondeu.',
      detalhe: probe.reason === 'timeout'
        ? `Nenhuma resposta de ${SUPABASE_URL} dentro do tempo limite.`
        : `Não foi possível alcançar ${SUPABASE_URL}.`,
      comoResolver: [
        'O projeto Supabase pode estar pausado — no plano gratuito ele hiberna após alguns dias sem uso. Abra o painel e clique em "Restore project".',
        'Numa rede corporativa, o domínio pode estar bloqueado. Teste pelo 4G do celular para confirmar.',
        'Extensões de bloqueio de anúncios ou rastreadores também barram a requisição — tente numa janela anônima.',
      ],
    };
  }
  if (isSchemaOutOfDate(err)) {
    return {
      titulo: 'O banco de dados está desatualizado.',
      detalhe: `${(err && err.message) || ''} ${(err && err.hint) || ''}`.trim(),
      comoResolver: [
        'Abra o SQL Editor do Supabase, cole o conteúdo de supabase/schema.sql e rode. Ele cria o que estiver faltando e é idempotente — pode rodar quantas vezes quiser.',
        'Depois recarregue esta página com Ctrl+Shift+R.',
      ],
    };
  }
  if (isNetworkError(err)) {
    return {
      titulo: 'A requisição não chegou ao servidor.',
      detalhe: err.message || 'Falha de rede.',
      comoResolver: ['Verifique sua conexão e tente de novo.'],
    };
  }

  const msg = String((err && err.message) || '');
  if (MENSAGENS_CONHECIDAS[msg]) {
    return { titulo: MENSAGENS_CONHECIDAS[msg], detalhe: '', comoResolver: [] };
  }
  if (msg.toLowerCase().includes('rate limit')) {
    return { titulo: 'Muitas tentativas seguidas.', detalhe: 'Aguarde um minuto antes de tentar novamente.', comoResolver: [] };
  }
  return { titulo: msg || 'Não foi possível concluir a operação.', detalhe: '', comoResolver: [] };
}
