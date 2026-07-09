-- =====================================================================
-- DDL — add-copa-tecnico-heranca (copa herda técnico da divisão de origem)
-- ---------------------------------------------------------------------
-- Aditivo e idempotente. Mostrar ao dono e aplicar em PROD via MCP após aprovação
-- (REGRA 4). `supabase/schema.sql` é a fonte de verdade; este arquivo é o recorte
-- exato aplicável a um banco já provisionado. Rodar dentro de UMA transação.
--
-- Muda:
--   1. cup_entries ganha competitor_id (proveniência de liga) + índice parcial.
--   2. classificacao_final_divisao passa a expor competitor_id — DROP + CREATE
--      (mudança de tipo de retorno impede create-or-replace: 42P13) + RE-EMISSÃO
--      dos grants (o DROP apaga os privilégios; sem re-emitir, o SECURITY DEFINER
--      reverte a EXECUTE público e vaza a classificação da pirâmide ao anon).
--   3. montar_copa herda competitor_id + técnico (holder_user_id) na vaga por-clube
--      de origem-divisão, com dedup v_holders_usados (espelha montar_playoff).
-- NÃO muda RLS, o trigger fn_registrar_coach_tenure nem fn_resolver_season_divisao.
-- =====================================================================
begin;

-- ---------- 1) cup_entries.competitor_id (proveniência de liga) ----------
alter table public.cup_entries
  add column if not exists competitor_id uuid
  references public.league_competitors (id) on delete set null;

create index if not exists cup_entries_competitor_idx
  on public.cup_entries (competitor_id) where competitor_id is not null;

-- ---------- 2) classificacao_final_divisao: + competitor_id (DROP + CREATE) ----------
-- Adicionar competitor_id ao returns table MUDA o tipo de retorno → create-or-
-- replace falha (42P13). DROP sem CASCADE (nenhum objeto do banco referencia a
-- função) + CREATE com o corpo atual + a coluna. Re-emitir os privilégios logo
-- abaixo (o DROP os apagou).
drop function if exists public.classificacao_final_divisao(uuid, integer);
create function public.classificacao_final_divisao(
  p_competition_id uuid,
  p_nivel          integer
)
returns table (
  team_id          uuid,
  rotulo           text,
  posicao_final    integer,
  rank             integer,
  origem_season_id uuid,
  competitor_id    uuid
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
           v_season as origem_season_id,
           lcomp.id
      from public.league_division_entries lde
      join public.league_competitors lcomp on lcomp.id = lde.competitor_id
     where lde.division_season_id = v_div
       and lde.posicao_final is not null
     order by lde.posicao_final asc, lde.competitor_id asc;
end;
$$;

-- RE-EMISSAO obrigatoria apos o DROP (senao volta a EXECUTE publico e vaza ao anon).
revoke execute on function public.classificacao_final_divisao(uuid, integer) from public, anon;
grant execute on function public.classificacao_final_divisao(uuid, integer) to authenticated;

-- classificacao_final_copa NAO muda (origem-copa segue sem competitor_id).

-- ---------- 3) montar_copa: herança de técnico na vaga por-clube ----------
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
  v_user_id        uuid;
  v_holder         uuid;
  v_holders_usados uuid[];
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

  -- Pre-check: toda entry semeada pertence a ESTA edicao.
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

  -- Pre-check: homogeneidade por_nome (D6). copa por clube exige toda entry com
  -- team_id; copa por nome exige toda entry com rotulo. Divergente => COPA_HETEROGENEA.
  select exists (
    select 1 from public.cup_entries ce
     where ce.id = any (p_seeded_entry_ids)
       and ( (v_por_nome and ce.team_id is not null)
          or (not v_por_nome and ce.rotulo is not null) )
  ) into v_heterogenea;
  if v_heterogenea then
    raise exception 'COPA_HETEROGENEA';
  end if;

  -- Pre-check de capacidade/geometria por formato (D7), sobre N efetivo.
  if v_formato = 'mata_mata' then
    if v_n < 2 then
      raise exception 'COPA_SEM_PARTICIPANTES_SUFICIENTES';
    end if;
    if v_n > 32 then
      raise exception 'COPA_LOTADA';
    end if;
  else
    if v_qtd_grupos is null or v_classif is null then
      raise exception 'COPA_GEOMETRIA_INVALIDA';
    end if;
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

  -- Cria o tournaments da edicao (rascunho — iniciarEdicaoCopa gera a chave e promove).
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

  -- Slots na ORDEM de p_seeded_entry_ids. HERANCA de tecnico so na entry POR-CLUBE
  -- com competitor_id (proveniencia de divisao): resolve o holder_user_id e grava
  -- competitor_id + user_id, com dedup v_holders_usados (espelha montar_playoff).
  -- Por-nome/origem-copa/manual => competitor_id/user_id NULOS. O trigger de
  -- coach_tenures decide o resto (tenure de copa, season nula).
  v_holders_usados := array[]::uuid[];
  foreach v_eid in array p_seeded_entry_ids loop
    select ce.id, ce.team_id, ce.rotulo, ce.competitor_id
      into v_entry
      from public.cup_entries ce
     where ce.id = v_eid;

    if v_entry.id is null then
      raise exception 'ENTRY_DE_OUTRA_EDICAO';
    end if;

    if v_por_nome then
      -- Por-nome nunca herda: competitor_id/user_id NULOS mesmo se a entry trouxesse um.
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, null, v_entry.rotulo, null, null)
      returning id into v_slot;
    elsif v_entry.competitor_id is not null then
      -- Entry POR-CLUBE de origem-DIVISAO: herda o competidor + o tecnico-ancora.
      select lc.holder_user_id into v_holder
        from public.league_competitors lc
       where lc.id = v_entry.competitor_id;
      -- Degradacao do user_id na colisao com slots_um_clube_por_tecnico.
      if v_holder is not null
         and not (v_holder = any (v_holders_usados))
      then
        v_user_id := v_holder;
        v_holders_usados := array_append(v_holders_usados, v_holder);
      else
        v_user_id := null;
      end if;
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, v_entry.team_id, null, v_user_id, v_entry.competitor_id)
      returning id into v_slot;
    else
      -- Por-clube sem proveniencia de liga (origem-copa/manual): sem tecnico.
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

