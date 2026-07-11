-- =====================================================================
-- Grants de paridade para desenvolvimento LOCAL (NÃO é necessário em prod)
-- ---------------------------------------------------------------------
-- O Supabase Cloud concede automaticamente DML a anon/authenticated/
-- service_role nas tabelas do schema `public` (via default privileges do
-- papel `supabase_admin`) e a RLS faz o controle fino por linha. Quando o
-- `schema.sql` é carregado num stack LOCAL via `psql` conectado como
-- `postgres`, esses grants NÃO são aplicados: o default privilege do papel
-- `postgres` no stack local concede apenas TRUNCATE/REFERENCES/TRIGGER —
-- sem SELECT/INSERT/UPDATE/DELETE. O resultado é "permission denied for
-- table ..." no PostgREST mesmo com a anon key correta.
--
-- Este arquivo replica, no LOCAL, o estado de privilégios que a plataforma
-- garante em produção. A segurança continua na RLS (todas as tabelas de
-- `public` têm RLS habilitada). É idempotente.
--
-- IMPORTANTE: NÃO concede EXECUTE em funções — o `schema.sql` já gerencia
-- isso explicitamente (REVOKE/GRANT por função, incl. o hardening). Um
-- "grant all on functions" aqui REVERTERIA esse hardening.
--
-- ATENÇÃO (PII): o `grant all on all tables` abaixo é por-TABELA e RE-EXPÕE o
-- `select(celular)` de `public.users` que o schema.sql fecha. Por isso o bloco
-- FINAL deste arquivo re-aplica o grant de coluna — e DEVE ser a última
-- instrução tocando `users` (reaplicar schema.sql exige reaplicar este arquivo).
--
-- Aplicar SEMPRE depois do schema.sql:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -f supabase/local-grants.sql
-- =====================================================================

grant usage on schema public to anon, authenticated, service_role;

-- Tabelas e sequences JÁ existentes (RLS gateia as linhas).
grant all on all tables in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;

-- Tabelas/sequences criadas no futuro pelo papel `postgres` (ex.: um novo
-- `psql -f schema.sql`) passam a conceder ALL automaticamente — espelha o
-- comportamento de default privileges do Cloud.
alter default privileges for role postgres in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;

-- PII (espelha o fim do schema.sql): re-fecha o `select(celular)` que o
-- `grant all on all tables` acima reabriu. ÚLTIMA palavra sobre `users`.
revoke select on public.users from anon, authenticated;
grant select (id, nome, avatar, created_at) on public.users to anon, authenticated;

-- Disciplina (add-contador-wo-tecnico): re-fecha o SELECT de anon em wo_perdoes que
-- o `grant all` acima reabriu — espelha o `revoke select ... from anon` do schema.sql
-- (anon falha-fechado 42501; authenticated fica gated pela policy).
revoke select on public.wo_perdoes from anon;
