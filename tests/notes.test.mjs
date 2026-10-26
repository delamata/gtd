// ==========================================================================
// Testes: Anotações — captura, processamento e conversão em tarefa.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB } from './fake-indexeddb.mjs';

installFakeIndexedDB();
const store = await import('../js/store.js');
await store.init();

test('captura exige só o texto e deriva o título da primeira linha', async () => {
  const note = await store.createNote({ texto: '  Revisar contrato do fornecedor\nPedir proposta revisada  ' });
  assert.equal(note.titulo, 'Revisar contrato do fornecedor', 'sem título digitado, usa a primeira linha não vazia');
  assert.equal(note.data, new Date().toISOString().slice(0, 10), 'assume hoje');
  assert.equal(note.processadoEm, '', 'nasce na caixa de entrada');
  assert.deepEqual(note.tarefasIds, []);
  await assert.rejects(() => store.createNote({ texto: '   ' }), { name: 'ValidationError' });
});

test('título digitado prevalece sobre a primeira linha', async () => {
  const note = await store.createNote({ titulo: 'Comitê semanal', texto: 'ponto um\nponto dois' });
  assert.equal(note.titulo, 'Comitê semanal');
});

test('a anotação preserva as quebras de linha — é delas que saem as tarefas', async () => {
  const note = await store.createNote({ texto: 'linha um\nlinha dois\nlinha três' });
  assert.equal(note.texto.split('\n').length, 3);
});

test('criar tarefa a partir da anotação guarda o vínculo e marca como processada', async () => {
  const note = await store.createNote({ texto: 'Fechar orçamento', area: 'Growth' });
  const task = await store.createTask({ titulo: 'Fechar orçamento', area: 'Growth' });
  const vinculada = await store.linkNoteToTask(note.id, task.id);

  assert.deepEqual(vinculada.tarefasIds, [task.id]);
  assert.ok(vinculada.processadoEm, 'a primeira tarefa gerada tira a anotação da caixa de entrada');

  const tarefas = await store.getNoteTasks(note.id);
  assert.equal(tarefas.length, 1);
  assert.equal(tarefas[0].id, task.id);
});

test('uma anotação pode gerar várias tarefas, sem duplicar vínculo', async () => {
  const note = await store.createNote({ texto: 'a\nb' });
  const t1 = await store.createTask({ titulo: 'tarefa a' });
  const t2 = await store.createTask({ titulo: 'tarefa b' });
  await store.linkNoteToTask(note.id, t1.id);
  const depois = await store.linkNoteToTask(note.id, t2.id);
  assert.deepEqual(depois.tarefasIds, [t1.id, t2.id]);

  const primeiroProcessado = depois.processadoEm;
  const reVinculo = await store.linkNoteToTask(note.id, t1.id);
  assert.deepEqual(reVinculo.tarefasIds, [t1.id, t2.id], 'vincular de novo não duplica');
  assert.equal(reVinculo.processadoEm, primeiroProcessado, 'nem remarca a data de processamento');
});

test('vincular a uma tarefa inexistente é recusado', async () => {
  const note = await store.createNote({ texto: 'qualquer' });
  await assert.rejects(() => store.linkNoteToTask(note.id, 'T999'), /Tarefa não encontrada/);
});

test('uma tarefa excluída some da lista de tarefas geradas, mas a anotação fica', async () => {
  const note = await store.createNote({ texto: 'com tarefa que será excluída' });
  const task = await store.createTask({ titulo: 'some depois' });
  await store.linkNoteToTask(note.id, task.id);
  await store.deleteTask(task.id);
  assert.deepEqual(await store.getNoteTasks(note.id), []);
  assert.ok(await store.getNote(note.id), 'a anotação não é apagada junto');
});

test('marcar como processada sem gerar tarefa, e voltar atrás', async () => {
  const note = await store.createNote({ texto: 'só registro, não gera ação' });
  const processada = await store.markNoteProcessed(note.id, true);
  assert.ok(processada.processadoEm);
  assert.ok(!(await store.listNotes({ pendentes: true })).some((n) => n.id === note.id));

  const devolvida = await store.markNoteProcessed(note.id, false);
  assert.equal(devolvida.processadoEm, '');
  assert.ok((await store.listNotes({ pendentes: true })).some((n) => n.id === note.id));
});

test('filtro de pendentes separa a caixa de entrada do que já foi processado', async () => {
  const pendente = await store.createNote({ texto: 'ainda a processar' });
  const feita = await store.createNote({ texto: 'já processada' });
  await store.markNoteProcessed(feita.id, true);

  const pendentes = await store.listNotes({ pendentes: true });
  const processadas = await store.listNotes({ pendentes: false });
  assert.ok(pendentes.some((n) => n.id === pendente.id));
  assert.ok(!pendentes.some((n) => n.id === feita.id));
  assert.ok(processadas.some((n) => n.id === feita.id));
});

test('arquivar tira a anotação da listagem; desarquivar devolve', async () => {
  const note = await store.createNote({ texto: 'anotação a arquivar' });
  await store.archiveNote(note.id);
  assert.ok(!(await store.listNotes()).some((n) => n.id === note.id));
  assert.ok((await store.listNotes({ somenteArquivadas: true })).some((n) => n.id === note.id));
  await store.unarchiveNote(note.id);
  assert.ok((await store.listNotes()).some((n) => n.id === note.id));
});

test('exclusão lógica remove de todas as listagens, inclusive das arquivadas', async () => {
  const note = await store.createNote({ texto: 'capturada por engano' });
  await store.deleteNote(note.id);
  assert.ok(!(await store.listNotes()).some((n) => n.id === note.id));
  assert.ok(!(await store.listNotes({ includeArchived: true })).some((n) => n.id === note.id));
  assert.ok(!(await store.listNotes({ somenteArquivadas: true })).some((n) => n.id === note.id));
});

