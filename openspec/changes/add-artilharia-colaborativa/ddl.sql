-- ============================================================
-- DDL da change add-artilharia-colaborativa — APLICAR MANUALMENTE no Supabase
-- ============================================================
-- Fonte de verdade: supabase/schema.sql (este arquivo é o recorte exato desta
-- change, para aplicação isolada). O dono aplica no SQL Editor / MCP com
-- autorização. Idempotente. NÃO rodar sem revisar os counts de pré-checagem.
--
-- Escopo (tudo aditivo/reprojeção sem perda):
--   1. public.match_goals ganha `contra boolean not null default false`, o
--      `jogador` vira NULLABLE, a CHECK de tamanho vira `match_goals_jogador_valido`
--      (só o gol contra admite nome nulo) e o índice único é reprojetado em DOIS
--      índices PARCIAIS disjuntos por `contra`.
--   2. Nova RPC SECURITY DEFINER `registrar_autores_lado(uuid, smallint, jsonb, text)`
--      (edição colaborativa POR-LADO com MODO explícito append/replace), escopada
--      a UM lado, funciona com a partida encerrada.
--   3. RPC `aprovar_proposta_placar` estendida: preserva `contra` E escreve POR-LADO
--      (só os lados governados pela proposta; o lado oposto colaborativo fica intocado).
--   4. RPC `registrar_conquistas_temporada` estendida: o artilheiro do hall da fama
--      passa a considerar SÓ gols normais (`and g.contra = false`) — sem esse filtro,
--      um gol contra cravaria um artilheiro fictício/nulo na FOTO durável (corrupção
--      IRREVERSÍVEL do hall da fama). É o ÚNICO outro leitor SQL de match_goals.
--   5. Trigger `matches_limpar_gols_wo` (AFTER UPDATE): W.O./0×0 limpa os match_goals
--      da partida ATOMICAMENTE no encerramento (cobre simples/duplo/órfão/aceite).
-- Robustez dos parses (registrar_autores_lado + aprovar_proposta_placar): o RANGE de
-- `gols`/`lado` é checado no NUMERIC ANTES do `::int`, então nem fracionário (`2.5`)
-- nem gigante (`1e20`) aborta a chamada — o item é ignorado (invariante "malformado
-- nunca aborta"), defesa contra POST direto que burla o Zod.

-- ------------------------------------------------------------
-- 0. Pré-checagens (rodar ANTES; só prosseguir com os resultados esperados)
-- ------------------------------------------------------------
-- (a) A tabela match_goals já existe (espera-se 1 — a change add-artilharia já
--     está em PROD):
--   select count(*) from information_schema.tables
--    where table_schema = 'public' and table_name = 'match_goals';
-- (b) A coluna contra ainda não existe (espera-se 0):
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'match_goals'
--      and column_name = 'contra';
-- (c) Não há linha que violaria a nova CHECK (todas têm jogador válido; espera-se 0):
--   select count(*) from public.match_goals
--    where jogador is null or char_length(btrim(jogador)) not between 1 and 60;
-- (d) As RPCs alvo existem e serão substituídas por create or replace (espera-se 1 cada):
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('aprovar_proposta_placar', 'registrar_conquistas_temporada');
--   -- (espera-se 2 no total; 1 de cada)

-- ------------------------------------------------------------
-- 1. match_goals: coluna contra + jogador nullable + CHECK + índices parciais
-- ------------------------------------------------------------
alter table public.match_goals
  add column if not exists contra boolean not null default false;

-- gol contra: conta pro placar do lado, FORA do ranking; nome do adversário opcional.
comment on column public.match_goals.contra is
  'true = gol contra (conta pro placar do lado, fora do ranking; jogador opcional).';

-- jogador deixa de ser obrigatório (o gol contra admite nome nulo). Idempotente.
alter table public.match_goals alter column jogador drop not null;

-- CHECK antiga (jogador NOT NULL + 1..60) → nova (só o gol contra admite nulo;
-- todo nome presente respeita 1..60). O drop torna o par idempotente.
alter table public.match_goals drop constraint if exists match_goals_jogador_tam;
alter table public.match_goals drop constraint if exists match_goals_jogador_valido;
alter table public.match_goals add constraint match_goals_jogador_valido check (
  (jogador is not null and char_length(btrim(jogador)) between 1 and 60)
  or (jogador is null and contra = true)
);

-- Reprojeta o único: parcial p/ gol normal (um autor por partida/lado,
-- case-insensitive) + parcial p/ gol contra (um por partida/lado/nome, com o
-- anônimo colapsando numa linha só via coalesce(...,'')). Predicados disjuntos:
-- normal e contra do mesmo nome coexistem. Migração sem perda — toda linha atual
-- é contra=false e cai no índice de normais.
drop index if exists public.match_goals_unico;
create unique index if not exists match_goals_unico
  on public.match_goals (match_id, lado, lower(btrim(jogador)))
  where contra = false;
create unique index if not exists match_goals_contra_unico
  on public.match_goals (match_id, lado, lower(btrim(coalesce(jogador, ''))))
  where contra = true;

-- ------------------------------------------------------------
-- 2. RPC registrar_autores_lado — edição colaborativa POR-LADO
-- ------------------------------------------------------------
-- Escopada a UM lado (o delete/insert é filtrado por `lado = p_lado`; NUNCA toca
-- o lado oposto). O MODO é EXPLÍCITO (p_modo), NÃO inferido pelo papel — evita o
-- footgun dual-role (quem é árbitro E técnico do mesmo lado, usando o editor
-- append, mandaria o DELTA mas cairia no ramo replace e APAGARIA os gols salvos):
--   * p_modo = 'append'  → base = EXISTENTE; soma o incoming ao já registrado
--                          (nunca reduz/remove). Autoriza: técnico-do-lado OU árbitro.
--   * p_modo = 'replace' → base = VAZIA; o incoming é a lista COMPLETA do lado
--                          (substitui). Autoriza: SOMENTE árbitro.
-- Teto: soma de TODOS os buckets do lado (normais + contra) <= placar[lado].
-- Funciona com a partida ENCERRADA (é o ponto — a policy de INSERT exige
-- status<>'encerrada'; esta RPC definer ignora RLS). NÃO altera status/placar.
create or replace function public.registrar_autores_lado(
  p_match_id uuid,
  p_lado     smallint,
  p_autores  jsonb,
  p_modo     text
)
returns integer               -- total de gols atribuídos ao lado após a operação
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_tid       uuid;
  v_vaga      uuid;
  v_placar    integer;
  v_slot_user uuid;
  v_arbitro   boolean;
  v_tecnico   boolean;
  v_existing  jsonb;
  v_input     jsonb;
  v_merged    jsonb;
  v_total     integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_lado not in (1, 2) then
    raise exception 'LADO_INVALIDO';
  end if;
  if p_modo is null or p_modo not in ('append', 'replace') then
    raise exception 'MODO_INVALIDO';
  end if;

  -- Carrega o match e o lado com lock (serializa escritas concorrentes do lado).
  select m.tournament_id,
         case p_lado when 1 then m.vaga_1 else m.vaga_2 end,
         case p_lado when 1 then m.placar_1 else m.placar_2 end
    into v_tid, v_vaga, v_placar
    from public.matches m
   where m.id = p_match_id
   for update;

  if not found then
    raise exception 'PARTIDA_INVALIDA';
  end if;
  -- Escopo competitivo: o lado precisa de vaga (avulso não passa por aqui).
  if v_vaga is null then
    raise exception 'LADO_SEM_VAGA';
  end if;

  select s.user_id into v_slot_user
    from public.tournament_slots s
   where s.id = v_vaga;

  v_arbitro := public.pode_arbitrar_torneio(v_tid);
  v_tecnico := (v_slot_user is not null and v_slot_user = v_uid);
  -- Autorização por MODO (não por papel): replace é exclusivo do árbitro.
  if p_modo = 'replace' then
    if not v_arbitro then
      raise exception 'NAO_AUTORIZADO';
    end if;
  else -- 'append'
    if not (v_arbitro or v_tecnico) then
      raise exception 'NAO_AUTORIZADO';
    end if;
  end if;

  -- Base do merge: replace parte do VAZIO; append parte do EXISTENTE. Concatenar
  -- existente ∪ incoming e re-agregar por bucket SOMA os gols (append nunca reduz,
  -- pois o existente entra sempre no merge).
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'jogador', g.jogador, 'gols', g.gols, 'contra', g.contra)),
           '[]'::jsonb)
    into v_existing
    from public.match_goals g
   where g.match_id = p_match_id and g.lado = p_lado;

  v_input := case p_modo
               when 'replace' then coalesce(p_autores, '[]'::jsonb)
               else v_existing || coalesce(p_autores, '[]'::jsonb)
             end;
  if jsonb_typeof(v_input) <> 'array' then
    v_input := '[]'::jsonb;
  end if;

  -- Parse endurecido + agregação por (contra, nome normalizado). Item malformado
  -- é IGNORADO (guardas jsonb_typeof antes dos casts; nunca lança 22P02). `gols`:
  -- o RANGE é checado no NUMERIC (arbitrary precision, nunca estoura) ANTES do
  -- `::int` — um `2.5` é truncado por floor; um `1e20` (que passa o num-guard mas
  -- estouraria `::int` com 22003) cai no `else null` e é ignorado, NUNCA aborta a
  -- chamada. O resultado vira jsonb numa variável (re-entrante: sem tabela
  -- temporária que colidiria numa 2ª chamada na mesma transação).
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'jogador', a2.jogador, 'gols', a2.gols, 'contra', a2.contra)), '[]'::jsonb),
    coalesce(sum(a2.gols), 0)
    into v_merged, v_total
    from (
      select a.contra,
             min(a.jogador) as jogador,          -- grafia estável (null p/ anônimo)
             sum(a.gols)    as gols
        from (
          select
            case when jsonb_typeof(e->'contra') = 'boolean'
                 then (e->>'contra')::boolean else false end                 as contra,
            case when jsonb_typeof(e->'jogador') = 'string'
                 then nullif(btrim(e->>'jogador'), '') else null end         as jogador,
            case when jsonb_typeof(e->'gols') = 'number'
                 then case when (e->>'gols')::numeric >= 1
                            and (e->>'gols')::numeric < 100
                           then floor((e->>'gols')::numeric)::int end
                 end                                                         as gols
            from jsonb_array_elements(v_input) e
        ) a
       where a.gols between 1 and 99
         and (
           (a.jogador is not null and char_length(a.jogador) between 1 and 60)
           or (a.jogador is null and a.contra = true)
         )
       group by a.contra, lower(coalesce(a.jogador, ''))
    ) a2;

  if v_total > v_placar then
    raise exception 'TETO_LADO';
  end if;

  -- Delete-then-insert do LADO (nunca do lado oposto).
  delete from public.match_goals
   where match_id = p_match_id and lado = p_lado;

  insert into public.match_goals (match_id, lado, jogador, gols, contra)
  select p_match_id, p_lado,
         nullif(e->>'jogador', ''),   -- json null → null (gol contra anônimo)
         (e->>'gols')::int,
         (e->>'contra')::boolean
    from jsonb_array_elements(v_merged) e;

  return v_total;
