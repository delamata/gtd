// ==========================================================================
// Testes: diagnóstico de falhas de comunicação com o backend — distinguir
// "projeto fora do ar" de "sem internet" de "senha errada".
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { isNetworkError, probeBackend, describeBackendError } from '../js/backend-errors.js';
import { SUPABASE_URL, SUPABASE_DASHBOARD_URL, SUPABASE_PROJECT_REF } from '../js/supabase-config.js';

test('reconhece as mensagens de falha de rede dos diferentes navegadores', () => {
  assert.equal(isNetworkError(new TypeError('Failed to fetch')), true, 'Chrome');
  assert.equal(isNetworkError(new TypeError('Load failed')), true, 'Safari');
  assert.equal(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.')), true, 'Firefox');
  assert.equal(isNetworkError(Object.assign(new Error('abortado'), { name: 'AbortError' })), true, 'timeout');
});

test('não confunde erro de negócio nem bug de código com falha de rede', () => {
  assert.equal(isNetworkError(new Error('Invalid login credentials')), false);
  assert.equal(isNetworkError(new TypeError("Cannot read properties of undefined (reading 'id')")), false, 'bug no código não é "sem conexão"');
  assert.equal(isNetworkError(null), false);
});

test('probeBackend: qualquer resposta HTTP significa servidor no ar', async () => {
  const fetch401 = async () => ({ status: 401 });
  assert.deepEqual(await probeBackend({ fetchImpl: fetch401 }), { reachable: true });
});

test('probeBackend: exceção significa inalcançável', async () => {
  const fetchFalha = async () => { throw new TypeError('Failed to fetch'); };
  assert.deepEqual(await probeBackend({ fetchImpl: fetchFalha }), { reachable: false, reason: 'unreachable' });
});

test('probeBackend: respeita o tempo limite e não deixa o timer pendurado', async () => {
  const fetchTravado = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('abortado'), { name: 'AbortError' })));
  });
  const resultado = await probeBackend({ fetchImpl: fetchTravado, timeoutMs: 30 });
  assert.deepEqual(resultado, { reachable: false, reason: 'timeout' });
});

test('probeBackend bate no endpoint de health com a chave pública', async () => {
  let urlChamada = null;
  let headersEnviados = null;
  await probeBackend({ fetchImpl: async (url, opts) => { urlChamada = url; headersEnviados = opts.headers; return { status: 200 }; } });
  assert.equal(urlChamada, `${SUPABASE_URL}/auth/v1/health`);
  assert.ok(headersEnviados.apikey, 'precisa mandar a apikey');
});

test('servidor fora do ar vira diagnóstico acionável, não "Failed to fetch"', () => {
  const d = describeBackendError(new TypeError('Failed to fetch'), { reachable: false, reason: 'unreachable' });
  assert.match(d.titulo, /não respondeu/);
  assert.ok(d.comoResolver.length >= 3, 'precisa listar o que fazer');
  assert.ok(d.comoResolver.some((p) => /pausado/i.test(p)), 'projeto pausado é a causa mais provável e tem que aparecer');
  assert.ok(!d.titulo.includes('Failed to fetch'), 'a mensagem crua não vai para o usuário');
});

test('offline é diferenciado de servidor fora do ar', () => {
  const d = describeBackendError(new TypeError('Failed to fetch'), { reachable: false, reason: 'offline' });
  assert.match(d.titulo, /Sem conexão/);
  assert.ok(!d.comoResolver.some((p) => /pausado/i.test(p)), 'sem internet não é problema do Supabase');
});

test('timeout informa o endereço sondado no detalhe', () => {
  const d = describeBackendError(null, { reachable: false, reason: 'timeout' });
  assert.match(d.detalhe, /tempo limite/);
  assert.ok(d.detalhe.includes(SUPABASE_URL));
});

