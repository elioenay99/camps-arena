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

-- Ownership e visibilidade (aditivo; idempotente).
-- created_by anulável + ON DELETE SET NULL: torneios de sistema/legados não têm
-- dono e apagar o usuário não deve levar junto torneios com histórico.
-- is_public default true: preserva a visibilidade dos torneios já semeados.
alter table public.tournaments
  add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.tournaments
  add column if not exists is_public boolean not null default true;

create index if not exists tournaments_created_by_idx on public.tournaments (created_by);

-- Regras de pontuação por torneio (aditivo; idempotente). Defaults 3/1/0:
-- torneios legados herdam a convenção do futebol sem migração de dados.
alter table public.tournaments
  add column if not exists pontos_vitoria integer not null default 3;
alter table public.tournaments
  add column if not exists pontos_empate integer not null default 1;
alter table public.tournaments
  add column if not exists pontos_derrota integer not null default 0;

-- Coerência: derrota valendo mais que vitória corromperia toda classificação.
-- Segunda barreira além do Zod (POST direto/edições futuras). Teto 100 = sanidade.
alter table public.tournaments drop constraint if exists tournaments_pontuacao_coerente;
alter table public.tournaments
  add constraint tournaments_pontuacao_coerente
  check (
    pontos_derrota >= 0
    and pontos_derrota <= pontos_empate
    and pontos_empate <= pontos_vitoria
    and pontos_vitoria <= 100
  );

-- ---------- Tabela: teams (cache de clubes reais buscados via API) ----------
-- Dados públicos de clube (nome + escudo). 'external_id' + 'provider' permitem
-- reusar/atualizar o clube sem duplicar. Aditivo: NÃO substitui o participante.
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  escudo_url  text,
  external_id text,
  provider    text not null default 'api-football',
  created_at  timestamptz not null default now(),
  constraint teams_provider_external_unico unique (provider, external_id)
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

-- ---------- Clube que cada lado representa (aditivo; participante segue sendo o user) ----------
-- NÃO travado no lock_match_relations de propósito: o clube é identidade cosmética
-- (a autorização de placar continua baseada no usuário), e deve poder ser ajustado
-- pelo participante. A RLS matches_update_participant já restringe o UPDATE.
alter table public.matches
  add column if not exists time_1 uuid references public.teams (id) on delete set null;
alter table public.matches
  add column if not exists time_2 uuid references public.teams (id) on delete set null;

create index if not exists matches_time_1_idx on public.matches (time_1);
create index if not exists matches_time_2_idx on public.matches (time_2);

-- ---------- Hardening: integridade dos clubes (defesa em profundidade) ----------
-- Segunda barreira além da validação nas Server Actions (searchTeams/selectTeam/
-- updateMatchTeams). Idempotente via DROP + ADD (Postgres não tem ADD IF NOT EXISTS).

-- Os dois lados da partida não podem referenciar o MESMO clube.
alter table public.matches drop constraint if exists matches_times_distintos;
alter table public.matches
  add constraint matches_times_distintos
  check (time_1 is null or time_2 is null or time_1 <> time_2);

-- Escudo só do CDN confiável da API-Football (espelha next.config.ts) ou nulo.
-- ATENÇÃO: se houver registros legados com escudo_url fora desse domínio, o ADD
-- falha. Conferir ANTES de aplicar:
--   select count(*) from public.teams
--   where escudo_url is not null
--     and escudo_url not like 'https://media.api-sports.io/%';
alter table public.teams drop constraint if exists teams_escudo_url_dominio;
alter table public.teams
  add constraint teams_escudo_url_dominio
  check (escudo_url is null or escudo_url like 'https://media.api-sports.io/%');

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

-- ---------- Lifecycle: status só pelo dono; placar/clube de encerrada imutáveis --
-- A RLS de UPDATE é por LINHA: sem este trigger, um participante mudaria o
-- próprio status (encerrando/reabrindo a partida por POST direto), o placar e
-- até o CLUBE de partida já encerrada (reescrevendo a classificação de clubes
-- silenciosamente). Regras:
--   1. `status` só muda quando auth.uid() é o dono do torneio.
--   2. Partida `encerrada` não aceita mudança de placar NEM de clube (o fluxo
--      de correção é: dono reabre → participante corrige → dono re-encerra).
-- service_role (admin/migrations) permanece livre.
create or replace function public.lock_match_lifecycle()
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
    if new.status is distinct from old.status then
      if not exists (
        select 1 from public.tournaments t
        where t.id = new.tournament_id
          and t.created_by = (select auth.uid())
      ) then
        raise exception 'Só o dono do torneio altera o status da partida';
      end if;
    end if;

    if old.status = 'encerrada'
       and (new.placar_1 is distinct from old.placar_1
            or new.placar_2 is distinct from old.placar_2
            or new.time_1 is distinct from old.time_1
            or new.time_2 is distinct from old.time_2)
    then
      raise exception 'Partida encerrada não aceita alteração de placar ou clube';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_lock_lifecycle on public.matches;
