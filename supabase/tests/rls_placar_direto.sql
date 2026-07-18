-- =====================================================================
-- INTEGRAÇÃO (pgTAP): placar direto transacional (fix-placar-replace-transacional)
-- ---------------------------------------------------------------------
-- Exercita, num Postgres REAL, as garantias ATÔMICAS da RPC aplicar_placar_direto
-- que o vitest mockado não toca: sucesso (placar + autores), REPLACE dos dois
-- lados, teto forjado por lado, poda de órfão ao reduzir o placar, guarda otimista
-- (p_expected_status), status encerrada, e a autorização (writer autoritativo:
-- participante do avulso OU árbitro; anon/terceiro/técnico-não-árbitro barrados).
-- Reusa o seed determinístico de _setup.sql (torneio b1; d1 avulso 002×003; d3
-- vaga c1×c2). NÃO toca produção — Postgres efêmero (ver supabase/tests/run.sh).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(21);

\set DONO      '\'00000000-0000-0000-0000-000000000001\''
\set TEC1      '\'00000000-0000-0000-0000-000000000002\''
\set TERCEIRO  '\'00000000-0000-0000-0000-000000000004\''
\set B1        '\'00000000-0000-0000-0000-0000000000b1\''
\set C1        '\'00000000-0000-0000-0000-0000000000c1\''
\set C2        '\'00000000-0000-0000-0000-0000000000c2\''
\set D1        '\'00000000-0000-0000-0000-0000000000d1\''
\set D3        '\'00000000-0000-0000-0000-0000000000d3\''
-- Fixtures próprias desta suíte (roll back no fim).
\set MREPLACE  '\'00000000-0000-0000-0000-00000000e1a1\''
\set MTETO     '\'00000000-0000-0000-0000-00000000e2a1\''
\set MORFAO    '\'00000000-0000-0000-0000-00000000e3a1\''
\set MGUARD    '\'00000000-0000-0000-0000-00000000e4a1\''
\set MENC      '\'00000000-0000-0000-0000-00000000e5a1\''
\set MATOM     '\'00000000-0000-0000-0000-00000000e6a1\''

-- ---------- Fixtures (superuser; triggers OFF para não brigar com os locks) ----------
set local session_replication_role = replica;

-- Match para o REPLACE dos dois lados (vaga-based, com gols pré-semeados dos dois).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values (:MREPLACE, :B1, null, null, :C1, :C2, 'agendada', 2, 1, now() - interval '1 hour');
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  (:MREPLACE, 1, 'A', 2, false),
  (:MREPLACE, 2, 'B', 1, false);

-- Match para o teto forjado por lado (placar 1×0; payload lado 1 somando 5).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values (:MTETO, :B1, null, null, :C1, :C2, 'agendada', 0, 0, now() - interval '1 hour');

-- Match para a poda de órfão (lado 1 soma 3; será reduzido a placar 1 sem autores).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values (:MORFAO, :B1, null, null, :C1, :C2, 'agendada', 3, 0, now() - interval '1 hour');
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  (:MORFAO, 1, 'Ant1', 2, false),
  (:MORFAO, 1, 'Ant2', 1, false);

-- Match para a guarda otimista (avulso 002×003; placar 0×0).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values (:MGUARD, :B1, :TEC1::uuid, '00000000-0000-0000-0000-000000000003'::uuid, null, null, 'agendada', 0, 0, now() - interval '1 hour');

-- Match ENCERRADO (avulso 002×003).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values (:MENC, :B1, :TEC1::uuid, '00000000-0000-0000-0000-000000000003'::uuid, null, null, 'encerrada', 1, 0, now() - interval '1 hour');

-- Match para ATOMICIDADE de escrita parcial (avulso 002×003; placar ORIGINAL 5×3).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values (:MATOM, :B1, :TEC1::uuid, '00000000-0000-0000-0000-000000000003'::uuid, null, null, 'agendada', 5, 3, now() - interval '1 hour');

set local session_replication_role = origin;  -- triggers LIGADOS para as asserções

-- =====================================================================
-- Sucesso: aplica placar + autores (avulso d1, como participante 002)
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select lives_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-0000000000d1'::uuid, 2, 1,
       '[{"lado":1,"jogador":"Zico","gols":2},{"lado":2,"jogador":"Rai","gols":1}]'::jsonb,
       'agendada') $$,
  'participante do avulso aplica placar + autores sem erro'
);
select is(
  (select placar_1 || 'x' || placar_2 from public.matches where id = :D1),
  '2x1',
  'placar do avulso aplicado (2x1)'
);
select is(
  (select gols from public.match_goals where match_id = :D1 and lado = 1 and lower(jogador) = 'zico'),
  2,
  'autor do lado 1 (Zico:2) materializado'
);
select is(
  (select gols from public.match_goals where match_id = :D1 and lado = 2 and lower(jogador) = 'rai'),
  1,
  'autor do lado 2 (Rai:1) materializado'
);

