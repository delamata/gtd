// ==========================================================================
// Testes puros: sanitização, validação de formulários e utilitários de data.
// Não dependem de IndexedDB.
// ==========================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeText, sanitizeTags, validateTask, validateFup, validateCollaborator, isValidEmail } from '../js/validators.js';
import { addDaysISO, diffDaysISO, isWithinNextDays, isOverdue, isOpenStatus, todayISO, escapeHtml } from '../js/utils.js';
import { formatId } from '../js/models.js';

test('sanitizeText remove marcações HTML e não executa nada', () => {
  assert.equal(sanitizeText('<script>alert(1)</script>Olá'), 'alert(1)Olá');
  assert.equal(sanitizeText('<img src=x onerror=alert(1)>texto'), 'texto');
});

test('sanitizeText limita o tamanho do texto', () => {
  assert.equal(sanitizeText('a'.repeat(600), { maxLength: 10 }).length, 10);
});

test('sanitizeTags normaliza, remove espaços, duplicadas e itens vazios', () => {
  assert.deepEqual(sanitizeTags(' Growth , growth,,  Ads '), ['growth', 'ads']);
});

test('escapeHtml neutraliza caracteres perigosos para inserção em HTML', () => {
  assert.equal(escapeHtml('<b>"teste" & \'aspas\'</b>'), '&lt;b&gt;&quot;teste&quot; &amp; &#39;aspas&#39;&lt;/b&gt;');
});

test('validateTask exige título e valida enums', () => {
  const semTitulo = validateTask({ titulo: '' });
  assert.equal(semTitulo.valid, false);
  assert.ok(semTitulo.errors.titulo);

  const invalida = validateTask({ titulo: 'ok', prioridade: 'urgentíssima', status: 'inexistente' });
  assert.equal(invalida.valid, false);
  assert.ok(invalida.errors.prioridade);
  assert.ok(invalida.errors.status);

  const valida = validateTask({ titulo: 'Tarefa válida', prioridade: 'alta', status: 'a_fazer' });
  assert.equal(valida.valid, true);
});

test('validateFup exige colaborador e assunto', () => {
  const result = validateFup({ assunto: '', colaboradorId: '' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.assunto);
  assert.ok(result.errors.colaboradorId);

  const ok = validateFup({ assunto: 'Assunto válido', colaboradorId: 'P001' });
  assert.equal(ok.valid, true);
});

test('validateCollaborator exige nome e valida e-mail quando informado', () => {
  assert.equal(validateCollaborator({ nome: '' }).valid, false);
  assert.equal(validateCollaborator({ nome: 'Fulano', email: 'invalido' }).valid, false);
  assert.equal(validateCollaborator({ nome: 'Fulano', email: '' }).valid, true);
  assert.equal(validateCollaborator({ nome: 'Fulano', email: 'fulano@empresa.com' }).valid, true);
});

test('isValidEmail aceita vazio (opcional) e valida o formato', () => {
  assert.equal(isValidEmail(''), true);
  assert.equal(isValidEmail('nome@empresa.com'), true);
});

test('formatId monta o ID com prefixo e zero-padding', () => {
  assert.equal(formatId('T', 1), 'T001');
  assert.equal(formatId('F', 42), 'F042');
  assert.equal(formatId('P', 1000), 'P1000');
});

test('addDaysISO e diffDaysISO são operações inversas consistentes', () => {
  const next = addDaysISO('2026-08-26', 10);
  assert.equal(next, '2026-09-05');
  assert.equal(diffDaysISO('2026-08-26', next), 10);
});

test('isWithinNextDays considera hoje e respeita o limite superior', () => {
  const today = todayISO();
  assert.equal(isWithinNextDays(today, 7), true);
  assert.equal(isWithinNextDays(addDaysISO(today, 7), 7), true);
  assert.equal(isWithinNextDays(addDaysISO(today, 8), 7), false);
  assert.equal(isWithinNextDays(addDaysISO(today, -1), 7), false);
});

test('isOverdue considera apenas itens com data passada e status aberto', () => {
  const past = addDaysISO(todayISO(), -3);
  assert.equal(isOverdue({ status: 'a_fazer', prazo: past }, 'prazo'), true);
  assert.equal(isOverdue({ status: 'concluido', prazo: past }, 'prazo'), false);
  assert.equal(isOverdue({ status: 'a_fazer', prazo: '' }, 'prazo'), false);
});

test('isOpenStatus distingue itens finalizados dos ativos', () => {
  assert.equal(isOpenStatus('em_andamento'), true);
  assert.equal(isOpenStatus('aguardando_retorno'), true);
  assert.equal(isOpenStatus('concluido'), false);
  assert.equal(isOpenStatus('cancelado'), false);
});
