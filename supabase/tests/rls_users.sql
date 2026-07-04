-- =====================================================================
-- Grant de COLUNA: users.celular é PII fechada a anon/authenticated
-- ---------------------------------------------------------------------
-- A RLS é por-LINHA; para proteger só o `celular` (mantendo nome/avatar amplos,
-- necessários em torneios públicos) o schema REVOGA o SELECT da tabela e
-- re-concede apenas as colunas não-PII. O celular só é legível pela RPC definer
-- `celulares_de_contato` (gate de co-participação). Aqui provamos o grant de
-- coluna: nome PASSA, celular tomba com 42501 (insufficient_privilege).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(4);

-- ALLOW: authenticated lê colunas não-PII (nome).
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select lives_ok(
  $$ select nome from public.users where id = '00000000-0000-0000-0000-000000000001' $$,
  'ALLOW: authenticated le coluna nao-PII (nome)'
);

-- DENY: authenticated NÃO lê a coluna PII `celular` (grant de coluna).
select throws_ok(
  $$ select celular from public.users where id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'DENY: authenticated nao le a PII celular'
);

-- ALLOW: anon lê nome (baseline público preservado).
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select lives_ok(
  $$ select nome from public.users where id = '00000000-0000-0000-0000-000000000001' $$,
  'ALLOW: anon le coluna nao-PII (nome)'
);

-- DENY: anon NÃO lê a PII celular.
select throws_ok(
  $$ select celular from public.users where id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', null,
  'DENY: anon nao le a PII celular'
);

select * from finish();
rollback;
