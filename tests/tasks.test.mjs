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

test('arquivar uma tarefa a remove das listagens e das agregações; desarquivar a traz de volta', async () => {
  const task = await store.createTask({ titulo: 'Tarefa a arquivar', prazo: '2020-02-02' });
  assert.equal(task.arquivada, false);
  assert.ok((await store.listTasks()).some((t) => t.id === task.id));
  assert.ok((await store.getOverdueItems()).some((i) => i.id === task.id));

  const archived = await store.archiveTask(task.id);
  assert.equal(archived.arquivada, true);
  assert.ok(!(await store.listTasks()).some((t) => t.id === task.id), 'arquivada não aparece na listagem padrão');
  assert.ok(!(await store.getOverdueItems()).some((i) => i.id === task.id), 'arquivada não conta como atrasada');
  assert.ok(!(await store.globalSearch('Tarefa a arquivar')).some((r) => r.id === task.id), 'arquivada some da busca global');

  // ...mas continua no banco, acessível pelos filtros explícitos
  assert.ok((await store.listTasks({ somenteArquivadas: true })).some((t) => t.id === task.id));
  assert.ok((await store.listTasks({ includeArchived: true })).some((t) => t.id === task.id));
  assert.ok(await store.getTask(task.id), 'arquivar nunca apaga o registro');

  const restored = await store.unarchiveTask(task.id);
  assert.equal(restored.arquivada, false);
  assert.ok((await store.listTasks()).some((t) => t.id === task.id));
  assert.ok(!(await store.listTasks({ somenteArquivadas: true })).some((t) => t.id === task.id));
});

test('editar uma tarefa arquivada preserva o arquivamento', async () => {
  const task = await store.createTask({ titulo: 'Arquivada e editada' });
  await store.archiveTask(task.id);
  const updated = await store.updateTask(task.id, { titulo: 'Arquivada e editada (revisão)' });
  assert.equal(updated.arquivada, true);
});

test('aceita o status urgente em tarefas e o prioriza no foco do dia', async () => {
  const task = await store.createTask({ titulo: 'Incêndio para apagar', status: 'urgente', prioridade: 'baixa' });
  assert.equal(task.status, 'urgente');

  // Comparável: mesma ausência de prazo, só mudam status e prioridade.
  const altaPrioridade = await store.createTask({ titulo: 'Importante, mas não urgente', status: 'a_fazer', prioridade: 'alta' });
  const focus = await store.getFocusOfDay(100);
  const urgente = focus.find((i) => i.id === task.id);
  const alta = focus.find((i) => i.id === altaPrioridade.id);
  assert.ok(urgente, 'tarefa urgente deve entrar no foco do dia mesmo sem prazo');
  assert.ok(alta);
  assert.ok(urgente._score > alta._score, 'urgente pontua acima de prioridade alta');

  const stats = await store.getDashboardStats();
  assert.ok(stats.urgentes >= 1);

  await assert.rejects(() => store.createTask({ titulo: 'Status inexistente', status: 'urgentissimo' }), { name: 'ValidationError' });
});

test('aceita a prioridade urgente, ordena acima de alta e conta no dashboard', async () => {
  const { PRIORIDADE_ORDEM } = await import('../js/utils.js');
  assert.ok(PRIORIDADE_ORDEM.urgente < PRIORIDADE_ORDEM.alta, 'urgente vem antes de alta na ordenação');

  const task = await store.createTask({ titulo: 'Prioridade máxima', prioridade: 'urgente', status: 'a_fazer' });
  assert.equal(task.prioridade, 'urgente');
  assert.ok((await store.listTasks({ prioridade: 'urgente' })).some((t) => t.id === task.id));

  const stats = await store.getDashboardStats();
  assert.ok(stats.urgentes >= 1, 'prioridade urgente entra no contador de urgentes');
  assert.ok(stats.distribuicaoPrioridade.urgente >= 1);

  await assert.rejects(() => store.createTask({ titulo: 'Prioridade inválida', prioridade: 'altissima' }), { name: 'ValidationError' });
});

test('isUrgente cobre os dois eixos: status urgente e prioridade urgente', async () => {
  assert.equal(store.isUrgente({ status: 'urgente', prioridade: 'baixa' }), true);
  assert.equal(store.isUrgente({ status: 'a_fazer', prioridade: 'urgente' }), true);
  assert.equal(store.isUrgente({ status: 'a_fazer', prioridade: 'alta' }), false);
});

test('exclusão lógica remove a tarefa de todas as listagens, inclusive da de arquivadas', async () => {
  const task = await store.createTask({ titulo: 'Criada por engano' });
  assert.ok((await store.listTasks()).some((t) => t.id === task.id));

  const deleted = await store.deleteTask(task.id);
  assert.equal(deleted.deletedFlag, true);
  assert.ok(!(await store.listTasks()).some((t) => t.id === task.id));
  assert.ok(!(await store.listTasks({ includeArchived: true })).some((t) => t.id === task.id));
  assert.ok(!(await store.listTasks({ somenteArquivadas: true })).some((t) => t.id === task.id), 'excluir não é arquivar');
  assert.ok(!(await store.globalSearch('Criada por engano')).some((r) => r.id === task.id));
});
