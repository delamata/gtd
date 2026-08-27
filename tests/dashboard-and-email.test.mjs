// ==========================================================================
// Testes: seletores do dashboard/Foco do dia e geração do e-mail executivo.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';

installFakeIndexedDB();
const store = await import('../js/store.js');
const { generateExecutiveEmail } = await import('../js/email-generator.js');
await store.init();

test('Foco do dia nunca inclui itens concluídos ou cancelados', async () => {
  const t1 = await store.createTask({ titulo: 'Alta prioridade aberta', prioridade: 'alta' });
  const t2 = await store.createTask({ titulo: 'Alta prioridade concluída', prioridade: 'alta' });
  const t3 = await store.createTask({ titulo: 'Alta prioridade cancelada', prioridade: 'alta' });
  await store.completeTask(t2.id, { createNext: false });
  await store.cancelTask(t3.id);

  const focus = await store.getFocusOfDay(20);
  assert.ok(focus.some((f) => f.id === t1.id));
  assert.ok(!focus.some((f) => f.id === t2.id));
  assert.ok(!focus.some((f) => f.id === t3.id));
});

test('getDashboardStats retorna contagens coerentes e a série de 7 dias', async () => {
  const stats = await store.getDashboardStats();
  assert.ok(stats.tarefasAbertas >= 1);
  assert.equal(typeof stats.atrasados, 'number');
  assert.ok(Array.isArray(stats.conclusoesUltimos7Dias));
  assert.equal(stats.conclusoesUltimos7Dias.length, 7);
});

test('o dashboard é notificado imediatamente após qualquer alteração (pub/sub)', async () => {
  let notified = false;
  const unsubscribe = store.subscribe(() => { notified = true; });
  const t = await store.createTask({ titulo: 'Tarefa para notificação' });
  await store.completeTask(t.id, { createNext: false });
  unsubscribe();
  assert.equal(notified, true);
});

test('gera o e-mail executivo com o assunto padrão e as seções esperadas', async () => {
  const email = await generateExecutiveEmail({ periodo: 'hoje', incluirConcluidos: true });
  assert.match(email.subject, /^Status executivo — Atividades, riscos e próximos passos —/);
  assert.ok(email.bodyText.startsWith('Olá,'));
  assert.ok(email.bodyText.includes('Resumo executivo'));
  assert.ok(email.bodyText.includes('Atenciosamente'));
  assert.ok(email.bodyHtml.includes('<h3'));
  assert.equal(typeof email.stats.concluidas, 'number');
});

test('o filtro "somente alta prioridade" remove itens de menor prioridade do e-mail', async () => {
  await store.createTask({ titulo: 'Tarefa de prioridade baixa em andamento XYZ', prioridade: 'baixa', status: 'em_andamento' });
  await store.createTask({ titulo: 'Tarefa de prioridade alta em andamento XYZ', prioridade: 'alta', status: 'em_andamento' });

  const email = await generateExecutiveEmail({ periodo: 'hoje', somenteAltaPrioridade: true });
  assert.ok(!email.bodyText.includes('Tarefa de prioridade baixa em andamento XYZ'));
  assert.ok(email.bodyText.includes('Tarefa de prioridade alta em andamento XYZ'));
});

test('o e-mail respeita o filtro de área/projeto', async () => {
  await store.createTask({ titulo: 'Tarefa área única de teste', area: 'Área-Exclusiva-Teste', status: 'em_andamento' });
  const email = await generateExecutiveEmail({ periodo: 'hoje', area: 'Área-Exclusiva-Teste' });
  assert.ok(email.bodyText.includes('Tarefa área única de teste'));
});