end;
$$;

revoke execute on function public.registrar_autores_lado(uuid, smallint, jsonb, text)
  from public, anon;
grant execute on function public.registrar_autores_lado(uuid, smallint, jsonb, text)
  to authenticated;

-- ------------------------------------------------------------
-- 3. RPC aprovar_proposta_placar — estendida p/ preservar `contra`
-- ------------------------------------------------------------
-- create or replace (substitui a definição anterior). Mudança desta change: o
-- parse do jsonb de autores passa a ler `contra`, a agregação agrupa por
-- (lado, contra, nome normalizado), o INSERT grava `contra` e o teto por lado
-- conta normais + contra. Sem isso, um gol contra proposto viraria gol normal e
-- entraria no ranking.
create or replace function public.aprovar_proposta_placar(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_match   uuid;
  v_p1      integer;
  v_p2      integer;
  v_tid     uuid;
  v_autores jsonb;
  v_merged  jsonb;
  v_linhas  integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select sp.match_id, sp.placar_1, sp.placar_2, m.tournament_id, sp.autores
    into v_match, v_p1, v_p2, v_tid, v_autores
    from public.match_score_proposals sp
    join public.matches m on m.id = sp.match_id
   where sp.id = p_proposal_id and sp.status = 'pendente'
   for update of sp;

  if v_match is null then
    raise exception 'PROPOSTA_INVALIDA';
  end if;
  if not public.pode_arbitrar_torneio(v_tid) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  update public.matches
     set placar_1 = v_p1, placar_2 = v_p2, status = 'encerrada'
   where id = v_match and status <> 'encerrada';
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'PARTIDA_INDISPONIVEL';
  end if;

  -- Materializa os autores propostos em match_goals ATOMICAMENTE. Writer
  -- AUTORITATIVO (a policy de INSERT da proposta NÃO valida `autores`):
  --  * null = "não informado" → PRESERVA todos os gols (não apaga nada).
  --  * Escrita POR-LADO: o delete/insert só toca os LADOS GOVERNADOS pela proposta
  --    (os que têm item VÁLIDO dentro do teto). Um lado AUSENTE do payload — ex.:
  --    a artilharia colaborativa do adversário, que não está nesta proposta —
  --    fica INTOCADO. `[]` (nenhum lado governado) não apaga nada.
  --  * Guardas de tipo ANTES dos casts + RANGE checado no NUMERIC antes do `::int`:
  --    `2.5` é truncado; `1e20`/lado gigante forjado cai no `else null` (nunca
  --    lança 22P02 nem 22003). Elemento malformado é IGNORADO, jamais aborta.
  --  * `contra` (add-artilharia-colaborativa): gol contra conta pro placar do lado
  --    mas fica FORA do ranking; o nome é opcional (nullif p/ anônimo).
  --  * Agrega por (lado, contra, nome normalizado) — coincide com os índices
  --    parciais (normal vs contra) e absorve duplicata forjada (soma).
  --  * Um lado cuja SOMA (normais + contra) exceda o placar NÃO é governado (fora
  --    do conjunto) → nem apaga nem infla o lado (defesa contra payload forjado).
  if v_autores is not null and jsonb_typeof(v_autores) = 'array' then
    -- Conjunto final (só lados dentro do teto) numa variável, para derivar os
    -- lados governados (do delete) do MESMO conjunto do insert.
    select coalesce(jsonb_agg(jsonb_build_object(
             'lado', g.lado, 'contra', g.contra, 'jogador', g.jogador, 'gols', g.gols)),
             '[]'::jsonb)
      into v_merged
      from (
        select x.lado,
               x.contra,
               min(x.jogador)                             as jogador,
               sum(x.gols)                                as gols,
               sum(sum(x.gols)) over (partition by x.lado) as total_lado
          from (
            -- CASE aninhado (guard de tipo no WHEN externo; range no interno):
            -- garante que o `::numeric` só roda em número (Postgres não garante
            -- short-circuit de AND num WHEN para evitar erro — nested é à prova).
            select case when jsonb_typeof(e->'lado') = 'number'
                        then case when (e->>'lado')::numeric in (1, 2)
                                  then floor((e->>'lado')::numeric)::int end
                        end                                                 as lado,
                   case when jsonb_typeof(e->'contra') = 'boolean'
                        then (e->>'contra')::boolean else false end         as contra,
                   case when jsonb_typeof(e->'jogador') = 'string'
                        then nullif(btrim(e->>'jogador'), '') else null end  as jogador,
                   case when jsonb_typeof(e->'gols') = 'number'
                        then case when (e->>'gols')::numeric >= 1
                                   and (e->>'gols')::numeric < 100
                                  then floor((e->>'gols')::numeric)::int end
                        end                                                 as gols
              from jsonb_array_elements(v_autores) e
          ) x
         where x.lado in (1, 2)
           and x.gols between 1 and 99
           and (
             (x.jogador is not null and char_length(x.jogador) between 1 and 60)
             or (x.jogador is null and x.contra = true)
           )
         group by x.lado, x.contra, lower(coalesce(x.jogador, ''))
      ) g
     where g.total_lado <= case g.lado when 1 then v_p1 else v_p2 end;

    -- Delete só dos lados GOVERNADOS (presentes no conjunto final); o oposto fica.
    delete from public.match_goals
     where match_id = v_match
       and lado in (select distinct (e->>'lado')::int
                      from jsonb_array_elements(v_merged) e);

    insert into public.match_goals (match_id, lado, jogador, gols, contra)
    select v_match,
           (e->>'lado')::smallint,
           nullif(e->>'jogador', ''),
           (e->>'gols')::int,
           (e->>'contra')::boolean
      from jsonb_array_elements(v_merged) e;
  end if;

  -- Invariante soma(match_goals de um lado) <= placar[lado] SEMPRE (R1): se a
  -- aprovação REDUZ o placar de um lado abaixo da soma já gravada daquele lado E a
  -- proposta NÃO governa esse lado (autores nulos ou de só outro lado), os gols
  -- antigos ficariam ÓRFÃOS acima do novo teto → materializados na FOTO durável do
  -- hall da fama (corrupção irreversível). Poda o lado inteiro. O lado governado já
  -- foi reescrito <= placar (teto), então nunca cai aqui.
  delete from public.match_goals g
   where g.match_id = v_match
     and (case g.lado when 1 then v_p1 else v_p2 end) <
         (select sum(g2.gols) from public.match_goals g2
           where g2.match_id = v_match and g2.lado = g.lado);

  update public.match_score_proposals
     set status = 'aprovada', resolvido_em = now(), resolvido_por = v_uid
   where id = p_proposal_id;

  update public.match_score_proposals
     set status = 'rejeitada', motivo = 'substituída (partida encerrada)',
         resolvido_em = now(), resolvido_por = v_uid
   where match_id = v_match and status = 'pendente' and id <> p_proposal_id;

  return v_match;
end;
$$;

revoke execute on function public.aprovar_proposta_placar(uuid) from public, anon;
grant execute on function public.aprovar_proposta_placar(uuid) to authenticated;

-- ------------------------------------------------------------
-- 4. RPC registrar_conquistas_temporada — artilheiro do hall da fama só de gol NORMAL
-- ------------------------------------------------------------
-- Esta RPC materializa a FOTO DURÁVEL dos troféus de uma temporada (em PROD desde
-- 2026-07-05). O bloco "(c) Artilheiro por divisão" é o ÚNICO outro leitor SQL de
-- match_goals. ÚNICA mudança desta change: o join a match_goals ganha
-- `and g.contra = false` — sem ele, um gol contra (ou o anônimo, `jogador` null)
-- cravaria um artilheiro fictício/nulo na foto, corrompendo o hall da fama de forma
-- IRREVERSÍVEL (a foto não é recomputada). Corpo reproduzido de schema.sql
-- (registrar_conquistas_temporada) — só o join do bloco (c) muda. Idempotente.
create or replace function public.registrar_conquistas_temporada(
  p_season_id uuid,
  p_premios jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_comp   uuid;
  v_nome   text;
  v_numero integer;
  v_rotulo text;
  v_count  integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Posse (dono da liga) + estado (em fechamento ou já encerrada).
  select s.competition_id, c.nome, s.numero
    into v_comp, v_nome, v_numero
    from public.league_seasons s
    join public.league_competitions c on c.id = s.competition_id
   where s.id = p_season_id
     and c.created_by = v_uid
     and s.status in ('em_fluxo', 'encerrada');
  if v_comp is null then
    raise exception 'TEMPORADA_INVALIDA';
  end if;

  v_rotulo := v_nome || ' — Temporada ' || v_numero::text;

  -- Idempotência: reescreve a FOTO inteira desta temporada.
  delete from public.conquistas where escopo = 'temporada' and ref_id = p_season_id;

  -- (a) Campeão (pos 1) / Vice (pos 2) — SÓ em divisão liga de ciclo ANUAL, onde o
  --     campeão É o líder da tabela (posicao_final 1). EXCLUI split
  --     (tournament_id_clausura not null): em apertura_clausura o campeão da
  --     divisão é o VENCEDOR DA GRANDE FINAL, nunca o líder da combinada — vem pelo
  --     payload (bloco d). grupos_mata_mata também é coroado por chave → payload.
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_texto)
  select e.competitor_id,
         case e.posicao_final when 1 then 'campeao' when 2 then 'vice' end,
         'temporada', p_season_id, v_rotulo, ds.nivel, ds.nome
    from public.league_division_entries e
    join public.league_division_seasons ds on ds.id = e.division_season_id
   where ds.season_id = p_season_id
     and ds.formato = 'liga'
     and ds.tournament_id_clausura is null
     and e.posicao_final in (1, 2);

  -- (b) Promovido ('sobe') / Rebaixado ('cai') — de entries.destino (todo formato).
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_texto)
  select e.competitor_id,
         case e.destino when 'sobe' then 'promovido' when 'cai' then 'rebaixado' end,
         'temporada', p_season_id, v_rotulo, ds.nivel, ds.nome
    from public.league_division_entries e
    join public.league_division_seasons ds on ds.id = e.division_season_id
   where ds.season_id = p_season_id
     and e.destino in ('sobe', 'cai');

  -- (c) Artilheiro por divisão — de match_goals (autoritativo). Um por divisão: o
  --     par (competidor, nome normalizado) com mais gols nos torneios da divisão
  --     (apertura + clausura + grande final, quando existirem). SÓ gols NORMAIS
  --     (and g.contra = false) — gol contra nunca vira artilheiro do hall da fama.
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_num, jogador)
  select r.competitor_id, 'artilheiro', 'temporada', p_season_id, v_rotulo,
         r.nivel, r.gols, r.jogador
    from (
      select ds.nivel,
             s.competitor_id,
             min(g.jogador) as jogador,
             sum(g.gols)    as gols,
             row_number() over (
               partition by ds.nivel
               order by sum(g.gols) desc, lower(btrim(min(g.jogador)))
             ) as rn
        from public.league_division_seasons ds
        join public.matches m
          on m.tournament_id in (ds.tournament_id, ds.tournament_id_clausura, ds.final_tournament_id)
        join public.match_goals g on g.match_id = m.id and g.contra = false
        join public.tournament_slots s
          on s.id = case g.lado when 1 then m.vaga_1 else m.vaga_2 end
       where ds.season_id = p_season_id
         and s.competitor_id is not null
       group by ds.nivel, s.competitor_id, lower(btrim(g.jogador))
    ) r
   where r.rn = 1;

  -- (d) Prêmios do servidor (payload): campeão/vice das divisões coroadas por
  --     chave (liga-SPLIT via grande final + grupos_mata_mata) + melhor
  --     ataque/defesa/sequência. Guardas de tipo antes dos casts (num-guard em
  --     nivel/valor_num; UUID-guard em competitor_id) — linha malformada é
  --     IGNORADA, jamais lança 22P02 nem aborta a RPC. `distinct on (competitor_id,
  --     tipo)` DEDUPLICA o payload antes do insert: dois prêmios do mesmo
  --     (competidor, tipo) NÃO podem disparar cardinality_violation (21000) no
  --     `on conflict` — mantém a invariante "malformado é ignorado, nunca aborta".
  --     Só grava para competidor que PERTENCE à temporada.
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_texto, valor_num)
  select y.competitor_id::uuid, y.tipo, 'temporada', p_season_id, v_rotulo,
         y.nivel, y.valor_texto, y.valor_num
    from (
      select distinct on (x.competitor_id, x.tipo)
             x.competitor_id, x.tipo, x.nivel, x.valor_texto, x.valor_num
        from (
          select d->>'competitor_id' as competitor_id,
                 d->>'tipo'          as tipo,
                 case when jsonb_typeof(d->'nivel')     = 'number' then (d->>'nivel')::smallint end   as nivel,
                 case when jsonb_typeof(d->'valor_texto') = 'string' then d->>'valor_texto' end        as valor_texto,
                 case when jsonb_typeof(d->'valor_num') = 'number' then (d->>'valor_num')::int end     as valor_num
            from jsonb_array_elements(coalesce(p_premios, '[]'::jsonb)) d
           where jsonb_typeof(d->'competitor_id') = 'string'
             and d->>'competitor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and jsonb_typeof(d->'tipo') = 'string'
             and (d->>'tipo') in ('campeao', 'vice', 'melhor_ataque', 'melhor_defesa', 'melhor_sequencia')
        ) x
       where exists (
         select 1
           from public.league_division_entries e
           join public.league_division_seasons ds on ds.id = e.division_season_id
          where ds.season_id = p_season_id
            and e.competitor_id = x.competitor_id::uuid
       )
       order by x.competitor_id, x.tipo, x.valor_num desc nulls last
    ) y
  on conflict (escopo, ref_id, competitor_id, tipo) do update
    set valor_texto = excluded.valor_texto,
        valor_num   = excluded.valor_num,
        nivel       = excluded.nivel,
        ref_rotulo  = excluded.ref_rotulo;

  select count(*) into v_count from public.conquistas
   where escopo = 'temporada' and ref_id = p_season_id;
  return v_count;
