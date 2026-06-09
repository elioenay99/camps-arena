# Tasks — add-sentry-observability

## 1. Env e núcleo de scrubbing

- [x] 1.1 `src/lib/env.ts`: `NEXT_PUBLIC_SENTRY_DSN` opcional no schema + parseEnv;
      `sentryAuthToken()` lazy server-only.
- [x] 1.2 `src/lib/observability/scrub.ts`: `scrubEvent`/`scrubBreadcrumb` puros;
      regex BR (3 formatos reais) + `wa.me`; `scrubDeep` com WeakSet + limite de
      profundidade; força `event.user={id}`.
- [x] 1.3 `src/lib/observability/scrub.test.ts`: celular 11 e 13 dígitos +
      `(11) 91234-5678` em message/request.data/breadcrumb + `wa.me/...`; assert
      redação total; ciclo não trava.

## 2. Configs Sentry (3 runtimes + boundaries)

- [x] 2.1 `src/sentry.server.config.ts`: init + `requestDataIntegration` (include
      tudo false, incl. `user`) + scrub + `tracesSampleRate 0.1` + `maxValueLength 250`.
- [x] 2.2 `src/sentry.edge.config.ts`: init mínimo + scrub.
- [x] 2.3 `src/instrumentation-client.ts`: init (Replay OFF) + scrub +
      `onRouterTransitionStart` + denyUrls/ignoreErrors.
- [x] 2.4 `src/instrumentation.ts`: `register()` (node/edge) + `onRequestError`.
- [x] 2.5 `src/app/global-error.tsx`: boundary de raiz (captureException + UI pt-BR).

## 3. Build, túnel e env doc

- [x] 3.1 `next.config.ts`: `withSentryConfig` (org/project/authToken de env,
      `tunnelRoute`, silent) preservando headers/images/experimental e o
      `import "./src/lib/env"`.
- [x] 3.2 `src/proxy.ts:37`: matcher exclui `sentry-tunnel` (1º termo).
- [x] 3.3 `.env.example`: documentar DSN (público) + token/org/project (build).

## 4. Validação

- [x] 4.1 Gates: typecheck/lint/test/build (build sem DSN/token = no-op, não quebra).
- [x] 4.2 Confirmar que a suíte Vitest NÃO dispara `Sentry.init`.
- [x] 4.3 Validação ao vivo (prod local, CSP estrita): app carrega, sem violação
      de CSP, sem erro de runtime do Sentry; túnel `/sentry-tunnel` não é barrado
      pelo proxy.
- [x] 4.4 Workflow adversarial (lentes: vazamento de PII / scrub, regressão de
      CSP-túnel-proxy, no-op gracioso, Next 16) → aplicar fixes.
- [ ] 4.5 Commit + push + CI verde + archive. Validação de envio real + source
      maps = pós-deploy quando o usuário fornecer DSN/token (anotado).