commit;

-- =====================================================================
-- PRÉ-CHECAGENS (rodar ANTES; documentam o estado esperado antes de aplicar)
-- =====================================================================
-- A coluna ainda NÃO existe (esperado: 0 linhas):
--   select 1 from information_schema.columns
--    where table_schema='public' and table_name='cup_entries' and column_name='competitor_id';
-- A função ainda retorna 5 colunas (sem competitor_id):
--   select count(*) from information_schema.routines r
--     join information_schema.parameters p on p.specific_name = r.specific_name
--    where r.routine_name='classificacao_final_divisao';  -- OUT params + IN

-- =====================================================================
-- PÓS-CHECAGENS (rodar DEPOIS; tudo deve bater)
-- =====================================================================
-- (1) A coluna existe e é nullable:
--   select data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='cup_entries' and column_name='competitor_id';
--   -- esperado: uuid | YES
--
-- (2) A RPC retorna competitor_id no returns table:
--   select data_type from information_schema.parameters
--    where specific_name in (
--      select specific_name from information_schema.routines
--       where routine_schema='public' and routine_name='classificacao_final_divisao')
--      and parameter_name='competitor_id';
--   -- esperado: uuid
--
-- (3) GRANTS re-emitidos: anon NÃO executa; authenticated executa.
--   select grantee, privilege_type from information_schema.routine_privileges
--    where routine_name='classificacao_final_divisao';
--   -- esperado: authenticated=EXECUTE presente; anon/PUBLIC AUSENTES.
--   -- (defesa: anon não deve conseguir chamar a função — vazaria a pirâmide.)
--
-- (4) montar_copa grava competitor_id numa vaga de origem-divisão: montar uma
--     edição de teste (por-clube, com participante classificado de divisão) e
--     conferir a vaga:
--   select ts.competitor_id, ts.user_id
--     from public.tournament_slots ts
--     join public.cup_entries ce on ce.slot_id = ts.id
--    where ce.competitor_id is not null
--    limit 1;
--   -- esperado: competitor_id preenchido; user_id = holder_user_id (ou NULL se dedup).
--
-- (5) get_advisors (Supabase) sem novo ERROR após aplicar.
