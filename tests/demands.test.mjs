// ==========================================================================
// Testes: Demandas — pedidos recebidos sem login e a triagem deles.
//
// A criação pela página pública acontece na função submit_demand() do
// Postgres (supabase/schema.sql), que não roda aqui. O que estes testes
// cobrem é a MESMA validação do lado JS e todo o fluxo de triagem.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';
import { validateDemand } from '../js/validators.js';

installFakeIndexedDB();
const store = await import('../js/store.js');
await store.init();

test('demanda exige título e descrição', () => {
  assert.equal(validateDemand({ titulo: '', descricao: 'tem texto' }).valid, false);
  assert.equal(validateDemand({ titulo: 'tem título', descricao: '' }).valid, false);
  assert.equal(validateDemand({ titulo: 'ok', descricao: 'ok' }).valid, true);
});

test('demanda valida e-mail, data e urgência sugerida', () => {
  const base = { titulo: 'ok', descricao: 'ok' };
  assert.equal(validateDemand({ ...base, email: 'nao-e-email' }).valid, false);
  assert.equal(validateDemand({ ...base, email: 'pessoa@empresa.com.br' }).valid, true);
  assert.equal(validateDemand({ ...base, email: '' }).valid, true, 'e-mail é opcional');
  assert.equal(validateDemand({ ...base, prazoDesejado: '30/01/2026' }).valid, false);
  assert.equal(validateDemand({ ...base, prazoDesejado: '2026-01-30' }).valid, true);
  assert.equal(validateDemand({ ...base, prioridadeSugerida: 'altissima' }).valid, false);
  assert.equal(validateDemand({ ...base, prioridadeSugerida: 'urgente' }).valid, true);
  assert.equal(validateDemand({ ...base, status: 'inventado' }).valid, false);
});

test('demanda nasce como nova, sem tarefa vinculada', async () => {
  const d = await store.createDemand({ titulo: 'Preciso de acesso ao relatório', descricao: 'Sem acesso desde ontem.', solicitante: 'Fulano' });
  assert.equal(d.status, 'nova');
  assert.deepEqual(d.tarefasIds, []);
  assert.match(d.id, /^D\d+$/, 'usa o prefixo D');
  assert.equal(d.prioridadeSugerida, 'media', 'urgência sugerida tem padrão');
});

test('aceitar a demanda cria o vínculo com a tarefa e muda o status', async () => {
  const d = await store.createDemand({ titulo: 'Revisar contrato', descricao: 'Vence mês que vem.' });
  const t = await store.createTask({ titulo: 'Revisar contrato' });
  const aceita = await store.linkDemandToTask(d.id, t.id);

  assert.equal(aceita.status, 'aceita');
  assert.deepEqual(aceita.tarefasIds, [t.id]);
  const tarefas = await store.getDemandTasks(d.id);
  assert.equal(tarefas[0].id, t.id);
});

test('vincular a mesma tarefa duas vezes não duplica', async () => {
  const d = await store.createDemand({ titulo: 'Qualquer', descricao: 'Qualquer.' });
  const t = await store.createTask({ titulo: 'Única' });
  await store.linkDemandToTask(d.id, t.id);
  const again = await store.linkDemandToTask(d.id, t.id);
  assert.deepEqual(again.tarefasIds, [t.id]);
});

test('recusar registra o motivo para o solicitante poder ser respondido', async () => {
  const d = await store.createDemand({ titulo: 'Fora de escopo', descricao: 'Pedido que não cabe.' });
  const recusada = await store.rejectDemand(d.id, 'Já é tratado pelo time de Operações.');
  assert.equal(recusada.status, 'recusada');
  assert.match(recusada.respostaInterna, /Operações/);
});

test('a triagem é manual: demanda nova nunca vira tarefa sozinha', async () => {
  const antes = (await store.listTasks()).length;
  await store.createDemand({ titulo: 'Só entrou', descricao: 'Aguardando decisão.' });
  assert.equal((await store.listTasks()).length, antes, 'nenhuma tarefa criada automaticamente');
});

test('filtro por status separa a fila de triagem', async () => {
  const nova = await store.createDemand({ titulo: 'Na fila', descricao: 'x' });
  const tratada = await store.createDemand({ titulo: 'Já recusada', descricao: 'x' });
  await store.rejectDemand(tratada.id, 'não procede');

  const novas = await store.listDemands({ status: 'nova' });
  assert.ok(novas.some((d) => d.id === nova.id));
  assert.ok(!novas.some((d) => d.id === tratada.id));
  assert.ok((await store.listDemands({ status: 'recusada' })).some((d) => d.id === tratada.id));
});

test('arquivar e excluir demanda (spam) tiram da listagem', async () => {
  const arquivada = await store.createDemand({ titulo: 'Arquivar', descricao: 'x' });
  await store.archiveDemand(arquivada.id);
  assert.ok(!(await store.listDemands()).some((d) => d.id === arquivada.id));
  assert.ok((await store.listDemands({ somenteArquivadas: true })).some((d) => d.id === arquivada.id));
  await store.unarchiveDemand(arquivada.id);
  assert.ok((await store.listDemands()).some((d) => d.id === arquivada.id));

  const spam = await store.createDemand({ titulo: 'Spam', descricao: 'x' });
  await store.deleteDemand(spam.id);
  assert.ok(!(await store.listDemands({ includeArchived: true })).some((d) => d.id === spam.id));
  assert.ok(!(await store.listDemands({ somenteArquivadas: true })).some((d) => d.id === spam.id));
});

