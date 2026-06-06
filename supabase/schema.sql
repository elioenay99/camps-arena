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
  -- Formato do torneio: 'avulso' (partidas manuais, modelo original) ou
  -- 'liga' (tabela round-robin gerada ao iniciar). Formatos futuros (grupos,
  -- mata-mata) entram com ALTER TYPE ... ADD VALUE (aditivo).
  if not exists (select 1 from pg_type where typname = 'tournament_format') then
    create type public.tournament_format as enum ('avulso', 'liga');
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

-- Formato (aditivo; idempotente). Default 'avulso': legados preservam o
-- comportamento original sem migração. 'ida_e_volta' só é significativo em
-- liga (espelho do segundo turno com lados invertidos); fica false nos demais.
alter table public.tournaments
  add column if not exists formato public.tournament_format not null default 'avulso';
alter table public.tournaments
  add column if not exists ida_e_volta boolean not null default false;

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

-- ---------- Tabela: participants (participação CONFIRMADA em torneio) ----------
-- Linha = participante confirmado; não existe convite "pendente" persistido
-- (o aceite É a ação de entrar pelo link). PK composta evita duplicata;
-- cascade: participação não sobrevive ao torneio nem ao usuário.
create table if not exists public.participants (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id       uuid not null references public.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create index if not exists participants_user_id_idx on public.participants (user_id);

-- ---------- Tabela: tournament_invites (código de convite, 1:1) ----------
-- O código é SEGREDO do dono e por isso mora FORA de `tournaments`: a policy
-- de SELECT público do torneio vazaria a coluna para qualquer visitante.
-- PK = tournament_id: regenerar é UPDATE do code (o link antigo morre
-- atomicamente; o torneio nunca tem dois códigos válidos).
create table if not exists public.tournament_invites (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  code          text not null unique,
  created_at    timestamptz not null default now()
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

-- ---------- Rodada (aditivo; idempotente) ----------
-- NULL = partida avulsa (todas as legadas). Em liga, número da rodada gerada
-- pela tabela round-robin. Imutável via anon/authenticated (trigger
-- lock_match_relations) — renumerar rodada reescreveria a ordem da liga.
alter table public.matches
  add column if not exists rodada integer;

alter table public.matches drop constraint if exists matches_rodada_positiva;
alter table public.matches
  add constraint matches_rodada_positiva
  check (rodada is null or rodada >= 1);

-- Barreira contra DUPLA GERAÇÃO da tabela (check-then-act da action não é
-- atômico: duas abas podem passar a checagem e inserir duas tabelas). Como o
-- INSERT em lote é um statement único, o perdedor da corrida falha INTEIRO
-- (23505) sem estado parcial — o retry idempotente só promove o status.
-- Parcial (rodada not null): partidas avulsas seguem livres para repetir pares.
create unique index if not exists matches_liga_par_unico
  on public.matches (tournament_id, rodada, participante_1, participante_2)
  where rodada is not null;

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
       or new.rodada is distinct from old.rodada
    then
      raise exception 'Não é permitido alterar participantes, torneio ou rodada da partida';
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

-- ---------- Participação: helper anti-recursão de RLS ----------
-- Usada DENTRO das policies de tournaments/matches. SECURITY DEFINER é
-- obrigatório: policy de tournaments lendo participants (cuja policy lê
-- tournaments de volta) dispara "infinite recursion detected in policy" —
-- como definer (owner), a leitura de participants não reentra nas policies.
create or replace function public.eh_participante(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants p
    where p.tournament_id = t_id
      and p.user_id = (select auth.uid())
  );
$$;

-- ---------- Convite: aceite e preview via SECURITY DEFINER ----------
-- A RLS de INSERT de participants não consegue validar um segredo que não
-- está na linha inserida, e o convidado não pode ler tournament_invites.
-- Estas funções são o ÚNICO caminho do convidado: validam o código e agem
-- em nome do próprio auth.uid(), nada além.

-- Aceita o convite: exige sessão, código válido, torneio não-encerrado e —
-- em liga — torneio ainda em rascunho (a tabela é gerada ao iniciar; quem
-- entra depois ficaria órfão de partidas).
-- Idempotente (on conflict do nothing): reabrir o link não duplica nem falha.
create or replace function public.aceitar_convite(codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament uuid;
  v_status public.tournament_status;
  v_formato public.tournament_format;
begin
  if v_uid is null then
    raise exception 'Você precisa estar autenticado para aceitar um convite';
  end if;

  select i.tournament_id, t.status, t.formato
    into v_tournament, v_status, v_formato
    from public.tournament_invites i
    join public.tournaments t on t.id = i.tournament_id
   where i.code = codigo;

  -- Mensagem única: não distingue código inexistente de revogado.
  if v_tournament is null then
    raise exception 'Convite inválido ou expirado';
  end if;
  if v_status = 'encerrado' then
    raise exception 'Este torneio está encerrado e não aceita novos participantes';
  end if;
  if v_formato = 'liga' and v_status <> 'rascunho' then
    raise exception 'Esta liga já foi iniciada e não aceita novos participantes';
  end if;

  insert into public.participants (tournament_id, user_id)
  values (v_tournament, v_uid)
  on conflict do nothing;

  return v_tournament;
end;
$$;

-- Preview do convite para a página /convite/[codigo]: o torneio pode ser
-- privado e invisível ao convidado até o aceite — o CÓDIGO é a credencial.
-- Expõe apenas o mínimo (id, título, status, formato, se já participa);
-- código inválido devolve zero linhas (mesma resposta que revogado).
-- DROP antes do CREATE: mudar o RETURNS TABLE (coluna `formato` adicionada
-- nesta change) não é permitido via CREATE OR REPLACE. O DROP derruba os
-- GRANTs — eles são re-aplicados logo abaixo.
drop function if exists public.info_convite(text);
create function public.info_convite(codigo text)
returns table (
  tournament_id uuid,
  titulo text,
  status public.tournament_status,
  formato public.tournament_format,
  ja_participa boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.titulo,
    t.status,
    t.formato,
    exists (
      select 1 from public.participants p
      where p.tournament_id = t.id
        and p.user_id = (select auth.uid())
    ) as ja_participa
  from public.tournament_invites i
  join public.tournaments t on t.id = i.tournament_id
  where i.code = codigo;
$$;

-- ---------- GRANTs das funções (CREATE FUNCTION dá EXECUTE a PUBLIC) ----------
-- eh_participante: as policies de tournaments/matches a avaliam COM O ROLE DA
-- QUERY (anon/authenticated) — revogar deles quebraria todo SELECT. Revoga-se
-- PUBLIC e concede-se explicitamente aos dois roles; a exposição via
-- /rest/v1/rpc resultante é inócua (só responde sobre o PRÓPRIO auth.uid()).
revoke execute on function public.eh_participante(uuid) from public;
grant execute on function public.eh_participante(uuid) to anon, authenticated;

-- Convite: só logado (espelha o design — deslogado não vê preview nem aceita;
-- aceitar_convite já exige auth.uid(), o revoke de anon é defesa em camada).
revoke execute on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;
revoke execute on function public.info_convite(text) from public, anon;
grant execute on function public.info_convite(text) to authenticated;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.users              enable row level security;
alter table public.tournaments        enable row level security;
alter table public.matches            enable row level security;
alter table public.teams              enable row level security;
alter table public.participants       enable row level security;
alter table public.tournament_invites enable row level security;

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

-- ----- tournaments: visibilidade por dono/público/participante; escrita do dono -----
-- SELECT: público vê os públicos; o dono vê os seus privados; o PARTICIPANTE
-- confirmado vê o torneio mesmo privado (descoberta pós-convite). A checagem
-- de participação usa eh_participante() (security definer) — ver o comentário
-- da função: referência direta a participants aqui criaria recursão de policy.
-- (anon tem auth.uid() nulo → enxerga apenas is_public.)
drop policy if exists tournaments_select_public on public.tournaments;
drop policy if exists tournaments_select_visivel on public.tournaments;
create policy tournaments_select_visivel on public.tournaments
  for select to anon, authenticated
  using (is_public or created_by = auth.uid() or public.eh_participante(id));

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
        and (t.is_public
             or t.created_by = auth.uid()
             or public.eh_participante(t.id))
    )
    or auth.uid() = participante_1
    or auth.uid() = participante_2
  );

-- INSERT: só o dono do torneio cria partidas nele, e nunca em torneio
-- encerrado. `<> 'encerrado'` (em vez de `= 'ativo'`) é falha-segura: rascunho
-- recebe partidas (montagem antes de ativar) e um status futuro não bloqueia
-- silenciosamente. Cada participante informado precisa ser participante
-- CONFIRMADO do torneio (consentiu via convite) — partidas legadas não são
-- afetadas (a policy só vale para INSERTs novos). Formato: em torneio 'liga'
-- só entra partida COM rodada (o caminho da geração da tabela) — partida
-- manual sem rodada é barrada; o dono forjar rodada via POST direto é
-- auto-sabotagem sem vítima terceira (risco aceito no design). A Server
-- Action createMatch repete as checagens (mensagem precisa); esta policy é a
-- segunda barreira contra POST direto.
drop policy if exists matches_insert_tournament_owner on public.matches;
create policy matches_insert_tournament_owner on public.matches
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
        and (t.formato = 'avulso' or matches.rodada is not null)
    )
    and (participante_1 is null or exists (
      select 1 from public.participants p
      where p.tournament_id = matches.tournament_id
        and p.user_id = matches.participante_1
    ))
    and (participante_2 is null or exists (
      select 1 from public.participants p
      where p.tournament_id = matches.tournament_id
        and p.user_id = matches.participante_2
    ))
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

-- ----- participants: leitura acompanha o torneio; entrada controlada -----
-- SELECT: quem enxerga o torneio enxerga a lista (página do torneio, selects
-- de nova partida). A subquery espelha tournaments_select_visivel; a cláusula
-- de participação usa eh_participante() (definer) — sem recursão.
drop policy if exists participants_select_visivel on public.participants;
create policy participants_select_visivel on public.participants
  for select to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.is_public
             or t.created_by = auth.uid()
             or public.eh_participante(t.id))
    )
  );

