-- =====================================================================
-- RLS + trigger: slot_invites — vaga POR-NOME nunca aceita convite
-- ---------------------------------------------------------------------
-- Invariante do modelo por-nome (forja latente da Auditoria 2): uma vaga por
-- NOME (team_id null + rotulo) não tem técnico nem convite — o organizador
-- lança os placares. Defesa em profundidade: o trigger SECURITY DEFINER
-- `block_slot_invite_por_nome` (raise SLOT_POR_NOME) E a RLS
-- `slot_invites_insert_owner` (with check exige team_id not null + moderador).
-- =====================================================================
\set ON_ERROR_STOP on
begin;
select plan(3);

-- DENY (TRIGGER): nem o DONO cria convite para uma vaga POR-NOME.
-- O trigger BEFORE INSERT dispara antes da checagem de RLS e levanta P0001.
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ insert into public.slot_invites (slot_id, code)
     values ('00000000-0000-0000-0000-0000000000c3', 'CONVITE-PORNOME') $$,
  'P0001', 'SLOT_POR_NOME',
  'DENY: trigger bloqueia convite para vaga por-nome (mesmo do dono)'
);

-- ALLOW: o dono cria convite para uma vaga TEAM-BASED normal.
select lives_ok(
  $$ insert into public.slot_invites (slot_id, code)
     values ('00000000-0000-0000-0000-0000000000c1', 'CONVITE-VALIDO') $$,
  'ALLOW: dono cria convite para vaga team-based'
);

-- DENY (RLS): um terceiro (não-moderador) não cria convite nem para vaga válida.
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-000000000004","role":"authenticated"}';
select throws_ok(
  $$ insert into public.slot_invites (slot_id, code)
     values ('00000000-0000-0000-0000-0000000000c2', 'CONVITE-INVASOR') $$,
  '42501', null,
  'DENY: terceiro nao-moderador nao cria convite (RLS)'
);

select * from finish();
rollback;
