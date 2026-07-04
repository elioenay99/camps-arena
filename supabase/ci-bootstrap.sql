-- =====================================================================
-- Bootstrap de PRÉ-REQUISITOS para aplicar `schema.sql` num Postgres CRU (CI)
-- ---------------------------------------------------------------------
-- O `supabase/schema.sql` (fonte de verdade) assume objetos que a PLATAFORMA
-- Supabase provisiona automaticamente e que um `postgres:17` avulso NÃO tem:
--   - papéis `anon`, `authenticated`, `service_role`;
--   - schema `auth` com a tabela `auth.users` (alvo de FK) e `auth.uid()`;
--   - schema `storage` com `storage.buckets`, `storage.objects` (RLS) e
--     `storage.foldername()`.
--
-- Este arquivo cria STUBS MÍNIMOS desses objetos — apenas o suficiente para
-- que `schema.sql` aplique e para exercer sua idempotência num Postgres
-- efêmero de CI. NÃO reproduz a semântica do GoTrue/Storage (auth.uid()
-- retorna NULL; nenhuma autenticação real acontece) e NUNCA deve ser aplicado
-- num banco de produção — lá a plataforma já provê tudo isto. É idempotente.
--
-- Ordem de aplicação no CI (Postgres cru):
--   1. psql -f supabase/ci-bootstrap.sql      (ON_ERROR_STOP=1)
--   2. psql -f supabase/schema.sql            (passe 1, tolerante — forward-ref)
--   3. psql -f supabase/schema.sql            (passe 2, ON_ERROR_STOP=1)
--   4. psql -f supabase/local-grants.sql      (ON_ERROR_STOP=1)
-- =====================================================================

-- ---------- Papéis (NOLOGIN; a plataforma cria com atributos ricos) ----------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end$$;

-- ---------- Schema auth ----------
create schema if not exists auth;

-- Alvo da FK `public.users.id -> auth.users(id)`. Só a coluna `id` importa
-- para o schema.sql; as demais colunas do GoTrue são irrelevantes aqui.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid()
);

-- `auth.uid()` real lê o JWT da request; no CI é um stub que retorna NULL
-- (nenhuma linha é avaliada — só precisamos que a função exista para as
-- policies compilarem). `stable` espelha a assinatura da plataforma.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select null::uuid;
$$;

-- ---------- Schema storage ----------
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;

-- `storage.foldername(name)` real: divide o path por '/' e devolve os
-- segmentos de PASTA (sem o nome do arquivo). As policies usam `[1]`.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
stable
as $$
declare
  parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

-- ---------- Realtime ----------
-- A plataforma provisiona a publication `supabase_realtime`. O `schema.sql`
-- publica `public.matches` nela por um bloco guardado que assume que a
-- publication EXISTE; num Postgres cru ela não existe. Criamos vazia (a
-- plataforma faz o mesmo) para o guard do schema poder adicionar a tabela.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end$$;

-- Privilégios de uso dos schemas da plataforma (a plataforma já os concede).
grant usage on schema auth, storage to anon, authenticated, service_role;
