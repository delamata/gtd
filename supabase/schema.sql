-- ==========================================================================
-- schema.sql — GTD Executivo: tabelas, RLS e função de ID sequencial.
--
-- Como aplicar: cole este arquivo inteiro no SQL Editor do painel do
-- Supabase (https://supabase.com/dashboard/project/_/sql) e clique em
-- "Run". Idempotente: pode rodar mais de uma vez sem duplicar nada.
--
-- Convenção: os nomes de coluna usam o mesmo camelCase de js/models.js
-- (entre aspas duplas — Postgres normalmente força minúsculas sem aspas).
-- Isso deixa js/adapters/supabase-adapter.js quase um passthrough, sem
-- tradução de campo a campo.
-- ==========================================================================

-- ---------------------------------------------------------------------
-- Tabelas de negócio (uma por STORE_NAMES, exceto "meta")
-- ---------------------------------------------------------------------
create table if not exists public.tasks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null default '',
  area text not null default '',
  responsavel text not null default '',
  prioridade text not null default 'media',
  status text not null default 'a_fazer',
  prazo text not null default '',
  horario text not null default '',
  recorrencia text not null default 'nenhuma',
  "proximaAcao" text not null default '',
  observacao text not null default '',
  tags text[] not null default '{}',
  "criadoEm" text not null default '',
  "atualizadoEm" text not null default '',
  "concluidoEm" text not null default '',
  "origemId" text not null default '',
  arquivada boolean not null default false,
  "deletedFlag" boolean not null default false
);

create table if not exists public.fups (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "colaboradorId" text not null default '',
  area text not null default '',
  assunto text not null default '',
  responsavel text not null default '',
  prioridade text not null default 'media',
  status text not null default 'a_fazer',
  "proximoFupEm" text not null default '',
  "prazoFinal" text not null default '',
  "proximaAcao" text not null default '',
  dependencia text not null default '',
  observacao text not null default '',
  tags text[] not null default '{}',
  "criadoEm" text not null default '',
  "atualizadoEm" text not null default '',
  "concluidoEm" text not null default '',
  "qtdCobrancas" integer not null default 0,
  "ultimoContatoEm" text not null default '',
  historico jsonb not null default '[]',
  arquivada boolean not null default false,
  "deletedFlag" boolean not null default false
);

create table if not exists public.agenda (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  data text not null default '',
  "horaInicio" text not null default '',
  "horaFim" text not null default '',
  compromisso text not null default '',
  area text not null default '',
  responsavel text not null default '',
  status text not null default 'agendado',
  preparacao text not null default '',
  observacao text not null default '',
  "criadoEm" text not null default '',
  "atualizadoEm" text not null default '',
  "concluidoEm" text not null default '',
  "deletedFlag" boolean not null default false
);

create table if not exists public.collaborators (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nome text not null default '',
  time text not null default '',
  cargo text not null default '',
  email text not null default '',
  observacoes text not null default '',
  ativo boolean not null default true,
  cor text not null default '#1E425F',
  "criadoEm" text not null default '',
  "deletedFlag" boolean not null default false
);

create table if not exists public.notes (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null default '',
  texto text not null default '',
  data text not null default '',
  "colaboradorId" text not null default '',
  area text not null default '',
  participantes text not null default '',
  tags text[] not null default '{}',
  "tarefasIds" text[] not null default '{}',
  "processadoEm" text not null default '',
  "criadoEm" text not null default '',
  "atualizadoEm" text not null default '',
  arquivada boolean not null default false,
  "deletedFlag" boolean not null default false
);

-- Demandas recebidas pela página pública (demanda.html). Repare que NÃO há
-- política para o papel "anon" nesta tabela: quem está sem login não enxerga
-- nem grava nada aqui diretamente — só pode chamar a função
-- submit_demand() mais abaixo, que valida e grava em nome do dono.
create table if not exists public.demands (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  solicitante text not null default '',
  email text not null default '',
  area text not null default '',
  titulo text not null default '',
  descricao text not null default '',
  "prioridadeSugerida" text not null default 'media',
  "prazoDesejado" text not null default '',
  status text not null default 'nova',
  "tarefasIds" text[] not null default '{}',
  "respostaInterna" text not null default '',
  "criadoEm" text not null default '',
  "atualizadoEm" text not null default '',
  -- timestamp real, só para o controle de vazão da função pública; o app
  -- continua lendo "criadoEm" como as demais entidades.
  submitted_at timestamptz not null default now(),
  arquivada boolean not null default false,
  "deletedFlag" boolean not null default false
);

create index if not exists demands_submitted_at_idx on public.demands (submitted_at);

create table if not exists public.history (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "dataHora" text not null default '',
  categoria text not null default '',
  area text not null default '',
  atividade text not null default '',
  responsavel text not null default '',
  resultado text not null default '',
  "tipoOrigem" text not null default '',
  "idOrigem" text not null default '',
  "atualizadoEm" text not null default '',
  reaberto boolean not null default false
);

create table if not exists public."auditLog" (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  "dataHora" text not null default '',
  "tipoAcao" text not null default '',
  "tipoRegistro" text not null default '',
  "idRegistro" text not null default '',
  "valorAnterior" text not null default '',
  "valorNovo" text not null default ''
);

-- ---------------------------------------------------------------------
-- Migrações de colunas — para bancos criados por uma versão anterior
-- deste arquivo, que ainda não tinham as colunas abaixo. Em um banco
-- novo os create table acima já as criaram e estes comandos não fazem
-- nada (add column if not exists).
-- ---------------------------------------------------------------------
alter table public.tasks add column if not exists arquivada boolean not null default false;
alter table public.fups  add column if not exists arquivada boolean not null default false;

