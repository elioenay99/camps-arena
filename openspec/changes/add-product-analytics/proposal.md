# Proposal — add-product-analytics

## Why

A segunda transversal (analytics) fechava o trio de observabilidade. O app não
mede nada: nem audiência (quais páginas são usadas) nem performance real (Web
Vitals do usuário). Como o projeto já roda no Vercel (`.vercel` presente),
**Vercel Analytics + Speed Insights** é a opção de menor atrito: zero credencial,
sem cookies (privacy-friendly, sem banner de consentimento), e nativo da
plataforma.

## What Changes

- **`@vercel/analytics`** (`<Analytics />`) e **`@vercel/speed-insights`**
  (`<SpeedInsights />`) no root layout. Audiência/page views + Web Vitals (LCP,
  CLS, INP) coletados no deploy do Vercel; no-op fora do Vercel (dev local não
  envia nada).
- **Compatível com a CSP estrita** (sem mudança de política): os dois injetam o
  script via `document.createElement("script")` a partir do bundle React já
  confiável → o `script-src 'strict-dynamic'` o autoriza (trust propagado); os
  beacons vão para `/_vercel/insights/*` e `/_vercel/speed-insights/*`
  (same-origin) → cobertos por `connect-src 'self'`. Nenhuma origem nova.

## Capabilities

### Added Capabilities

- `analytics`: medição de audiência e Web Vitals via Vercel, sem cookies.

## Impact

- **Deps**: `@vercel/analytics`, `@vercel/speed-insights` (2 componentes, sem
  config nem chave).
- **`src/app/layout.tsx`**: monta os dois componentes no `<body>`.
- **Não muda**: CSP/headers (verificado: strict-dynamic cobre a injeção via JS),
  RLS, Server Actions, motores. Sem DDL. Sem credencial.
- **Validação**: local confirma que o app não quebra e a CSP não bloqueia
  (sem violação no console). A coleta real só existe no deploy do Vercel
  (no-op local) — validação plena é pós-deploy no painel do Vercel.
