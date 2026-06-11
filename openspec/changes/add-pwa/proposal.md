# Proposal — add-pwa

## Why

O Goliseu é usado majoritariamente em CELULAR ([[feedback-mobile-pwa]]). Hoje não
há manifest nem ícones de app: abrir no telefone não oferece "Adicionar à tela
inicial", e iOS mostraria um screenshot genérico. Habilitar a instalação (PWA
nível 1) dá presença de app nativo com custo baixo.

## What Changes

Fase 1 (instalabilidade) — sem service worker/offline (fase 2, valor baixo num app
realtime/auth-gated).

- **`app/manifest.ts`** (`MetadataRoute.Manifest`, Next 16 auto-linka): name/
  short_name "Goliseu", `display: "standalone"`, `start_url: "/"`, `lang: "pt-BR"`,
  `background_color` Dracula slate, `theme_color` roxo de marca, `categories`
  ["sports"], e `icons` (192, 512, maskable).
- **Ícones de app** (derivados do escudo "G" da marca): `public/icon-192.png`,
  `public/icon-512.png` (purpose any, transparentes) e `public/icon-maskable.png`
  (512, opaco com safe-zone p/ recorte do Android).
- **`app/apple-icon.png`** (180×180, fundo opaco — iOS não aceita transparência):
  Next gera o `apple-touch-icon` automaticamente.
- **`app/layout.tsx`**: `export const viewport` com `themeColor` por esquema
  (slate no dark, branco-quente no light) e `appleWebApp` na metadata (capable +
  title "Goliseu" + statusBarStyle).

## Capabilities

Nenhuma capability nova. Adiciona um requisito de INSTALABILIDADE (PWA) ao
`design-system`. Sem mudança de comportamento da app.

## Impact

- **Novo**: `app/manifest.ts`, `app/apple-icon.png`, `public/icon-192.png`,
  `public/icon-512.png`, `public/icon-maskable.png`.
- **Editado**: `app/layout.tsx` (viewport themeColor + appleWebApp).
- **Atenção CSP**: o `manifest.webmanifest` é same-origin; os ícones são
  same-origin (`/icon-*.png`). A `img-src`/`manifest-src` da CSP precisa permitir
  `'self'` — confirmar no `proxy.ts`/headers que não quebra (validar com
  `next start`, não dev). O `<link rel="manifest">` exige `crossorigin`? não p/
  same-origin.
- **Sem mudança**: lógica, dados, RLS, rotas. Favicon `icon.svg` permanece.
- **Risco**: baixo. Validar manifest servido (200 + JSON correto), ícones 200,
  e Lighthouse/instalabilidade no Chrome mobile.
