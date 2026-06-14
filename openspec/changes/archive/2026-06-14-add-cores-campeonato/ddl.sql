-- add-cores-campeonato — DDL aditiva e idempotente.
-- Cores de identidade (hex #rrggbb minúsculo, nullable) por campeonato e por divisão.
-- ALTER TABLE ... ADD CONSTRAINT não aceita IF NOT EXISTS → drop-if-exists antes do add
-- (padrão do repo). Reaplicável sem 42710.

-- tournaments
alter table public.tournaments add column if not exists cor_primaria  text;
alter table public.tournaments add column if not exists cor_secundaria text;
alter table public.tournaments drop constraint if exists tournaments_cor_primaria_hex;
alter table public.tournaments add  constraint tournaments_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$');
alter table public.tournaments drop constraint if exists tournaments_cor_secundaria_hex;
alter table public.tournaments add  constraint tournaments_cor_secundaria_hex
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$');

-- league_competitions (default da pirâmide)
alter table public.league_competitions add column if not exists cor_primaria  text;
alter table public.league_competitions add column if not exists cor_secundaria text;
alter table public.league_competitions drop constraint if exists league_competitions_cor_primaria_hex;
alter table public.league_competitions add  constraint league_competitions_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$');
alter table public.league_competitions drop constraint if exists league_competitions_cor_secundaria_hex;
alter table public.league_competitions add  constraint league_competitions_cor_secundaria_hex
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$');

-- league_division_seasons (override por divisão; copiada entre temporadas)
alter table public.league_division_seasons add column if not exists cor_primaria  text;
alter table public.league_division_seasons add column if not exists cor_secundaria text;
alter table public.league_division_seasons drop constraint if exists league_division_seasons_cor_primaria_hex;
alter table public.league_division_seasons add  constraint league_division_seasons_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$');
alter table public.league_division_seasons drop constraint if exists league_division_seasons_cor_secundaria_hex;
alter table public.league_division_seasons add  constraint league_division_seasons_cor_secundaria_hex
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$');
