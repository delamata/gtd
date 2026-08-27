// ==========================================================================
// Testes: geração sequencial de IDs, prefixos por entidade e migração de
// versão do esquema local (banco em memória, isolado por processo).
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';

installFakeIndexedDB();
const store = await import('../js/store.js');
const db = await import('../js/database.js');

test('inicializa o banco e semeia os dados de exemplo na primeira execução', async () => {
  await store.init();
  const tasks = await store.listTasks();
  const fups = await store.listFups();
  const collaborators = await store.listCollaborators();
  assert.ok(tasks.length >= 5, 'deveria semear as tarefas iniciais');
  assert.ok(fups.length >= 13, 'deveria semear os FUPs iniciais');
  assert.ok(collaborators.some((c) => c.nome === 'André'));
  assert.ok(collaborators.some((c) => c.nome === 'A definir'));
});

test('gera IDs sequenciais e nunca reaproveitados, mesmo após conclusão', async () => {
  const t1 = await store.createTask({ titulo: 'Tarefa de teste 1' });
  const t2 = await store.createTask({ titulo: 'Tarefa de teste 2' });
  assert.equal(Number(t2.id.slice(1)), Number(t1.id.slice(1)) + 1);
  await store.completeTask(t1.id, { createNext: false });
  const t3 = await store.createTask({ titulo: 'Tarefa de teste 3' });
  assert.equal(Number(t3.id.slice(1)), Number(t2.id.slice(1)) + 1, 'o ID concluído não deve ser reaproveitado');
});

test('IDs de cada entidade usam o prefixo correto (T, F, A, P)', async () => {
  const collaborators = await store.listCollaborators();
  const task = await store.createTask({ titulo: 'Prefixo T' });
  const fup = await store.createFup({ assunto: 'Prefixo F', colaboradorId: collaborators[0].id });
  const agenda = await store.createAgendaItem({ compromisso: 'Prefixo A', data: '2026-09-01' });
  const collaborator = await store.createCollaborator({ nome: 'Prefixo P' });
  assert.match(task.id, /^T\d{3,}$/);
  assert.match(fup.id, /^F\d{3,}$/);
  assert.match(agenda.id, /^A\d{3,}$/);
  assert.match(collaborator.id, /^P\d{3,}$/);
});

test('IDs permanecem estáveis após edição do registro', async () => {
  const task = await store.createTask({ titulo: 'Estabilidade de ID' });
  const updated = await store.updateTask(task.id, { titulo: 'Título alterado' });
  assert.equal(updated.id, task.id);
});

test('migração de esquema local converge para a versão atual e é idempotente', async () => {
  await db.runDataMigrations();
  const first = await db.getMeta();
  assert.equal(first.schemaVersion, db.SCHEMA_VERSION);
  await db.runDataMigrations();
  const second = await db.getMeta();
  assert.equal(second.schemaVersion, db.SCHEMA_VERSION);
});
