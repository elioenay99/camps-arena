-- =====================================================================
-- Integração: DISCIPLINA — W.O. seguidos por técnico (add-contador-wo-tecnico)
-- ---------------------------------------------------------------------
-- Exercita, num Postgres REAL, o que os testes herméticos (vi.mock) NÃO alcançam:
--   (1) sequencia_disciplina_torneio classifica wo_loss/wo_win/jogou, marca
--       perdoado, respeita a janela meio-aberta e só tenures ABERTAS;
--   (2) gate: authenticated não-gestor → NAO_AUTORIZADO; anon → 42501;
--       dono/admin → funciona;
--   (3) perdoar_wo_tecnico insere e é IDEMPOTENTE (2ª chamada = 0);
--   (4) RLS: anon/authenticated NÃO escrevem/leem wo_perdoes direto (42501);
--       helper wo_sofridos_do_tecnico não executável por authenticated;
--   (5) duplo W.O. aparece como wo_loss pros DOIS técnicos;
--   (6) expulsar_tecnico_wo: gestor esvazia a vaga + fecha a tenure (o técnico
--       some da sequência); idempotente na vaga vazia.
--
-- Estratégia de seed: SUPERUSER (bypassa RLS) com session_replication_role =
-- replica (triggers OFF) para montar os pré-requisitos; depois triggers ON + jwt
-- claims; asserts sob `set local role authenticated`/`anon` para NÃO ter
-- falso-verde de superuser. NÃO toca produção (Postgres efêmero).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(16);

-- Prefixos: TW=torneio, LW=liga, CW=competidor, S=slot, técnicos = users 002/003,
-- não-gestor = 004, dono = 001 (todos já vêm do _setup.sql).
set local session_replication_role = replica;

-- Torneio de liga do DONO (001).
insert into public.tournaments (id, titulo, status, created_by, is_public, formato) values
  ('00000000-0000-0000-0000-0000000000da', 'Torneio Disciplina', 'ativo',
   '00000000-0000-0000-0000-000000000001', true, 'liga');

-- Liga + competidores (coach_tenures.competitor_id é NOT NULL → precisa existir).
insert into public.league_competitions (id, nome, created_by, status, is_public) values
  ('00000000-0000-0000-0000-0000000000db', 'Liga Disciplina',
   '00000000-0000-0000-0000-000000000001', 'ativa', true);
insert into public.league_competitors (id, competition_id, team_id, rotulo, holder_user_id) values
  ('00000000-0000-0000-0000-000000000da1', '00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000da2', '00000000-0000-0000-0000-0000000000db', '00000000-0000-0000-0000-0000000000a2', null, '00000000-0000-0000-0000-000000000003');