test('editar não apaga o vínculo nem o processamento já registrados', async () => {
  const note = await store.createNote({ texto: 'original' });
  const task = await store.createTask({ titulo: 'da anotação' });
  await store.linkNoteToTask(note.id, task.id);
  const editada = await store.updateNote(note.id, { texto: 'texto corrigido' });
  assert.equal(editada.texto, 'texto corrigido');
  assert.deepEqual(editada.tarefasIds, [task.id], 'o vínculo sobrevive à edição');
  assert.ok(editada.processadoEm);
});

test('a busca global encontra anotações pelo texto', async () => {
  await store.createNote({ texto: 'combinamos o reajuste do contrato guarda-chuva' });
  const achados = await store.globalSearch('guarda-chuva');
  assert.ok(achados.some((r) => r.type === 'note'), 'anotação deve aparecer na busca global');
  assert.ok(achados.find((r) => r.type === 'note').route === '#/anotacoes');
});

test('o dashboard conta quantas anotações faltam processar', async () => {
  const antes = (await store.getDashboardStats()).anotacoesPendentes;
  await store.createNote({ texto: 'mais uma para a fila' });
  const depois = (await store.getDashboardStats()).anotacoesPendentes;
  assert.equal(depois, antes + 1);
});

test('anotações entram no backup e voltam na importação', async () => {
  const note = await store.createNote({ texto: 'precisa sobreviver ao backup', participantes: 'João, Maria' });
  const dump = await store.exportAll();
  assert.ok(Array.isArray(dump.anotacoes), 'o backup precisa ter a lista de anotações');
  assert.ok(dump.anotacoes.some((n) => n.id === note.id));

  await store.importBackup(dump, { mode: 'replace', autoBackup: false });
  const restaurada = await store.getNote(note.id);
  assert.equal(restaurada.texto, 'precisa sobreviver ao backup');
  assert.equal(restaurada.participantes, 'João, Maria');
});

test('backup antigo (sem o campo de anotações) continua válido', async () => {
  const dump = await store.exportAll();
  delete dump.anotacoes;
  const validacao = store.validateBackupShape(dump);
  assert.equal(validacao.valid, true, 'quem tem backup anterior a esta versão precisa conseguir importar');
  assert.equal(validacao.summary.anotacoes, 0);
});

test('o ID de anotação usa o prefixo N e não colide com os outros', async () => {
  const note = await store.createNote({ texto: 'checando o id' });
  assert.match(note.id, /^N\d+$/);
});

// --------------------------------------------------------------------
// Itens de ação: cada linha da anotação é um card que pode virar tarefa.
// --------------------------------------------------------------------
import { noteActionItems } from '../js/models.js';

test('cada linha vira um item de ação, sem marcadores de lista', () => {
  const itens = noteActionItems('- Revisar contrato\n* Pedir proposta\n• Agendar retorno');
  assert.deepEqual(itens, ['Revisar contrato', 'Pedir proposta', 'Agendar retorno']);
});

test('linhas vazias e espaços sobrando não viram item', () => {
  assert.deepEqual(noteActionItems('  primeiro  \n\n\n   \n  segundo'), ['primeiro', 'segundo']);
  assert.deepEqual(noteActionItems(''), []);
  assert.deepEqual(noteActionItems(null), []);
});

test('a linha que virou título não se repete como item', () => {
  const texto = 'Reunião VTEX\nAditivo de contrato\nIntegração OK';
  assert.deepEqual(noteActionItems(texto, { titulo: 'Reunião VTEX' }), ['Aditivo de contrato', 'Integração OK']);
  // título digitado, diferente da primeira linha: nenhuma linha some
  assert.equal(noteActionItems(texto, { titulo: 'Outro título' }).length, 3);
});

test('getNoteItems marca o item cuja tarefa já foi criada', async () => {
  const note = await store.createNote({ texto: 'Reunião X\nMandar o aditivo\nCobrar a integração' });
  let itens = await store.getNoteItems(note.id);
  assert.deepEqual(itens.map((i) => i.texto), ['Mandar o aditivo', 'Cobrar a integração']);
  assert.ok(itens.every((i) => i.tarefa === null), 'nada convertido ainda');

  const task = await store.createTask({ titulo: 'Mandar o aditivo' });
  await store.linkNoteToTask(note.id, task.id);

  itens = await store.getNoteItems(note.id);
  assert.equal(itens[0].tarefa.id, task.id, 'o item convertido aponta para a tarefa');
  assert.equal(itens[1].tarefa, null, 'o outro continua pendente');
});

test('o vínculo por item é uma pista: título editado deixa de casar, mas a lista geral não erra', async () => {
  const note = await store.createNote({ texto: 'Reunião Y\nItem original' });
  const task = await store.createTask({ titulo: 'Item com título alterado na hora de salvar' });
  await store.linkNoteToTask(note.id, task.id);

  const itens = await store.getNoteItems(note.id);
  assert.equal(itens[0].tarefa, null, 'a pista por título não casa — e isso é esperado');
  const tarefas = await store.getNoteTasks(note.id);
  assert.equal(tarefas.length, 1, 'a lista de tarefas geradas continua exata');
});

test('anotação de uma linha só (que virou título) não mostra item nenhum', async () => {
  const note = await store.createNote({ texto: 'Só um lembrete' });
  assert.deepEqual(await store.getNoteItems(note.id), []);
});
