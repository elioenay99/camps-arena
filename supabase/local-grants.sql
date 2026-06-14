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
