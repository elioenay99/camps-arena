# Proposal — add-og-images

## Why

Links compartilhados do Arena (landing, login, convite) renderizam preview "pelado"
nas redes/apps de mensagem — sem imagem, sem marca. Falta `og:image`/`twitter:image`.
É o último item do polish backlog.

## Decisão de escopo (apurada com o usuário)

OG **dinâmico** (nome do torneio no card) foi DESCARTADO após verificação:

- A página `/convite/[codigo]` é pública, mas as RPCs `info_convite`/`info_convite_vaga`
  **revogam `anon`** (`grant ... to authenticated`). Um crawler social é sempre
  anônimo → jamais leria o título → o OG dinâmico cairia sempre no fallback.
- A página de torneio é auth-gated → o crawler é redirecionado ao login → não alcança.

Logo, sob o modelo de auth atual, **só um card ESTÁTICO da marca funciona em previews**.
Ele também não vaza nome de torneio — preserva a decisão de privacidade já existente
no `/convite` (título fora do metadata de propósito).

## What Changes

- **`src/features/og/brand.tsx`**: render compartilhado do card 1200×630 via
  `next/og` (Satori) — fundo "estádio à noite" (verde `#34e58b` sobre `#0a120e`),
  escudo (o `icon.svg` embutido como `<img>` data-URL), wordmark "Arena" e tagline.
  Fonte de marca **Space Grotesk** (pesos 500/700) embarcada como WOFF
  (`src/features/og/fonts/`, ~17KB cada; Satori aceita ttf/otf/woff, não woff2).
- **`src/app/opengraph-image.tsx`** e **`src/app/twitter-image.tsx`**: rotas finas
  na RAIZ que exportam `alt`/`size`/`contentType` e chamam o render — herdadas por
  TODAS as rotas. Prerenderizadas no build (`○ Static`).
- **`src/app/layout.tsx`**: bloco `openGraph` (type/siteName/title/description/locale/url)
  + `twitter` (`summary_large_image`). As tags de imagem vêm dos arquivos acima.
- **`next.config.ts`**: `outputFileTracingIncludes` para fonte+logo nas rotas de
  imagem (backup caso virem dinâmicas — o root layout é `force-dynamic`).
- **`src/proxy.ts`**: matcher exclui `opengraph-image`/`twitter-image` (PNG não
  precisa de nonce/CSP nem de `getUser` por hit de crawler), com boundary
  `(?:$|/)` nos termos-palavra para não desviar rotas que só compartilhem o
  prefixo. `src/proxy.test.ts` trava a regressão do matcher.

## Capabilities

### Added

- `og-images`: card OG/Twitter estático da marca em todas as rotas; sem vazamento
  de dados de torneio/convite.

## Impact

- **Novos**: `src/features/og/brand.tsx` (+ `brand.test.ts`), 2 rotas de imagem,
  2 fontes WOFF. **Editados**: `layout.tsx`, `next.config.ts`, `proxy.ts`.
- **Validação ao vivo (feita)**: build → `/opengraph-image` e `/twitter-image`
  `○ Static`; `next start` + curl → PNG 1200×630 válido, card renderizado (fonte
  e logo OK); `/convite/XXXX` mantém `<title>Convite · Arena</title>` e herda o
  card (nome do torneio NÃO vaza); sem CSP/nonce no PNG (matcher OK); todas as
  meta og/twitter presentes.
- **Não muda**: auth/RLS, Server Actions, banco (sem DDL), CSP das páginas HTML.
- **Risco**: baixo. Sem credencial. `NEXT_PUBLIC_SITE_URL` (já existente) define a
  URL absoluta do og:image — pendência só de configuração no Vercel (sem ele,
  default localhost).
