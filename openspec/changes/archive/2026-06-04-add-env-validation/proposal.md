## Why

O app lê variáveis de ambiente em 8 pontos com `process.env.X!` (non-null assertion) ou fallback silencioso, sem nenhuma validação:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` com `!` em `src/lib/supabase/client.ts:11-12`, `server.ts:14-15` e `middleware.ts:23-24` — se faltarem num deploy, o erro aparece como crash criptíco do `@supabase/ssr` na primeira request (ou pior: `undefined` vira string na URL), não como mensagem clara no build/boot.
- `NEXT_PUBLIC_SITE_URL` com fallback inline em `src/app/layout.tsx:21` — um deploy de produção sem ela gera metadados/OG apontando para `localhost:3000` **silenciosamente**.
- `API_FOOTBALL_KEY` em `src/actions/teams.ts:74` — já tem degradação graciosa (correto), mas é o único acesso documentado; o restante do app não tem contrato de env.

Fail-fast contra deploy quebrado é item do Tier 0 do roadmap: detectar configuração inválida no **build/boot**, com mensagem que nomeia cada variável, em vez de quebrar em runtime na cara do usuário.

## What Changes

- **Novo módulo central `src/lib/env.ts`**: schema Zod das variáveis de runtime, parse **no load do módulo** (fail-fast) com mensagem em pt-BR nomeando cada variável ausente/inválida. Campos em branco (`VAR=`) contam como ausentes.
- **Referências estáticas** a `process.env.NEXT_PUBLIC_*` (exigência do inlining do Next em client bundles); `NEXT_PUBLIC_SITE_URL` ganha default `http://localhost:3000` no schema (comportamento atual preservado).
- **`API_FOOTBALL_KEY` continua opcional e lida em runtime** via accessor `apiFootballKey()` no mesmo módulo — preserva a degradação graciosa especificada em `team-search` e a leitura por chamada (Server Action, server-only).
- **Consumidores refatorados** para o módulo central: `src/lib/supabase/{client,server,middleware}.ts`, `src/app/layout.tsx`, `src/actions/teams.ts`. Zero `process.env` fora de `src/lib/env.ts` no runtime do app.
- **`next.config.ts` importa o módulo** (side-effect) — validação roda no início de `next build`/`next dev`, não no meio do prerender.
- **`vitest.config.ts`** ganha `test.env` com dummies das públicas (o parse eager roda em qualquer teste que importe transitivamente o módulo).
- **Testes** de `parseEnv`/`apiFootballKey` em `src/lib/env.test.ts`.

## Capabilities

### New Capabilities
- `env-validation`: contrato e validação fail-fast das variáveis de ambiente de runtime.

### Modified Capabilities
<!-- Nenhuma: team-search mantém a degradação graciosa sem a chave (comportamento inalterado). -->

## Impact

- **Código**: novo `src/lib/env.ts`; edições em `src/lib/supabase/client.ts`, `server.ts`, `middleware.ts`, `src/app/layout.tsx`, `src/actions/teams.ts`, `next.config.ts`, `vitest.config.ts`, `.env.example` (nota).
- **Testes**: novo `src/lib/env.test.ts`; `teams.test.ts` continua válido (stub de `API_FOOTBALL_KEY` por teste segue funcionando — leitura em runtime).
- **Deploy**: builds na Vercel já têm as variáveis injetadas (integração Supabase) — nenhuma ação. Um build SEM elas passa a falhar cedo e com mensagem clara (objetivo da change).
- **Não-impacto**: nenhum DDL; nenhuma mudança de contrato de Server Action; `SUPABASE_SERVICE_ROLE_KEY`/`DATABASE_URL` ficam fora do schema (não são lidas pelo runtime do app — documentado no `.env.example`).
- **Risco**: baixo. O parse eager roda também no client bundle (valores públicos inlined) — valores válidos em build implicam parse válido no browser; default de `SITE_URL` mantém o demo local sem `.env.local` completo funcionando.
