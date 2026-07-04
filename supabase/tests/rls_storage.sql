-- =====================================================================
-- RLS: match_score_proposals — foto_path amarrado à pasta do autor
-- ---------------------------------------------------------------------
-- Hardening #3 (add-storage-hardening): a coluna foto_path (NOT NULL) tem de
-- morar em `<uid_do_autor>/<match_id>/...`. Sem isso o browser (anon key)
-- poderia forjar a linha via PostgREST apontando para a pasta de OUTRO usuário
-- e, pela SELECT policy de storage, ler evidência alheia (confused deputy).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(3);

-- Contexto: U_P1 é técnico da vaga_1 da partida vaga-based M_VAGA (liberada).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}';

-- ALLOW: foto_path na PRÓPRIA pasta (<uid>/<match_id>/arquivo).
select lives_ok(
  $$ insert into public.match_score_proposals
       (match_id, submetido_por, placar_1, placar_2, foto_path)
     values (
       '00000000-0000-0000-0000-0000000000d3',
       '00000000-0000-0000-0000-000000000002',
       2, 1,
       '00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-0000000000d3/foto.jpg'
     ) $$,
  'ALLOW: proposta com foto_path na propria pasta'
);

-- DENY: foto_path FORJADO apontando para a pasta de OUTRO usuário (U_P2).
select throws_ok(
  $$ insert into public.match_score_proposals
       (match_id, submetido_por, placar_1, placar_2, foto_path)
     values (
       '00000000-0000-0000-0000-0000000000d3',
       '00000000-0000-0000-0000-000000000002',
       3, 0,
       '00000000-0000-0000-0000-000000000003/00000000-0000-0000-0000-0000000000d3/forja.jpg'
     ) $$,
  '42501', null,
  'DENY: foto_path forjado na pasta de outro usuario'
);

-- DENY: submetido_por forjado como OUTRO usuário (não bate com auth.uid()).
-- foto_path fica na PRÓPRIA pasta de U2 (passa a cláusula foldername[1]), então a
-- ÚNICA barreira que reprova é `submetido_por = auth.uid()` — o teste isola essa
-- cláusula (falharia se ela fosse removida da policy).
select throws_ok(
  $$ insert into public.match_score_proposals
       (match_id, submetido_por, placar_1, placar_2, foto_path)
     values (
       '00000000-0000-0000-0000-0000000000d3',
       '00000000-0000-0000-0000-000000000003',
       1, 1,
       '00000000-0000-0000-0000-000000000002/00000000-0000-0000-0000-0000000000d3/foto.jpg'
     ) $$,
  '42501', null,
  'DENY: submetido_por forjado como outro usuario'
);

select * from finish();
rollback;
