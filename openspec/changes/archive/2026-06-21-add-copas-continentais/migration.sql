-- =====================================================================
-- COPAS E CONTINENTAIS (change add-copas-continentais)
-- Copas imortais alimentadas pela classificacao final encerrada de ligas
-- e de outras copas. Uma EDICAO materializa UM tournaments (mata_mata ou
-- grupos_mata_mata), reusando o motor de jogo existente. As copas apenas
-- LEEM a classificacao da piramide; zero regressao.
--
-- Ordem de dependencias: enums -> tabelas (cup_competitions ->
-- cup_qualification_rules -> cup_seasons -> cup_entries ->
-- cup_season_exclusions) -> helper eh_dono_cup -> RPCs de leitura gated ->
-- RPC montar_copa -> triggers (anti-ciclo, guard de delete) -> RLS/policies.
--
-- Idempotente onde o repo e idempotente (IF NOT EXISTS / DROP ... IF EXISTS /
-- create or replace). Tudo qualificado com public.
--
-- ADVISORY LOCK NAMESPACES (documentado junto de montar_temporada/playoff):
--   0 = montar_temporada (por season)
--   1 = montar_playoff / montar_barragem / montar_grande_final (por fronteira/divisao)
--   2 = montar_copa (por cup_season)  <-- reservado nesta change
-- =====================================================================

-- ---------- Enums ----------
do $$
begin
  -- Formato da copa (espelha o subconjunto de tournament_format usado: a copa
  -- so suporta chave eliminatoria ou grupos+mata).
  if not exists (select 1 from pg_type where typname = 'cup_format') then
    create type public.cup_format as enum ('mata_mata', 'grupos_mata_mata');
  end if;
  -- Abrangencia: ROTULO informativo (exibicao/filtro), sem invariante
  -- estrutural (continental nao exige >=2 piramides) — D12.
  if not exists (select 1 from pg_type where typname = 'cup_scope') then
    create type public.cup_scope as enum ('nacional', 'continental');
  end if;
  -- Tipo de origem de uma regra de qualificacao: divisao de liga OU resultado
  -- de outra copa (XOR por CHECK na tabela).
  if not exists (select 1 from pg_type where typname = 'cup_origin_type') then
    create type public.cup_origin_type as enum ('divisao', 'copa');
  end if;
  -- Ciclo de vida da edicao: 'rascunho' (montando o pool/ajuste manual),
  -- 'montada' (tournament criado, slots semeados, antes de iniciar), 'ativa'
  -- (chave/grupos gerados, jogando), 'encerrada' (posicao_final gravada).
  if not exists (select 1 from pg_type where typname = 'cup_season_status') then
    create type public.cup_season_status as enum ('rascunho', 'montada', 'ativa', 'encerrada');
  end if;
  -- Ciclo de vida da copa (imortal): 'ativa' (default) ou 'arquivada' (some das
  -- listagens publicas; edicoes preservadas). status NAO e gate de privacidade.
  if not exists (select 1 from pg_type where typname = 'cup_competition_status') then
    create type public.cup_competition_status as enum ('ativa', 'arquivada');
  end if;
end$$;

