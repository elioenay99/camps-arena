-- =====================================================================
-- INTEGRAÇÃO (pgTAP): adiamento de partida (add-partida-adiada)
-- ---------------------------------------------------------------------
-- Exercita, num Postgres REAL, as garantias que o vitest mockado não toca: a
-- RPC `adiar_partida` (autorização por pode_arbitrar_torneio, guard de chave,
-- cancelamento ATÔMICO de proposta/solicitação pendente), a CHECK
-- `matches_adiamento_coerente` e a imutabilidade das colunas de adiamento em
-- `lock_match_lifecycle` (encerrada → encerrada). Reusa o seed determinístico
-- de _setup.sql (torneio b1, dono 001, slots c1/c2 com técnicos 002/003,
-- terceiro 004). NÃO toca produção — Postgres efêmero (ver
-- supabase/tests/run.sh).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(11);

\set DONO      '\'00000000-0000-0000-0000-000000000001\''
\set TEC1      '\'00000000-0000-0000-0000-000000000002\''
\set TERCEIRO  '\'00000000-0000-0000-0000-000000000004\''
\set B1        '\'00000000-0000-0000-0000-0000000000b1\''
\set C1        '\'00000000-0000-0000-0000-0000000000c1\''
\set C2        '\'00000000-0000-0000-0000-0000000000c2\''
-- Fixtures próprias desta suíte (roll back no fim).
\set MABERTA  '\'00000000-0000-0000-0000-00000000f1a1\''
\set MCHAVE   '\'00000000-0000-0000-0000-00000000f2a1\''
\set MENC     '\'00000000-0000-0000-0000-00000000f3a1\''
\set PROP     '\'00000000-0000-0000-0000-00000000f1b1\''
\set REQ      '\'00000000-0000-0000-0000-00000000f1c1\''

-- ---------- Fixtures (superuser; triggers OFF para não brigar com os locks) ----------
set local session_replication_role = replica;

-- Match ABERTA fora de chave (vaga-based, liga/grupos) — alvo do adiamento
-- feliz, com uma proposta de placar E uma solicitação de W.O. PENDENTES.
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, rodada, liberada_em)
values (:MABERTA, :B1, null, null, :C1, :C2, 'agendada', 1, now() - interval '1 hour');
insert into public.match_score_proposals (id, match_id, submetido_por, placar_1, placar_2, foto_path, status)
values (:PROP, :MABERTA, :TEC1::uuid, 2, 1, 'seed/dummy.jpg', 'pendente');
insert into public.match_wo_requests (id, match_id, solicitante_slot, status)
values (:REQ, :MABERTA, :C1, 'pendente');

-- Match de CHAVE (posicao não nula) — a RPC deve recusar o adiamento. Rodada
-- 2 (par vaga_1/vaga_2 já ocupado na rodada 1 por MABERTA — unique
-- matches_liga_par_unico_vaga).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, posicao, rodada, liberada_em)
values (:MCHAVE, :B1, null, null, :C1, :C2, 'agendada', 1, 2, now() - interval '1 hour');

-- Match ENCERRADA (avulso 002×003) — alvo do teste de imutabilidade.
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values (:MENC, :B1, :TEC1::uuid, '00000000-0000-0000-0000-000000000003'::uuid, null, null, 'encerrada', 1, 0, now() - interval '1 hour');

set local session_replication_role = origin;  -- triggers LIGADOS para as asserções

-- =====================================================================
-- Autorização: terceiro (não arbitra) é recusado ANTES de tocar a partida.
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.adiar_partida('00000000-0000-0000-0000-00000000f1a1'::uuid, 'chuva') $$,
  'NAO_AUTORIZADO',
  'DENY: terceiro sem capacidade ARBITRAR nao adia'
);
select is(
  (select status from public.matches where id = :MABERTA),
  'agendada'::public.match_status,
  'partida permanece agendada apos a recusa por autorizacao'
);

-- =====================================================================
-- Guard de chave: partida com posicao não nula é recusada.
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.adiar_partida('00000000-0000-0000-0000-00000000f2a1'::uuid) $$,
  'CHAVE_NAO_ADIA',
  'DENY: partida de chave (posicao nao nula) nao adia'
);

-- =====================================================================
-- Sucesso: o dono adia a partida aberta com motivo — status, metadado e
-- cancelamento ATÔMICO das pendências da MESMA partida.
-- =====================================================================
select lives_ok(
  $$ select public.adiar_partida('00000000-0000-0000-0000-00000000f1a1'::uuid, 'chuva forte') $$,
  'dono adia a partida sem erro'
);
select is(
  (select status from public.matches where id = :MABERTA),
  'adiada'::public.match_status,
  'status vira adiada'
);
select is(
  (select adiada_por from public.matches where id = :MABERTA),
  '00000000-0000-0000-0000-000000000001'::uuid,
  'adiada_por registra quem adiou'
);
select is(
  (select adiamento_motivo from public.matches where id = :MABERTA),
  'chuva forte',
  'adiamento_motivo grava o motivo informado'
);
select is(
  (select status from public.match_score_proposals where id = :PROP),
  'rejeitada',
  'proposta de placar pendente e cancelada (rejeitada) ao adiar'
);
select is(
  (select status from public.match_wo_requests where id = :REQ),
  'recusado',
  'solicitacao de W.O. pendente e cancelada (recusado) ao adiar'
);

-- =====================================================================
-- CHECK matches_adiamento_coerente: rejeita 'adiada' sem adiada_em/adiada_por
-- (POST direto, contornando a RPC).
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ update public.matches set status = 'adiada', adiada_em = null, adiada_por = null
     where id = '00000000-0000-0000-0000-00000000f2a1' $$,
  '23514', null,
  'DENY: CHECK matches_adiamento_coerente rejeita adiada sem metadado'
);

-- =====================================================================
-- lock_match_lifecycle: colunas de adiamento imutáveis em encerrada→encerrada
-- (POST direto simulando o PARTICIPANTE via matches_update_participant).
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ update public.matches set adiamento_motivo = 'forjado' where id = '00000000-0000-0000-0000-00000000f3a1' $$,
  'P0001', 'Partida encerrada não aceita alteração de placar, clube ou W.O.',
  'DENY: adiamento_motivo imutavel em partida encerrada (POST direto do participante)'
);

select * from finish();
rollback;
