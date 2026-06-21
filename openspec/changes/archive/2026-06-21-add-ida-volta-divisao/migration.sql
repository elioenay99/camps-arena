-- Migration: add-ida-volta-divisao
-- ida-e-volta POR DIVISÃO na pirâmide de ligas.
-- Idempotente; default false preserva o comportamento atual (turno único).
-- Aplicar em PROD via MCP apply_migration; espelhado em supabase/schema.sql.

-- (1) Coluna nova: turno da divisão de liga + invariante liga-only no banco.
alter table public.league_division_seasons
  add column if not exists ida_e_volta boolean not null default false;
alter table public.league_division_seasons drop constraint if exists league_division_seasons_ida_volta_so_liga;
alter table public.league_division_seasons add  constraint league_division_seasons_ida_volta_so_liga
  check (formato = 'liga' or ida_e_volta = false);

-- (2) montar_temporada: cursor v_div lê ida_e_volta; os 2 inserts de
-- tournaments (Apertura/Clausura) gravam ida_e_volta da divisão.
create or replace function public.montar_temporada(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_competition  uuid;
  v_is_public    boolean;
  v_dono         uuid;
  v_ciclo        text;
  v_div          record;
  v_comp         record;
  v_tournament   uuid;
  v_slot         uuid;
  v_user_id      uuid;
  v_holders_usados uuid[];
  v_vagas        integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- (1) Posse: só o dono da pirâmide monta a temporada dela. Lê também o ciclo
  -- (Fase 5.1): 'apertura_clausura' cria DOIS torneios por divisão.
  select ls.competition_id, lc.created_by, lc.is_public, ls.ciclo
    into v_competition, v_dono, v_is_public, v_ciclo
    from public.league_seasons ls
    join public.league_competitions lc on lc.id = ls.competition_id
   where ls.id = p_season_id;

  if v_competition is null then
    raise exception 'SEASON_INVALIDA';
  end if;
  if not public.pode_gerir_competition(v_competition) then
    raise exception 'NAO_DONO';
  end if;

  -- (1.1) Serializa a montagem por temporada: as sentinelas (tournament_id e, no
  -- split, tournament_id_clausura) só são gravadas após o INSERT do torneio, então
  -- duas chamadas concorrentes (ex.: duas abas) leriam NULL e ambas criariam
  -- torneios+slots duplicados. O advisory lock transacional força a 2ª chamada a
  -- esperar o commit da 1ª e então ver as sentinelas preenchidas (pula os blocos
  -- já feitos). Liberado automaticamente no fim da tx. Cobre os 2 torneios do split.
  perform pg_advisory_xact_lock(hashtextextended(p_season_id::text, 0));

  -- (2) Para cada divisão, criar o(s) torneio(s) que faltam. Fase 5.1 [NIT]: SEM
  -- continue de curto-circuito — Apertura e Clausura são blocos guardados
  -- INDEPENDENTES (cada um com sua sentinela e seu v_holders_usados), para que o
  -- retry de uma montagem parcial complete só o que faltou.
  for v_div in
    select id, nivel, nome, por_nome, desempate, formato, ida_e_volta,
           classificados_por_grupo, tournament_id, tournament_id_clausura
      from public.league_division_seasons
     where season_id = p_season_id
     order by nivel
  loop
    -- Fase 5.1 [MEDIUM]: backstop da decisão "split só liga". Antes de criar nada.
    if v_ciclo = 'apertura_clausura' and v_div.formato <> 'liga' then
      raise exception 'SPLIT_SO_LIGA';
    end if;

    -- ===== BLOCO A — APERTURA (= tournament_id; caminho legado quando anual) =====
    -- (3) Cria o tournament da divisão com o FORMATO da divisão (liga ou
    -- grupos_mata_mata) e o K dos grupos (null em liga; FONTE ÚNICA — Fase 5.2).
    -- is_public herdado da pirâmide. CAST text→enum: league_division_seasons.formato
    -- é text (com CHECK); tournaments.formato é o enum tournament_format (variável
    -- text NÃO auto-coage para enum — sem o cast a RPC inteira falha). No split o
    -- título ganha o sufixo " — Apertura"; anual mantém o nome puro (byte-idêntico).
    if v_div.tournament_id is null then
      insert into public.tournaments
        (titulo, status, created_by, formato, ida_e_volta, classificados_por_grupo,
         por_nome, desempate_criterio, is_public)
      values
        (case when v_ciclo = 'apertura_clausura'
              then v_div.nome || ' — Apertura' else v_div.nome end,
         'rascunho', v_uid,
         v_div.formato::public.tournament_format, v_div.ida_e_volta,
         v_div.classificados_por_grupo,
         v_div.por_nome, v_div.desempate, v_is_public)
      returning id into v_tournament;

      update public.league_division_seasons
         set tournament_id = v_tournament
       where id = v_div.id;

      -- (4)+(5) Insere os slots preenchidos, um por competidor da divisão. Os
      -- competidores são os que já têm league_division_entries para esta
      -- division_season (criadas pela action ANTES da RPC, sem slot_id ainda). A
      -- Apertura LIGA entries.slot_id (o lado canônico do remap slot→competidor).
      v_holders_usados := array[]::uuid[];
      v_vagas := 0;
      for v_comp in
        select lde.id as entry_id, lc.id as competitor_id, lc.team_id, lc.rotulo,
               lc.holder_user_id, lc.competition_id
          from public.league_division_entries lde
          join public.league_competitors lc on lc.id = lde.competitor_id
         where lde.division_season_id = v_div.id
           and lde.slot_id is null
         order by lde.created_at, lc.created_at
      loop
        -- Integridade cross-pirâmide: o competidor da entry tem de pertencer à
        -- MESMA competição da temporada (a cascata de posse não garante; o FK só
        -- exige existência).
        if v_comp.competition_id is distinct from v_competition then
          raise exception 'COMPETIDOR_DE_OUTRA_PIRAMIDE';
        end if;

        if v_div.por_nome then
          if v_comp.rotulo is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, null, v_comp.rotulo, null, v_comp.competitor_id)
          returning id into v_slot;
        else
          if v_comp.team_id is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          if v_comp.holder_user_id is not null
             and not (v_comp.holder_user_id = any (v_holders_usados))
          then
            v_user_id := v_comp.holder_user_id;
            v_holders_usados := array_append(v_holders_usados, v_comp.holder_user_id);
          else
            v_user_id := null;
          end if;

          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, v_comp.team_id, null, v_user_id, v_comp.competitor_id)
          returning id into v_slot;
        end if;

        update public.league_division_entries
           set slot_id = v_slot
         where id = v_comp.entry_id;

        v_vagas := v_vagas + 1;
      end loop;

      -- (6) Uma liga precisa de 2..20 (iniciarTorneio). Falha explícita ANTES de
      -- consolidar a sentinela em estado inválido (o raise reverte a tx toda,
      -- restaurando tournament_id = NULL para re-montagem).
      if v_vagas < 2 then
        raise exception 'DIVISAO_SEM_COMPETIDORES_SUFICIENTES';
      end if;
    end if;

    -- ===== BLOCO B — CLAUSURA (só split; itera TODAS as entries) =====
    -- A Clausura é um segundo torneio independente. Os slots iteram TODAS as
    -- entries da divisão (NÃO filtram slot_id, que já aponta para a Apertura) e
    -- NÃO tocam entries.slot_id (a entry continua ligada só à Apertura — modelo de
    -- entries intocado). O competitor_id do slot da Clausura é o que a combinada
    -- usa para mapear o lado → competidor (slot Clausura → competidor → slot
    -- Apertura). Split é só liga (5.1b) ⇒ formato/K herdados são liga/null.
    if v_ciclo = 'apertura_clausura' and v_div.tournament_id_clausura is null then
      insert into public.tournaments
        (titulo, status, created_by, formato, ida_e_volta, classificados_por_grupo,
         por_nome, desempate_criterio, is_public)
      values
        (v_div.nome || ' — Clausura', 'rascunho', v_uid,
         v_div.formato::public.tournament_format, v_div.ida_e_volta,
         v_div.classificados_por_grupo,
         v_div.por_nome, v_div.desempate, v_is_public)
      returning id into v_tournament;

      update public.league_division_seasons
         set tournament_id_clausura = v_tournament
       where id = v_div.id;

      v_holders_usados := array[]::uuid[];
      v_vagas := 0;
      for v_comp in
        select lc.id as competitor_id, lc.team_id, lc.rotulo,
               lc.holder_user_id, lc.competition_id
          from public.league_division_entries lde
          join public.league_competitors lc on lc.id = lde.competitor_id
         where lde.division_season_id = v_div.id
         order by lde.created_at, lc.created_at
      loop
        if v_comp.competition_id is distinct from v_competition then
          raise exception 'COMPETIDOR_DE_OUTRA_PIRAMIDE';
        end if;

        if v_div.por_nome then
          if v_comp.rotulo is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, null, v_comp.rotulo, null, v_comp.competitor_id);
        else
          if v_comp.team_id is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          if v_comp.holder_user_id is not null
             and not (v_comp.holder_user_id = any (v_holders_usados))
          then
            v_user_id := v_comp.holder_user_id;
            v_holders_usados := array_append(v_holders_usados, v_comp.holder_user_id);
          else
            v_user_id := null;
          end if;
          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, v_comp.team_id, null, v_user_id, v_comp.competitor_id);
        end if;

        v_vagas := v_vagas + 1;
      end loop;

      if v_vagas < 2 then
        raise exception 'DIVISAO_SEM_COMPETIDORES_SUFICIENTES';
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.montar_temporada(uuid) from public, anon;
grant execute on function public.montar_temporada(uuid) to authenticated;

