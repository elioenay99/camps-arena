-- ============================================================
-- DDL da change add-conquistas-hall — APLICAR MANUALMENTE no Supabase
-- ============================================================
-- Fonte de verdade: supabase/schema.sql (este arquivo é o recorte exato desta
-- change, para aplicação isolada). O dono aplica no SQL Editor / MCP com
-- autorização (REGRA 4). Idempotente. NÃO rodar sem revisar as pré-checagens.
--
-- Escopo desta change = LIGA (temporada). TUDO aditivo; nenhum dado existente é
-- alterado:
--   1. Tabela public.conquistas (+ índices + RLS SELECT-only + grant de select).
--      O CHECK de `escopo` mantém 'torneio'/'copa' por FORWARD-COMPAT, mas o
--      ÚNICO writer desta change grava escopo='temporada'.
--   2. RPC registrar_conquistas_temporada — writer AUTORITATIVO da temporada.
--
-- Nenhum grant de INSERT/UPDATE/DELETE em public.conquistas: o ÚNICO writer é a
-- RPC SECURITY DEFINER abaixo (que ignora RLS). Isso fecha, no banco, a regra
-- "nenhum troféu é gravado por caminho não-autoritativo".
--
-- FORA DE ESCOPO (diferido — ver proposal.md): premiação de TORNEIO avulso (o
-- avulso não tem identidade persistente: tournament_slots.competitor_id é NULL)
-- e de COPA (cup_entries chaveia por team_id/rotulo, não league_competitors).

-- ------------------------------------------------------------
-- 0. Pré-checagens (rodar ANTES; só prosseguir com os resultados esperados)
-- ------------------------------------------------------------
-- (a) A tabela ainda não existe (espera-se 0):
--   select count(*) from information_schema.tables
--    where table_schema = 'public' and table_name = 'conquistas';
-- (b) As tabelas/colunas de origem existem (espera-se 3):
--   select count(*) from information_schema.tables
--    where table_schema = 'public'
--      and table_name in ('league_division_entries','league_division_seasons','match_goals');
-- (c) match_goals já existe (dependência: change add-artilharia aplicada) (1):
--   select count(*) from information_schema.tables
--    where table_schema='public' and table_name='match_goals';

-- ------------------------------------------------------------
-- 1. Tabela conquistas (um troféu por linha; competidor por join, NÃO denormalizado)
-- ------------------------------------------------------------
create table if not exists public.conquistas (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references public.league_competitors (id) on delete cascade,
  tipo           text not null check (tipo in (
                    'campeao', 'vice', 'artilheiro', 'melhor_ataque',
                    'melhor_defesa', 'melhor_sequencia', 'promovido', 'rebaixado'
                  )),
  -- 'torneio'/'copa' mantidos por forward-compat; esta change grava só 'temporada'.
  escopo         text not null check (escopo in ('temporada', 'torneio', 'copa')),
  -- ref_id é POLIMÓRFICO (season_id | tournament_id | cup_season_id): sem FK, para
  -- o troféu SOBREVIVER à remoção da competição (hall da fama é durável). A
  -- estabilidade de exibição vem de ref_rotulo (materializado no fechamento).
  ref_id         uuid not null,
  ref_rotulo     text not null,     -- ex.: "Brasileirão — Temporada 3"
  nivel          smallint,          -- nível da divisão (liga); null nos demais
  valor_texto    text,              -- "Série A", "47 gols pró", "12 vitórias seguidas"
  valor_num      int,               -- 47, 12 (opcional)
  jogador        text,              -- nome do artilheiro (tipo='artilheiro'); null nos demais
  conquistado_em timestamptz not null default now(),
  constraint conquistas_unica unique (escopo, ref_id, competitor_id, tipo)
);

create index if not exists conquistas_competitor_idx
  on public.conquistas (competitor_id);
create index if not exists conquistas_escopo_ref_idx
  on public.conquistas (escopo, ref_id);

alter table public.conquistas enable row level security;

-- ------------------------------------------------------------
-- 2. RLS de conquistas — SELECT-only (espelha a visibilidade do competidor).
--    SEM policy nem grant de escrita: o único writer é a RPC SECURITY DEFINER.
-- ------------------------------------------------------------
drop policy if exists conquistas_select on public.conquistas;
create policy conquistas_select on public.conquistas
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

grant select on public.conquistas to anon, authenticated;
-- NENHUM grant de insert/update/delete (writer = RPC abaixo). Defesa em
-- profundidade: o Supabase AUTO-CONCEDE insert/update/delete/truncate/references/
-- trigger aos roles de API; a RLS já nega (sem policy de escrita), mas o REVOKE
-- explícito fecha o modelo "zero grant de escrita" no nível do privilégio.
revoke insert, update, delete, truncate, references, trigger
  on public.conquistas from anon, authenticated;

-- ------------------------------------------------------------
-- 3. RPC registrar_conquistas_temporada — writer AUTORITATIVO da temporada.
--
--    Deriva em SQL, de dados JÁ CONGELADOS por confirmarFluxoTemporada (zero
--    confiança no cliente):
--      * Campeão (pos 1) / Vice (pos 2) — SOMENTE em divisão 'liga' de ciclo
--        ANUAL (tournament_id_clausura is null), onde o campeão coincide com a
--        posição final congelada. Em divisão liga SPLIT (apertura_clausura) o
--        campeão é o VENCEDOR DA GRANDE FINAL, e em 'grupos_mata_mata' o campeão
--        é COROADO pelo mata-mata — ambos podem divergir de posicao_final →
--        nesses casos campeão/vice vêm do PAYLOAD autoritativo do servidor
--        (grande final / resultadoDaChave), no bloco (d).
--      * Promovido ('sobe') / Rebaixado ('cai') — de entries.destino (correto em
--        TODO formato).
--      * Artilheiro por divisão — de match_goals.
--    Prêmios do PAYLOAD (p_premios, computados por computeStandings/
--    calcularDestaques/resultadoDaChave no caminho de fechamento):
--      * Campeão/Vice das divisões coroadas por mata-mata + Melhor Ataque/Defesa/
--        Sequência. Guardas de tipo ANTES dos casts + competitor_id validado como
--        UUID e como pertencente à temporada → linha malformada é IGNORADA, nunca
--        aborta a RPC (que é FATAL no caminho de encerramento).
--    Idempotente: delete-then-insert do escopo desta temporada. A RPC aceita a
--    season em 'em_fluxo' (premiação ocorre ANTES do flip final para 'encerrada'
--    — as entries já foram congeladas) OU 'encerrada' (re-execução idempotente).
-- ------------------------------------------------------------
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
  --     (apertura + clausura + grande final, quando existirem).
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
        join public.match_goals g on g.match_id = m.id
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
       -- desempate estável: entre linhas do mesmo (competidor, tipo), mantém a de
       -- maior valor_num (nulls por último).
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
-- 4. Pós-checagens (opcional)
-- ------------------------------------------------------------
--   select count(*) from public.conquistas;                       -- nova tabela (0 no início)
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--    where n.nspname='public' and proname='registrar_conquistas_temporada';  -- 1
--   select count(*) from information_schema.role_table_grants
--    where table_schema='public' and table_name='conquistas'
--      and privilege_type in ('INSERT','UPDATE','DELETE');          -- deve ser 0
