-- =====================================================================
-- INTEGRAÇÃO (pgTAP): artilharia colaborativa (add-artilharia-colaborativa)
-- ---------------------------------------------------------------------
-- Exercita, num Postgres REAL, as garantias que vivem em plpgsql (o vitest
-- mockado é falso-verde): a RPC registrar_autores_lado (append/replace, teto,
-- autorização por MODO, lado oposto intacto, parse endurecido), a materialização
-- por-lado + `contra` da aprovar_proposta_placar, o trigger matches_limpar_gols_wo
-- e o filtro `contra = false` do artilheiro no hall da fama.
-- NÃO toca produção — Postgres efêmero (ver supabase/tests/run.sh).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(24);

-- UUIDs do seed (_setup.sql): dono=001, técnicos=002 (vaga c1) / 003 (vaga c2),
-- terceiro=004; torneio público b1 (dono 001); match d3 vaga-based (c1×c2);
-- match d1 participante-based (vaga nula); liga e1 (dono 001).
\set DONO      '\'00000000-0000-0000-0000-000000000001\''
\set TEC1      '\'00000000-0000-0000-0000-000000000002\''
\set TEC2      '\'00000000-0000-0000-0000-000000000003\''
\set TERCEIRO  '\'00000000-0000-0000-0000-000000000004\''
\set D3        '\'00000000-0000-0000-0000-0000000000d3\''
\set D1        '\'00000000-0000-0000-0000-0000000000d1\''
\set C1        '\'00000000-0000-0000-0000-0000000000c1\''
\set C2        '\'00000000-0000-0000-0000-0000000000c2\''

-- ---------- Fixtures (superuser; triggers OFF para não brigar com os locks) ----------
set local session_replication_role = replica;

-- d3 vira ENCERRADA com placar 3×2 (é o caso de uso: completar após a validação).
update public.matches set status = 'encerrada', placar_1 = 3, placar_2 = 2, wo = false
 where id = :D3;
-- Pré-semeia o lado 1 (Vini:2) e o lado 2 colaborativo (Rival:1).
delete from public.match_goals where match_id = :D3;
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  (:D3, 1, 'Vini',  2, false),
  (:D3, 2, 'Rival', 1, false);

-- Match para o TRIGGER de W.O. (começa ABERTO; o W.O. é aplicado na fase de
-- asserção, com os triggers LIGADOS, para o AFTER disparar).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000b1',
        null, null, :C1, :C2, 'em_andamento', 3, 1, now() - interval '1 hour');
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  ('00000000-0000-0000-0000-0000000000f1', 1, 'Fulano', 3, false);

-- Match encerrado NORMALMENTE (wo=false) — o trigger NÃO dispara (preserva gols).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000b1',
        null, null, :C1, :C2, 'encerrada', 2, 0, now() - interval '1 hour');
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  ('00000000-0000-0000-0000-0000000000f2', 1, 'Preservado', 2, false);

-- Match + proposta para a APROVAÇÃO (não encerrado; lado 2 já tem gol colaborativo).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values ('00000000-0000-0000-0000-0000000000f3', '00000000-0000-0000-0000-0000000000b1',
        null, null, :C1, :C2, 'agendada', 0, 0, now() - interval '1 hour');
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  ('00000000-0000-0000-0000-0000000000f3', 2, 'Adv', 1, false);
insert into public.match_score_proposals (id, match_id, submetido_por, placar_1, placar_2, foto_path, status, autores)
values ('00000000-0000-0000-0000-0000000000f4', '00000000-0000-0000-0000-0000000000f3',
        :TEC1, 2, 1, 'x/y.png', 'pendente',
        '[{"lado":1,"jogador":"Vini","gols":1},{"lado":1,"gols":1,"contra":true}]'::jsonb);

