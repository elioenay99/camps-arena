# Tasks — add-og-images

## 1. Render do card da marca

- [x] 1.1 Fontes Space Grotesk 500/700 (WOFF) em `src/features/og/fonts/`.
- [x] 1.2 `src/features/og/brand.tsx`: `renderBrandOg()` + `BrandCard` (logo
      `icon.svg` data-URL, wordmark, divisor, tagline; cores hex; flexbox).
      Constantes `OG_SIZE`/`OG_ALT`/`OG_CONTENT_TYPE`.

## 2. Rotas de imagem + metadata

- [x] 2.1 `src/app/opengraph-image.tsx` e `src/app/twitter-image.tsx` (finas).
- [x] 2.2 `src/app/layout.tsx`: `openGraph` + `twitter` no metadata.
- [x] 2.3 `next.config.ts`: `outputFileTracingIncludes` (fonte+logo).
- [x] 2.4 `src/proxy.ts`: matcher exclui as rotas de imagem, com boundary
      `(?:$|/)` nos termos-palavra (só a rota exata/filhos é isenta; prefixo-
      colisão futura segue protegido). Guard em `src/proxy.test.ts`.

## 3. Testes e validação

- [x] 3.1 `brand.test.ts`: assets (fontes WOFF válidas, logo SVG) — hermético.
      `proxy.test.ts`: guard de regressão do matcher (protegidas MATCH / OG/asset
      SKIP / boundary).
- [x] 3.2 Gates: typecheck/lint/test (848 ✅) + build (`○ Static` nas 2 rotas).
- [x] 3.3 Validação ao vivo (`next start` + curl + inspeção do PNG): card
      renderiza (fonte/logo OK), 1200×630; convite mantém título genérico e herda
      o card; sem CSP no PNG; meta og/twitter completas.
- [x] 3.4 Validação adversarial via workflow (5 lentes + verificação): 10
      achados confirmados, nenhum crítico/high. Fixes desta change aplicados
      (boundary do matcher + `proxy.test.ts`; comentário do `next.config`). Os
      achados cross-cutting (Sentry em `varrerOrfaos`; docblock `Lado`) vão em
      commits próprios.
- [x] 3.5 Commit + push + CI verde + archive. Run `27245560298` verde.
      Pendência só de config (`NEXT_PUBLIC_SITE_URL` no Vercel; sem ele, default
      localhost — og:image absoluto).
