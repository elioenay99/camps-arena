# Tasks — add-product-analytics

## 1. Componentes no layout

- [x] 1.1 `pnpm add @vercel/analytics @vercel/speed-insights`.
- [x] 1.2 `src/app/layout.tsx`: `<Analytics />` (`@vercel/analytics/next`) e
      `<SpeedInsights />` (`@vercel/speed-insights/next`) no `<body>`.

## 2. Validação

- [x] 2.1 Gates: typecheck/lint/test/build.
- [x] 2.2 Validação ao vivo (prod local, CSP estrita): app carrega, console SEM
      violação de CSP por causa dos scripts injetados, app continua interativo.
- [ ] 2.3 Commit + push + CI verde + archive. Coleta real validada pós-deploy no
      painel do Vercel (no-op local).
