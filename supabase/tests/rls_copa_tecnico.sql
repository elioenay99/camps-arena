-- =====================================================================
-- Integração: herança de técnico na COPA (add-copa-tecnico-heranca)
-- ---------------------------------------------------------------------
-- Exercita, num Postgres REAL, o trilho que faz a copa entrar na carreira do
-- técnico — o que os testes herméticos (vi.mock) NÃO alcançam:
--   (a) classificacao_final_divisao expõe competitor_id;
--   (b) montar_copa grava competitor_id + user_id na vaga POR-CLUBE de origem-
--       divisão e NULOS na vaga sem competitor_id (manual) e na copa POR-NOME;
--   (c) dedup de técnico: 2º clube do mesmo técnico → vaga com user_id NULL
--       (mantendo competitor_id), respeitando slots_um_clube_por_tecnico;
--   (d) o trigger fn_registrar_coach_tenure abre a tenure de copa (competitor_id,
--       season NULA) para a vaga herdada e NÃO abre para a sem competitor_id nem
--       para a degradada (user_id NULL);
--   (e) uma partida de copa encerrada nessa vaga é atribuível ao técnico (a trilha
--       coach_tenures → slot da partida existe).
--
-- Estratégia de seed: como SUPERUSER (bypassa RLS) com session_replication_role =
-- replica (triggers OFF) para montar os pré-requisitos; depois triggers ON e
-- auth.uid() = dono (via request.jwt.claims) para exercitar montar_copa e o
-- trigger DE VERDADE. NÃO toca produção (Postgres efêmero).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(15);

-- ---------- Seed dos pré-requisitos (triggers OFF) ----------
set local session_replication_role = replica;

-- Clubes extras (a1/a2 já vêm do _setup.sql).
insert into public.teams (id, nome, provider, external_id) values
  ('00000000-0000-0000-0000-0000000000fb', 'Clube FB', 'api-football', '9101'),
  ('00000000-0000-0000-0000-0000000000fc', 'Clube FC', 'api-football', '9102');

-- Pirâmide pública do dono, com uma temporada ENCERRADA e uma divisão nível 1.
insert into public.league_competitions (id, nome, created_by, status, is_public) values
  ('00000000-0000-0000-0000-0000000000f1', 'Liga Copa-Heranca',
   '00000000-0000-0000-0000-000000000001', 'ativa', true);
insert into public.league_seasons (id, competition_id, numero, status) values
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000f1', 1, 'encerrada');
insert into public.league_division_seasons (id, season_id, nivel, nome, tamanho) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000f2', 1, 'Serie A', 4);

-- Competidores: dois clubes de técnicos distintos (CA/CB), um 3º clube do MESMO
-- técnico de CA (CC → dedup) e um por-NOME com técnico (CN → não deve herdar).
insert into public.league_competitors (id, competition_id, team_id, rotulo, holder_user_id) values
  ('00000000-0000-0000-0000-00000000fa01', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-00000000fa02', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000a2', null, '00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-00000000fa03', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000fb', null, '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-00000000fa04', '00000000-0000-0000-0000-0000000000f1', null, 'Fantasma FC', '00000000-0000-0000-0000-000000000003');

-- Classificação final da divisão (posições 1..4).
insert into public.league_division_entries (division_season_id, competitor_id, posicao_final) values
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000fa01', 1),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000fa02', 2),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000fa03', 3),
  ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-00000000fa04', 4);

-- COPA 1 (por-clube, mata-mata). Entries: CA/CB/CC herdados + M manual (sem
-- competitor_id). A ordem de seeding coloca CA antes de CC (dedup do técnico).
insert into public.cup_competitions (id, nome, created_by, formato, por_nome, is_public) values
  ('00000000-0000-0000-0000-0000000000c1', 'Copa Clube', '00000000-0000-0000-0000-000000000001', 'mata_mata', false, true);
insert into public.cup_seasons (id, cup_competition_id, numero, status) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000c1', 1, 'rascunho');
insert into public.cup_entries (id, cup_season_id, team_id, rotulo, competitor_id, manual, seed) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-00000000fa01', false, 1),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a2', null, '00000000-0000-0000-0000-00000000fa02', false, 2),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000fb', null, '00000000-0000-0000-0000-00000000fa03', false, 3),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000fc', null, null,                                       true,  4);