-- ---------- Tabela: cup_competitions (a copa imortal — config-mae) ----------
-- Espelha league_competitions (schema.sql:1721): created_by anulavel + ON DELETE
-- SET NULL (apagar o dono nao derruba a copa com historico); is_public default
-- true (herdado pelos tournaments das edicoes via montar_copa). Soma o formato
-- da copa (mata_mata|grupos_mata_mata), os toggles de mata-mata (ida_e_volta,
-- terceiro_lugar), a geometria de grupos (qtd_grupos/classificados_por_grupo,
-- so em grupos_mata_mata) e por_nome (clube vs rotulo — homogeneidade da copa).
create table if not exists public.cup_competitions (
  id                       uuid primary key default gen_random_uuid(),
  nome                     text not null,
  created_by               uuid references public.users (id) on delete set null,
  status                   public.cup_competition_status not null default 'ativa',
  -- Mapeia a coluna 'abrangencia' (rotulo nacional|continental — D12).
  abrangencia              public.cup_scope not null default 'nacional',
  formato                  public.cup_format not null default 'mata_mata',
  -- Identidade do participante: false = clube; true = por nome (rotulo livre).
  -- Homogeneidade autoritativa e checada na montagem (COPA_HETEROGENEA — D6).
  por_nome                 boolean not null default false,
  -- Toggles de mata-mata (significativos no mata_mata e no mata-mata pos-grupos).
  ida_e_volta              boolean not null default false,
  terceiro_lugar           boolean not null default false,
  -- Geometria de grupos: presente sse formato = grupos_mata_mata (CHECK abaixo).
  qtd_grupos               integer,
  classificados_por_grupo  integer,
  -- Preset de desempate (mesmo dominio de tournaments.desempate_criterio,
  -- schema.sql:2046). Passa ao tournaments da edicao em montar_copa.
  desempate_criterio       text not null default 'cbf',
  is_public                boolean not null default true,
  -- Cores de identidade (hex #rrggbb minusculo OU NULL — espelha league_competitions).
  cor_primaria             text,
  cor_secundaria           text,
  created_at               timestamptz not null default now(),
  constraint cup_competitions_nome_nao_vazio check (length(trim(nome)) > 0),
  constraint cup_competitions_desempate_valido
    check (desempate_criterio in ('cbf', 'ingles', 'custom', 'espanhol', 'fifa')),
  constraint cup_competitions_cor_primaria_hex
    check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$'),
  constraint cup_competitions_cor_secundaria_hex
    check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$'),
  -- Coerencia de formato: geometria de grupos presente E coerente SSE
  -- grupos_mata_mata; ausente/nula em mata_mata (espelha
  -- league_division_seasons_grupos_coerente, schema.sql:1837). Alem do espelho,
  -- o produto qtd_grupos*classificados_por_grupo DEVE ser uma chave valida:
  -- potencia de 2 entre 2 e 32 (teto do motor MATA_MATA_MAX_PARTICIPANTES).
  -- Bitwise: n>0 and (n & (n-1)) = 0 testa potencia de 2.
  constraint cup_competitions_grupos_coerente
    check (
      (formato = 'mata_mata'
         and qtd_grupos is null and classificados_por_grupo is null)
      or (formato = 'grupos_mata_mata'
         and qtd_grupos >= 2 and classificados_por_grupo >= 1
         and (qtd_grupos * classificados_por_grupo) between 2 and 32
         and ((qtd_grupos * classificados_por_grupo)
              & ((qtd_grupos * classificados_por_grupo) - 1)) = 0)
    )
);

create index if not exists cup_competitions_created_by_idx
  on public.cup_competitions (created_by);

-- ---------- Tabela: cup_qualification_rules (regra de qualificacao = vaga(s)) ----------
-- Cada regra deriva uma faixa de vagas de UMA origem: uma divisao de liga
-- (origem_competition_id + origem_nivel) OU o resultado de outra copa
-- (origem_cup_id). XOR por CHECK. A faixa [posicao_inicio..posicao_fim] indexa
-- um RANK DE SEEDING CONTIGUO 1..n por origem (NAO o valor cru de posicao_final
-- — D3). ON DELETE: cup_competition_id CASCADE (regra morre com a copa);
-- origem_competition_id/origem_cup_id RESTRICT (nao perder regra silenciosamente
-- ao apagar a origem — tasks.md 1.3).
create table if not exists public.cup_qualification_rules (
  id                    uuid primary key default gen_random_uuid(),
  cup_competition_id    uuid not null references public.cup_competitions (id) on delete cascade,
  origem_tipo           public.cup_origin_type not null,
  origem_competition_id uuid references public.league_competitions (id) on delete restrict,
  origem_nivel          integer,
  -- Auto-referencia a outra copa (forward-ref resolvida: cup_competitions ja existe).
  origem_cup_id         uuid references public.cup_competitions (id) on delete restrict,
  posicao_inicio        integer not null,
  posicao_fim           integer not null,
  prioridade            integer not null default 0,
  rotulo                text,
  created_at            timestamptz not null default now(),
  -- XOR de origem amarrado ao tipo: divisao => competition_id + nivel not null,
  -- cup_id null; copa => cup_id not null, competition_id + nivel null.
  constraint cup_qualification_rules_origem_xor
    check (
      (origem_tipo = 'divisao'
         and origem_competition_id is not null and origem_nivel is not null
         and origem_cup_id is null)
      or (origem_tipo = 'copa'
         and origem_cup_id is not null
         and origem_competition_id is null and origem_nivel is null)
    ),
  constraint cup_qualification_rules_nivel_positivo
    check (origem_nivel is null or origem_nivel >= 1),
  -- Faixa valida: fim >= inicio >= 1 (num_vagas = fim - inicio + 1).
  constraint cup_qualification_rules_faixa_valida
    check (posicao_inicio >= 1 and posicao_fim >= posicao_inicio),
  -- Uma copa nao pode ter origem nela mesma (caso trivial; ciclos transitivos
  -- sao barrados pelo trigger anti-ciclo).
  constraint cup_qualification_rules_nao_auto
    check (origem_cup_id is null or origem_cup_id <> cup_competition_id)
);

create index if not exists cup_qualification_rules_cup_idx
  on public.cup_qualification_rules (cup_competition_id);
create index if not exists cup_qualification_rules_origem_competition_idx
  on public.cup_qualification_rules (origem_competition_id) where origem_competition_id is not null;
create index if not exists cup_qualification_rules_origem_cup_idx
  on public.cup_qualification_rules (origem_cup_id) where origem_cup_id is not null;

-- ---------- Tabela: cup_seasons (uma edicao da copa) ----------
-- Espelha league_seasons (schema.sql:1757): numero 1-based sequencial unico por
-- copa (SENTINELA de dupla criacao), previous_season_id (cadeia de proveniencia),
-- config_snapshot jsonb (geometria/formato congelados ao montar — D2). tournament_id
-- e a SENTINELA de idempotencia da montagem (RESTRICT: o torneio nao some sem
-- desfazer a edicao; UNIQUE parcial garante 1 torneio por papel).
create table if not exists public.cup_seasons (
  id                 uuid primary key default gen_random_uuid(),
  cup_competition_id uuid not null references public.cup_competitions (id) on delete cascade,
  numero             integer not null,
  status             public.cup_season_status not null default 'rascunho',
  -- Aponta para o unico tournaments materializado (NULL enquanto rascunho).
  tournament_id      uuid references public.tournaments (id) on delete restrict,
  -- Snapshot imutavel da geometria/formato no momento da montagem (a copa-mae
  -- pode evoluir; a edicao ja montada le do snapshot). NULL ate montar.
  config_snapshot    jsonb,
  -- Auto-referencia a edicao anterior (forward-ref auto-resolvida no Postgres).
  previous_season_id uuid references public.cup_seasons (id) on delete set null,
  montada_em         timestamptz,
  encerrada_em       timestamptz,
  created_at         timestamptz not null default now(),
  constraint cup_seasons_numero_positivo check (numero >= 1)
);

-- SENTINELA de dupla criacao de edicao (23505 em corrida -> retry acha a criada).
create unique index if not exists cup_seasons_numero_unico
  on public.cup_seasons (cup_competition_id, numero);
create index if not exists cup_seasons_cup_idx
  on public.cup_seasons (cup_competition_id);
-- Um torneio pertence a no maximo uma edicao (sentinela de idempotencia).
create unique index if not exists cup_seasons_tournament_unico
  on public.cup_seasons (tournament_id) where tournament_id is not null;
create index if not exists cup_seasons_previous_idx
  on public.cup_seasons (previous_season_id) where previous_season_id is not null;

-- ---------- Tabela: cup_entries (participante de uma edicao) ----------
-- Identidade do participante: team_id = clube (modo clube) XOR rotulo (modo por
-- nome) — espelha league_competitors (schema.sql:1960) e tournament_slots, mas
-- SEM competitor_id (participante de copa NAO e league_competitor). slot_id liga
-- a vaga concreta no tournaments da edicao (NULL ate montar; RESTRICT). origem_*
-- rastreia de onde a vaga veio. posicao_final NULL ate o encerramento (D11).
-- manual=true marca ancoras (ajuste do dono; preservadas na re-derivacao — D5).
-- Vaga vazia = AUSENCIA de linha (o CHECK XOR proibe placeholder — D5).
create table if not exists public.cup_entries (
  id              uuid primary key default gen_random_uuid(),
  cup_season_id   uuid not null references public.cup_seasons (id) on delete cascade,
  team_id         uuid references public.teams (id) on delete restrict,
  rotulo          text,
  -- Regra que derivou esta entry (NULL em entry manual). SET NULL: apagar a regra
  -- nao apaga a entry ja derivada (preserva a edicao montada).
  origem_rule_id  uuid references public.cup_qualification_rules (id) on delete set null,
  -- Season/edicao-origem efetivamente consumida na derivacao. POLIMORFICA (aponta
  -- para league_seasons OU cup_seasons conforme origem_tipo da regra) — SEM FK
  -- forte por isso. Rastreabilidade + base do COPA_HETEROGENEA em montar_copa.
  origem_season_id uuid,
  origem_descricao text,
  seed            integer,
  posicao_final   integer,
  -- Vaga concreta no tournaments da edicao (gravada por montar_copa). NULL ate montar.
  slot_id         uuid references public.tournament_slots (id) on delete restrict,
  manual          boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint cup_entries_clube_xor_rotulo
    check ((team_id is null) <> (rotulo is null)),
  constraint cup_entries_rotulo_nao_vazio
    check (rotulo is null or length(trim(rotulo)) > 0),
  constraint cup_entries_posicao_positiva
    check (posicao_final is null or posicao_final >= 1),
  constraint cup_entries_seed_positivo
    check (seed is null or seed >= 1)
);

create index if not exists cup_entries_season_idx
  on public.cup_entries (cup_season_id);
create index if not exists cup_entries_rule_idx
  on public.cup_entries (origem_rule_id) where origem_rule_id is not null;
-- UNIQUE participante por edicao SEM componente de origem (identidade de edicao =
-- team_id OU lower(trim(rotulo)) — D5). Dois indices parciais (espelha
-- league_competitors_team_unico / _rotulo_unico, schema.sql:1976-1979).
create unique index if not exists cup_entries_team_unico
  on public.cup_entries (cup_season_id, team_id) where team_id is not null;
create unique index if not exists cup_entries_rotulo_unico
  on public.cup_entries (cup_season_id, lower(trim(rotulo))) where rotulo is not null;
-- Um slot pertence a no maximo uma entry (espelha league_division_entries_slot_unico).
create unique index if not exists cup_entries_slot_unico
  on public.cup_entries (slot_id) where slot_id is not null;
create index if not exists cup_entries_team_idx
  on public.cup_entries (team_id) where team_id is not null;

-- ---------- Tabela: cup_season_exclusions (exclusoes persistentes da re-derivacao) ----------
-- O dono removeu uma entry derivada -> registramos a IDENTIDADE excluida aqui
-- (nao como linha em cup_entries, preservando o invariante "sem placeholder" — D5)
-- para que a re-derivacao nao a reintroduza. Identidade = team_id XOR rotulo.
create table if not exists public.cup_season_exclusions (
  id            uuid primary key default gen_random_uuid(),
  cup_season_id uuid not null references public.cup_seasons (id) on delete cascade,
  team_id       uuid references public.teams (id) on delete restrict,
  rotulo        text,
  created_at    timestamptz not null default now(),
  constraint cup_season_exclusions_clube_xor_rotulo
    check ((team_id is null) <> (rotulo is null)),
  constraint cup_season_exclusions_rotulo_nao_vazio
    check (rotulo is null or length(trim(rotulo)) > 0)
);

create index if not exists cup_season_exclusions_season_idx
  on public.cup_season_exclusions (cup_season_id);
-- Unicidade da identidade excluida por edicao (espelha o UNIQUE de cup_entries).
create unique index if not exists cup_season_exclusions_team_unico
  on public.cup_season_exclusions (cup_season_id, team_id) where team_id is not null;
create unique index if not exists cup_season_exclusions_rotulo_unico
  on public.cup_season_exclusions (cup_season_id, lower(trim(rotulo))) where rotulo is not null;
create index if not exists cup_season_exclusions_team_idx
  on public.cup_season_exclusions (team_id) where team_id is not null;

-- ---------- Helper anti-recursao de RLS: dono da copa ----------
-- Usada DENTRO das policies das tabelas-filhas da copa. SECURITY DEFINER evita a
-- recursao (espelha eh_dono_competition, schema.sql:2791). EXECUTE a anon +
-- authenticated — NUNCA revogar de authenticated: a policy o avalia COM O ROLE
-- DA QUERY (licao do hardening — revogar quebra a RLS).
create or replace function public.eh_dono_cup(p_cup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cup_competitions c
    where c.id = p_cup_id
      and c.created_by = (select auth.uid())
  );
$$;

revoke execute on function public.eh_dono_cup(uuid) from public;
grant execute on function public.eh_dono_cup(uuid) to anon, authenticated;

-- ---------- RPC: classificacao_final_divisao (SECURITY DEFINER, leitura gated) ----------
-- Le a classificacao final ENCERRADA de uma divisao de liga para alimentar a
-- derivacao de vagas (D3/D4/D9). DEFINER para NAO depender da RLS row-level do
-- dono da copa (que esconderia piramide arquivada e produziria pool silenciosamente
-- incompleto). Aplica o GATE de consentimento explicitamente:
--   (1) ORIGEM_INVISIVEL: a piramide nao e publica nem do proprio dono da copa.
--   (2) ORIGEM_NAO_ENCERRADA: nenhuma temporada 'encerrada' (ativacao diferida).
--   (3) NIVEL_INEXISTENTE: o nivel sumiu da temporada consumida (piramide encolheu).
-- Retorna a lista ordenada por (posicao_final asc, competitor_id asc) com RANK
-- CONTIGUO 1..n (row_number) — a faixa da regra indexa esse rank, nao o valor cru.
-- Inclui origem_season_id (a league_seasons consumida) para rastreabilidade.
create or replace function public.classificacao_final_divisao(
  p_competition_id uuid,
  p_nivel          integer
)
returns table (
  team_id          uuid,
  rotulo           text,
  posicao_final    integer,
  rank             integer,
  origem_season_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_is_public boolean;
  v_dono      uuid;
  v_season    uuid;
  v_div       uuid;
begin
  -- (1) Gate de consentimento: origem publica OU do proprio dono.
  select lc.is_public, lc.created_by
    into v_is_public, v_dono
    from public.league_competitions lc
   where lc.id = p_competition_id;

  if v_is_public is null then
    raise exception 'ORIGEM_INVISIVEL';
  end if;
  if not (v_is_public or v_dono = v_uid) then
    raise exception 'ORIGEM_INVISIVEL';
  end if;

  -- (2) Temporada encerrada de MAIOR numero (D8: nao usar encerrada_em, nullable).
  select ls.id into v_season
    from public.league_seasons ls
   where ls.competition_id = p_competition_id
     and ls.status = 'encerrada'
   order by ls.numero desc
   limit 1;

  if v_season is null then
    raise exception 'ORIGEM_NAO_ENCERRADA';
  end if;

  -- (3) Divisao do nivel pedido na temporada consumida.
  select lds.id into v_div
    from public.league_division_seasons lds
   where lds.season_id = v_season
     and lds.nivel = p_nivel;

  if v_div is null then
    raise exception 'NIVEL_INEXISTENTE';
  end if;

  -- Lista ordenada com rank contiguo. Join league_division_entries ->
  -- league_competitors para resolver team_id/rotulo. posicao_final e NOT NULL na
  -- temporada encerrada (gravado por confirmarFluxoTemporada); filtramos por
  -- garantia. competitor_id e o desempate estavel do seeding.
  return query
    select lcomp.team_id,
           lcomp.rotulo,
           lde.posicao_final,
           (row_number() over (
              order by lde.posicao_final asc, lde.competitor_id asc
           ))::integer as rank,
           v_season as origem_season_id
      from public.league_division_entries lde
      join public.league_competitors lcomp on lcomp.id = lde.competitor_id
     where lde.division_season_id = v_div
       and lde.posicao_final is not null
     order by lde.posicao_final asc, lde.competitor_id asc;
end;
$$;

revoke execute on function public.classificacao_final_divisao(uuid, integer) from public, anon;
grant execute on function public.classificacao_final_divisao(uuid, integer) to authenticated;

-- ---------- RPC: classificacao_final_copa (SECURITY DEFINER, leitura gated) ----------
-- Simetrico a classificacao_final_divisao, mas a fonte e cup_entries.posicao_final
-- da edicao 'encerrada' de maior numero (preenchido por encerrarEdicaoCopa — D11).
-- O gate de consentimento usa cup_competitions.is_public/created_by. Em copa nao ha
-- 'nivel' (NIVEL_INEXISTENTE nao se aplica). Retorna a mesma forma TABLE com rank
-- contiguo (campeao=rank 1, vice=rank 2, ...).
create or replace function public.classificacao_final_copa(
  p_cup_id uuid
)
returns table (
  team_id          uuid,
  rotulo           text,
  posicao_final    integer,
  rank             integer,
  origem_season_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_is_public boolean;
  v_dono      uuid;
  v_season    uuid;
begin
  -- (1) Gate de consentimento.
  select c.is_public, c.created_by
    into v_is_public, v_dono
    from public.cup_competitions c
   where c.id = p_cup_id;

  if v_is_public is null then
    raise exception 'ORIGEM_INVISIVEL';
  end if;
  if not (v_is_public or v_dono = v_uid) then
    raise exception 'ORIGEM_INVISIVEL';
  end if;

  -- (2) Edicao encerrada de MAIOR numero.
  select cs.id into v_season
    from public.cup_seasons cs
   where cs.cup_competition_id = p_cup_id
     and cs.status = 'encerrada'
   order by cs.numero desc
   limit 1;

  if v_season is null then
    raise exception 'ORIGEM_NAO_ENCERRADA';
  end if;

  -- Lista ordenada com rank contiguo. posicao_final foi gravada por
  -- encerrarEdicaoCopa (NOT NULL na edicao encerrada). Desempate por id da entry
  -- (estavel; a copa nao tem competitor_id).
  return query
    select ce.team_id,
           ce.rotulo,
           ce.posicao_final,
           (row_number() over (
              order by ce.posicao_final asc, ce.id asc
           ))::integer as rank,
           v_season as origem_season_id
      from public.cup_entries ce
     where ce.cup_season_id = v_season
       and ce.posicao_final is not null
     order by ce.posicao_final asc, ce.id asc;
end;
$$;

revoke execute on function public.classificacao_final_copa(uuid) from public, anon;
grant execute on function public.classificacao_final_copa(uuid) to authenticated;

-- ---------- RPC: montar_copa (SECURITY DEFINER) ----------
-- Cria o UNICO tournaments da edicao e insere os tournament_slots semeados na
-- ORDEM de p_seeded_entry_ids, a partir de cup_entries (por team_id/rotulo, com
-- competitor_id e user_id NULL — participante de copa NAO e league_competitor),
-- e grava cup_entries.slot_id + cup_seasons.tournament_id + status='montada'.
-- Reusa de montar_playoff (schema.sql:2313) APENAS o esqueleto: posse explicita,
-- advisory lock, sentinela/promote-first, criacao do tournaments rascunho, slots
-- na ordem de seeding. DIFERENCAS: autoriza por created_by DIRETO (sem helper de
-- capacidade); namespace 2 do advisory lock; slots sem competitor_id/user_id.
--   Pre-checks: ENTRY_DE_OUTRA_EDICAO, COPA_HETEROGENEA (por_nome da origem
--   consumida vs por_nome da copa), COPA_LOTADA / geometria.
create or replace function public.montar_copa(
  p_cup_season_id    uuid,
  p_seeded_entry_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_cup            uuid;
  v_dono           uuid;
  v_is_public      boolean;
  v_formato        public.cup_format;
  v_por_nome       boolean;
  v_idavolta       boolean;
  v_terceiro       boolean;
  v_qtd_grupos     integer;
  v_classif        integer;
  v_desempate      text;
  v_nome           text;
  v_existing       uuid;
  v_n              integer;
  v_produto        integer;
  v_tournament     uuid;
  v_eid            uuid;
  v_entry          record;
  v_slot           uuid;
  v_heterogenea    boolean;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Copa-mae da edicao + posse + heranca (formato/toggles/geometria/desempate).
  select cc.id, cc.created_by, cc.is_public, cc.formato, cc.por_nome,
         cc.ida_e_volta, cc.terceiro_lugar, cc.qtd_grupos, cc.classificados_por_grupo,
         cc.desempate_criterio, cc.nome
    into v_cup, v_dono, v_is_public, v_formato, v_por_nome,
         v_idavolta, v_terceiro, v_qtd_grupos, v_classif,
         v_desempate, v_nome
    from public.cup_seasons cs
    join public.cup_competitions cc on cc.id = cs.cup_competition_id
   where cs.id = p_cup_season_id;

  if v_cup is null then
    raise exception 'EDICAO_INVALIDA';
  end if;
  -- Posse DIRETA (D9): sem helper de capacidade — copa e gerida so pelo dono.
  if v_dono is distinct from v_uid then
    raise exception 'NAO_DONO';
  end if;

  -- Idempotencia (promote-first): a edicao ja tem torneio (sentinela).
  select tournament_id into v_existing
    from public.cup_seasons where id = p_cup_season_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Serializa por edicao (namespace 2 — reservado a montar_copa): a 2a chamada
  -- espera o commit da 1a e ve a sentinela preenchida.
  perform pg_advisory_xact_lock(hashtextextended(p_cup_season_id::text, 2));
  select tournament_id into v_existing
    from public.cup_seasons where id = p_cup_season_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Cardinalidade do array de seeding.
  v_n := coalesce(array_length(p_seeded_entry_ids, 1), 0);

  -- Pre-check: toda entry semeada pertence a ESTA edicao. Faz num passo so via
  -- contagem (o array nao pode ter id fora da edicao).
  if exists (
    select 1
      from unnest(p_seeded_entry_ids) as t(eid)
     where not exists (
       select 1 from public.cup_entries ce
        where ce.id = t.eid and ce.cup_season_id = p_cup_season_id
     )
  ) then
    raise exception 'ENTRY_DE_OUTRA_EDICAO';
  end if;

  -- Pre-check: homogeneidade por_nome (D6). AUTORIDADE da checagem. Cada entry
  -- registra a identidade efetiva (team_id XOR rotulo) que DEVE ser compativel
  -- com cup_competitions.por_nome: copa por clube exige toda entry com team_id;
  -- copa por nome exige toda entry com rotulo. Isso reflete o por_nome da origem
  -- EFETIVAMENTE consumida (a derivacao so gera team_id de origem por-clube e
  -- rotulo de origem por-nome — origem_season_id rastreia o vinculo). Uma entry
  -- divergente => COPA_HETEROGENEA.
  select exists (
    select 1 from public.cup_entries ce
     where ce.id = any (p_seeded_entry_ids)
       and ( (v_por_nome and ce.team_id is not null)
          or (not v_por_nome and ce.rotulo is not null) )
  ) into v_heterogenea;
  if v_heterogenea then
    raise exception 'COPA_HETEROGENEA';
  end if;

  -- Pre-check de capacidade/geometria por formato (D7), sobre N efetivo (= entries
  -- semeadas; vagas vazias ja sao ausencia de id no array).
  if v_formato = 'mata_mata' then
    if v_n < 2 then
      raise exception 'COPA_SEM_PARTICIPANTES_SUFICIENTES';
    end if;
    if v_n > 32 then
      raise exception 'COPA_LOTADA';
    end if;
  else
    -- grupos_mata_mata: a geometria (qtd_grupos x classificados_por_grupo) e fixa
    -- na copa; o N efetivo deve preencher exatamente os grupos (N = qtd_grupos x
    -- tamanho_do_grupo). Como o tamanho do grupo nao e fixado na copa, exigimos N
    -- divisivel por qtd_grupos, com >= classificados_por_grupo+1 por grupo (ao
    -- menos 2 por grupo) e produto classificados = chave valida (ja garantido pelo
    -- CHECK de cup_competitions). O teto de 32 vale para a chave dos classificados.
    if v_qtd_grupos is null or v_classif is null then
      raise exception 'COPA_GEOMETRIA_INVALIDA';
    end if;
    -- Grupos podem ser DESIGUAIS (+-1), como o motor gerarFaseGruposSemeada/
    -- validarGeometria: NAO exigir N % qtd_grupos = 0. O menor grupo =
    -- floor(N/qtd_grupos) precisa de >= 2 e > classificados_por_grupo.
    if v_n < (v_qtd_grupos * 2) then
      raise exception 'COPA_SEM_PARTICIPANTES_SUFICIENTES';
    end if;
    if (v_n / v_qtd_grupos) < (v_classif + 1) then
      raise exception 'COPA_GEOMETRIA_INVALIDA';
    end if;
    v_produto := v_qtd_grupos * v_classif;
    if v_produto > 32 then
      raise exception 'COPA_LOTADA';
    end if;
  end if;

  -- Cria o tournaments da edicao (rascunho — iniciarEdicaoCopa gera a chave/grupos
  -- e promove). por_nome/desempate/ida_e_volta/terceiro/qtd_grupos/classificados
  -- herdados da copa; created_by = dono; is_public herdado. classificados_por_grupo
  -- so em grupos (NULL em mata_mata).
  insert into public.tournaments
    (titulo, status, created_by, formato, ida_e_volta, terceiro_lugar,
     por_nome, desempate_criterio, is_public, classificados_por_grupo)
  values
    (v_nome, 'rascunho', v_uid, v_formato::text::public.tournament_format,
     coalesce(v_idavolta, false), coalesce(v_terceiro, false),
     v_por_nome, v_desempate, v_is_public,
     case when v_formato = 'grupos_mata_mata' then v_classif else null end)
  returning id into v_tournament;

  -- Promove a sentinela ANTES dos slots (o promote-first protege a corrida).
  update public.cup_seasons
     set tournament_id = v_tournament,
         status        = 'montada',
         montada_em    = now(),
         config_snapshot = jsonb_build_object(
           'formato', v_formato::text,
           'por_nome', v_por_nome,
           'ida_e_volta', coalesce(v_idavolta, false),
           'terceiro_lugar', coalesce(v_terceiro, false),
           'qtd_grupos', v_qtd_grupos,
           'classificados_por_grupo', v_classif,
           'desempate_criterio', v_desempate,
           'n', v_n
         )
   where id = p_cup_season_id;

  -- Slots na ORDEM de p_seeded_entry_ids (= ordem de seeding). competitor_id e
  -- user_id NULL (participante de copa nao tem league_competitor nem tecnico).
  foreach v_eid in array p_seeded_entry_ids loop
    select ce.id, ce.team_id, ce.rotulo
      into v_entry
      from public.cup_entries ce
     where ce.id = v_eid;

    if v_entry.id is null then
      raise exception 'ENTRY_DE_OUTRA_EDICAO';
    end if;

    if v_por_nome then
      -- (a heterogeneidade ja foi barrada acima; rotulo e NOT NULL aqui)
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, null, v_entry.rotulo, null, null)
      returning id into v_slot;
    else
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, v_entry.team_id, null, null, null)
      returning id into v_slot;
    end if;

    update public.cup_entries
       set slot_id = v_slot
     where id = v_eid;
  end loop;

  return v_tournament;
end;
$$;

revoke execute on function public.montar_copa(uuid, uuid[]) from public, anon;
grant execute on function public.montar_copa(uuid, uuid[]) to authenticated;

-- ---------- Trigger anti-ciclo copa->copa (DEFINER) — D10 ----------
-- BEFORE INSERT/UPDATE em cup_qualification_rules de origem 'copa': caminha o
-- grafo de origens-copa a partir de origem_cup_id e verifica se alcanca a
-- propria copa-mae (cup_competition_id) — ciclo transitivo. SECURITY DEFINER
-- para ler regras de copas de OUTROS donos (a varredura nao deve depender de RLS).
-- A recursao usa um WITH RECURSIVE sobre cup_qualification_rules. Profundidade
-- limitada pelo numero de copas (grafo finito; cup_qualification_rules_nao_auto
-- ja barra o auto-loop trivial de 1 no).
create or replace function public.cup_rule_anti_ciclo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alcanca boolean;
begin
  if new.origem_tipo <> 'copa' or new.origem_cup_id is null then
    return new;
  end if;

  -- A copa-mae (new.cup_competition_id) e alcancavel a partir de new.origem_cup_id
  -- seguindo as arestas origem 'copa'? Se sim, fechar essa aresta criaria ciclo.
  with recursive alcancaveis(cup_id) as (
    select new.origem_cup_id
    union
    select r.origem_cup_id
      from public.cup_qualification_rules r
      join alcancaveis a on a.cup_id = r.cup_competition_id
     where r.origem_tipo = 'copa'
       and r.origem_cup_id is not null
  )
  select exists (
    select 1 from alcancaveis where cup_id = new.cup_competition_id
  ) into v_alcanca;

  if v_alcanca then
    raise exception 'CICLO_DE_COPAS';
  end if;

  return new;
end;
$$;

drop trigger if exists cup_qualification_rules_anti_ciclo on public.cup_qualification_rules;
create trigger cup_qualification_rules_anti_ciclo
  before insert or update on public.cup_qualification_rules
  for each row execute function public.cup_rule_anti_ciclo();
revoke execute on function public.cup_rule_anti_ciclo() from anon, authenticated, public;

-- ---------- Trigger guard: nao apagar copa com edicao materializada ----------
-- BEFORE DELETE em cup_competitions: recusa se alguma edicao ja tem tournament_id
-- (materializada — preserva o historico de partidas). A action arquiva em vez de
-- apagar. Espelha o espirito de league_division_seasons.tournament_id RESTRICT.
create or replace function public.cup_block_delete_materializada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cup_seasons cs
     where cs.cup_competition_id = old.id
       and cs.tournament_id is not null
  ) then
    raise exception 'COPA_COM_EDICAO_MATERIALIZADA';
  end if;
  return old;
end;
$$;

drop trigger if exists cup_competitions_block_delete on public.cup_competitions;
create trigger cup_competitions_block_delete
  before delete on public.cup_competitions
  for each row execute function public.cup_block_delete_materializada();
revoke execute on function public.cup_block_delete_materializada() from anon, authenticated, public;

-- ============================================================================
-- RLS das tabelas cup_* (D9)
-- SELECT: cup_competitions usa (is_public or created_by = (select auth.uid())) — status
-- NAO e gate de privacidade. Filhas resolvem via eh_dono_cup(<fk>) OR is_public
-- da copa-mae. INSERT/UPDATE/DELETE: cup_competitions por created_by direto;
-- filhas via eh_dono_cup (dono direto). O tournaments/slots da edicao tem RLS
-- propria (nao recriada aqui). Sem grants de tabela explicitos: o repo usa o
-- default privilege do Supabase (cloud) / `grant all on all tables` do
-- local-grants.sql — a RLS governa o acesso.
-- ============================================================================
alter table public.cup_competitions       enable row level security;
alter table public.cup_qualification_rules enable row level security;
alter table public.cup_seasons             enable row level security;
alter table public.cup_entries             enable row level security;
alter table public.cup_season_exclusions   enable row level security;

-- ----- cup_competitions: publica OU do dono (status nao e gate) -----
drop policy if exists cup_competitions_select_visivel on public.cup_competitions;
create policy cup_competitions_select_visivel on public.cup_competitions
  for select to anon, authenticated
  using (is_public or created_by = (select auth.uid()));

drop policy if exists cup_competitions_insert_owner on public.cup_competitions;
create policy cup_competitions_insert_owner on public.cup_competitions
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists cup_competitions_update_owner on public.cup_competitions;
create policy cup_competitions_update_owner on public.cup_competitions
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists cup_competitions_delete_owner on public.cup_competitions;
create policy cup_competitions_delete_owner on public.cup_competitions
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- ----- cup_qualification_rules: visibilidade/escrita via copa-mae -----
drop policy if exists cup_qualification_rules_select_visivel on public.cup_qualification_rules;
create policy cup_qualification_rules_select_visivel on public.cup_qualification_rules
  for select to anon, authenticated
  using (exists (select 1 from public.cup_competitions c
          where c.id = cup_competition_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_qualification_rules_insert_owner on public.cup_qualification_rules;
create policy cup_qualification_rules_insert_owner on public.cup_qualification_rules
  for insert to authenticated
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_qualification_rules_update_owner on public.cup_qualification_rules;
create policy cup_qualification_rules_update_owner on public.cup_qualification_rules
  for update to authenticated
  using (public.eh_dono_cup(cup_competition_id))
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_qualification_rules_delete_owner on public.cup_qualification_rules;
create policy cup_qualification_rules_delete_owner on public.cup_qualification_rules
  for delete to authenticated
  using (public.eh_dono_cup(cup_competition_id));

-- ----- cup_seasons: visibilidade/escrita via copa-mae -----
drop policy if exists cup_seasons_select_visivel on public.cup_seasons;
create policy cup_seasons_select_visivel on public.cup_seasons
  for select to anon, authenticated
  using (exists (select 1 from public.cup_competitions c
          where c.id = cup_competition_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_seasons_insert_owner on public.cup_seasons;
create policy cup_seasons_insert_owner on public.cup_seasons
  for insert to authenticated
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_seasons_update_owner on public.cup_seasons;
create policy cup_seasons_update_owner on public.cup_seasons
  for update to authenticated
  using (public.eh_dono_cup(cup_competition_id))
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_seasons_delete_owner on public.cup_seasons;
create policy cup_seasons_delete_owner on public.cup_seasons
  for delete to authenticated
  using (public.eh_dono_cup(cup_competition_id));

-- ----- cup_entries: visibilidade/escrita via edicao -> copa-mae -----
drop policy if exists cup_entries_select_visivel on public.cup_entries;
create policy cup_entries_select_visivel on public.cup_entries
  for select to anon, authenticated
  using (exists (select 1 from public.cup_seasons cs
          join public.cup_competitions c on c.id = cs.cup_competition_id
          where cs.id = cup_season_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_entries_insert_owner on public.cup_entries;
create policy cup_entries_insert_owner on public.cup_entries
  for insert to authenticated
  with check (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

drop policy if exists cup_entries_update_owner on public.cup_entries;
create policy cup_entries_update_owner on public.cup_entries
  for update to authenticated
  using (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)))
  with check (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

drop policy if exists cup_entries_delete_owner on public.cup_entries;
create policy cup_entries_delete_owner on public.cup_entries
  for delete to authenticated
  using (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

-- ----- cup_season_exclusions: visibilidade/escrita via edicao -> copa-mae -----
drop policy if exists cup_season_exclusions_select_visivel on public.cup_season_exclusions;
create policy cup_season_exclusions_select_visivel on public.cup_season_exclusions
  for select to anon, authenticated
  using (exists (select 1 from public.cup_seasons cs
          join public.cup_competitions c on c.id = cs.cup_competition_id
          where cs.id = cup_season_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_season_exclusions_insert_owner on public.cup_season_exclusions;
create policy cup_season_exclusions_insert_owner on public.cup_season_exclusions
  for insert to authenticated
  with check (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

drop policy if exists cup_season_exclusions_delete_owner on public.cup_season_exclusions;
create policy cup_season_exclusions_delete_owner on public.cup_season_exclusions
  for delete to authenticated
  using (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

-- =====================================================================
-- Fim — COPAS E CONTINENTAIS
-- =====================================================================
