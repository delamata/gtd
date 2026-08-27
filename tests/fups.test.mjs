// ==========================================================================
// Testes: cadastro de colaborador, criação/edição de FUP, cobranças,
// conclusão/reabertura/cancelamento e filtro por colaborador.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';

installFakeIndexedDB();
const store = await import('../js/store.js');
await store.init();

let collaboratorId;

test('cadastra um novo colaborador e ele aparece imediatamente na listagem', async () => {
  const collaborator = await store.createCollaborator({ nome: 'Colaborador Teste', time: 'QA', cargo: 'Analista' });
  collaboratorId = collaborator.id;
  const list = await store.listCollaborators();
  assert.ok(list.some((c) => c.id === collaboratorId && c.nome === 'Colaborador Teste'));
});

test('cria e edita um FUP vinculado ao colaborador recém-cadastrado', async () => {
  const fup = await store.createFup({ colaboradorId: collaboratorId, assunto: 'Follow-up de teste', prioridade: 'alta' });
  assert.equal(fup.colaboradorId, collaboratorId);
  assert.equal(fup.status, 'a_fazer');

  const updated = await store.updateFup(fup.id, { assunto: 'Follow-up atualizado', status: 'em_andamento' });
  assert.equal(updated.id, fup.id);
  assert.equal(updated.assunto, 'Follow-up atualizado');
  assert.equal(updated.status, 'em_andamento');
});

test('"Cobrei hoje" incrementa o contador de cobranças e grava no histórico do FUP', async () => {
  const fup = await store.createFup({ colaboradorId: collaboratorId, assunto: 'FUP para cobrar' });
  const updated = await store.registerCobranca(fup.id, { resposta: 'Aguardando retorno até sexta.' });
  assert.equal(updated.qtdCobrancas, 1);
  assert.ok(updated.ultimoContatoEm);
  assert.equal(updated.historico.length, 1);
  assert.equal(updated.historico[0].tipo, 'cobranca');

  const updated2 = await store.registerCobranca(fup.id, {});
  assert.equal(updated2.qtdCobrancas, 2);
});

test('altera rapidamente a próxima data de FUP', async () => {
  const fup = await store.createFup({ colaboradorId: collaboratorId, assunto: 'FUP com nova data', proximoFupEm: '2026-09-01' });
  const updated = await store.setNextFupDate(fup.id, '2026-09-15');
  assert.equal(updated.proximoFupEm, '2026-09-15');
  assert.ok(updated.historico.some((h) => h.tipo === 'reagendamento'));
});

test('conclui um FUP sem apagar o histórico, permite reabrir e depois cancelar', async () => {
  const fup = await store.createFup({ colaboradorId: collaboratorId, assunto: 'FUP ciclo completo' });
  const { fup: done, historyEntry } = await store.completeFup(fup.id, { resultado: 'Resolvido.' });
  assert.equal(done.status, 'concluido');
  assert.equal(historyEntry.tipoOrigem, 'fup');

  const reopened = await store.reopenFup(fup.id);
  assert.equal(reopened.status, 'em_andamento');
  assert.ok(reopened.historico.some((h) => h.tipo === 'reabertura'));

  const history = await store.listHistory({});
  assert.ok(history.some((h) => h.id === historyEntry.id), 'a conclusão original permanece no histórico');

  const cancelled = await store.cancelFup(fup.id, 'Não se aplica mais');
  assert.equal(cancelled.status, 'cancelado');
});

test('filtra todos os FUPs de um colaborador específico', async () => {
  const other = await store.createCollaborator({ nome: 'Outro Colaborador' });
  await store.createFup({ colaboradorId: other.id, assunto: 'FUP de outro colaborador' });

  const mine = await store.getFupsByCollaborator(collaboratorId);
  assert.ok(mine.length >= 3);
  assert.ok(mine.every((f) => f.colaboradorId === collaboratorId));
  assert.ok(!mine.some((f) => f.colaboradorId === other.id));
});

test('identifica FUP atrasado por próximo FUP ou por prazo final', async () => {
  const overdueFup = await store.createFup({ colaboradorId: collaboratorId, assunto: 'FUP vencido', proximoFupEm: '2020-01-01' });
  const overdue = await store.getOverdueItems();
  assert.ok(overdue.some((i) => i.id === overdueFup.id));
});

test('inativar colaborador não apaga o cadastro (exclusão lógica)', async () => {
  const c = await store.createCollaborator({ nome: 'Para inativar' });
  await store.setCollaboratorActive(c.id, false);
  const stillThere = await store.getCollaborator(c.id);
  assert.ok(stillThere);
  assert.equal(stillThere.ativo, false);
  const activeOnly = await store.listCollaborators({ includeInactive: false });
  assert.ok(!activeOnly.some((x) => x.id === c.id));
});