-- (R1) Match + proposta que REDUZ o placar do lado 1 (3→1) sem governar autores
-- desse lado (autores nulo) — a poda de órfãos deve limpar os gols acima do teto.
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values ('00000000-0000-0000-0000-0000000000fb', '00000000-0000-0000-0000-0000000000b1',
        null, null, :C1, :C2, 'agendada', 0, 0, now() - interval '1 hour');
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  ('00000000-0000-0000-0000-0000000000fb', 1, 'Antigo1', 2, false),
  ('00000000-0000-0000-0000-0000000000fb', 1, 'Antigo2', 1, false);
insert into public.match_score_proposals (id, match_id, submetido_por, placar_1, placar_2, foto_path, status, autores)
values ('00000000-0000-0000-0000-0000000000fc', '00000000-0000-0000-0000-0000000000fb',
        :TEC1, 1, 0, 'x/z.png', 'pendente', null);

-- (P2) Proposta com `lado` DECIMAL forjado (1.0) por POST direto — o parse não
-- pode abortar com 22P02 no `::int` sobre o texto "1.0".
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values ('00000000-0000-0000-0000-0000000000fd', '00000000-0000-0000-0000-0000000000b1',
        null, null, :C1, :C2, 'agendada', 0, 0, now() - interval '1 hour');
insert into public.match_score_proposals (id, match_id, submetido_por, placar_1, placar_2, foto_path, status, autores)
values ('00000000-0000-0000-0000-0000000000fe', '00000000-0000-0000-0000-0000000000fd',
        :TEC1, 1, 0, 'x/w.png', 'pendente',
        '[{"lado":1.0,"jogador":"Deci","gols":1}]'::jsonb);

-- Fixtures do HALL DA FAMA: liga e1 (dono 001) → season em_fluxo → 1 divisão →
-- 1 competidor → 1 torneio com um match cujo maior somatório é um GOL CONTRA.
insert into public.tournaments (id, titulo, status, created_by, is_public, formato)
values ('00000000-0000-0000-0000-0000000000f5', 'Div Hall', 'ativo', :DONO, true, 'avulso');
insert into public.league_seasons (id, competition_id, numero, status, ciclo)
values ('00000000-0000-0000-0000-0000000000f6', '00000000-0000-0000-0000-0000000000e1', 1, 'em_fluxo', 'anual');
insert into public.league_competitors (id, competition_id, team_id, rotulo)
values ('00000000-0000-0000-0000-0000000000f8', '00000000-0000-0000-0000-0000000000e1', null, 'Clube Hall');
insert into public.league_division_seasons (id, season_id, nivel, nome, tournament_id, formato, tamanho)
values ('00000000-0000-0000-0000-0000000000f7', '00000000-0000-0000-0000-0000000000f6', 1, 'Série A',
        '00000000-0000-0000-0000-0000000000f5', 'liga', 4);
insert into public.tournament_slots (id, tournament_id, team_id, user_id, competitor_id)
values ('00000000-0000-0000-0000-0000000000f9', '00000000-0000-0000-0000-0000000000f5',
        '00000000-0000-0000-0000-0000000000a1', null, '00000000-0000-0000-0000-0000000000f8');
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, placar_1, placar_2, liberada_em)
values ('00000000-0000-0000-0000-0000000000fa', '00000000-0000-0000-0000-0000000000f5',
        null, null, '00000000-0000-0000-0000-0000000000f9', null, 'encerrada', 7, 0, now() - interval '1 hour');
insert into public.match_goals (match_id, lado, jogador, gols, contra) values
  ('00000000-0000-0000-0000-0000000000fa', 1, 'Ronaldo', 2, false),
  ('00000000-0000-0000-0000-0000000000fa', 1, null,      5, true);  -- gol contra, maior somatório

set local session_replication_role = origin;  -- triggers LIGADOS para as asserções

-- =====================================================================
-- registrar_autores_lado
-- =====================================================================

-- (g) LADO_SEM_VAGA: partida participante-based (vaga nula) — escopo competitivo.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.registrar_autores_lado(
       '00000000-0000-0000-0000-0000000000d1'::uuid, 1::smallint, '[]'::jsonb, 'replace') $$,
  'LADO_SEM_VAGA',
  'lado sem vaga (avulso) é recusado'
);

