## 0. Baseline primeiro

- [x] 0.1 Baseline HEAD `d73be97`: `pnpm typecheck`, `pnpm lint`, `pnpm test`,
  `pnpm build` (com env placeholders) — capturado antes de qualquer edição. Verde
  final = igual ao baseline (o app não muda).

## 1. Job de BUILD no CI

- [x] 1.1 Adicionar job `build` com `needs: quality` rodando `pnpm build`.
- [x] 1.2 Setar no `env:` do job os placeholders públicos exigidos por
  `src/lib/env.ts`: `NEXT_PUBLIC_SUPABASE_URL: https://dummy.supabase.co` e
  `NEXT_PUBLIC_SUPABASE_ANON_KEY: dummy-anon-key` (mesmos dummies da vitest). Sem
  segredo real; URL https válida (o `new URL()` do next.config exige).

## 2. Varredura de dependências

- [x] 2.1 Job `audit` com `pnpm audit --audit-level=high` e
  `continue-on-error: true` (não-bloqueante por ora).

## 3. SHA-pinning das Actions + Dependabot

- [x] 3.1 Resolver os SHAs via `git ls-remote 'refs/tags/v6*'` (linha `^{}` da
  maior v6.x): checkout `df4cb1c…` (v6.0.3), pnpm/action-setup `0ebf471…`
  (v6.0.9), setup-node `48b55a0…` (v6.4.0).
- [x] 3.2 Trocar cada `uses: X@v6` por `uses: X@<sha40> # vX.Y.Z` em TODOS os jobs.
- [x] 3.3 Criar `.github/dependabot.yml` com `github-actions` (/, weekly) e `npm`
  (/, weekly).

## 4. Job de aplicação do schema (Postgres efêmero, sem segredo)

- [x] 4.1 Criar `supabase/ci-bootstrap.sql` com os pré-requisitos da plataforma
  que um Postgres cru não tem: papéis anon/authenticated/service_role, schema
  `auth` (`auth.users`, `auth.uid()`), schema `storage`
  (`buckets`/`objects`+RLS/`foldername()`) e a publication `supabase_realtime`.
- [x] 4.2 Adicionar job `schema` com service container `postgres:17` (health
  check) e a sequência: bootstrap (estrito) → schema.sql passe 1 (tolerante) →
  schema.sql passe 2 (estrito) → local-grants.sql (estrito).
- [x] 4.3 Corrigir a não-idempotência exposta pelo passe 2: adicionar
  `drop policy if exists` antes das 4 policies de `push_subscriptions` em
  `schema.sql` (higiene; ZERO DDL para o dono — banco aplicado idêntico).
- [x] 4.4 VALIDAR localmente num `postgres:17` descartável (`docker run --rm`):
  rodar a MESMA sequência e confirmar exit 0 nos passes estritos
  (`SCHEMA_APPLY_CLEAN`); derrubar o container.

## 5. Gate mecânico

- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (com env
  placeholders) — VERDE, igual ao baseline 0.1.
- [x] 5.2 `openspec validate add-ci-hardening --strict` = valid.
- [ ] 5.3 Revisão adversarial do diff + gate autoritativo. (ORQUESTRADOR)