-- COPA 2 (por-NOME, mata-mata). Uma entry rotulo carrega competitor_id ARTIFICIAL
-- (defesa: o ramo por-nome NUNCA herda, mesmo se a entry trouxesse um competidor).
insert into public.cup_competitions (id, nome, created_by, formato, por_nome, is_public) values
  ('00000000-0000-0000-0000-0000000000d1', 'Copa Nome', '00000000-0000-0000-0000-000000000001', 'mata_mata', true, true);
insert into public.cup_seasons (id, cup_competition_id, numero, status) values
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000d1', 1, 'rascunho');
insert into public.cup_entries (id, cup_season_id, team_id, rotulo, competitor_id, manual, seed) values
  ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000d2', null, 'Alfa', '00000000-0000-0000-0000-00000000fa01', false, 1),
  ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000d2', null, 'Beta', null,                                       false, 2);

-- Triggers ON + dono logado.
set local session_replication_role = default;
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- Monta as duas edições (exercita a herança + a dedup + o trigger).
select public.montar_copa('00000000-0000-0000-0000-0000000000c2', array[
  '00000000-0000-0000-0000-0000000000e1',
  '00000000-0000-0000-0000-0000000000e2',
  '00000000-0000-0000-0000-0000000000e3',
  '00000000-0000-0000-0000-0000000000e4']::uuid[]);
select public.montar_copa('00000000-0000-0000-0000-0000000000d2', array[
  '00000000-0000-0000-0000-0000000000f8',
  '00000000-0000-0000-0000-0000000000f9']::uuid[]);

-- Volta a superuser p/ ler/asserir sem o filtro de RLS.
reset role;
set local request.jwt.claims to '';

-- (a) classificacao_final_divisao expõe competitor_id (rank 1 = CA). Roda sob role
-- authenticated (NÃO superuser, que bypassaria EXECUTE) para EXERCITAR o grant
-- re-emitido após o DROP+CREATE — se o grant a authenticated sumisse, quebra aqui.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  (select competitor_id from public.classificacao_final_divisao(
     '00000000-0000-0000-0000-0000000000f1', 1) where rank = 1),
  '00000000-0000-0000-0000-00000000fa01'::uuid,
  '(a) classificacao_final_divisao retorna o competitor_id de origem (rank 1)'
);

-- (a2) SEGURANÇA: anon NÃO executa a RPC (o revoke public,anon do DROP+CREATE
-- vale). throws_ok 42501 (insufficient_privilege) — se o grant vazasse ao anon, a
-- classificação da pirâmide ficaria exposta e este assert quebraria.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$ select * from public.classificacao_final_divisao('00000000-0000-0000-0000-0000000000f1', 1) $$,
  '42501',
  null,
  '(a2) anon NÃO executa classificacao_final_divisao (grant fechado a anon)'
);

reset role;
set local request.jwt.claims to '';

