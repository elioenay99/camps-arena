## 1. Harness pgTAP (provar antes de escalar)

- [x] 1.1 Vendorizar pgTAP 1.3.3 puro-SQL em `supabase/tests/pgtap-1.3.3.sql`
- [x] 1.2 `supabase/tests/_setup.sql`: `auth.uid()` realista (lê o JWT) + seed
      determinístico como superuser (`session_replication_role = replica`)
- [x] 1.3 `supabase/tests/run.sh`: modo LOCAL (docker `postgres:17` efêmero) e
      modo CI externo; aplica bootstrap → schema (2 passes) → grants → pgTAP →
      seed → roda os `.sql`; falha em qualquer `not ok` ou erro SQL cru
- [x] 1.4 Provar o harness ponta-a-ponta: 1 ALLOW + 1 DENY passando

## 2. Suíte por área (itens prioritários)

- [x] 2.1 `rls_matches.sql` — select_visivel, update_participant, update_owner
- [x] 2.2 `rls_tournaments.sql` — vazamento de rascunho (tournaments +
      league_competitions) + update/delete do dono
- [x] 2.3 `rls_slots.sql` — trigger `block_slot_invite_por_nome` (vaga por-nome)
- [x] 2.4 `rls_storage.sql` — `match_score_proposals` foto_path amarrado à pasta
- [x] 2.5 `rls_users.sql` — PII `celular` fechada (grant de coluna)

## 3. Integração (separada do run hermético)

- [x] 3.1 `package.json`: script `test:rls`
- [x] 3.2 `.github/workflows/ci.yml`: job DEDICADO `rls-tests` (service
      `postgres:17`), sem tocar o job `quality`

## 4. Verificação

- [x] 4.1 Rodar a suíte localmente no docker: todos os testes RLS passam
- [x] 4.2 `openspec validate add-rls-integration-tests --strict` = valid
- [x] 4.3 Run hermético intacto: `pnpm typecheck && pnpm lint && pnpm test` verdes