-- INSERT direto: SÓ o dono inserindo A SI MESMO (entrada automática ao criar
-- o torneio / botão "Participar"). Convidado NUNCA insere direto — entra pela
-- função aceitar_convite (security definer), que valida o código secreto.
-- Torneio encerrado não recebe ninguém (espelha a regra do aceite).
drop policy if exists participants_insert_owner_self on public.participants;
create policy participants_insert_owner_self on public.participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
    )
  );

-- DELETE: o próprio participante sai; o dono remove qualquer um. Partidas já
-- criadas NÃO são tocadas (histórico) — o removido só deixa de ser elegível
-- para novas partidas. Sem policy de UPDATE: não há coluna mutável.
drop policy if exists participants_delete_self_or_owner on public.participants;
create policy participants_delete_self_or_owner on public.participants
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

-- ----- tournament_invites: TUDO restrito ao dono do torneio -----
-- O código é o segredo que dá entrada — convidado não lê a tabela (valida o
-- código apenas via aceitar_convite/info_convite, security definer).
drop policy if exists tournament_invites_select_owner on public.tournament_invites;
create policy tournament_invites_select_owner on public.tournament_invites
  for select to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists tournament_invites_insert_owner on public.tournament_invites;
create policy tournament_invites_insert_owner on public.tournament_invites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists tournament_invites_update_owner on public.tournament_invites;
create policy tournament_invites_update_owner on public.tournament_invites
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

drop policy if exists tournament_invites_delete_owner on public.tournament_invites;
create policy tournament_invites_delete_owner on public.tournament_invites
  for delete to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

-- Segurança/PII: a tabela `users` (com `celular`) é legível só por authenticated.
-- Anônimos leem apenas `users_public` (id, nome, avatar) — sem telefone.
-- O atalho de WhatsApp usa `celular`, disponível somente na área autenticada.