-- =====================================================================
-- REPLACE dos DOIS lados: autores só do lado 1 ESVAZIA o lado 2 (como árbitro=dono)
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-00000000e1a1'::uuid, 2, 1,
       '[{"lado":1,"jogador":"Novo","gols":2}]'::jsonb, 'agendada') $$,
  'árbitro reescreve só o lado 1 (REPLACE dos dois)'
);
select is(
  (select count(*)::int from public.match_goals where match_id = :MREPLACE and lado = 2),
  0,
  'REPLACE esvaziou o lado 2 (payload não trouxe o lado 2)'
);
select is(
  (select string_agg(jogador, ',') from public.match_goals where match_id = :MREPLACE and lado = 1),
  'Novo',
  'lado 1 reescrito com o novo autor (B removido)'
);

-- =====================================================================
-- Teto forjado por lado: soma do lado > placar → lado NÃO entra (fica vazio)
-- =====================================================================
select lives_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-00000000e2a1'::uuid, 1, 0,
       '[{"lado":1,"jogador":"Forjado","gols":5}]'::jsonb, 'agendada') $$,
  'payload forjado (lado 1 soma 5 > placar 1) não aborta'
);
select is(
  (select count(*)::int from public.match_goals where match_id = :MTETO and lado = 1),
  0,
  'lado forjado acima do placar foi descartado (não materializou)'
);

-- =====================================================================
-- Poda de órfão: reduzir o placar (3→1) sem autores (null) limpa o lado órfão
-- =====================================================================
select lives_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-00000000e3a1'::uuid, 1, 0, null, 'agendada') $$,
  'reduzir placar sem autores (preserva) roda a poda'
);
select is(
  (select count(*)::int from public.match_goals where match_id = :MORFAO and lado = 1),
  0,
  'gols órfãos acima do novo teto (soma 3 > placar 1) foram podados'
);

-- =====================================================================
-- Guarda otimista: p_expected_status obsoleto → PARTIDA_INDISPONIVEL, placar intacto
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-00000000e4a1'::uuid, 5, 5, null, 'encerrada') $$,
  'PARTIDA_INDISPONIVEL',
  'status esperado obsoleto (agendada≠encerrada) dispara PARTIDA_INDISPONIVEL'
);
select is(
  (select placar_1 || 'x' || placar_2 from public.matches where id = :MGUARD),
  '0x0',
  'atomicidade: nada mudou após a guarda otimista barrar (placar intacto)'
);

-- =====================================================================
-- Atomicidade de escrita PARCIAL: o UPDATE de placar acontece ANTES do INSERT de
-- autores; se o INSERT abortar (aqui, Zico/zico colapsam em gols=198 > 99 do CHECK
-- de match_goals → 23514), o placar já aplicado (200×0) DEVE reverter junto. Prova
-- o rollback de escrita parcial (não só a guarda-antes-da-escrita acima).
-- =====================================================================
select throws_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-00000000e6a1'::uuid, 200, 0,
       '[{"lado":1,"jogador":"Zico","gols":99},{"lado":1,"jogador":"zico","gols":99}]'::jsonb,
       'agendada') $$,
  '23514', null,
  'INSERT que viola o CHECK de gols (merge Zico/zico = 198) aborta com 23514'
);
select is(
  (select placar_1 || 'x' || placar_2 from public.matches where id = :MATOM),
  '5x3',
  'atomicidade: o UPDATE de placar (200×0) reverteu junto com o INSERT abortado'
);

-- =====================================================================
-- Partida ENCERRADA rejeitada
-- =====================================================================
select throws_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-00000000e5a1'::uuid, 3, 3, null, 'encerrada') $$,
  'PARTIDA_ENCERRADA',
  'partida encerrada é rejeitada (imutável)'
);

-- =====================================================================
-- Autorização: terceiro (não participa, não arbitra) barrado no avulso
-- =====================================================================
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-0000000000d1'::uuid, 1, 0, null, 'agendada') $$,
  'NAO_AUTORIZADO',
  'terceiro (não participante/não árbitro) barrado no avulso'
);

-- Competitivo: o TÉCNICO da vaga (não árbitro) NÃO grava direto (propõe com foto).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-0000000000d3'::uuid, 1, 0, null, 'agendada') $$,
  'NAO_AUTORIZADO',
  'técnico de vaga (não árbitro) barrado no lançamento direto'
);

-- Árbitro (dono do torneio) grava direto no competitivo.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select lives_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-0000000000d3'::uuid, 4, 2, null, 'agendada') $$,
  'árbitro (dono) grava direto no competitivo'
);

-- AUTH_REQUIRED: sem `sub` no JWT (auth.uid() null).
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-0000000000d1'::uuid, 1, 0, null, 'agendada') $$,
  'AUTH_REQUIRED',
  'chamada sem identidade (sub ausente) dispara AUTH_REQUIRED'
);

-- REVOKE sob papel REAL: os casos acima usam só o JWT (o runner é superuser e
-- BYPASSA grants). Este exerce o `revoke execute ... from public, anon` de verdade,
-- sob role anon → 42501 (insufficient_privilege) antes mesmo de rodar o corpo.
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$ select public.aplicar_placar_direto(
       '00000000-0000-0000-0000-0000000000d1'::uuid, 1, 0, null, 'agendada') $$,
  '42501', null,
  'anon NÃO executa aplicar_placar_direto (EXECUTE revogado → 42501)'
);
reset role;

select * from finish();
rollback;
