# Proposal — add-sentry-observability

## Why

A terceira e última transversal de observabilidade. O app não captura erros de
produção: uma exceção em Server Action, RSC ou no client morre no console do
usuário sem nenhum sinal para o time. Sentry fecha isso — com a restrição
INEGOCIÁVEL do projeto: **PII (o celular BR) NUNCA pode ir para o Sentry**.

## What Changes

- **`@sentry/nextjs` (10.56.0)** instrumentando os 3 runtimes (server, edge,
  client) via os arquivos de convenção do Next 16: `src/instrumentation.ts`
  (`register()` + `onRequestError` para RSC/Server Actions/route handlers/proxy),
  `src/instrumentation-client.ts` (substitui o antigo `sentry.client.config`;
  `onRouterTransitionStart`), `src/sentry.server.config.ts`,
  `src/sentry.edge.config.ts`, e `src/app/global-error.tsx` (boundary de raiz).
- **Escopo: erros + performance** (`tracesSampleRate: 0.1`). **Replay DESLIGADO**
  (`/dashboard/conta` mostra nome/celular/avatar — gravar o DOM seria o maior
  vetor de vazamento visual; ativar depois exige máscara total e `worker-src`).
- **Scrubbing de PII em 3 camadas** (núcleo puro `src/lib/observability/scrub.ts`,
  compartilhado pelos 3 runtimes): (1) `sendDefaultPii: false`; (2)
  `requestDataIntegration({ include: {cookies,data,headers,ip,query_string} →
  false })` no server (corta o FormData de `signup`/`atualizarPerfil` na raiz);
  (3) `beforeSend` + `beforeSendTransaction` + `beforeBreadcrumb` que redigem
  telefone BR e `wa.me` de message/transaction/exception/request/tags/extra/
  contexts/breadcrumbs/spans e forçam `user={id}` (transações de performance
  têm gancho próprio — não passam pelo beforeSend).
- **Transporte por túnel same-origin** (`tunnelRoute: "/sentry-tunnel"`):
  **NÃO muda a CSP** — o browser POSTa same-origin (`connect-src 'self'` já
  cobre) e dribla ad-blockers. O matcher do `proxy.ts` exclui `sentry-tunnel`.
- **Source maps** via `withSentryConfig` (`org`/`project`/`authToken` de env —
  no-op se ausentes; upload roda no build do Vercel, fora do CI).
- **`env.ts`**: `NEXT_PUBLIC_SENTRY_DSN` opcional (no-op sem ele) +
  `sentryAuthToken()` lazy server-only.

## Capabilities

### Added Capabilities

- `observability`: captura de erros/performance com scrubbing de PII obrigatório.

## Impact

- **Criar**: `src/lib/observability/scrub.ts` (+ teste), `src/instrumentation.ts`,
  `src/instrumentation-client.ts`, `src/sentry.server.config.ts`,
  `src/sentry.edge.config.ts`, `src/app/global-error.tsx`.
- **Editar**: `src/lib/env.ts` (DSN + authToken), `next.config.ts`
  (`withSentryConfig`), `src/proxy.ts:37` (matcher exclui o túnel),
  `.env.example`.
- **CSP**: NO-OP (túnel é same-origin). Só mudaria se Replay fosse ativado
  (`worker-src 'self' blob:`) — fora de escopo.
- **Sem DDL. Sem mudança em RLS/motores/actions.** Degradação graciosa total:
  sem DSN nada é enviado; sem auth token os maps não sobem; nenhum quebra
  build/dev/runtime.
- **Credencial do usuário**: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
  (build-only), `SENTRY_ORG`, `SENTRY_PROJECT` — no `.env.local` e no Vercel.
