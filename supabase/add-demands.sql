-- ==========================================================================
-- add-demands.sql — cria SÓ o que a versão de Demandas precisa.
--
-- Use este arquivo se o app mostrar "O banco de dados está desatualizado"
-- citando a tabela public.demands. Rodar o schema.sql inteiro também
-- resolve; este aqui é mais curto e, por isso, menos sujeito a colagem
-- truncada no editor do Supabase.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar nada.
-- ==========================================================================

-- 1. A tabela -------------------------------------------------------------
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

-- 2. A função pública (o único caminho de escrita sem login) --------------
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

-- 3. Row Level Security — ninguém sem login lê ou escreve na tabela -------
alter table public.demands enable row level security;

drop policy if exists "select_own" on public.demands;
create policy "select_own" on public.demands for select using (auth.uid() = user_id);

drop policy if exists "insert_own" on public.demands;
create policy "insert_own" on public.demands for insert with check (auth.uid() = user_id);

drop policy if exists "update_own" on public.demands;
create policy "update_own" on public.demands for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "delete_own" on public.demands;
create policy "delete_own" on public.demands for delete using (auth.uid() = user_id);

-- 4. Realtime — para a triagem atualizar sozinha em outro dispositivo -----
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'demands'
  ) then
    alter publication supabase_realtime add table public.demands;
  end if;
end $$;
