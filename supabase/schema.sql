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
-- Row Level Security — cada usuário só vê/edita as próprias linhas
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  for t in select unnest(array['tasks','fups','agenda','collaborators','history','auditLog','meta','id_counters'])
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
  for t in select unnest(array['tasks','fups','agenda','collaborators','history'])
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I;', t);
    end if;
  end loop;
end $$;
