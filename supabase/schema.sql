-- =====================================================================
-- Arena — schema do banco (PostgreSQL / Supabase)
-- Fonte de verdade do modelo de dados. Aplicar manualmente no Supabase
-- (SQL Editor) — DDL não é executada automaticamente pelos agentes.
-- Idempotente onde possível (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------- Enums ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tournament_status') then
    create type public.tournament_status as enum ('rascunho', 'ativo', 'encerrado');
  end if;
  if not exists (select 1 from pg_type where typname = 'match_status') then
    create type public.match_status as enum ('agendada', 'em_andamento', 'encerrada');
  end if;
end$$;

-- ---------- Tabela: users (perfil público, 1:1 com auth.users) ----------
create table if not exists public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  celular    text,
  avatar     text,
  created_at timestamptz not null default now()
);

-- ---------- Tabela: tournaments ----------
create table if not exists public.tournaments (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  status     public.tournament_status not null default 'ativo',
  created_at timestamptz not null default now()
);

-- ---------- Tabela: matches ----------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  participante_1 uuid references public.users (id) on delete set null,
  participante_2 uuid references public.users (id) on delete set null,
  placar_1       integer not null default 0 check (placar_1 >= 0),
  placar_2       integer not null default 0 check (placar_2 >= 0),
  status         public.match_status not null default 'agendada',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint matches_participantes_distintos
    check (participante_1 is null or participante_2 is null
           or participante_1 <> participante_2)
);

create index if not exists matches_tournament_id_idx on public.matches (tournament_id);
create index if not exists matches_status_idx on public.matches (status);
create index if not exists matches_participante_1_idx on public.matches (participante_1);
create index if not exists matches_participante_2_idx on public.matches (participante_2);

-- ---------- updated_at automático em matches ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------- Trava colunas de relação da partida contra reatribuição ----------
-- Via anon/authenticated key, participante_1/participante_2/tournament_id não
-- podem ser alterados (fecha a brecha de reatribuir adversário/torneio).
-- service_role (admin/migrations) permanece livre para corrigir atribuições.
create or replace function public.lock_match_relations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
       current_setting('request.jwt.claims', true)::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    if new.participante_1 is distinct from old.participante_1
       or new.participante_2 is distinct from old.participante_2
       or new.tournament_id is distinct from old.tournament_id
    then
      raise exception 'Não é permitido alterar participantes ou torneio da partida';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_lock_relations on public.matches;
create trigger matches_lock_relations
  before update on public.matches
  for each row execute function public.lock_match_relations();

-- ---------- Cria o perfil público ao registrar no Auth ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, nome, celular, avatar)
  values (
    new.id,
    new.raw_user_meta_data ->> 'nome',
    new.raw_user_meta_data ->> 'celular',
    new.raw_user_meta_data ->> 'avatar'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.users       enable row level security;
alter table public.tournaments enable row level security;
alter table public.matches     enable row level security;

-- ----- users: leitura completa só para logados (protege PII como celular) -----
drop policy if exists users_select_public on public.users;
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated on public.users
  for select to authenticated
  using (true);

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- View pública SEM PII: anônimos enxergam só id/nome/avatar (nunca o celular).
-- security_invoker = false (definer) é proposital: a view roda como dona e
-- projeta apenas colunas não-sensíveis, já que anon não tem acesso à tabela.
create or replace view public.users_public
  with (security_invoker = false)
  as select id, nome, avatar from public.users;

grant select on public.users_public to anon, authenticated;

-- ----- tournaments: SELECT público; escrita negada por padrão (sem policy) -----
drop policy if exists tournaments_select_public on public.tournaments;
create policy tournaments_select_public on public.tournaments
  for select to anon, authenticated
  using (true);

-- ----- matches: SELECT público; UPDATE só para participante da partida -----
drop policy if exists matches_select_public on public.matches;
create policy matches_select_public on public.matches
  for select to anon, authenticated
  using (true);

drop policy if exists matches_update_participant on public.matches;
create policy matches_update_participant on public.matches
  for update to authenticated
  using (auth.uid() = participante_1 or auth.uid() = participante_2)
  with check (auth.uid() = participante_1 or auth.uid() = participante_2);

-- Segurança/PII: a tabela `users` (com `celular`) é legível só por authenticated.
-- Anônimos leem apenas `users_public` (id, nome, avatar) — sem telefone.
-- O atalho de WhatsApp usa `celular`, disponível somente na área autenticada.
