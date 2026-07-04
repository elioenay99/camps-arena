## Why

Segunda frente de HARDENING: endurecer a INTEGRAÇÃO CONTÍNUA. O `ci.yml` atual
roda só `typecheck + lint + test` num job `quality`, com as Actions em TAGS
MÓVEIS (`@v6`) — mutáveis por quem controla a tag (risco de supply-chain). As
auditorias apontaram os gaps: "CI sem build/audit/SHA/drift" e "ZERO testes de
RLS reais". Esta change fecha quatro deles, tudo ADITIVO e SEM segredo do dono:

1. **Sem BUILD no CI.** `typecheck` não pega erros que só o `next build` acusa
   (prerender, avaliação de `next.config.ts`, resolução de módulos server/client).
   Um PR pode passar os gates e quebrar o deploy do Vercel.
2. **Sem varredura de dependências.** Nenhum `pnpm audit` — vulnerabilidade
   conhecida numa dependência passa despercebida.
3. **Actions em tags móveis + sem atualização automatizada.** `@v6` pode ser
   re-apontada para um commit malicioso; e sem Dependabot os pins envelhecem.
4. **Schema nunca é exercido no CI.** `supabase/schema.sql` (fonte de verdade)
   só é validado quando o dono o aplica à mão. Um schema quebrado ou
   NÃO-idempotente só aparece no apply manual — tarde demais.

## What Changes

- **Job `build` (`needs: quality`).** Roda `pnpm build`. Como `next.config.ts`
  importa `src/lib/env.ts` (parse fail-fast) e faz `new URL(NEXT_PUBLIC_SUPABASE_URL)`,
  o job seta PLACEHOLDERS públicos e sintéticos (`https://dummy.supabase.co` +
  `dummy-anon-key`, espelhando os dummies da `vitest.config.ts`). Zero segredo real.
- **Job `audit` (não-bloqueante).** `pnpm audit --audit-level=high` com
  `continue-on-error: true` — reporta high/critical sem reprovar o merge por ora
  (endurecer para bloquear fica de follow-up).
- **SHA-pinning das 3 Actions + Dependabot.** Cada `uses: X@v6` vira
  `uses: X@<sha40> # vX.Y.Z` (o commit exato que a tag `v6` aponta hoje). Novo
  `.github/dependabot.yml` (ecossistemas `github-actions` e `npm`, weekly) mantém
  os pins/deps atualizados por PRs que os próprios gates validam.
- **Job `schema` (o mais valioso, SEM segredo).** Sobe um service container
  `postgres:17` (mesmo major do `supabase/config.toml`) e aplica o schema:
  `ci-bootstrap.sql` (pré-requisitos da plataforma) → `schema.sql` passe 1
  tolerante (forward-refs) → `schema.sql` passe 2 ESTRITO (idempotência) →
  `local-grants.sql` estrito. Pega schema quebrado ou não-idempotente.
- **`supabase/ci-bootstrap.sql` (novo).** Stubs mínimos do que a plataforma
  Supabase provê e um Postgres cru não tem: papéis `anon`/`authenticated`/
  `service_role`, schema `auth` (`auth.users`, `auth.uid()`), schema `storage`
  (`buckets`, `objects` c/ RLS, `foldername()`) e a publication
  `supabase_realtime`. Só para o CI — NUNCA aplicado em produção.
- **Idempotência de `schema.sql` (higiene da fonte de verdade, SEM DDL p/ o dono).**
  As 4 policies de `public.push_subscriptions` (`_select_self`/`_insert_self`/
  `_update_self`/`_delete_self`) eram criadas SEM `drop policy if exists` antes —
  o passe 2 falhava (`policy ... already exists`). Adicionado o guarda a cada uma,
  igual ao restante do arquivo. O banco APLICADO em prod NÃO muda (lá foram
  aplicadas uma vez; o guarda é no-op num apply limpo) — é higiene idempotente,
  sem DDL para o dono rodar.

## Capabilities

### Modified Capabilities
- `continuous-integration`: o CI passa a incluir build de produção, varredura de
  dependências, Actions fixadas por SHA (com atualização automatizada) e a
  validação de aplicação idempotente do `schema.sql` num Postgres efêmero.
- `data-model`: `supabase/schema.sql` passa a definir as policies de
  `push_subscriptions` de forma idempotente (`drop policy if exists` antes do
  `create policy`), honrando o contrato de idempotência já declarado no arquivo.

### New Capabilities
<!-- Nenhuma. -->

## Impact

- **CI/infra:** `.github/workflows/ci.yml` — jobs `build`, `audit`, `schema`
  novos; 3 Actions pinadas por SHA. `.github/dependabot.yml` — novo.
- **Banco de dados:** `supabase/ci-bootstrap.sql` — NOVO, exclusivo do CI (stubs
  da plataforma; nunca aplicado em prod). `supabase/schema.sql` — 4 `drop policy
  if exists` aditivos (idempotência). **ZERO DDL para o dono aplicar**: o estado
  aplicado em produção é idêntico.
- **Segredos:** nenhum. O build usa placeholders públicos; o job de schema roda
  contra um Postgres local ao runner. Drift real vs. produção
  (`pg_dump`/`supabase db diff` com `DATABASE_URL`/`service_role`) fica de
  FOLLOW-UP (exige segredo do dono em GitHub Secrets) — fora desta change.
- **Dependências:** nenhuma nova.
- **Testes:** a suíte permanece integralmente verde (nenhuma mudança de runtime).
  Gate: typecheck + lint + test + build, mais a validação local do job de schema
  (aplicação limpa num `postgres:17` efêmero).
