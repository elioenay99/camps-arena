-- add-liberacao-rodadas — DDL aditiva e idempotente.
-- Gating de visibilidade/jogabilidade por rodada via matches.liberada_em (timestamptz):
--   NULL      = oculta (só o dono do torneio vê);
--   <= now()  = liberada (visível e jogável pelos demais ramos de visibilidade);
--   > now()   = agendada (suportada pelo tipo; sem UI no v1).
-- supabase/schema.sql é a fonte de verdade. Aplicar primeiro no LOCAL (psql), depois em
-- prod via MCP mostrando o SQL. Reaplicável sem erro.

-- 1) Coluna nullable com DEFAULT now() (toda inserção futura nasce liberada, salvo quando
--    a action passar liberada_em = null explicitamente — cadência manual).
alter table public.matches add column if not exists liberada_em timestamptz;
alter table public.matches alter column liberada_em set default now();

comment on column public.matches.liberada_em is
  'Liberacao da partida. NULL = oculta (so o dono ve); <= now() = liberada (visivel/jogavel); > now() = agendada (futuro).';

-- 2) Backfill: tudo que ja existe fica visivel (preserva o comportamento atual).
update public.matches set liberada_em = now() where liberada_em is null;

-- 3) Indice para o filtro liberada_em <= now() por torneio (RLS do nao-dono e listas).
create index if not exists matches_liberada_em_idx
  on public.matches (tournament_id, liberada_em);

-- 4) RLS SELECT: o dono ve TUDO; os demais ramos exigem partida liberada.
drop policy if exists matches_select_visivel on public.matches;
create policy matches_select_visivel on public.matches
  for select to anon, authenticated
  using (
    -- dono do torneio (inclui divisoes de liga, que sao tournaments) ve TUDO
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.created_by = auth.uid()
    )
    or (
      -- demais (publico, participante do torneio, jogador/tecnico da partida)
      -- so veem a partida quando liberada
      liberada_em is not null and liberada_em <= now()
      and (
        exists (
          select 1 from public.tournaments t
          where t.id = tournament_id
            and (t.is_public or public.eh_participante(t.id))
        )
        or auth.uid() = participante_1
        or auth.uid() = participante_2
        or exists (
          select 1 from public.tournament_slots s
          where s.id in (matches.vaga_1, matches.vaga_2)
            and s.user_id = auth.uid()
        )
      )
    )
  );

-- 5) RLS UPDATE do participante/tecnico: so partida LIBERADA. Isso tambem protege a
--    coluna liberada_em contra POST direto (with check rejeita ocultar/forjar). O dono
--    segue por matches_update_tournament_owner (intocado), sem restricao de liberacao.
drop policy if exists matches_update_participant on public.matches;
create policy matches_update_participant on public.matches
  for update to authenticated
  using (
    liberada_em is not null and liberada_em <= now()
    and (
      auth.uid() = participante_1
      or auth.uid() = participante_2
      or exists (
        select 1 from public.tournament_slots s
        where s.id in (matches.vaga_1, matches.vaga_2)
          and s.user_id = auth.uid()
      )
    )
  )
  with check (
    liberada_em is not null and liberada_em <= now()
    and (
      auth.uid() = participante_1
      or auth.uid() = participante_2
      or exists (
        select 1 from public.tournament_slots s
        where s.id in (matches.vaga_1, matches.vaga_2)
          and s.user_id = auth.uid()
      )
    )
  );
