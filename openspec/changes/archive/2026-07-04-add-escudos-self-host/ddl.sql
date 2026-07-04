-- ============================================================
-- DDL da change add-escudos-self-host — APLICAR MANUALMENTE no Supabase
-- ============================================================
-- Fonte de verdade: supabase/schema.sql (este arquivo é o recorte exato desta
-- change, para aplicação isolada). O dono aplica no SQL Editor / MCP com
-- autorização. Idempotente. NÃO rodar sem revisar os counts de pré-checagem.
--
-- ORDEM: aplicar esta DDL ANTES de rodar scripts/backfill-escudos.ts (a CHECK
-- relaxada precisa aceitar a URL do Storage; senão o UPDATE do backfill falha).

-- ------------------------------------------------------------
-- 0. Pré-checagem (rodar ANTES; só prosseguir se o count = 0)
-- ------------------------------------------------------------
-- A CHECK abaixo é ADITIVA (aceita tudo que a anterior aceitava + o Storage),
-- então não deveria falhar. Ainda assim, confira que não há URL fora dos hosts
-- confiáveis (legado inesperado):
--   select count(*) from public.teams
--   where escudo_url is not null
--     and escudo_url not like 'https://media.api-sports.io/%'
--     and escudo_url not like 'https://%.supabase.co/storage/v1/object/public/escudos/%'
--     and escudo_url not like 'http://127.0.0.1:54321/storage/v1/object/public/escudos/%';

-- ------------------------------------------------------------
-- 1. Bucket público `escudos` (cache compartilhado de escudos)
-- ------------------------------------------------------------
-- Espelha o hardening do `avatars`. Limites em defesa em profundidade: 256KB e
-- {png,webp} — SVG fica FORA (mata SVG-XSS armazenado, como no avatars). A app
-- grava sempre image/png; webp por robustez. `do update` aplica os limites mesmo
-- se o bucket já existir.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('escudos', 'escudos', true, 262144,
        array['image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- 2. Policies de storage.objects para o bucket `escudos`
-- ------------------------------------------------------------
-- SEM policy SELECT ampla (evita LISTAR todos os escudos; leitura por URL
-- direta, o bucket é público). INSERT liberado a `authenticated` (cache
-- compartilhado, mesmo nível de confiança de inserir em public.teams), MAS com
-- `name` ANCORADO a `<external_id>.png` (external_id numérico) — bloqueia hosting
-- de arquivo/path arbitrário por autenticado. SEM UPDATE/DELETE amplas — o escudo
-- é WRITE-ONCE via anon/authenticated (imutável). O backfill usa service_role,
-- que ignora a RLS (upsert/reprocesso de qualquer chave liberados).
drop policy if exists "escudos leitura publica" on storage.objects;

drop policy if exists "escudos insert autenticado" on storage.objects;
create policy "escudos insert autenticado" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'escudos' and name ~ '^[0-9]+\.png$');

-- ------------------------------------------------------------
-- 3. Relaxar a CHECK teams_escudo_url_dominio (aditiva)
-- ------------------------------------------------------------
-- Aceita api-sports (transição) OU a URL pública do bucket `escudos` OU nulo.
-- Os ramos do Storage ANCORAM o host (`https://%.supabase.co/...` prod +
-- `http://127.0.0.1:54321/...` local): `%` só no meio (sub-ref) e no fim (path),
-- NUNCA na frente do host — senão `http://169.254.169.254/x/storage/v1/object/
-- public/escudos/y.png` passaria e abriria SSRF no sink (og/rodada.tsx). Como a
-- RLS de teams não valida escudo_url, esta CHECK é a única defesa no banco contra
-- POST direto via anon key. O ramo api-sports pode SAIR pós-backfill 100%.
alter table public.teams drop constraint if exists teams_escudo_url_dominio;
alter table public.teams
  add constraint teams_escudo_url_dominio
  check (
    escudo_url is null
    or escudo_url like 'https://media.api-sports.io/%'
    or escudo_url like 'https://%.supabase.co/storage/v1/object/public/escudos/%'
    or escudo_url like 'http://127.0.0.1:54321/storage/v1/object/public/escudos/%'
  );
