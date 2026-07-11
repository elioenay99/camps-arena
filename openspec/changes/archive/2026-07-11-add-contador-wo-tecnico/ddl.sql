-- =====================================================================
-- DDL — add-contador-wo-tecnico (escada disciplinar de W.O. seguidos por técnico)
-- ---------------------------------------------------------------------
-- Aditivo e idempotente. Mostrar ao dono e aplicar em PROD via MCP após aprovação
-- (REGRA 4). `supabase/schema.sql` é a fonte de verdade; este arquivo é o recorte
-- exato aplicável a um banco já provisionado. Rodar dentro de UMA transação.
--
-- Cria:
--   1. wo_perdoes — baseline de perdão persistido (match_id + user_id), RLS
--      SELECT-only gated por bastidores/gestão, escrita só via RPC DEFINER, REVOKE
--      explícito (Supabase auto-concede escrita a anon/authenticated em tabela nova).
--   2. wo_sofridos_do_tecnico — helper INTERNO (só DEFINER chamam) que lista os
--      wo_loss do técnico na janela meio-aberta das tenures dele no torneio.
--   3. sequencia_disciplina_torneio — RPC de leitura GATED (pode_gerir_torneio) que
--      devolve os eventos disciplinares por técnico (para calcularStreakWo no TS).
--   4. perdoar_wo_tecnico — RPC de escrita GATED que materializa o perdão (idempotente).
--   5. expulsar_tecnico_wo — RPC de escrita GATED (pode_gerir_torneio) que esvazia a
--      vaga (dispara o fecho da tenure); expulsão disciplinar liberada a dono + admins.
-- NÃO toca matches, coach_tenures, standings nem policies existentes.
-- =====================================================================
begin;

-- ---------- 1) wo_perdoes (baseline de perdão) ----------
create table if not exists public.wo_perdoes (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  user_id       uuid not null references public.users (id) on delete cascade,
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  perdoado_por  uuid references public.users (id) on delete set null,
  perdoado_em   timestamptz not null default now(),
  -- Idempotência: um W.O.-derrota é perdoado no máximo uma vez por técnico.
  constraint wo_perdoes_match_user_uk unique (match_id, user_id)
);

create index if not exists wo_perdoes_torneio_user_idx
  on public.wo_perdoes (tournament_id, user_id);

alter table public.wo_perdoes enable row level security;

-- RLS SELECT-only (ESPELHA coach_tenures): sem policy nem grant de escrita — o único
-- writer é perdoar_wo_tecnico (SECURITY DEFINER). Visível a quem gere/vê bastidores
-- do torneio.
drop policy if exists wo_perdoes_select on public.wo_perdoes;
create policy wo_perdoes_select on public.wo_perdoes
  for select to anon, authenticated
  using (
    public.pode_ver_bastidores_torneio(tournament_id)
    or public.pode_gerir_torneio(tournament_id)
  );

grant select on public.wo_perdoes to authenticated;
-- Defesa em profundidade (lição conquistas/coach_tenures): o Supabase AUTO-CONCEDE
-- GRANT ALL (inclui SELECT + escrita) aos roles de API em tabela nova → REVOKE
-- explícito fecha o modelo "zero grant de escrita".
revoke insert, update, delete, truncate, references, trigger
  on public.wo_perdoes from anon, authenticated;
-- anon nunca lê perdões (a policy lista `to anon` só por simetria): revogar o
-- auto-grant de SELECT faz o anon falhar-fechado (42501) em vez de depender só da
-- policy. Espelha o padrão de `users` (schema.sql:1294).
revoke select on public.wo_perdoes from anon;

