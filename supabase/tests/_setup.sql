-- =====================================================================
-- Setup do banco de teste RLS (aplicado DEPOIS de bootstrap + schema + grants)
-- ---------------------------------------------------------------------
-- Fecha o falso-verde estrutural dos ~100 testes herméticos (vi.mock do
-- Supabase): aqui as ~101 policies RLS reais e os SECURITY DEFINER são
-- EXERCITADOS num Postgres de verdade. Dois pilares:
--
--   1. `auth.uid()` REALISTA (não o stub NULL do ci-bootstrap.sql, que existe
--      só para o schema.sql COMPILAR): lê o `sub` do JWT que cada teste injeta
--      via `set local request.jwt.claims`. Com isso as policies reagem ao
--      "usuário logado" simulado, exatamente como no PostgREST em produção.
--
--   2. Seed DETERMINÍSTICO com UUIDs fixos, inserido como SUPERUSER (postgres),
--      que bypassa RLS — o "service_role" do briefing. Só INSERTs: nenhum
--      trigger BEFORE UPDATE de matches/slots dispara na semeadura.
--
-- Ordem de aplicação (ver supabase/tests/run.sh e o job rls-tests do CI):
--   1. supabase/ci-bootstrap.sql   (roles, auth/storage, publication)
--   2. supabase/schema.sql x2      (fonte de verdade; forward-ref → 2 passes)
--   3. supabase/local-grants.sql   (DML a anon/authenticated; PII fechada)
--   4. supabase/tests/pgtap-1.3.3.sql  (pgTAP puro-SQL, vendorizado)
--   5. supabase/tests/_setup.sql   (ESTE arquivo: auth.uid real + seed)
--   6. supabase/tests/rls_*.sql    (as asserções por papel)
--
-- NÃO tocar em produção: este arquivo cria dados fictícios num Postgres
-- efêmero. NUNCA aplicar num banco real.
-- =====================================================================

-- ---------- auth.uid() REALISTA (sobrescreve o stub NULL do bootstrap) ----------
-- Espelha a implementação da plataforma Supabase: o `sub` (subject) do JWT.
-- `stable` para casar a assinatura usada pelas policies e pelos DEFINER.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  )::uuid
$$;

-- ---------- Seed determinístico (como superuser: bypassa RLS) ----------
-- Idempotente (UUIDs fixos + limpeza), para permitir re-run contra o mesmo
-- container durante o desenvolvimento.
--
-- `session_replication_role = replica` desliga os TRIGGERS de usuário (e as RI
-- triggers) durante a semeadura — é o modo canônico de seed por superuser. Sem
-- ele o trigger `handle_new_user` dispararia no INSERT em `auth.users` e leria
-- `new.raw_user_meta_data`, coluna que o stub do ci-bootstrap não tem. A ordem
-- de DELETE/INSERT abaixo respeita as FKs manualmente (cascade fica off aqui).
set session_replication_role = replica;

-- Limpa em ordem de dependência (FKs) antes de re-semear.
delete from public.slot_invites          where slot_id in (
  '00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000c3');
delete from public.match_score_proposals where match_id in (
  '00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3');
delete from public.matches               where tournament_id in (
  '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
delete from public.tournament_slots      where tournament_id in (
  '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
delete from public.participants          where tournament_id in (
  '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
delete from public.tournaments           where id in (
  '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2');
delete from public.league_competitions   where id in (
  '00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000e2');
delete from public.teams                 where id in (
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000a2');
delete from public.users                 where id in (
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');
delete from auth.users                   where id in (
  '00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');

-- Usuários: dono, dois técnicos/participantes, um terceiro sem relação.
insert into auth.users (id) values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000003'),
  ('00000000-0000-0000-0000-000000000004');

insert into public.users (id, nome, celular, avatar) values
  ('00000000-0000-0000-0000-000000000001', 'Dono',        '+5511900000001', null),
  ('00000000-0000-0000-0000-000000000002', 'Tecnico Um',  '+5511900000002', null),
  ('00000000-0000-0000-0000-000000000003', 'Tecnico Dois', '+5511900000003', null),
  ('00000000-0000-0000-0000-000000000004', 'Terceiro',    '+5511900000004', null);

-- Clubes (referenciados por vagas team-based).
insert into public.teams (id, nome, provider, external_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'Clube A', 'api-football', '9001'),
  ('00000000-0000-0000-0000-0000000000a2', 'Clube B', 'api-football', '9002');

-- Torneios: um PÚBLICO e um PRIVADO (vazamento de rascunho). Formato avulso.
insert into public.tournaments (id, titulo, status, created_by, is_public, formato) values
  ('00000000-0000-0000-0000-0000000000b1', 'Torneio Publico', 'ativo',    '00000000-0000-0000-0000-000000000001', true,  'avulso'),
  ('00000000-0000-0000-0000-0000000000b2', 'Torneio Privado', 'rascunho', '00000000-0000-0000-0000-000000000001', false, 'avulso');

-- Participante confirmado do torneio PRIVADO (descoberta pós-convite): U_P1
-- enxerga o privado por eh_participante(); o terceiro não.
insert into public.participants (tournament_id, user_id) values
  ('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000002');

-- Vagas do torneio público: duas team-based (com técnico) e uma POR-NOME
-- (team_id null + rotulo; nunca aceita convite — trigger block_slot_invite_por_nome).
insert into public.tournament_slots (id, tournament_id, team_id, user_id, rotulo) values
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000002', null),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-000000000003', null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', null,                                   null,                                   'Fulano');

-- Partidas do torneio público:
--   M_USERS  — participante-based, LIBERADA (matches_update_participant / select).
--   M_HIDDEN — participante-based, NÃO liberada (não visível a terceiro).
--   M_VAGA   — vaga-based, LIBERADA (proposta de placar com foto / storage).
insert into public.matches (id, tournament_id, participante_1, participante_2, vaga_1, vaga_2, status, liberada_em) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', null, null, 'agendada', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003', null, null, 'agendada', null),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b1', null, null, '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2', 'agendada', now() - interval '1 hour');

-- Pirâmides de liga: uma ATIVA (pública) e uma ARQUIVADA (vazamento).
insert into public.league_competitions (id, nome, created_by, status, is_public) values
  ('00000000-0000-0000-0000-0000000000e1', 'Liga Ativa',     '00000000-0000-0000-0000-000000000001', 'ativa',     true),
  ('00000000-0000-0000-0000-0000000000e2', 'Liga Arquivada', '00000000-0000-0000-0000-000000000001', 'arquivada', true);

reset session_replication_role;