test('credenciais inválidas continuam sendo erro de senha, em português', () => {
  const d = describeBackendError(new Error('Invalid login credentials'));
  assert.equal(d.titulo, 'E-mail ou senha incorretos.');
  assert.equal(d.comoResolver.length, 0, 'erro de senha cabe num toast, não precisa de banner');
});

test('excesso de tentativas é identificado', () => {
  const d = describeBackendError(new Error('Email rate limit exceeded'));
  assert.match(d.titulo, /Muitas tentativas/);
});

test('erro desconhecido não quebra nem fica vazio', () => {
  assert.equal(describeBackendError(new Error('algo muito específico')).titulo, 'algo muito específico');
  assert.equal(describeBackendError(null).titulo, 'Não foi possível concluir a operação.');
  assert.equal(describeBackendError(undefined).titulo, 'Não foi possível concluir a operação.');
});

test('o link do painel aponta para o projeto configurado', () => {
  assert.ok(SUPABASE_URL.startsWith('https://'));
  assert.equal(SUPABASE_DASHBOARD_URL, `https://supabase.com/dashboard/project/${SUPABASE_PROJECT_REF}`);
  assert.ok(!SUPABASE_PROJECT_REF.includes('.'), 'a referência é só o subdomínio');
});

// --------------------------------------------------------------------
// "Banco desatualizado": o código espera uma tabela/coluna que não existe
// — quase sempre schema.sql não rodado depois de uma atualização. Já
// aconteceu duas vezes (coluna `arquivada`, tabelas `notes`/`demands`), e
// nas duas a mensagem crua do Postgres não dizia o que fazer.
// --------------------------------------------------------------------
import { isSchemaOutOfDate } from '../js/backend-errors.js';

test('reconhece tabela ou coluna inexistente pelos códigos do Postgres e do PostgREST', () => {
  assert.equal(isSchemaOutOfDate({ code: '42P01', message: 'relation "public.notes" does not exist' }), true);
  assert.equal(isSchemaOutOfDate({ code: '42703', message: 'column "arquivada" does not exist' }), true);
  assert.equal(isSchemaOutOfDate({ code: 'PGRST205', message: "Could not find the table 'public.demands' in the schema cache" }), true);
  assert.equal(isSchemaOutOfDate({ code: 'PGRST204', message: "Could not find the 'arquivada' column of 'fups' in the schema cache" }), true);
});

test('reconhece pela mensagem quando o código não vem', () => {
  assert.equal(isSchemaOutOfDate({ message: 'relation "public.demands" does not exist' }), true);
  assert.equal(isSchemaOutOfDate({ message: 'Could not find the table in the schema cache' }), true);
});

test('não confunde com erro de rede, de senha ou de permissão', () => {
  assert.equal(isSchemaOutOfDate(new TypeError('Failed to fetch')), false);
  assert.equal(isSchemaOutOfDate({ message: 'Invalid login credentials' }), false);
  assert.equal(isSchemaOutOfDate({ code: '42501', message: 'permission denied for table tasks' }), false);
  assert.equal(isSchemaOutOfDate(null), false);
});

test('banco desatualizado vira instrução de rodar o schema, não mensagem crua', () => {
  const d = describeBackendError({ code: '42P01', message: 'relation "public.notes" does not exist' });
  assert.match(d.titulo, /desatualizado/);
  assert.ok(d.comoResolver.some((p) => /schema\.sql/.test(p)), 'tem que dizer qual arquivo rodar');
  assert.ok(d.detalhe.includes('public.notes'), 'preserva qual objeto faltou, para o diagnóstico');
});

test('a classificação de esquema vem antes da de rede, que é a mais genérica', () => {
  // Um erro do PostgREST pode chegar sem código e ser confundido com outra
  // coisa se a ordem das verificações mudar.
  const d = describeBackendError({ message: 'Could not find the table \'public.demands\' in the schema cache' }, null);
  assert.match(d.titulo, /desatualizado/);
});
