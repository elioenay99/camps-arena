-- ============================================================
-- DDL da change add-tecnicos-historico — APLICAR MANUALMENTE no Supabase
-- ============================================================
-- Fonte de verdade: supabase/schema.sql (este arquivo é o recorte exato desta
-- change, para aplicação isolada). O dono aplica no SQL Editor / MCP com
-- autorização (REGRA 4). Idempotente. NÃO rodar sem revisar as pré-checagens.
--
-- Escopo desta change = LIGA (competidor persistente). TUDO aditivo; nenhum dado
-- existente é alterado. Compõe-se de:
--   1. Tabela public.coach_tenures (histórico de posse de vaga por técnico) +
--      índices (incl. único parcial de tenure vigente) + RLS SELECT-only + grant
--      de select + REVOKE explícito de escrita.
--   2. Helper public.fn_rodada_corrente(uuid) — rodada ativa do torneio (espelha
--      getTournamentClassificacao).
--   3. Helper public.fn_resolver_season_divisao(uuid) — resolve (season_id,
--      division_season_id) do torneio da divisão (anual + Apertura/Clausura).
--   4. Função de trigger public.fn_registrar_coach_tenure() + o trigger
--      tournament_slots_registrar_coach_tenure (AFTER INSERT OR UPDATE OF user_id):
--      o WRITER ÚNICO das tenures. Nenhuma server action grava tenure.
--   5. Backfill único a partir das tournament_slots ATUAIS com competitor_id → 1
--      tenure VIGENTE por vaga (o técnico FINAL de cada temporada).
--
-- Nenhum grant de INSERT/UPDATE/DELETE em public.coach_tenures: o ÚNICO writer é a
-- função de trigger SECURITY DEFINER abaixo (que ignora RLS). Igual conquistas.
--
-- LIMITAÇÃO DOCUMENTADA (decisão 6 do dono): o trigger é forward-only. Temporadas
-- já encerradas ANTES desta change não têm o histórico de trocas — o backfill
-- registra APENAS o técnico FINAL de cada vaga (1 tenure vigente), sem as
-- passagens intermediárias, que nunca foram gravadas.
--
-- FORA DE ESCOPO: torneio avulso (tournament_slots.competitor_id IS NULL — sem
-- âncora de competidor/temporada nem visibilidade via league_competitors). O
-- gate `competitor_id is not null` no trigger e no backfill os deixa de fora.

-- ------------------------------------------------------------
-- 0. Pré-checagens (rodar ANTES; só prosseguir com os resultados esperados)
-- ------------------------------------------------------------
-- (a) A tabela ainda não existe (espera-se 0):
--   select count(*) from information_schema.tables
--    where table_schema = 'public' and table_name = 'coach_tenures';
-- (b) As tabelas de origem / alvo de FK existem (espera-se 7):
--   select count(*) from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('tournament_slots','league_competitors','league_seasons',
--                         'league_division_seasons','matches','tournaments','users');
-- (c) O helper de bastidores existe (dependência da RLS) (espera-se 1):
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'pode_ver_bastidores_competition';

-- ------------------------------------------------------------
-- 1. Tabela coach_tenures (uma linha por PASSAGEM de técnico numa vaga)
-- ------------------------------------------------------------
-- Técnico = USUÁRIO GLOBAL (user_id) OU rótulo local (nome, vaga por-nome). A
-- VIGÊNCIA é dada por encerrada_em IS NULL (marcador autoritativo, sempre setado no
-- fechamento) — NUNCA por rodada_fim (que é valor de EXIBIÇÃO). Nome/identidade do
-- técnico resolvem por JOIN a users (não denormalizados). season_id/division_season_id
-- são best-effort (null em torneios de playoff/barragem/final que não portam o standing).
create table if not exists public.coach_tenures (
  id                 uuid primary key default gen_random_uuid(),
  slot_id            uuid not null references public.tournament_slots (id) on delete cascade,
  competitor_id      uuid not null references public.league_competitors (id) on delete cascade,
  tournament_id      uuid not null references public.tournaments (id) on delete cascade,
  season_id          uuid references public.league_seasons (id) on delete cascade,
  division_season_id uuid references public.league_division_seasons (id) on delete cascade,
  -- Técnico é conta global (user_id) OU rótulo local sem conta (nome). on delete
  -- set null preserva o histórico ao apagar a conta.
  user_id            uuid references public.users (id) on delete set null,
  nome               text,
  rodada_inicio      smallint,        -- null = desde o início da temporada
  rodada_fim         smallint,        -- rodada de fechamento (exibição; não é vigência)
  aberta_em          timestamptz not null default now(),
  encerrada_em       timestamptz,     -- NULL = tenure VIGENTE (marcador autoritativo)
  -- "NO MÁXIMO um preenchido": proíbe só o caso ambos-preenchidos. O estado
  -- (user_id NULL, nome NULL) = técnico REMOVIDO/ANONIMIZADO — surge APENAS por
  -- cascade de exclusão de conta (users on delete cascade de auth.users → user_id
  -- on delete set null). Sem esse relaxamento, apagar uma conta com tenure violaria
  -- o CHECK e abortaria a exclusão (técnico indeletável). O trigger e o backfill
  -- SEMPRE gravam exatamente UM preenchido.
  constraint coach_tenure_user_ou_nome check (user_id is null or nome is null)
);