end;
$$;

revoke execute on function public.registrar_conquistas_temporada(uuid, jsonb) from public, anon;
grant  execute on function public.registrar_conquistas_temporada(uuid, jsonb) to authenticated;

-- ------------------------------------------------------------
-- 5. Trigger: W.O./0×0 limpa os match_goals ATOMICAMENTE no encerramento
-- ------------------------------------------------------------
-- Um W.O. força 0×0 (partida sem gols), mas os match_goals antigos (de um placar
-- anterior, antes de uma reabertura) sobreviveriam e poluiriam ranking/carreira
-- (que não filtram por `wo`). Em vez de 4 deletes app-layer (simples/duplo/órfão/
-- aceite) — 2 statements separados, com janela de corrida contra um
-- aprovar_proposta_placar concorrente e regra espalhada — UM trigger AFTER UPDATE
-- deleta os gols no MESMO passo do UPDATE que grava o W.O. e encerra. É ATÔMICO e
-- cobre TODOS os caminhos de W.O. num lugar só. SECURITY DEFINER: ignora a policy
-- de DELETE de match_goals (que exigiria status<>'encerrada' — e aqui a partida
-- ACABOU de encerrar). Só dispara quando a partida PASSA a `wo=true` +
-- `status='encerrada'` (o encerramento NORMAL, com `wo=false`, PRESERVA os gols —
-- é o cerne da feature). Roda DEPOIS do lock BEFORE `matches_lock_lifecycle` (que
-- só barra W.O. em encerrada→encerrada; um W.O. novo é aberta→encerrada e passa).
create or replace function public.limpar_gols_no_wo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.match_goals where match_id = new.id;
  return null;  -- AFTER trigger: retorno é ignorado