-- ---------- 2) wo_sofridos_do_tecnico (helper INTERNO) ----------
-- Distinct dos match_id de W.O.-derrota do técnico em TODAS as tenures dele no
-- torneio (janela meio-aberta, igual a partidaNaJanela). É o conjunto que o perdão
-- materializa. INTERNO: só as DEFINER que precisam (perdoar_wo_tecnico) chamam.
create or replace function public.wo_sofridos_do_tecnico(
  p_tournament_id uuid,
  p_user_id       uuid
)
returns table (match_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.id
    from public.coach_tenures ct
    join public.matches m
      on m.tournament_id = ct.tournament_id
     and (m.vaga_1 = ct.slot_id or m.vaga_2 = ct.slot_id)
   where ct.tournament_id = p_tournament_id
     and ct.user_id = p_user_id
     and m.status = 'encerrada'
     and m.wo = true
     and (
       m.wo_duplo = true
       or (m.wo_duplo = false and m.wo_vencedor is distinct from ct.slot_id)
     )
     and (ct.rodada_inicio is null or m.rodada >= ct.rodada_inicio)
     and (ct.rodada_fim is null or m.rodada < ct.rodada_fim);
$$;

revoke all on function public.wo_sofridos_do_tecnico(uuid, uuid)
  from public, anon, authenticated;

-- ---------- 3) sequencia_disciplina_torneio (RPC de leitura GATED) ----------
-- Para cada técnico com tenure ABERTA no torneio, os eventos disciplinares (partidas
-- encerradas da janela aberta) classificados em wo_loss/wo_win/jogou + perdoado, com
-- o slot da tenure (para o botão Expulsar). O fetcher agrupa por user_id e chama
-- calcularStreakWo. Gate INTERNO (DEFINER bypassa RLS).
create or replace function public.sequencia_disciplina_torneio(
  p_tournament_id uuid
)
returns table (
  user_id   uuid,
  slot_id   uuid,
  rodada    integer,
  tipo      text,
  perdoado  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NAO_AUTENTICADO';   -- simetria com perdoar/expulsar
  end if;
  if not public.pode_gerir_torneio(p_tournament_id) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  return query
    select
      ct.user_id,
      ct.slot_id,
      m.rodada,
      case
        when m.wo = true and (
               m.wo_duplo = true
               or (m.wo_duplo = false and m.wo_vencedor is distinct from ct.slot_id)
             ) then 'wo_loss'
        when m.wo = true and m.wo_duplo = false and m.wo_vencedor = ct.slot_id
             then 'wo_win'
        else 'jogou'
      end as tipo,
      exists (
        select 1
          from public.wo_perdoes wp
         where wp.match_id = m.id
           and wp.user_id = ct.user_id
      ) as perdoado
    from public.coach_tenures ct
    join public.matches m
      on m.tournament_id = ct.tournament_id
     and (m.vaga_1 = ct.slot_id or m.vaga_2 = ct.slot_id)
   where ct.tournament_id = p_tournament_id
     and ct.encerrada_em is null          -- tenure ABERTA
     and ct.user_id is not null           -- técnico com conta
     and m.status = 'encerrada'
     and (ct.rodada_inicio is null or m.rodada >= ct.rodada_inicio)
     and (ct.rodada_fim is null or m.rodada < ct.rodada_fim)  -- paridade com partidaNaJanela
   -- ORDEM TOTAL (o fold calcularStreakWo é posicional): num ida-e-volta as duas
   -- pernas compartilham rodada+posicao, então rodada só não desempata → posicao,
   -- perna e por fim m.id garantem determinismo absoluto (streak estável).
   order by ct.user_id,
            m.rodada  asc nulls last,
            m.posicao asc nulls last,
            m.perna   asc nulls first,   -- perna 1 antes da 2
            m.id      asc;               -- desempate absoluto
end;
$$;

revoke all on function public.sequencia_disciplina_torneio(uuid)
  from public, anon;
grant execute on function public.sequencia_disciplina_torneio(uuid)
  to authenticated;

-- ---------- 4) perdoar_wo_tecnico (RPC de escrita GATED) ----------
-- Materializa o perdão: insere todos os wo_loss atuais do técnico em wo_perdoes,
-- idempotente (on conflict do nothing). Retorna quantos perdões NOVOS criou. NÃO
-- toca matches/standings.
create or replace function public.perdoar_wo_tecnico(
  p_tournament_id uuid,
  p_user_id       uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'NAO_AUTENTICADO';
  end if;
  if not public.pode_gerir_torneio(p_tournament_id) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  insert into public.wo_perdoes (match_id, user_id, tournament_id, perdoado_por)
  select w.match_id, p_user_id, p_tournament_id, v_uid
    from public.wo_sofridos_do_tecnico(p_tournament_id, p_user_id) w
  on conflict (match_id, user_id) do nothing;

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.perdoar_wo_tecnico(uuid, uuid)
  from public, anon;
grant execute on function public.perdoar_wo_tecnico(uuid, uuid)
  to authenticated;

-- ---------- 5) expulsar_tecnico_wo (RPC de escrita GATED) ----------
-- Expulsão DISCIPLINAR liberada a quem pode_gerir_torneio (dono + admins de
-- torneio/liga), diferente da expulsarTecnico dono-only original (que fica INTACTA
-- para os outros fluxos). Esvazia a vaga; o AFTER UPDATE OF user_id
-- (fn_registrar_coach_tenure) FECHA a tenure → o próximo técnico começa fresh
-- (streak 0, pois a sequência lê só tenures ABERTAS). DEFINER roda como owner e
-- ignora a RLS de tournament_slots → o gate pode_gerir_torneio é OBRIGATÓRIO.
create or replace function public.expulsar_tecnico_wo(
  p_tournament_id uuid,
  p_slot_id       uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then
    raise exception 'NAO_AUTENTICADO';
  end if;
  if not public.pode_gerir_torneio(p_tournament_id) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  update public.tournament_slots
     set user_id = null
   where id = p_slot_id
     and tournament_id = p_tournament_id   -- amarra o slot ao torneio (anti-tamper)
     and user_id is not null;

  get diagnostics v_n = row_count;
  return v_n;                              -- 1 = expulsou; 0 = vaga já vazia
end;
$$;

revoke all on function public.expulsar_tecnico_wo(uuid, uuid)
  from public, anon;
grant execute on function public.expulsar_tecnico_wo(uuid, uuid)
  to authenticated;

commit;

-- =====================================================================
-- PRÉ/PÓS-CHECAGENS (rodar fora da transação, como owner/via MCP)
-- ---------------------------------------------------------------------
-- 1) Tabela existe e RLS ativa:
--    select relrowsecurity from pg_class where oid = 'public.wo_perdoes'::regclass;  -- t
-- 2) anon NÃO executa a sequência (deve levantar erro de permissão):
--    set local role anon; select public.sequencia_disciplina_torneio('<tid>');       -- 42501
-- 3) anon NÃO lê wo_perdoes (revoke select + policy):
--    set local role anon; select * from public.wo_perdoes;                            -- 42501
-- 4) authenticated não-admin → NAO_AUTORIZADO (via gate interno):
--    (exercitado no pgTAP rls_wo_disciplina.sql sob jwt claims)
-- 5) perdão idempotente: 2 chamadas seguidas → 2ª retorna 0.
-- 6) expulsar_tecnico_wo: gestor → 1 (esvazia + fecha tenure); 2ª chamada → 0.
-- 7) helper interno não executável por authenticated:
--    set local role authenticated; select public.wo_sofridos_do_tecnico('<tid>','<uid>'); -- 42501
-- 8) get_advisors: sem novo ERROR (RLS/search_path).
-- =====================================================================
