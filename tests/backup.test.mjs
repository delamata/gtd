// ==========================================================================
// Testes: exportação/importação de backup e restauração dos dados de exemplo.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';

installFakeIndexedDB();
const store = await import('../js/store.js');
await store.init();

test('valida a estrutura de um backup antes de importar', async () => {
  const invalid = store.validateBackupShape({ foo: 'bar' });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length > 0);

  const data = await store.exportAll();
  const valid = store.validateBackupShape(data);
  assert.equal(valid.valid, true);
  assert.equal(valid.summary.tarefas, data.tarefas.length);
  assert.equal(valid.summary.fups, data.fups.length);
});

test('a estrutura do backup contém todas as seções exigidas', async () => {
  const data = await store.exportAll();
  for (const field of ['versaoEsquema', 'exportadoEm', 'configuracoes', 'colaboradores', 'tarefas', 'fups', 'agenda', 'historico', 'logs']) {
    assert.ok(field in data, `campo "${field}" ausente no backup`);
  }
});

test('exportação e importação de backup restauram todos os dados (JSON round-trip)', async () => {
  const beforeTasks = await store.listTasks();
  const beforeFups = await store.listFups();
  const beforeCollaborators = await store.listCollaborators();
  const snapshot = await store.exportAll();

  await store.wipeAll();
  assert.equal((await store.listTasks()).length, 0);
  assert.equal((await store.listCollaborators()).length, 0);

  const summary = await store.importBackup(snapshot, { mode: 'replace', autoBackup: false });
  assert.equal(summary.tarefas, beforeTasks.length);
  assert.equal(summary.fups, beforeFups.length);
  assert.equal(summary.colaboradores, beforeCollaborators.length);

  const afterTasks = await store.listTasks();
  assert.equal(afterTasks.length, beforeTasks.length);
  assert.deepEqual(afterTasks.map((t) => t.id).sort(), beforeTasks.map((t) => t.id).sort());
});

test('após importar um backup, novos IDs continuam a sequência sem reaproveitar', async () => {
  const tasks = await store.listTasks();
  const maxNumber = Math.max(0, ...tasks.map((t) => Number(t.id.slice(1))));
  const created = await store.createTask({ titulo: 'Pós-importação' });
  assert.ok(Number(created.id.slice(1)) > maxNumber);
});

test('rejeita importar um arquivo de backup inválido', async () => {
  await assert.rejects(() => store.importBackup({ nada: true }, { autoBackup: false }));
});

test('restaurar dados de exemplo recoloca a carga inicial e descarta alterações locais', async () => {
  await store.createTask({ titulo: 'Não deveria sobreviver ao reset de exemplo' });
  await store.resetToSeed();
  const tasks = await store.listTasks();
  assert.ok(tasks.some((t) => t.titulo.includes('SendGrid')));
  assert.ok(!tasks.some((t) => t.titulo === 'Não deveria sobreviver ao reset de exemplo'));
});
