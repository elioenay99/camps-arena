# Design — add-ci-hardening

## Contexto

`ci.yml` é hoje um único job `quality` (checkout → pnpm → node 22 → install
`--frozen-lockfile` → typecheck → lint → test), com Actions em tags móveis `@v6`.
A suíte é hermética (mocks de Supabase/next-cache/API-Football) e não usa segredos.

## Decisões

### 1. Build como job separado (`needs: quality`)
`build` depende de `quality` para não gastar minutos compilando um PR que já
falhou nos gates baratos. Reinstala deps (job isolado) — o cache do pnpm via
`actions/setup-node` (`cache: pnpm`) amortiza. Alternativa considerada: `pnpm
build` como passo final do job `quality`. Rejeitada: um job dedicado paraleliza
com `audit`/`schema` e isola o custo do build atrás do gate de qualidade.

### 2. Placeholders de env no build (sem segredo)
`next build` avalia `next.config.ts`, que importa `src/lib/env.ts` (parse eager
fail-fast via Zod) e faz `new URL(env.NEXT_PUBLIC_SUPABASE_URL)`. O contrato de
`src/lib/env.ts` exige `NEXT_PUBLIC_SUPABASE_URL` (URL http(s) válida) e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (`min(1)`); as demais são opcionais. O job seta
`https://dummy.supabase.co` + `dummy-anon-key` — MESMOS dummies da
`vitest.config.ts`, públicos e sintéticos. Sentry/VAPID ficam ausentes (upload de
source map é pulado; push é no-op). Nenhum segredo real toca o CI.

### 3. SHA-pinning + Dependabot
Tags como `@v6` são mutáveis (o mantenedor pode re-apontar para outro commit).
Pinar no SHA de 40 chars congela o código exato executado; o comentário `# vX.Y.Z`
preserva a legibilidade. Para os pins não envelhecerem, o Dependabot (ecossistema
`github-actions`) abre PRs bumpando o SHA quando sai release; o ecossistema `npm`
faz o mesmo para as deps. Cada PR do Dependabot passa pelos gates antes do merge.

SHAs fixados (resolvidos por `git ls-remote 'refs/tags/v6*'`, linha
desreferenciada `^{}` da maior `v6.x`):
- `actions/checkout`   → `df4cb1c069e1874edd31b4311f1884172cec0e10` (v6.0.3)
- `pnpm/action-setup`  → `0ebf47130e4866e96fce0953f49152a61190b271` (v6.0.9)
- `actions/setup-node` → `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` (v6.4.0)

### 4. Job de schema num Postgres efêmero (o núcleo)
Um service container `postgres:17` (major casando `supabase/config.toml`)
recebe o `schema.sql`. O desafio: `schema.sql` assume objetos que a PLATAFORMA
Supabase provisiona e um Postgres CRU não tem — papéis `anon`/`authenticated`/
`service_role`, schemas `auth`/`storage` (com `auth.users`, `auth.uid()`,
`storage.buckets/objects/foldername`) e a publication `supabase_realtime`.

Solução: `supabase/ci-bootstrap.sql` cria STUBS mínimos desses objetos (só o
suficiente para o schema compilar e exercer a idempotência; `auth.uid()` retorna
NULL — nenhuma autenticação real). É EXCLUSIVO do CI e nunca aplicado em prod
(lá a plataforma já provê tudo).

Sequência (espelha a receita do dev local, com o bootstrap na frente):
1. `ci-bootstrap.sql` — ESTRITO (`ON_ERROR_STOP=1`).
2. `schema.sql` passe 1 — TOLERANTE (`|| true`): há forward-refs (a coluna
   `rodada` e helpers de capacidade referenciados antes de definidos) que só
   resolvem no 2º passe; erros aqui são esperados.
3. `schema.sql` passe 2 — ESTRITO: tudo já existe, então TEM de aplicar limpo.
   É o passe que pega não-idempotência (`create` sem `drop if exists`).
4. `local-grants.sql` — ESTRITO: paridade de privilégios (sem ele PostgREST/anon
   quebraria em runtime).

O passe 2 estrito expôs uma não-idempotência REAL: as 4 policies de
`push_subscriptions` não tinham `drop policy if exists` antes do `create` —
corrigido em `schema.sql` (higiene, sem mudar o banco aplicado). A validação foi
confirmada localmente num `postgres:17` descartável (`docker run --rm`): passes 2
e grants aplicaram com exit 0 (`SCHEMA_APPLY_CLEAN`).

`wal_level` do Postgres do runner é `replica` (default), o que emite um WARNING
benigno ao criar a publication `supabase_realtime` vazia — não é erro e não
reprova o passo (exit 0).

### 5. Audit não-bloqueante por ora
`pnpm audit --audit-level=high` com `continue-on-error: true`: dá visibilidade de
vulnerabilidades sem travar o fluxo enquanto o baseline de avisos não é zerado.
Endurecer para reprovar em high/critical é follow-up.

## Fora de escopo (follow-up do dono)
- **Drift real vs. produção.** Comparar o `schema.sql` com o schema APLICADO em
  prod (`supabase db diff` / `pg_dump`) exige `DATABASE_URL`/`service_role` num
  GitHub Secret — segredo do dono. O job de schema aqui valida APLICABILIDADE e
  IDEMPOTÊNCIA, não paridade com prod.
- **Audit bloqueante** (falhar em high/critical) após zerar o baseline.
- **Testes de RLS reais** (a auditoria apontou "ZERO testes de RLS") — o Postgres
  efêmero deste job é a fundação natural para isso numa change futura.