-- ---------------------------------------------------------------------
-- Tabelas de apoio (não fazem parte de STORE_NAMES)
-- ---------------------------------------------------------------------
create table if not exists public.meta (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  "schemaVersion" integer not null default 1,
  seeded boolean not null default false,
  "lastBackupAt" text not null default ''
);

create table if not exists public.id_counters (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  prefix text not null,
  value integer not null default 0,
  primary key (user_id, prefix)
);

-- ---------------------------------------------------------------------
-- Função de ID sequencial e nunca reaproveitado (equivalente ao
-- getNextId() do adapter IndexedDB — lock de linha garante atomicidade).
-- ---------------------------------------------------------------------
create or replace function public.next_id(p_prefix text)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v integer;
begin
  insert into public.id_counters (user_id, prefix, value)
  values (auth.uid(), p_prefix, 1)
  on conflict (user_id, prefix)
  do update set value = public.id_counters.value + 1
  returning value into v;
  return p_prefix || lpad(v::text, 3, '0');
end;
$$;

grant execute on function public.next_id(text) to authenticated;

-- ---------------------------------------------------------------------
-- submit_demand() — o único caminho pelo qual alguém SEM LOGIN escreve
-- neste banco. É SECURITY DEFINER: roda com os privilégios do dono da
-- função, não do chamador, então o papel "anon" não precisa (e não recebe)
-- nenhuma permissão sobre a tabela demands. Quem chama só consegue:
--   * inserir uma demanda, nunca ler, alterar ou apagar nada;
--   * dentro dos limites de tamanho e de vazão verificados aqui.
-- Devolve só o número de protocolo.
-- ---------------------------------------------------------------------
create or replace function public.submit_demand(
  p_titulo text,
  p_descricao text,
  p_solicitante text default '',
  p_email text default '',
  p_area text default '',
  p_prioridade text default 'media',
  p_prazo text default '',
  p_trap text default ''        -- honeypot: campo escondido no formulário
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_id text;
  v_last_minute integer;
  v_last_hour integer;
begin
  -- Bot que preenche o campo escondido recebe um protocolo falso e nada é
  -- gravado: devolver erro só ensinaria o robô a tentar de outro jeito.
  if coalesce(trim(p_trap), '') <> '' then
    return 'D000';
  end if;

  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'Informe o título da demanda.';
  end if;
  if coalesce(trim(p_descricao), '') = '' then
    raise exception 'Descreva a demanda.';
  end if;
  if length(p_titulo) > 200 or length(p_descricao) > 4000
     or length(coalesce(p_solicitante, '')) > 120 or length(coalesce(p_email, '')) > 160
     or length(coalesce(p_area, '')) > 120 then
    raise exception 'Conteúdo acima do tamanho permitido.';
  end if;
  if coalesce(p_email, '') <> '' and p_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if coalesce(p_prazo, '') <> '' and p_prazo !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'Data inválida.';
  end if;

  -- Controle de vazão: a página é pública, então sem isso uma única pessoa
  -- (ou um script) entope a caixa de entrada.
  select count(*) into v_last_minute from public.demands where submitted_at > now() - interval '1 minute';
  select count(*) into v_last_hour   from public.demands where submitted_at > now() - interval '1 hour';
  if v_last_minute >= 5 or v_last_hour >= 60 then
    raise exception 'Muitas demandas enviadas agora há pouco. Tente de novo em alguns minutos.';
  end if;

  -- Dono da caixa de entrada. Este app é de uso pessoal: há uma conta só, e
  -- é ela que recebe. Virando multiusuário, troque por uma configuração
  -- explícita de para quem vai cada demanda.
  select id into v_owner from auth.users order by created_at asc limit 1;
  if v_owner is null then
    raise exception 'Nenhuma conta configurada para receber demandas.';
  end if;

  insert into public.id_counters (user_id, prefix, value)
  values (v_owner, 'D', 1)
  on conflict (user_id, prefix) do update set value = public.id_counters.value + 1
  returning 'D' || lpad(value::text, 3, '0') into v_id;

  insert into public.demands (
    id, user_id, solicitante, email, area, titulo, descricao,
    "prioridadeSugerida", "prazoDesejado", status, "criadoEm", "atualizadoEm"
  ) values (
    v_id, v_owner,
    trim(coalesce(p_solicitante, '')), trim(coalesce(p_email, '')), trim(coalesce(p_area, '')),
    trim(p_titulo), trim(p_descricao),
    case when p_prioridade in ('urgente','alta','media','baixa') then p_prioridade else 'media' end,
    coalesce(p_prazo, ''), 'nova',
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  );

  return v_id;
end;
$$;

-- É este grant — e só ele — que a página pública usa.
grant execute on function public.submit_demand(text, text, text, text, text, text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security — cada usuário só vê/edita as próprias linhas
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array['tasks','fups','agenda','collaborators','notes','demands','history','auditLog','meta','id_counters'])
  loop
    execute format('alter table public.%I enable row level security;', t);

    execute format('drop policy if exists "select_own" on public.%I;', t);
    execute format('create policy "select_own" on public.%I for select using (auth.uid() = user_id);', t);

    execute format('drop policy if exists "insert_own" on public.%I;', t);
    execute format('create policy "insert_own" on public.%I for insert with check (auth.uid() = user_id);', t);

    execute format('drop policy if exists "update_own" on public.%I;', t);
    execute format('create policy "update_own" on public.%I for update using (auth.uid() = user_id) with check (auth.uid() = user_id);', t);

    execute format('drop policy if exists "delete_own" on public.%I;', t);
    execute format('create policy "delete_own" on public.%I for delete using (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Realtime — habilita eventos postgres_changes nas tabelas que as views
-- precisam escutar (js/adapters/supabase-adapter.js#onRemoteChange)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array['tasks','fups','agenda','collaborators','notes','demands','history'])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