-- Uma única tenure VIGENTE por vaga+usuário (serializa reabertura acidental; a
-- defesa extra contra tenure-vigente duplicada por vaga). O sentinela cobre a
-- vaga por-nome (user_id NULL).
create unique index if not exists coach_tenures_slot_aberta_uk
  on public.coach_tenures (slot_id, coalesce(user_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where encerrada_em is null;
create index if not exists coach_tenures_user_idx
  on public.coach_tenures (user_id) where user_id is not null;
create index if not exists coach_tenures_competitor_idx
  on public.coach_tenures (competitor_id);
create index if not exists coach_tenures_season_idx
  on public.coach_tenures (season_id) where season_id is not null;

alter table public.coach_tenures enable row level security;

-- ------------------------------------------------------------
-- 2. RLS de coach_tenures — SELECT-only (ESPELHA conquistas_select via
--    league_competitors). SEM policy nem grant de escrita: o único writer é a
--    função de trigger SECURITY DEFINER.
-- ------------------------------------------------------------
drop policy if exists coach_tenures_select on public.coach_tenures;
create policy coach_tenures_select on public.coach_tenures
  for select to anon, authenticated
  using (
    exists (
      select 1
        from public.league_competitors lc
        join public.league_competitions c on c.id = lc.competition_id
       where lc.id = competitor_id
         and (
           c.status = 'ativa'
           or c.created_by = auth.uid()
           or public.pode_ver_bastidores_competition(c.id)
         )
    )
  );

grant select on public.coach_tenures to anon, authenticated;
-- Defesa em profundidade (lição conquistas): o Supabase AUTO-CONCEDE insert/
-- update/delete/truncate/references/trigger aos roles de API; a RLS já nega (sem
-- policy de escrita), mas o REVOKE explícito fecha o modelo "zero grant de
-- escrita" no nível do privilégio.
revoke insert, update, delete, truncate, references, trigger
  on public.coach_tenures from anon, authenticated;

-- ------------------------------------------------------------
-- 3. Helper: rodada corrente do torneio (espelha getTournamentClassificacao:736).
--    Rodada ativa = menor `rodada` entre as partidas NÃO encerradas. Interno (só
--    o trigger o chama); EXECUTE revogado de todos os papéis de API.
-- ------------------------------------------------------------
create or replace function public.fn_rodada_corrente(p_tournament_id uuid)
returns smallint
language sql
stable
security definer
set search_path = ''
as $$
  select min(rodada)::smallint
    from public.matches
   where tournament_id = p_tournament_id
     and status <> 'encerrada'
     and rodada is not null;
$$;

revoke execute on function public.fn_rodada_corrente(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. Helper: resolve (season_id, division_season_id) do torneio da divisão.
--    Cobre ciclo ANUAL (tournament_id) + Apertura/Clausura (tournament_id_clausura),
--    que são os PORTADORES do standing/troféu. Torneios de playoff/barragem/final
--    não casam → (null, null) (stints transitórios sem season âncora). Interno.
-- ------------------------------------------------------------
create or replace function public.fn_resolver_season_divisao(p_tournament_id uuid)
returns table (season_id uuid, division_season_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select ds.season_id, ds.id
    from public.league_division_seasons ds
   where p_tournament_id in (ds.tournament_id, ds.tournament_id_clausura)
   limit 1;
$$;

revoke execute on function public.fn_resolver_season_divisao(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 5. Função de trigger — WRITER ÚNICO das tenures. SECURITY DEFINER,
--    search_path='', SEM `raise`: um erro aqui reverteria a atribuição do técnico
--    (aceitar_convite_vaga / expulsar / materialização). A corretude vem de
--    testes, não de swallow. Gate de escopo: só slots de LIGA (competitor_id).
--
--    AFTER INSERT (materialização — torneio rascunho, sem matches):
--      * user_id NOT NULL (técnico propagado) → abre tenure desde o início
--        (rodada_inicio NULL);
--      * vaga por NOME (team_id NULL + rotulo) → abre tenure de rótulo local;
--      * clube vazio (user_id NULL, com team_id) → nada.
--    AFTER UPDATE OF user_id (OLD DISTINCT NEW):
--      * v_rodada := fn_rodada_corrente(NEW.tournament_id);
--      * OLD.user_id NOT NULL → fecha a tenure aberta daquela vaga+user;
--      * NEW.user_id NOT NULL → abre nova tenure (rodada_inicio = v_rodada).
-- ------------------------------------------------------------
create or replace function public.fn_registrar_coach_tenure()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rodada    smallint;
  v_season    uuid;
  v_divseason uuid;
begin
  -- Gate de escopo: só LIGA (competitor persistente). Avulso fica de fora.
  if new.competitor_id is null then
    return null;
  end if;

  if tg_op = 'INSERT' then
    select r.season_id, r.division_season_id
      into v_season, v_divseason
      from public.fn_resolver_season_divisao(new.tournament_id) r;

    if new.user_id is not null then
      insert into public.coach_tenures
        (slot_id, competitor_id, tournament_id, season_id, division_season_id,
         user_id, rodada_inicio)
      values
        (new.id, new.competitor_id, new.tournament_id, v_season, v_divseason,
         new.user_id, null);
    elsif new.team_id is null and new.rotulo is not null then
      insert into public.coach_tenures
        (slot_id, competitor_id, tournament_id, season_id, division_season_id,
         nome, rodada_inicio)
      values
        (new.id, new.competitor_id, new.tournament_id, v_season, v_divseason,
         new.rotulo, null);
    end if;
    -- clube vazio → nada (técnico entra depois via convite).
    return null;
  end if;

  -- UPDATE OF user_id: só age quando o técnico realmente muda.
  if old.user_id is not distinct from new.user_id then
    return null;
  end if;

  -- Rodada EFETIVA da troca: a rodada ativa; ou, se todas já estão encerradas
  -- (janela fim-de-temporada, antes de status='encerrado'), a ÚLTIMA rodada — para
  -- rodada_fim/rodada_inicio nunca ficarem NULL num torneio com partidas. Convenção
  -- de fronteira (spec + impl IDÊNTICOS): fecha o que saiu EM v_rodada e abre o que
  -- entrou EM v_rodada (a rodada da troca é a fronteira compartilhada).
  v_rodada := public.fn_rodada_corrente(new.tournament_id);
  if v_rodada is null then
    select max(m.rodada)::smallint into v_rodada
      from public.matches m
     where m.tournament_id = new.tournament_id and m.rodada is not null;
  end if;

  if old.user_id is not null then
    update public.coach_tenures
       set rodada_fim = v_rodada, encerrada_em = now()
     where slot_id = new.id
       and user_id = old.user_id
       and encerrada_em is null;
  end if;

  if new.user_id is not null then
    select r.season_id, r.division_season_id
      into v_season, v_divseason
      from public.fn_resolver_season_divisao(new.tournament_id) r;
    insert into public.coach_tenures
      (slot_id, competitor_id, tournament_id, season_id, division_season_id,
       user_id, rodada_inicio, aberta_em)
    values
      (new.id, new.competitor_id, new.tournament_id, v_season, v_divseason,
       new.user_id, v_rodada, now());
  end if;

  return null;
end;
$$;

revoke execute on function public.fn_registrar_coach_tenure() from public, anon, authenticated;

-- Engate: AFTER INSERT OR UPDATE OF user_id. Coexiste com
-- tournament_slots_lock_relations (BEFORE, não toca user_id).
drop trigger if exists tournament_slots_registrar_coach_tenure on public.tournament_slots;
create trigger tournament_slots_registrar_coach_tenure
  after insert or update of user_id on public.tournament_slots
  for each row execute function public.fn_registrar_coach_tenure();

-- ------------------------------------------------------------
-- 6. Backfill (executa UMA vez; idempotente por NOT EXISTS). Do técnico ATUAL de
--    cada vaga de liga → 1 tenure VIGENTE (rodada_inicio/rodada_fim NULL). Cobre
--    tanto conta (user_id) quanto rótulo local (vaga por-nome). Temporadas
--    encerradas ganham SÓ o técnico FINAL (sem trocas históricas — decisão 6).
-- ------------------------------------------------------------
insert into public.coach_tenures
  (slot_id, competitor_id, tournament_id, season_id, division_season_id,
   user_id, nome, rodada_inicio)
select ts.id, ts.competitor_id, ts.tournament_id,
       r.season_id, r.division_season_id,
       ts.user_id,
       case when ts.user_id is null and ts.team_id is null then ts.rotulo end,
       null
  from public.tournament_slots ts
  left join lateral public.fn_resolver_season_divisao(ts.tournament_id) r on true
 where ts.competitor_id is not null
   and (
        ts.user_id is not null
        or (ts.team_id is null and ts.rotulo is not null)
   )
   and not exists (
     select 1 from public.coach_tenures ct
      where ct.slot_id = ts.id and ct.encerrada_em is null
   );

-- ------------------------------------------------------------
-- 7. Pós-checagens (opcional)
-- ------------------------------------------------------------
--   select count(*) from public.coach_tenures;                     -- backfill
--   select count(*) from public.coach_tenures where encerrada_em is null; -- vigentes
--   select tgname from pg_trigger
--    where tgrelid = 'public.tournament_slots'::regclass
--      and tgname = 'tournament_slots_registrar_coach_tenure';       -- 1
--   select count(*) from information_schema.role_table_grants
--    where table_schema='public' and table_name='coach_tenures'
--      and privilege_type in ('INSERT','UPDATE','DELETE');           -- deve ser 0
