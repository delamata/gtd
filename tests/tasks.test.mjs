// ==========================================================================
// Testes: criação/edição de tarefas, conclusão, recorrência, cancelamento,
// reabertura e identificação de atraso.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';

installFakeIndexedDB();
const store = await import('../js/store.js');
await store.init();

test('cria e edita uma tarefa', async () => {
  const task = await store.createTask({ titulo: 'Escrever relatório', area: 'Growth', prioridade: 'alta', prazo: '2026-09-01' });
  assert.equal(task.status, 'a_fazer');
  assert.equal(task.prioridade, 'alta');

  const updated = await store.updateTask(task.id, { titulo: 'Escrever relatório executivo', status: 'em_andamento' });
  assert.equal(updated.id, task.id);
  assert.equal(updated.titulo, 'Escrever relatório executivo');
  assert.equal(updated.status, 'em_andamento');
});

test('conclui tarefa não recorrente: gera histórico permanente e não cria próxima ocorrência', async () => {
  const task = await store.createTask({ titulo: 'Tarefa simples', recorrencia: 'nenhuma' });
  const { task: done, historyEntry, nextTask } = await store.completeTask(task.id, { resultado: 'Concluído com sucesso.' });
  assert.equal(done.status, 'concluido');
  assert.ok(done.concluidoEm);
  assert.equal(nextTask, null);
  assert.equal(historyEntry.tipoOrigem, 'task');
  assert.equal(historyEntry.idOrigem, task.id);

  const history = await store.listHistory({});
  assert.ok(history.some((h) => h.id === historyEntry.id));
});

test('conclui tarefa recorrente semanal: cria a próxima ocorrência vinculada por origemId', async () => {
  const task = await store.createTask({ titulo: 'Reunião semanal', recorrencia: 'semanal', prazo: '2026-09-01' });
  const { task: done, nextTask, historyEntry } = await store.completeTask(task.id, { createNext: true });
  assert.equal(done.status, 'concluido');
  assert.ok(nextTask, 'deveria criar a próxima ocorrência por padrão');
  assert.equal(nextTask.origemId, task.id);
  assert.equal(nextTask.status, 'a_fazer');
  assert.equal(nextTask.prazo, '2026-09-08');

  const history = await store.listHistory({});
  assert.ok(history.some((h) => h.id === historyEntry.id), 'a conclusão anterior nunca é apagada');
});

test('conclui tarefa recorrente mensal calculando o próximo mês corretamente', async () => {
  const task = await store.createTask({ titulo: 'Fechamento mensal', recorrencia: 'mensal', prazo: '2026-01-31' });
  const { nextTask } = await store.completeTask(task.id, { createNext: true });
  assert.equal(nextTask.prazo, '2026-03-03'); // addMonthsISO normaliza dia 31 em fevereiro (28 dias)
});

test('createNext=false não gera a próxima ocorrência mesmo em tarefa recorrente', async () => {
  const task = await store.createTask({ titulo: 'Recorrente sem próxima', recorrencia: 'diaria', prazo: '2026-09-01' });
  const { nextTask } = await store.completeTask(task.id, { createNext: false });
  assert.equal(nextTask, null);
});

test('cancela uma tarefa — cancelamento não conta como conclusão', async () => {
  const task = await store.createTask({ titulo: 'Tarefa a cancelar' });
  const historyBefore = (await store.listHistory({})).length;
  const cancelled = await store.cancelTask(task.id, 'Não é mais necessária');
  assert.equal(cancelled.status, 'cancelado');
  const historyAfter = (await store.listHistory({})).length;
  assert.equal(historyAfter, historyBefore, 'cancelamento não deve gerar entrada de histórico');
});

test('reabre uma tarefa concluída e marca a entrada de histórico como reaberta', async () => {
  const task = await store.createTask({ titulo: 'Tarefa a reabrir' });
  const { historyEntry } = await store.completeTask(task.id, { createNext: false });
  const reopened = await store.reopenTask(task.id);
  assert.equal(reopened.status, 'a_fazer');
  assert.equal(reopened.concluidoEm, '');

  const history = await store.listHistory({});
  const entry = history.find((h) => h.id === historyEntry.id);
  assert.equal(entry.reaberto, true);
  assert.ok(entry.id, 'a entrada de histórico continua existindo — nunca é apagada');
});

test('identifica tarefas atrasadas (prazo no passado e status aberto)', async () => {
  const task = await store.createTask({ titulo: 'Tarefa vencida', prazo: '2020-01-01' });
  const overdue = await store.getOverdueItems();
  assert.ok(overdue.some((i) => i.id === task.id));

  await store.completeTask(task.id, { createNext: false });
  const overdueAfter = await store.getOverdueItems();
  assert.ok(!overdueAfter.some((i) => i.id === task.id), 'tarefa concluída não deve mais aparecer como atrasada');
});
