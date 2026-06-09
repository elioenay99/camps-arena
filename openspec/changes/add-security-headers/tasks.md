# Tasks — add-security-headers

## 1. Builder de CSP (puro + testável)

- [x] 1.1 `src/lib/security/csp.ts`: `buildContentSecurityPolicy({ nonce, isDev,
      supabaseUrl })` → string. Origens exatas do Supabase (https + wss) via
      `new URL`. DEV adiciona `'unsafe-eval'`; PROD adiciona
      `upgrade-insecure-requests`.
- [x] 1.2 `csp.test.ts`: nonce embutido no script-src; `strict-dynamic`;
      style-src com `'unsafe-inline'` e SEM nonce; connect-src com https+wss do
      Supabase; img-src com blob:/data:; frame-ancestors none; dev→unsafe-eval,
      prod→upgrade-insecure-requests (e o inverso ausente).

## 2. proxy + updateSession (nonce per-request)

- [x] 2.1 `src/lib/supabase/middleware.ts`: `updateSession(request,
      requestHeaders?)` usa `requestHeaders ?? request.headers` no
      `NextResponse.next` (inicial e no setAll). Sem mover o `getUser()`.
- [x] 2.2 `src/proxy.ts`: gera nonce, monta CSP, injeta `x-nonce`+CSP nos request
      headers, chama `updateSession`, fixa CSP na resposta (incl. redirect).

## 3. Renderização dinâmica + nonce no tema

- [x] 3.1 `src/app/layout.tsx`: async; lê `x-nonce` via `headers()`; passa
      `nonce` ao `ThemeProvider`; `export const dynamic = "force-dynamic"`.
- [x] 3.2 Build: confirmar que NENHUMA rota fica `○ (Static)`; se ficar, forçar
      `force-dynamic` na página específica.

## 4. Headers estáticos

- [x] 4.1 `next.config.ts`: `headers()` com X-Frame-Options, X-Content-Type-
      Options, Referrer-Policy, Permissions-Policy, e HSTS só em produção.

## 5. Testes e validação

- [x] 5.1 Gates: typecheck/lint/test/build (build valida o all-dynamic).
- [ ] 5.2 Validação ao vivo (Playwright): carregar landing, login, dashboard;
      console SEM violação de CSP; hidratação ok (interações funcionam); tema
      sem flash e o toggle funciona; Realtime conecta (2 abas, placar ao vivo);
      conferir que os headers (CSP, X-Frame-Options, nosniff, Referrer-Policy,
      Permissions-Policy) estão na resposta.
- [x] 5.3 Workflow adversarial → 22 achados, 4 confirmados (todos NIT). Fixes
      baratos aplicados (design.md nonce, tasks); os 2 nits "faltam testes de
      middleware/headers" ficam na validação ao vivo (decisão dos juízes — config
      de framework e consumo do nonce pelo Next não são testáveis fielmente em
      unit). Refutados os "CRITICAL" (proxy.ts É o middleware do Next 16; cookies
      preservados no clone pós-mutação).
- [ ] 5.4 Commit + push + CI verde + archive. Sem pendência manual.
