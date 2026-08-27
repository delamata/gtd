// ==========================================================================
// Testes: agenda — conflitos de horário, janelas livres e conclusão
// automática registrando histórico.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';

installFakeIndexedDB();
const store = await import('../js/store.js');
await store.init();

test('detecta conflito entre compromissos com horários sobrepostos', async () => {
  const a = await store.createAgendaItem({ data: '2026-09-10', horaInicio: '09:00', horaFim: '10:00', compromisso: 'Reunião A' });
  const b = await store.createAgendaItem({ data: '2026-09-10', horaInicio: '09:30', horaFim: '10:30', compromisso: 'Reunião B' });
  const c = await store.createAgendaItem({ data: '2026-09-10', horaInicio: '11:00', horaFim: '11:30', compromisso: 'Reunião C (sem conflito)' });

  const dayItems = (await store.listAgenda({})).filter((i) => i.data === '2026-09-10');
  const annotated = store.annotateConflicts(dayItems);
  assert.equal(annotated.find((i) => i.id === a.id)._conflict, true);
  assert.equal(annotated.find((i) => i.id === b.id)._conflict, true);
  assert.equal(annotated.find((i) => i.id === c.id)._conflict, false);
});

test('calcula janelas livres entre compromissos do dia', async () => {
  const dayItems = (await store.listAgenda({})).filter((i) => i.data === '2026-09-10');
  const windows = store.freeWindows(dayItems, { start: '08:00', end: '19:00' });
  assert.ok(windows.some((w) => w.inicio === '08:00' && w.fim === '09:00'));
});

test('conclui um compromisso e registra automaticamente no histórico', async () => {
  const item = await store.createAgendaItem({ data: '2026-09-11', horaInicio: '14:00', horaFim: '15:00', compromisso: 'Alinhamento' });
  const { item: done, historyEntry } = await store.completeAgendaItem(item.id, 'Reunião produtiva.');
  assert.equal(done.status, 'concluido');
  assert.equal(historyEntry.tipoOrigem, 'agenda');
  assert.equal(historyEntry.idOrigem, item.id);
});

test('transforma a preparação de um compromisso em uma nova tarefa', async () => {
  const item = await store.createAgendaItem({ data: '2026-09-12', compromisso: 'Reunião com Primelis', preparacao: 'Levantar pendências do contrato' });
  const task = await store.convertPrepToTask(item.id);
  assert.equal(task.titulo, 'Levantar pendências do contrato');
  assert.equal(task.status, 'a_fazer');
});
