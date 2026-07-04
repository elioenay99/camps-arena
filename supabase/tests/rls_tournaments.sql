-- =====================================================================
-- RLS: tournaments + league_competitions — visibilidade e escrita do dono
-- ---------------------------------------------------------------------
-- Foco no VAZAMENTO DE RASCUNHO (torneio/pirâmide não-pública de A não pode
-- vazar para um terceiro) e no gate de escrita (só o dono/gestor edita).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(13);

-- ----- tournaments_select_visivel -----
-- ALLOW: qualquer um (anon) enxerga um torneio PÚBLICO.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select isnt_empty(
  $$ select 1 from public.tournaments where id = '00000000-0000-0000-0000-0000000000b1' $$,
  'ALLOW: anon enxerga torneio publico'
);

-- DENY (VAZAMENTO): terceiro logado NÃO enxerga o torneio PRIVADO de outro.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty(
  $$ select 1 from public.tournaments where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'DENY: terceiro nao enxerga torneio privado alheio (sem vazamento)'
);

-- ALLOW: o DONO enxerga o próprio torneio privado.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select isnt_empty(
  $$ select 1 from public.tournaments where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'ALLOW: dono enxerga o proprio torneio privado'
);

-- ALLOW: PARTICIPANTE confirmado enxerga o torneio privado (descoberta pós-convite).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select isnt_empty(
  $$ select 1 from public.tournaments where id = '00000000-0000-0000-0000-0000000000b2' $$,
  'ALLOW: participante confirmado enxerga torneio privado'
);

-- ----- tournaments_update_owner / delete_owner -----
-- DENY: terceiro não atualiza torneio alheio (0 linhas afetadas).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty(
  $$ update public.tournaments set titulo = 'Invadido' where id = '00000000-0000-0000-0000-0000000000b1' returning 1 $$,
  'DENY: terceiro nao atualiza torneio alheio'
);

-- ALLOW: o dono atualiza o próprio torneio.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ update public.tournaments set titulo = 'Renomeado' where id = '00000000-0000-0000-0000-0000000000b1' returning 1 $$,
  $$ values (1) $$,
  'ALLOW: dono atualiza o proprio torneio'
);

-- DENY: terceiro não apaga torneio alheio. Mira o torneio PÚBLICO b1 (visível ao
-- terceiro pela SELECT policy) — assim o retorno vazio só pode vir da policy de
-- DELETE (tournaments_delete_owner), não da invisibilidade do SELECT.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty(
  $$ delete from public.tournaments where id = '00000000-0000-0000-0000-0000000000b1' returning 1 $$,
  'DENY: terceiro nao apaga torneio publico alheio (policy de delete, nao SELECT)'
);

-- ----- league_competitions_select_visivel / update_owner -----
-- ALLOW: anon enxerga uma pirâmide ATIVA (pública).
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select isnt_empty(
  $$ select 1 from public.league_competitions where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'ALLOW: anon enxerga piramide ativa (publica)'
);

-- DENY (VAZAMENTO): terceiro não enxerga pirâmide ARQUIVADA de outro.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty(
  $$ select 1 from public.league_competitions where id = '00000000-0000-0000-0000-0000000000e2' $$,
  'DENY: terceiro nao enxerga piramide arquivada alheia'
);

-- DENY: terceiro não atualiza pirâmide alheia.
select is_empty(
  $$ update public.league_competitions set nome = 'Invadida' where id = '00000000-0000-0000-0000-0000000000e1' returning 1 $$,
  'DENY: terceiro nao atualiza piramide alheia'
);

-- ALLOW (pareado): o dono/gestor atualiza a própria pirâmide.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ update public.league_competitions set nome = 'Renomeada' where id = '00000000-0000-0000-0000-0000000000e1' returning 1 $$,
  $$ values (1) $$,
  'ALLOW: dono atualiza a propria piramide'
);

-- ----- league_competitions_delete_owner -----
-- DENY: terceiro não apaga pirâmide alheia (0 linhas pela policy de delete).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty(
  $$ delete from public.league_competitions where id = '00000000-0000-0000-0000-0000000000e1' returning 1 $$,
  'DENY: terceiro nao apaga piramide alheia'
);

-- ALLOW: o dono apaga a própria pirâmide (e2, arquivada, sem temporadas seed).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ delete from public.league_competitions where id = '00000000-0000-0000-0000-0000000000e2' returning 1 $$,
  $$ values (1) $$,
  'ALLOW: dono apaga a propria piramide'
);

select * from finish();
rollback;