test('editar a demanda preserva o vínculo com as tarefas já geradas', async () => {
  const d = await store.createDemand({ titulo: 'Original', descricao: 'x' });
  const t = await store.createTask({ titulo: 'Gerada' });
  await store.linkDemandToTask(d.id, t.id);
  const editada = await store.updateDemand(d.id, { titulo: 'Título corrigido' });
  assert.equal(editada.titulo, 'Título corrigido');
  assert.deepEqual(editada.tarefasIds, [t.id]);
});

test('o dashboard conta as demandas novas', async () => {
  const antes = (await store.getDashboardStats()).demandasNovas;
  await store.createDemand({ titulo: 'Mais uma', descricao: 'x' });
  assert.equal((await store.getDashboardStats()).demandasNovas, antes + 1);
});

test('demandas entram no backup e voltam na importação', async () => {
  const d = await store.createDemand({ titulo: 'Sobrevive ao backup', descricao: 'x', solicitante: 'Ciclano', email: 'ciclano@empresa.com' });
  const dump = await store.exportAll();
  assert.ok(Array.isArray(dump.demandas));
  assert.ok(dump.demandas.some((x) => x.id === d.id));

  await store.importBackup(dump, { mode: 'replace', autoBackup: false });
  const restaurada = await store.getDemand(d.id);
  assert.equal(restaurada.solicitante, 'Ciclano');
  assert.equal(restaurada.email, 'ciclano@empresa.com');
});

test('backup sem o campo de demandas continua válido', async () => {
  const dump = await store.exportAll();
  delete dump.demandas;
  const v = store.validateBackupShape(dump);
  assert.equal(v.valid, true);
  assert.equal(v.summary.demandas, 0);
});

test('a descrição é truncada no limite, não rejeitada em silêncio', async () => {
  const d = await store.createDemand({ titulo: 'Texto longo', descricao: 'x'.repeat(5000) });
  assert.equal(d.descricao.length, 4000, 'o mesmo limite verificado em submit_demand()');
});

// --------------------------------------------------------------------
// Guardas da superfície pública. A página de demandas é o único ponto do
// sistema sem login; estes testes existem para que uma mudança futura não
// amplie esse acesso sem querer.
// --------------------------------------------------------------------
import { readFileSync } from 'node:fs';

const publicJs = readFileSync('js/public-demand.js', 'utf8');
const schema = readFileSync('supabase/schema.sql', 'utf8');

test('a página pública não importa o store nem o banco — ela não lê dados', () => {
  assert.ok(!/from '\.\/store\.js'/.test(publicJs), 'importar o store daria acesso de leitura');
  assert.ok(!/from '\.\/database\.js'/.test(publicJs));
  assert.ok(!/from '\.\/app\.js'/.test(publicJs));
  assert.ok(!/\.from\(/.test(publicJs), 'não pode consultar tabela nenhuma, só a RPC');
  assert.ok(publicJs.includes("rpc('submit_demand'"), 'o único acesso é a função controlada');
});

test('o papel anon recebe apenas a execução da função, nenhuma permissão de tabela', () => {
  const grantsAnon = [...schema.matchAll(/grant[^;]*to[^;]*anon[^;]*;/gi)].map((m) => m[0]);
  assert.ok(grantsAnon.length > 0, 'esperado ao menos o grant da função');
  for (const g of grantsAnon) {
    assert.match(g, /grant\s+execute\s+on\s+function/i, `grant amplo demais para anon: ${g}`);
  }
  // As políticas de RLS são criadas em laço para os papéis autenticados; se
  // alguma citar anon, é porque alguém abriu a tabela sem querer.
  const politicasAnon = [...schema.matchAll(/create policy[^;]*anon[^;]*;/gi)];
  assert.equal(politicasAnon.length, 0, 'nenhuma política de RLS deve mencionar anon');
});

test('a função pública é SECURITY DEFINER e tem o honeypot e o controle de vazão', () => {
  const fn = schema.slice(schema.indexOf('create or replace function public.submit_demand'));
  assert.match(fn, /security definer/i, 'sem isso, anon precisaria de permissão na tabela');
  assert.match(fn, /set search_path = public/i, 'search_path fixo evita sequestro de função');
  assert.match(fn, /p_trap/, 'honeypot');
  assert.match(fn, /interval '1 minute'/, 'controle de vazão por minuto');
  assert.match(fn, /interval '1 hour'/, 'controle de vazão por hora');
});

test('os limites de tamanho do SQL batem com os do JS', () => {
  const fn = schema.slice(schema.indexOf('create or replace function public.submit_demand'));
  assert.match(fn, /length\(p_titulo\) > 200/, 'título: mesmo limite de makeDemand');
  assert.match(fn, /length\(p_descricao\) > 4000/, 'descrição: mesmo limite de makeDemand');
  const d = { titulo: 'x'.repeat(250), descricao: 'y'.repeat(4500) };
  assert.equal(validateDemand(d).valid, true, 'o JS trunca; quem barra o excesso é o SQL');
});

test('a tabela de demandas existe no schema, com RLS e Realtime como as demais', () => {
  assert.match(schema, /create table if not exists public\.demands/);
  assert.ok(/array\[[^\]]*'demands'[^\]]*\][\s\S]*enable row level security/.test(schema)
    || schema.includes("'demands'"), 'demands precisa entrar nos laços de RLS e Realtime');
  const laços = [...schema.matchAll(/select unnest\(array\[([^\]]+)\]\)/g)].map((m) => m[1]);
  assert.ok(laços.length >= 2);
  for (const l of laços) assert.ok(l.includes("'demands'"), `demands fora de um dos laços: ${l}`);
});