create trigger matches_lock_lifecycle
  before update on public.matches
  for each row execute function public.lock_match_lifecycle();

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
alter table public.teams       enable row level security;

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

-- ----- tournaments: visibilidade por dono/público; escrita restrita ao dono -----
-- SELECT: público vê os públicos; o dono vê também os seus privados.
-- (anon tem auth.uid() nulo → enxerga apenas is_public.)
drop policy if exists tournaments_select_public on public.tournaments;
drop policy if exists tournaments_select_visivel on public.tournaments;
create policy tournaments_select_visivel on public.tournaments
  for select to anon, authenticated
  using (is_public or created_by = auth.uid());

-- INSERT/UPDATE/DELETE: só o dono. with check impede criar em nome de outro
-- e transferir a posse num UPDATE.
drop policy if exists tournaments_insert_owner on public.tournaments;
create policy tournaments_insert_owner on public.tournaments
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists tournaments_update_owner on public.tournaments;
create policy tournaments_update_owner on public.tournaments
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists tournaments_delete_owner on public.tournaments;
create policy tournaments_delete_owner on public.tournaments
  for delete to authenticated
  using (created_by = auth.uid());

-- ----- teams: SELECT público (dados públicos de clube); INSERT por logado (cache) -----
-- Sem UPDATE/DELETE (negados por padrão): o cache usa INSERT idempotente
-- (on conflict do nothing) por provider+external_id.
drop policy if exists teams_select_public on public.teams;
create policy teams_select_public on public.teams
  for select to anon, authenticated
  using (true);

drop policy if exists teams_insert_authenticated on public.teams;
create policy teams_insert_authenticated on public.teams
  for insert to authenticated
  with check (true);

-- ----- matches: SELECT segue a visibilidade do torneio; INSERT só do dono -----
-- A partida é visível quando o torneio dela é visível (público, ou privado do
-- próprio solicitante) OU quando o solicitante participa da partida — sem essa
-- cláusula, participante convidado em torneio privado de terceiro não veria a
-- própria partida (e o modal de placar quebraria). A subquery contra
-- `tournaments` espelha a policy tournaments_select_visivel: camadas consistentes.
drop policy if exists matches_select_public on public.matches;
drop policy if exists matches_select_visivel on public.matches;
create policy matches_select_visivel on public.matches
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.is_public or t.created_by = auth.uid())
    )
    or auth.uid() = participante_1
    or auth.uid() = participante_2
  );

-- INSERT: só o dono do torneio cria partidas nele, e nunca em torneio
-- encerrado. `<> 'encerrado'` (em vez de `= 'ativo'`) é falha-segura: rascunho
-- recebe partidas (montagem antes de ativar) e um status futuro não bloqueia
-- silenciosamente. A Server Action createMatch repete a checagem (mensagem
-- precisa); esta policy é a segunda barreira contra POST direto.
drop policy if exists matches_insert_tournament_owner on public.matches;
create policy matches_insert_tournament_owner on public.matches
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
    )
  );

drop policy if exists matches_update_participant on public.matches;
create policy matches_update_participant on public.matches
  for update to authenticated
  using (auth.uid() = participante_1 or auth.uid() = participante_2)
  with check (auth.uid() = participante_1 or auth.uid() = participante_2);

-- UPDATE também para o DONO do torneio (policies são OR): é ele quem encerra
-- e reabre partidas (modelo árbitro). A semântica de COLUNA (status só dono;
-- placar travado em encerrada) fica no trigger lock_match_lifecycle — RLS é
-- por linha e não distingue colunas.
drop policy if exists matches_update_tournament_owner on public.matches;
create policy matches_update_tournament_owner on public.matches
  for update to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

-- Segurança/PII: a tabela `users` (com `celular`) é legível só por authenticated.
-- Anônimos leem apenas `users_public` (id, nome, avatar) — sem telefone.
-- O atalho de WhatsApp usa `celular`, disponível somente na área autenticada.
