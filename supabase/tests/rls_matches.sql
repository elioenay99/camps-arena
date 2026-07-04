-- =====================================================================
-- RLS: matches — visibilidade e escrita (participante vs. terceiro vs. dono)
-- ---------------------------------------------------------------------
-- matches_select_visivel (partida só aparece quando liberada e o solicitante
-- é público/participante), matches_update_participant (só participante_1/2 de
-- partida LIBERADA escreve direto) e matches_update_tournament_owner (a
-- organização arbitra). O "técnico de vaga" NÃO escreve direto — usa proposta.
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(6);

-- ----- matches_select_visivel -----
-- ALLOW: anon enxerga uma partida LIBERADA de um torneio público.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select isnt_empty(
  $$ select 1 from public.matches where id = '00000000-0000-0000-0000-0000000000d1' $$,
  'ALLOW: anon enxerga partida liberada de torneio publico'
);

-- DENY: terceiro NÃO enxerga uma partida ainda NÃO liberada.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty(
  $$ select 1 from public.matches where id = '00000000-0000-0000-0000-0000000000d2' $$,
  'DENY: terceiro nao enxerga partida nao liberada'
);

-- ----- matches_update_participant -----
-- ALLOW: participante_1 corrige o placar da PRÓPRIA partida liberada.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select results_eq(
  $$ update public.matches set placar_1 = 2 where id = '00000000-0000-0000-0000-0000000000d1' returning 1 $$,
  $$ values (1) $$,
  'ALLOW: participante_1 atualiza a propria partida liberada'
);

-- DENY: terceiro não atualiza a partida (0 linhas afetadas pela RLS).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select is_empty(
  $$ update public.matches set placar_1 = 9 where id = '00000000-0000-0000-0000-0000000000d1' returning 1 $$,
  'DENY: terceiro nao atualiza partida alheia'
);

-- DENY: participante não atualiza uma partida NÃO liberada (gate temporal).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is_empty(
  $$ update public.matches set placar_1 = 3 where id = '00000000-0000-0000-0000-0000000000d2' returning 1 $$,
  'DENY: participante nao atualiza partida nao liberada'
);

-- ----- matches_update_tournament_owner -----
-- ALLOW: o dono do torneio (arbitragem) atualiza a partida.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select results_eq(
  $$ update public.matches set placar_2 = 1 where id = '00000000-0000-0000-0000-0000000000d1' returning 1 $$,
  $$ values (1) $$,
  'ALLOW: dono do torneio arbitra a partida'
);

select * from finish();
rollback;
