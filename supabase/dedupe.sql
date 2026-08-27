-- ==========================================================================
-- dedupe.sql — remove duplicatas causadas pelo bug de corrida na semeadura
-- inicial (já corrigido no código; ver commit "Corrigir corrida na
-- semeadura..."). NÃO é para rodar automaticamente — é um roteiro manual.
--
-- Como usar:
--   1. Ajuste o e-mail na definição de `me` logo abaixo, se necessário.
--   2. Rode a seção "PASSO 1 — DIAGNÓSTICO" inteira. Ela só faz SELECT,
--      não apaga nada. Revise os resultados: cada linha é um grupo de
--      registros com os mesmos dados "de origem" (título, assunto, nome...)
--      — "qtd" é quantas cópias existem hoje.
--   3. Só depois de exportar um backup pelo app (Configurações → Exportar
--      backup completo), rode a seção "PASSO 2 — LIMPEZA", tabela por
--      tabela, e confira o "DELETE N" retornado antes de seguir pra
--      próxima tabela.
--
-- O que cada DELETE mantém: dentro de cada grupo de duplicatas, mantém a
-- cópia com sinais de uso real (status alterado, cobrança registrada,
-- edição mais recente) e remove as demais. Nunca mistura registros de
-- grupos diferentes — só remove cópias EXATAS do mesmo dado de origem.
-- ==========================================================================

-- Ajuste aqui se o e-mail da sua conta no Supabase for outro:
-- (usado como filtro em todas as consultas abaixo via a CTE `me`)


-- ==========================================================================
-- PASSO 1 — DIAGNÓSTICO (somente leitura)
-- ==========================================================================

-- Colaboradores duplicados
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com')
select 'collaborators' as tabela, nome as chave, count(*) as qtd, array_agg(id order by "criadoEm") as ids
from public.collaborators, me
where collaborators.user_id = me.user_id
group by nome, time, cargo, email, observacoes, ativo, cor
having count(*) > 1
order by qtd desc;

-- Tarefas duplicadas
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com')
select 'tasks' as tabela, titulo as chave, count(*) as qtd, array_agg(id order by "atualizadoEm") as ids
from public.tasks, me
where tasks.user_id = me.user_id
group by titulo, area, responsavel, prioridade, status, prazo, horario, recorrencia, "proximaAcao", observacao, tags, "origemId", arquivada, "deletedFlag"
having count(*) > 1
order by qtd desc;

-- FUPs duplicados
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com')
select 'fups' as tabela, assunto as chave, count(*) as qtd, array_agg(id order by "atualizadoEm") as ids
from public.fups, me
where fups.user_id = me.user_id
group by "colaboradorId", area, assunto, responsavel, prioridade, status, "proximoFupEm", "prazoFinal", "proximaAcao", dependencia, observacao, tags, "deletedFlag"
having count(*) > 1
order by qtd desc;

-- Compromissos de agenda duplicados
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com')
select 'agenda' as tabela, compromisso as chave, count(*) as qtd, array_agg(id order by "atualizadoEm") as ids
from public.agenda, me
where agenda.user_id = me.user_id
group by data, "horaInicio", "horaFim", compromisso, area, responsavel, status, preparacao, observacao, "deletedFlag"
having count(*) > 1
order by qtd desc;

-- Histórico duplicado (só o que veio da semeadura — conclusões reais nunca duplicam)
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com')
select 'history (seed)' as tabela, atividade as chave, count(*) as qtd, array_agg(id order by id) as ids
from public.history, me
where history.user_id = me.user_id and "tipoOrigem" = 'seed'
group by categoria, area, atividade, responsavel, resultado, "tipoOrigem", "idOrigem", reaberto
having count(*) > 1
order by qtd desc;


-- ==========================================================================
-- PASSO 2 — LIMPEZA (roda uma tabela por vez, depois de exportar o backup)
-- ==========================================================================

-- Colaboradores: mantém a cópia criada primeiro
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com'),
ranked as (
  select id,
    row_number() over (
      partition by nome, time, cargo, email, observacoes, ativo, cor
      order by "criadoEm" asc, id asc
    ) as rn
  from public.collaborators, me
  where collaborators.user_id = me.user_id
)
delete from public.collaborators where id in (select id from ranked where rn > 1);

-- Tarefas: mantém a cópia com status alterado (uso real) e, empatando, a mais recente
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com'),
ranked as (
  select id,
    row_number() over (
      partition by titulo, area, responsavel, prioridade, status, prazo, horario, recorrencia, "proximaAcao", observacao, tags, "origemId", arquivada, "deletedFlag"
      order by (status <> 'a_fazer') desc, "atualizadoEm" desc, id asc
    ) as rn
  from public.tasks, me
  where tasks.user_id = me.user_id
)
delete from public.tasks where id in (select id from ranked where rn > 1);

-- FUPs: mantém a cópia com mais cobranças/histórico registrado e, empatando, a mais recente
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com'),
ranked as (
  select id,
    row_number() over (
      partition by "colaboradorId", area, assunto, responsavel, prioridade, status, "proximoFupEm", "prazoFinal", "proximaAcao", dependencia, observacao, tags, "deletedFlag"
      order by "qtdCobrancas" desc, jsonb_array_length(historico) desc, "atualizadoEm" desc, id asc
    ) as rn
  from public.fups, me
  where fups.user_id = me.user_id
)
delete from public.fups where id in (select id from ranked where rn > 1);

-- Agenda: mantém a cópia com status alterado e, empatando, a mais recente
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com'),
ranked as (
  select id,
    row_number() over (
      partition by data, "horaInicio", "horaFim", compromisso, area, responsavel, status, preparacao, observacao, "deletedFlag"
      order by (status <> 'agendado') desc, "atualizadoEm" desc, id asc
    ) as rn
  from public.agenda, me
  where agenda.user_id = me.user_id
)
delete from public.agenda where id in (select id from ranked where rn > 1);

-- Histórico: só remove duplicatas de origem "seed" (nunca mexe em conclusões reais)
with me as (select id as user_id from auth.users where email = 'andre.delamata@gmail.com'),
ranked as (
  select id,
    row_number() over (
      partition by categoria, area, atividade, responsavel, resultado, "tipoOrigem", "idOrigem", reaberto
      order by id asc
    ) as rn
  from public.history, me
  where history.user_id = me.user_id and "tipoOrigem" = 'seed'
)
delete from public.history where id in (select id from ranked where rn > 1);
