-- ============================================================
-- DDL da change add-artilharia — APLICAR MANUALMENTE no Supabase
-- ============================================================
-- Fonte de verdade: supabase/schema.sql (este arquivo é o recorte exato desta
-- change, para aplicação isolada). O dono aplica no SQL Editor / MCP com
-- autorização. Idempotente. NÃO rodar sem revisar os counts de pré-checagem.
--
-- Escopo: nova tabela public.match_goals (+ RLS + grants), nova coluna
-- public.match_score_proposals.autores (jsonb), e a RPC aprovar_proposta_placar
-- estendida para materializar os autores na aprovação. Tudo aditivo.

-- ------------------------------------------------------------
-- 0. Pré-checagens (rodar ANTES; só prosseguir com os resultados esperados)
-- ------------------------------------------------------------
-- (a) A tabela ainda não existe (espera-se 0):
--   select count(*) from information_schema.tables
--    where table_schema = 'public' and table_name = 'match_goals';
-- (b) A coluna autores ainda não existe (espera-se 0):
--   select count(*) from information_schema.columns
--    where table_schema = 'public' and table_name = 'match_score_proposals'
--      and column_name = 'autores';
-- (c) A RPC alvo existe e será substituída por create or replace (espera-se 1):
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and p.proname = 'aprovar_proposta_placar';

-- ------------------------------------------------------------
-- 1. Coluna autores na proposta (guardada até a aprovação)
-- ------------------------------------------------------------
alter table public.match_score_proposals add column if not exists autores jsonb;

-- ------------------------------------------------------------
-- 2. Tabela match_goals (autores dos gols; competidor resolvido por JOIN)
-- ------------------------------------------------------------
create table if not exists public.match_goals (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  lado       smallint not null check (lado in (1, 2)),
  jogador    text not null,
  gols       int not null default 1 check (gols between 1 and 99),
  created_at timestamptz not null default now(),
  constraint match_goals_jogador_tam
    check (char_length(btrim(jogador)) between 1 and 60)
);

create index if not exists match_goals_match_idx
  on public.match_goals (match_id);
create unique index if not exists match_goals_unico
  on public.match_goals (match_id, lado, lower(btrim(jogador)));

alter table public.match_goals enable row level security;

-- ------------------------------------------------------------
-- 3. RLS de match_goals (leitura = visibilidade da partida; escrita = quem
--    grava placar direto: ARBITRAR competitivo OU participante avulso liberado)
-- ------------------------------------------------------------
drop policy if exists match_goals_select on public.match_goals;
create policy match_goals_select on public.match_goals
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          public.pode_ver_bastidores_torneio(m.tournament_id)
          or (
            m.liberada_em is not null and m.liberada_em <= now()
            and (
              exists (
                select 1 from public.tournaments t
                where t.id = m.tournament_id
                  and (t.is_public or public.eh_participante(t.id))
              )
              or auth.uid() = m.participante_1
              or auth.uid() = m.participante_2
              or exists (
                select 1 from public.tournament_slots s
                where s.id in (m.vaga_1, m.vaga_2) and s.user_id = auth.uid()
              )
            )
          )
        )
    )
  );

drop policy if exists match_goals_insert on public.match_goals;
create policy match_goals_insert on public.match_goals
  for insert to authenticated
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status <> 'encerrada'
        and (
          public.pode_arbitrar_torneio(m.tournament_id)
          or (
            m.liberada_em is not null and m.liberada_em <= now()
            and (auth.uid() = m.participante_1 or auth.uid() = m.participante_2)
          )
        )
    )
  );

drop policy if exists match_goals_delete on public.match_goals;
create policy match_goals_delete on public.match_goals
  for delete to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status <> 'encerrada'
        and (
          public.pode_arbitrar_torneio(m.tournament_id)
          or (
            m.liberada_em is not null and m.liberada_em <= now()
            and (auth.uid() = m.participante_1 or auth.uid() = m.participante_2)
          )
        )
    )
  );

grant select on public.match_goals to anon, authenticated;
grant insert, delete on public.match_goals to authenticated;

-- ------------------------------------------------------------
-- 4. RPC aprovar_proposta_placar — estendida: materializa os autores em
--    match_goals no MESMO passo atômico (agregando por lado + nome normalizado).
--    create or replace (substitui a definição anterior).
-- ------------------------------------------------------------
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

  -- Materializa os autores propostos em match_goals (writer AUTORITATIVO — a policy
  -- de INSERT da proposta NÃO valida `autores`, então todo o endurecimento é aqui):
  --  * Só mexe em match_goals quando `autores` é ARRAY. `null` = "não informado" →
  --    PRESERVA os gols já registrados (alinha com updateMatchScore); `[]` = "limpar
  --    explicitamente" → delete sem reinsert.
  --  * Guardas de tipo (jsonb_typeof) ANTES dos casts: elemento malformado é IGNORADO,
  --    jamais lança 22P02 nem trava a aprovação inteira.
  --  * Agrega por (lado, nome normalizado) — coincide com o índice único e absorve
  --    duplicata forjada (soma em vez de violar o unique).
  --  * Descarta (clampa) o lado cuja SOMA de gols exceda o placar daquele lado, para
  --    autores forjados não inflarem o ranking sem quebrar a aprovação legítima.
  if v_autores is not null and jsonb_typeof(v_autores) = 'array' then
    delete from public.match_goals where match_id = v_match;
    insert into public.match_goals (match_id, lado, jogador, gols)
    select v_match, g.lado, g.jogador, g.gols
      from (
        select x.lado,
               min(x.jogador)                             as jogador,
               sum(x.gols)                                as gols,
               sum(sum(x.gols)) over (partition by x.lado) as total_lado
          from (
            select (e->>'lado')::smallint as lado,
                   btrim(e->>'jogador')   as jogador,
                   (e->>'gols')::int      as gols
              from jsonb_array_elements(v_autores) e
             where jsonb_typeof(e->'lado')    = 'number'
               and jsonb_typeof(e->'gols')    = 'number'
               and jsonb_typeof(e->'jogador') = 'string'
          ) x
         where x.lado in (1, 2)
           and char_length(x.jogador) between 1 and 60
           and x.gols between 1 and 99
         group by x.lado, lower(x.jogador)
      ) g
     where g.total_lado <= case g.lado when 1 then v_p1 else v_p2 end;
  end if;

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
-- 5. Pós-checagens (opcional)
-- ------------------------------------------------------------
--   select count(*) from public.match_goals;              -- nova tabela (0 no início)
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='match_score_proposals'
--      and column_name='autores';                          -- deve retornar 'autores'
