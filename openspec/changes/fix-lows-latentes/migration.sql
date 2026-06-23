-- Migration: fix-lows-latentes / D1 — sanidade do cache de clubes (teams)
--
-- Defesa no banco: CHECKs em `teams.nome`/`teams.external_id` (valem p/ POST direto
-- via anon key, que ignora o Zod do app) + policy de INSERT espelhando os predicados.
--
-- APLICAR LOCAL via psql e PROD via MCP mostrando o SQL (REGRA 4).
--
-- PRÉ-CHECAGEM OBRIGATÓRIA (rodar ANTES; só aplicar se AMBOS retornarem 0 — senão
-- sanear os registros legados com o dono):
--   select count(*) from public.teams
--   where char_length(btrim(nome)) not between 1 and 80;
--   select count(*) from public.teams
--   where external_id is not null and external_id !~ '^[0-9]+$';

alter table public.teams drop constraint if exists teams_nome_tam;
alter table public.teams
  add constraint teams_nome_tam
  check (char_length(btrim(nome)) between 1 and 80);

alter table public.teams drop constraint if exists teams_external_id_num;
alter table public.teams
  add constraint teams_external_id_num
  check (external_id is null or external_id ~ '^[0-9]+$');

drop policy if exists teams_insert_authenticated on public.teams;
create policy teams_insert_authenticated on public.teams
  for insert to authenticated
  with check (
    char_length(btrim(nome)) between 1 and 80
    and (external_id is null or external_id ~ '^[0-9]+$')
  );
