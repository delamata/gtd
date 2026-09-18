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

test('arquivar um FUP o remove das listagens e do painel por colaborador; desarquivar o traz de volta', async () => {
  const colaborador = await store.createCollaborator({ nome: 'Colaborador do arquivo' });
  const fup = await store.createFup({ colaboradorId: colaborador.id, assunto: 'Entrega a arquivar', proximoFupEm: '2020-03-03' });
  assert.equal(fup.arquivada, false);
  assert.ok((await store.listFups()).some((f) => f.id === fup.id));
  assert.equal((await store.collaboratorStats(colaborador.id)).totalAberto, 1);

  const archived = await store.archiveFup(fup.id);
  assert.equal(archived.arquivada, true);
  assert.ok(!(await store.listFups()).some((f) => f.id === fup.id), 'arquivado não aparece na listagem padrão');
  assert.ok(!(await store.getOverdueItems()).some((i) => i.id === fup.id), 'arquivado não conta como atrasado');
  assert.equal((await store.collaboratorStats(colaborador.id)).totalAberto, 0);
  assert.ok(archived.historico.some((h) => h.tipo === 'arquivamento'), 'o arquivamento entra no histórico do FUP');

  assert.ok((await store.listFups({ somenteArquivadas: true })).some((f) => f.id === fup.id));
  assert.ok(await store.getFup(fup.id), 'arquivar nunca apaga o registro');

  const restored = await store.unarchiveFup(fup.id);
  assert.equal(restored.arquivada, false);
  assert.ok((await store.listFups()).some((f) => f.id === fup.id));
  assert.equal((await store.collaboratorStats(colaborador.id)).totalAberto, 1);
});

test('editar um FUP arquivado preserva o arquivamento', async () => {
  const colaborador = await store.createCollaborator({ nome: 'Colaborador do arquivo 2' });
  const fup = await store.createFup({ colaboradorId: colaborador.id, assunto: 'FUP arquivado e editado' });
  await store.archiveFup(fup.id);
  const updated = await store.updateFup(fup.id, { assunto: 'FUP arquivado e editado (revisão)' });
  assert.equal(updated.arquivada, true);
});

test('aceita o status urgente em FUPs e recusa status inválido', async () => {
  const colaborador = await store.createCollaborator({ nome: 'Colaborador urgente' });
  const fup = await store.createFup({ colaboradorId: colaborador.id, assunto: 'Resposta urgente', status: 'urgente' });
  assert.equal(fup.status, 'urgente');
  assert.ok((await store.listFups({ status: 'urgente' })).some((f) => f.id === fup.id));

  await assert.rejects(
    () => store.createFup({ colaboradorId: colaborador.id, assunto: 'Inválido', status: 'urgentissimo' }),
    { name: 'ValidationError' }
  );
});

test('aceita a prioridade urgente em FUPs', async () => {
  const colaborador = await store.createCollaborator({ nome: 'Colaborador prioridade' });
  const fup = await store.createFup({ colaboradorId: colaborador.id, assunto: 'Entrega prioritária', prioridade: 'urgente' });
  assert.equal(fup.prioridade, 'urgente');
  assert.ok((await store.listFups({ prioridade: 'urgente' })).some((f) => f.id === fup.id));

  await assert.rejects(
    () => store.createFup({ colaboradorId: colaborador.id, assunto: 'Inválida', prioridade: 'altissima' }),
    { name: 'ValidationError' }
  );
});