-- (b) Vaga POR-CLUBE herdada: competitor_id + user_id (holder) na vaga de CA.
select is(
  (select ts.competitor_id from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id where ce.id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-00000000fa01'::uuid,
  '(b) vaga de CA herda o competitor_id'
);
select is(
  (select ts.user_id from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id where ce.id = '00000000-0000-0000-0000-0000000000e1'),
  '00000000-0000-0000-0000-000000000002'::uuid,
  '(b) vaga de CA herda o técnico (holder_user_id)'
);
select is(
  (select ts.user_id from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id where ce.id = '00000000-0000-0000-0000-0000000000e2'),
  '00000000-0000-0000-0000-000000000003'::uuid,
  '(b) vaga de CB herda o técnico dela'
);

-- (c) Dedup: CC (mesmo técnico de CA) mantém competitor_id mas user_id NULL.
select is(
  (select ts.competitor_id from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id where ce.id = '00000000-0000-0000-0000-0000000000e3'),
  '00000000-0000-0000-0000-00000000fa03'::uuid,
  '(c) dedup mantém o competitor_id da 2ª vaga do mesmo técnico'
);
select is(
  (select ts.user_id from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id where ce.id = '00000000-0000-0000-0000-0000000000e3'),
  null,
  '(c) dedup degrada o user_id da 2ª vaga do mesmo técnico para NULL'
);

-- (b) Vaga MANUAL (sem competitor_id): competitor_id e user_id NULOS.
select is(
  (select ts.competitor_id from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id where ce.id = '00000000-0000-0000-0000-0000000000e4'),
  null,
  '(b) vaga manual (sem proveniência) fica sem competitor_id'
);
select is(
  (select ts.user_id from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id where ce.id = '00000000-0000-0000-0000-0000000000e4'),
  null,
  '(b) vaga manual fica sem técnico'
);

-- (b) COPA por-NOME: NUNCA herda, mesmo com competitor_id artificial na entry.
select is(
  (select count(*)::int from public.tournament_slots ts
     join public.cup_entries ce on ce.slot_id = ts.id
    where ce.cup_season_id = '00000000-0000-0000-0000-0000000000d2'
      and (ts.competitor_id is not null or ts.user_id is not null)),
  0,
  '(b) copa por-nome grava competitor_id/user_id NULOS em toda vaga'
);

-- (d) Tenure de copa aberta para a vaga de CA: competitor_id + user 002 + season NULA.
select is(
  (select count(*)::int from public.coach_tenures ct
     join public.cup_entries ce on ce.slot_id = ct.slot_id
    where ce.id = '00000000-0000-0000-0000-0000000000e1'
      and ct.competitor_id = '00000000-0000-0000-0000-00000000fa01'
      and ct.user_id = '00000000-0000-0000-0000-000000000002'
      and ct.season_id is null
      and ct.division_season_id is null),
  1,
  '(d) trigger abre a tenure de copa (competitor_id, season NULA) para a vaga herdada'
);

-- (d) NENHUMA tenure para a vaga degradada (CC, user_id NULL) nem para a manual.
select is(
  (select count(*)::int from public.coach_tenures ct
     join public.cup_entries ce on ce.slot_id = ct.slot_id
    where ce.id = '00000000-0000-0000-0000-0000000000e3'),
  0,
  '(d) vaga degradada (user_id NULL) não gera tenure'
);
select is(
  (select count(*)::int from public.coach_tenures ct
     join public.cup_entries ce on ce.slot_id = ct.slot_id
    where ce.id = '00000000-0000-0000-0000-0000000000e4'),
  0,
  '(d) vaga sem competitor_id (manual) não gera tenure'
);
-- (d) NENHUMA tenure em toda a copa por-nome.
select is(
  (select count(*)::int from public.coach_tenures ct
     join public.cup_entries ce on ce.slot_id = ct.slot_id
    where ce.cup_season_id = '00000000-0000-0000-0000-0000000000d2'),
  0,
  '(d) copa por-nome não gera nenhuma tenure'
);

-- (e) Partida de copa encerrada na vaga de CA é atribuível ao técnico: a trilha
-- coach_tenures (slot da partida → user 002, season nula) existe.
set local session_replication_role = replica;
insert into public.matches (id, tournament_id, vaga_1, vaga_2, placar_1, placar_2, status)
select '00000000-0000-0000-0000-0000000000ee'::uuid, ts.tournament_id, ce1.slot_id, ce2.slot_id, 2, 1, 'encerrada'
  from public.cup_entries ce1
  join public.cup_entries ce2 on ce2.id = '00000000-0000-0000-0000-0000000000e2'
  join public.tournament_slots ts on ts.id = ce1.slot_id
 where ce1.id = '00000000-0000-0000-0000-0000000000e1';
set local session_replication_role = default;

select is(
  (select count(*)::int
     from public.matches m
     join public.coach_tenures ct on ct.slot_id = m.vaga_1
    where m.id = '00000000-0000-0000-0000-0000000000ee'
      and m.status = 'encerrada'
      and ct.user_id = '00000000-0000-0000-0000-000000000002'
      and ct.season_id is null),
  1,
  '(e) partida de copa encerrada é atribuível ao técnico via a trilha coach_tenures'
);

select * from finish();
rollback;