-- (3) RPC nova: editar o turno de uma divisão em rascunho (transacional).
create or replace function public.atualizar_ida_e_volta_divisao(
  p_division_season_id uuid,
  p_ida_e_volta boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition  uuid;
  v_formato      text;
  v_tid          uuid;
  v_tid_clausura uuid;
begin
  -- (1) Carrega a divisão + a competição-mãe (para a checagem de capacidade).
  select ls.competition_id, lds.formato, lds.tournament_id, lds.tournament_id_clausura
    into v_competition, v_formato, v_tid, v_tid_clausura
    from public.league_division_seasons lds
    join public.league_seasons ls on ls.id = lds.season_id
   where lds.id = p_division_season_id;

  if v_competition is null then
    raise exception 'DIVISAO_INVALIDA';
  end if;

  -- (2) Auth por CAPACIDADE (dono OU admin de liga). NÃO created_by.
  if not public.pode_gerir_competition(v_competition) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  -- (3) Só liga: em grupos_mata_mata o turno teria semântica intragrupo (fora de escopo).
  if v_formato <> 'liga' then
    raise exception 'FORMATO_INVALIDO';
  end if;

  -- (4) Só em rascunho: após iniciar, a tabela já foi gerada com o turno.
  if exists (
    select 1 from public.tournaments t
     where t.id in (v_tid, v_tid_clausura)
       and t.status <> 'rascunho'
  ) then
    raise exception 'JA_INICIADA';
  end if;

  -- (5) 'rascunho' não prova ausência de rodadas (recuperação de iniciarTorneio
  -- deixa matches+rascunho). Sonda matches.rodada nos torneios da divisão.
  if exists (
    select 1 from public.matches m
     where m.tournament_id in (v_tid, v_tid_clausura)
       and m.rodada is not null
  ) then
    raise exception 'JA_TEM_RODADAS';
  end if;

  -- (6) Escrita transacional: a divisão (fonte de verdade) + o(s) torneio(s) que
  -- o motor lê. final_tournament_id (mata_mata) NÃO é tocado.
  update public.league_division_seasons
     set ida_e_volta = p_ida_e_volta
   where id = p_division_season_id;

  update public.tournaments
     set ida_e_volta = p_ida_e_volta
   where id in (v_tid, v_tid_clausura);
end;
$$;

revoke execute on function public.atualizar_ida_e_volta_divisao(uuid, boolean) from public, anon;
grant execute on function public.atualizar_ida_e_volta_divisao(uuid, boolean) to authenticated;