end;
$$;

-- Trigger-only: sem superfície de RPC (revoga EXECUTE de todos os papéis).
revoke execute on function public.limpar_gols_no_wo() from public, anon, authenticated;

drop trigger if exists matches_limpar_gols_wo on public.matches;
create trigger matches_limpar_gols_wo
  after update on public.matches
  for each row
  when (
    new.wo = true and new.status = 'encerrada'
    and (old.wo is distinct from new.wo or old.status is distinct from new.status)
  )
  execute function public.limpar_gols_no_wo();

-- ------------------------------------------------------------
-- 6. Pós-checagens (opcional)
-- ------------------------------------------------------------
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='match_goals'
--      and column_name='contra';                            -- deve retornar 'contra'
--   select indexname from pg_indexes
--    where schemaname='public' and tablename='match_goals'
--      and indexname in ('match_goals_unico','match_goals_contra_unico'); -- 2 linhas
--   select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='registrar_autores_lado';     -- 1
--   -- Artilheiro do hall da fama passa a ignorar gol contra: conferir que o corpo
--   -- de registrar_conquistas_temporada tem `and g.contra = false` no join (c):
--   select pg_get_functiondef(p.oid) ~ 'g\.contra = false'
--     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and p.proname='registrar_conquistas_temporada'; -- t
--   -- Trigger de limpeza de W.O. instalado (espera-se 1):
--   select count(*) from pg_trigger
--    where tgname = 'matches_limpar_gols_wo' and not tgisinternal;
