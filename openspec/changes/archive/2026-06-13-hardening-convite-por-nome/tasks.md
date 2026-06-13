# Tasks — hardening-convite-por-nome

## 1. Banco (DDL em prod via MCP, mostrando o SQL antes)

- [x] 1.1 SELECT read-only de pré-checagem: 2 vagas por-nome, 18 convites,
      **0 órfãos** apontando para vaga por-nome (invariante já vale).
- [x] 1.2 Trigger `block_slot_invite_por_nome` (BEFORE INSERT OR UPDATE em
      `slot_invites`): exceção `SLOT_POR_NOME` se a vaga é por-nome
      (`team_id IS NULL`). Sem exceção de service_role (de propósito).
- [x] 1.3 Recriadas `slot_invites_insert_owner`/`_update_owner` com
      `and s.team_id is not null` no `with check`. Migração `hardening_convite_por_nome`
      aplicada em prod (`bfxmdypdxbbfedtqsqik`); objetos confirmados por read.
- [x] 1.4 Espelhado em `supabase/schema.sql` (função+trigger + policies).

## 2. Server Action (guard de UX)

- [x] 2.1 `regenerarConviteVaga`: select inclui `team_id`; recusa vaga por-nome
      com "Vagas por nome não usam convite." antes de tocar `slot_invites`.

## 3. Testes

- [x] 3.1 `slots.test.ts`: caso novo (vaga por-nome → recusada, sem upsert);
      `Cenario.slot` estendido com `team_id`; casos de regenerar de clube marcam
      `team_id: TEAM` (fidelidade). 32 testes no arquivo (31 + 1).

## 4. Validação (gates automáticos)

- [x] 4.1 Gates: typecheck / lint / test (854/854) / build.
- [x] 4.2 Banco AO VIVO (com rollback garantido): vaga por-nome → trigger barra
      (`SLOT_POR_NOME`); vaga de clube → passa (`OK_CLUBE_PASSA_TRIGGER`).
- [ ] 4.3 Workflow de revisão adversarial do diff; aplicar fixes; commit + push +
      CI + archive.