-- Vagas do torneio: S1 (técnico A=002), S2 (técnico B=003). O competitor_id é
-- OBRIGATÓRIO para o trigger fn_registrar_coach_tenure agir (ele curto-circuita em
-- new.competitor_id null) — sem ele a expulsão não fecharia a tenure.
insert into public.tournament_slots (id, tournament_id, team_id, user_id, competitor_id) values
  ('00000000-0000-0000-0000-000000000d51', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000da1'),
  ('00000000-0000-0000-0000-000000000d52', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000da2');

-- Tenures ABERTAS (writer real é o trigger; aqui semeamos direto com triggers OFF).
insert into public.coach_tenures (slot_id, competitor_id, tournament_id, user_id, rodada_inicio) values
  ('00000000-0000-0000-0000-000000000d51', '00000000-0000-0000-0000-000000000da1', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-000000000002', null),
  ('00000000-0000-0000-0000-000000000d52', '00000000-0000-0000-0000-000000000da2', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-000000000003', null);
-- Tenure FECHADA de um técnico anterior (004) na S1: NÃO deve aparecer.
insert into public.coach_tenures (slot_id, competitor_id, tournament_id, user_id, rodada_inicio, encerrada_em) values
  ('00000000-0000-0000-0000-000000000d51', '00000000-0000-0000-0000-000000000da1', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-000000000004', null, now());

-- Partidas: rodadas 1-3 = W.O.-derrota de S1 (vencedor S2) → A ausente, B presente
-- (wo_win). Rodada 4 = DUPLO W.O. (ambos ausentes) → wo_loss pros dois.
insert into public.matches (id, tournament_id, vaga_1, vaga_2, rodada, wo, wo_duplo, wo_vencedor, status) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-000000000d51', '00000000-0000-0000-0000-000000000d52', 1, true, false, '00000000-0000-0000-0000-000000000d52', 'encerrada'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-000000000d51', '00000000-0000-0000-0000-000000000d52', 2, true, false, '00000000-0000-0000-0000-000000000d52', 'encerrada'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-000000000d51', '00000000-0000-0000-0000-000000000d52', 3, true, false, '00000000-0000-0000-0000-000000000d52', 'encerrada'),
  ('00000000-0000-0000-0000-0000000000e4', '00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-000000000d51', '00000000-0000-0000-0000-000000000d52', 4, true, true,  null,                                   'encerrada');

set local session_replication_role = default;

-- ---------- Asserts de LEITURA/CLASSIFICAÇÃO (como DONO 001) ----------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (1) A (002) na rodada 1 = wo_loss, ainda não perdoado.
select is(
  (select count(*)::int from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da')
    where user_id = '00000000-0000-0000-0000-000000000002' and rodada = 1
      and tipo = 'wo_loss' and perdoado = false),
  1,
  '(1) sequencia classifica W.O.-derrota do técnico ausente como wo_loss (não perdoado)'
);

-- (2) B (003) na rodada 1 = wo_win (venceu por W.O., adversário faltou).
select is(
  (select count(*)::int from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da')
    where user_id = '00000000-0000-0000-0000-000000000003' and rodada = 1 and tipo = 'wo_win'),
  1,
  '(2) sequencia classifica W.O.-vitória como wo_win (técnico presente)'
);

-- (3) Duplo W.O. (rodada 4) = wo_loss pros DOIS técnicos.
select is(
  (select count(*)::int from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da')
    where rodada = 4 and tipo = 'wo_loss'),
  2,
  '(3) duplo W.O. conta como wo_loss para AMBOS os técnicos ausentes'
);

-- (4) Tenure FECHADA (técnico 004) NÃO aparece.
select is(
  (select count(*)::int from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da')
    where user_id = '00000000-0000-0000-0000-000000000004'),
  0,
  '(4) tenure fechada não entra na sequência (só tenures abertas)'
);

reset role;
set local request.jwt.claims to '';

-- ---------- Asserts de GATE ----------
-- (5) anon NÃO executa a sequência (EXECUTE revogado → 42501).
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$ select * from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da') $$,
  '42501', null,
  '(5) anon NÃO executa sequencia_disciplina_torneio (grant fechado)'
);
-- (11) anon NÃO lê wo_perdoes (revoke select → 42501).
select throws_ok(
  $$ select * from public.wo_perdoes $$,
  '42501', null,
  '(11) anon NÃO lê wo_perdoes (select revogado)'
);
reset role;
set local request.jwt.claims to '';

-- (6) authenticated NÃO-gestor (004) → NAO_AUTORIZADO na sequência.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select * from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da') $$,
  'P0001', 'NAO_AUTORIZADO',
  '(6) authenticated não-gestor recebe NAO_AUTORIZADO na sequência'
);
-- (7) authenticated NÃO-gestor → NAO_AUTORIZADO no perdão.
select throws_ok(
  $$ select public.perdoar_wo_tecnico('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-000000000002') $$,
  'P0001', 'NAO_AUTORIZADO',
  '(7) authenticated não-gestor recebe NAO_AUTORIZADO no perdão'
);
-- (12) authenticated NÃO insere direto em wo_perdoes (grant de escrita revogado).
select throws_ok(
  $$ insert into public.wo_perdoes (match_id, user_id, tournament_id)
     values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000da') $$,
  '42501', null,
  '(12) authenticated NÃO insere direto em wo_perdoes'
);
-- (13) helper interno wo_sofridos_do_tecnico não executável por authenticated.
select throws_ok(
  $$ select * from public.wo_sofridos_do_tecnico('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-000000000002') $$,
  '42501', null,
  '(13) helper wo_sofridos_do_tecnico não executável por authenticated'
);
reset role;
set local request.jwt.claims to '';

-- ---------- Asserts de PERDÃO (como DONO) ----------
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';

-- (8) perdoar A materializa os 4 W.O.-derrota (rodadas 1,2,3 + duplo rodada 4).
select is(
  public.perdoar_wo_tecnico('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-000000000002'),
  4,
  '(8) perdoar_wo_tecnico insere os W.O.-derrota atuais do técnico (4)'
);
-- (9) idempotente: 2ª chamada não insere nada.
select is(
  public.perdoar_wo_tecnico('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-000000000002'),
  0,
  '(9) perdão é idempotente (2ª chamada = 0)'
);
-- (10) após o perdão, a sequência marca a rodada 1 de A como perdoado.
select is(
  (select count(*)::int from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da')
    where user_id = '00000000-0000-0000-0000-000000000002' and rodada = 1 and perdoado = true),
  1,
  '(10) sequência reflete o perdão (perdoado = true) após materializar'
);

-- ---------- Asserts de EXPULSÃO (gestor; dispara o fecho da tenure) ----------
-- (14) expulsar A esvazia a vaga (1 linha afetada).
select is(
  public.expulsar_tecnico_wo('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-000000000d51'),
  1,
  '(14) expulsar_tecnico_wo esvazia a vaga do técnico (1 linha)'
);
-- (15) tenure de A fechada → some da sequência (só tenures abertas).
select is(
  (select count(*)::int from public.sequencia_disciplina_torneio('00000000-0000-0000-0000-0000000000da')
    where user_id = '00000000-0000-0000-0000-000000000002'),
  0,
  '(15) após a expulsão a tenure fecha e o técnico some da sequência'
);
-- (16) idempotente: vaga já vazia → 0 linhas.
select is(
  public.expulsar_tecnico_wo('00000000-0000-0000-0000-0000000000da','00000000-0000-0000-0000-000000000d51'),
  0,
  '(16) expulsar vaga já vazia retorna 0'
);

reset role;
set local request.jwt.claims to '';

select * from finish();
rollback;