-- MODO_INVALIDO: p_modo fora de {append, replace}.
select throws_ok(
  $$ select public.registrar_autores_lado(
       '00000000-0000-0000-0000-0000000000d3'::uuid, 1::smallint, '[]'::jsonb, 'sobrescrever') $$,
  'MODO_INVALIDO',
  'modo fora de {append, replace} é recusado'
);

-- (f) NAO_AUTORIZADO: o terceiro (nem árbitro nem técnico do lado) tenta append.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ select public.registrar_autores_lado(
       '00000000-0000-0000-0000-0000000000d3'::uuid, 1::smallint,
       '[{"jogador":"X","gols":1}]'::jsonb, 'append') $$,
  'NAO_AUTORIZADO',
  'terceiro (não técnico/não árbitro) é recusado no append'
);

-- (f) NAO_AUTORIZADO: o técnico do lado (sem arbitrar) tenta REPLACE (só árbitro).
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select public.registrar_autores_lado(
       '00000000-0000-0000-0000-0000000000d3'::uuid, 1::smallint,
       '[{"jogador":"X","gols":1}]'::jsonb, 'replace') $$,
  'NAO_AUTORIZADO',
  'replace por técnico não-árbitro é recusado'
);

-- (a) APPEND soma ao existente (Vini:2 + delta Vini:1 = 3), pela vaga do técnico,
--     com a partida ENCERRADA (e). Só o DELTA no payload — NÃO dobra (l).
select is(
  public.registrar_autores_lado(
    '00000000-0000-0000-0000-0000000000d3'::uuid, 1::smallint,
    '[{"jogador":"Vini","gols":1}]'::jsonb, 'append'),
  3,
  'append (técnico, partida encerrada) retorna o total do lado = 3'
);
select is(
  (select gols from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000d3' and lado = 1
      and lower(jogador) = 'vini'),
  3,
  'append somou (Vini 2 + delta 1 = 3), não dobrou'
);
select is(
  (select count(*)::int from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000d3' and lado = 1),
  1,
  'append com só o delta manteve UMA linha no lado (Vini), sem duplicar'
);

-- (c) O lado OPOSTO permanece intacto após escrever o lado 1.
select is(
  (select gols from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000d3' and lado = 2
      and lower(jogador) = 'rival'),
  1,
  'lado oposto (Rival:1) intacto após escrever o lado 1'
);

-- (b) REPLACE substitui a lista do lado (só árbitro), sem tocar o oposto.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is(
  public.registrar_autores_lado(
    '00000000-0000-0000-0000-0000000000d3'::uuid, 1::smallint,
    '[{"jogador":"Neymar","gols":1}]'::jsonb, 'replace'),
  1,
  'replace (árbitro) retorna o total do lado = 1'
);
select is(
  (select string_agg(coalesce(jogador,'∅'), ',' order by jogador) from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000d3' and lado = 1),
  'Neymar',
  'replace substituiu o lado 1 (só Neymar; Vini removido)'
);
select is(
  (select count(*)::int from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000d3' and lado = 2),
  1,
  'replace do lado 1 NÃO tocou o lado 2'
);

-- (d) TETO_LADO: a soma do lado excede o placar (3) → rejeita.
select throws_ok(
  $$ select public.registrar_autores_lado(
       '00000000-0000-0000-0000-0000000000d3'::uuid, 1::smallint,
       '[{"jogador":"A","gols":2},{"jogador":"B","gols":2}]'::jsonb, 'replace') $$,
  'TETO_LADO',
  'soma do lado acima do placar dispara TETO_LADO'
);

-- (j) Parse endurecido: `2.5` (trunca p/ 2) e `1e20` (ignorado) por POST direto NÃO
--     abortam a chamada (nem 22P02 nem 22003). F:2 + H:1 = 3 (≤ placar).
select is(
  public.registrar_autores_lado(
    '00000000-0000-0000-0000-0000000000d3'::uuid, 1::smallint,
    '[{"jogador":"F","gols":2.5},{"jogador":"G","gols":1e20},{"jogador":"H","gols":1}]'::jsonb,
    'replace'),
  3,
  'gols fracionário/gigante forjados não abortam (2.5→2, 1e20 ignorado); total 3'
);
select is(
  (select gols from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000d3' and lado = 1
      and lower(jogador) = 'f'),
  2,
  'gols=2.5 truncado por floor para 2'
);
select is(
  (select count(*)::int from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000d3' and lado = 1
      and lower(jogador) = 'g'),
  0,
  'gols=1e20 (fora de 1..99) foi IGNORADO, não gravado'
);

-- =====================================================================
-- (h) aprovar_proposta_placar: preserva `contra`, materializa POR-LADO e NÃO
--     deleta o lado oposto colaborativo.
-- =====================================================================
select public.aprovar_proposta_placar('00000000-0000-0000-0000-0000000000f4'::uuid);
select is(
  (select count(*)::int from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000f3' and lado = 1 and contra = true),
  1,
  'aprovação materializou o gol contra do lado 1 com contra=true'
);
select is(
  (select gols from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000f3' and lado = 1
      and lower(jogador) = 'vini' and contra = false),
  1,
  'aprovação materializou o artilheiro normal (Vini:1) do lado 1'
);
select is(
  (select string_agg(jogador, ',') from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000f3' and lado = 2),
  'Adv',
  'aprovação de proposta só do lado 1 PRESERVOU o lado 2 colaborativo (Adv)'
);

-- (R1) Aprovar reduzindo o placar do lado 1 (soma 3 → placar 1), sem governar o
-- lado (autores nulo), PODA os gols órfãos daquele lado.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select public.aprovar_proposta_placar('00000000-0000-0000-0000-0000000000fc'::uuid);
select is(
  (select count(*)::int from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000fb' and lado = 1),
  0,
  'R1: reduzir o placar abaixo da soma do lado (sem governá-lo) podou os órfãos'
);

-- (P2) Aprovar proposta com `lado` decimal forjado (1.0) NÃO aborta (floor no
-- numeric antes do ::int) — o item é tratado como lado 1 e materializa.
select public.aprovar_proposta_placar('00000000-0000-0000-0000-0000000000fe'::uuid);
select is(
  (select jogador from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000fd' and lado = 1),
  'Deci',
  'P2: lado decimal forjado (1.0) não aborta a aprovação (tratado como lado 1)'
);

-- =====================================================================
-- (k) Trigger matches_limpar_gols_wo: W.O. limpa os gols; encerramento normal preserva.
-- =====================================================================
update public.matches
   set wo = true, wo_vencedor = :C1, placar_1 = 0, placar_2 = 0, status = 'encerrada'
 where id = '00000000-0000-0000-0000-0000000000f1';
select is(
  (select count(*)::int from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000f1'),
  0,
  'W.O. (via trigger) removeu os match_goals da partida'
);
select is(
  (select count(*)::int from public.match_goals
    where match_id = '00000000-0000-0000-0000-0000000000f2'),
  1,
  'encerramento NORMAL (wo=false) PRESERVOU os match_goals'
);

-- =====================================================================
-- (i) registrar_conquistas_temporada: gol contra NÃO vira artilheiro do hall da fama.
-- =====================================================================
select public.registrar_conquistas_temporada('00000000-0000-0000-0000-0000000000f6'::uuid);
select is(
  (select jogador from public.conquistas
    where escopo = 'temporada' and ref_id = '00000000-0000-0000-0000-0000000000f6'
      and tipo = 'artilheiro'),
  'Ronaldo',
  'artilheiro do hall = o gol NORMAL (Ronaldo:2), não o gol contra (5)'
);
select is(
  (select count(*)::int from public.conquistas
    where escopo = 'temporada' and ref_id = '00000000-0000-0000-0000-0000000000f6'
      and tipo = 'artilheiro' and jogador is null),
  0,
  'nenhum artilheiro fictício/nulo (gol contra anônimo) foi gravado'
);

select * from finish();
rollback;
