# Proposal — add-pwa-offline

## Why

A Fase 1 da PWA (`add-pwa`, `4e6b30d`) entregou instalabilidade (manifest +
ícones), mas deixou explícito que o **service worker e o suporte offline ficariam
para uma etapa posterior** (ver `design-system` › "Instalabilidade como PWA"). Hoje,
um Goliseu instalado na tela inicial abre uma tela de erro do navegador (dino do
Chrome / "sem conexão") quando o usuário está sem rede — experiência pobre para um
app majoritariamente mobile ([[feedback-mobile-pwa]]).

Esta Fase 2 entrega a **camada offline mínima e proporcional**: um service worker
que (a) acelera revisitas cacheando assets estáticos públicos e (b) mostra uma página
de fallback offline própria em vez do erro cru do navegador. **Offline, aparece apenas
a página de fallback — a UI do app NÃO funciona sem rede** (escopo deliberado: o app é
realtime/auth-gated).

## What Changes

Escopo decidido com o dono (2026-06-16): **app shell + página offline, SEM cachear
dados do Supabase** (o app é realtime/auth-gated — cachear dados exibiria placares e
torneios desatualizados como se fossem atuais). **Push notifications ficam para uma
Fase 3** (exigem VAPID + backend + opt-in).

- **`public/sw.js`** — service worker manual em JavaScript puro (servido estático;
  é o caminho que os docs locais do Next 16 recomendam, já que Serwist/next-pwa
  exigem webpack e o projeto roda **Turbopack**). Versionado (`goliseu-sw-v1`):
  - `install`: precacheia **somente** `/offline.html` (`cache.add`, item único);
    `skipWaiting`.
  - `activate`: remove caches de versões antigas; `clients.claim`.
  - `fetch` com ordem de avaliação fixa: não-GET → bypass; cross-origin → bypass; RSC
    (`?_rsc=`/header `RSC`) → bypass; **navegação** (`mode==='navigate'`) →
    **network-only** com fallback para `/offline.html` (e Response sintético se ela
    faltar — nunca erro de rede); **allowlist estrita** → stale-while-revalidate;
    qualquer outra coisa same-origin → bypass.
  - **Cache é ALLOWLIST, não denylist**: grava só `/_next/static/*` + ícones de marca
    conhecidos. `/_next/image`, a rota de imagem da rodada, route handlers e
    `/auth/confirm` **nunca** são cacheados — fecha por construção o vazamento de PII
    (placares/avatares) no dispositivo. Guard de gravação: só `200/basic/não-redirect/
    sem no-store`, sobre um clone.
- **`public/offline.html`** — página de fallback estática e auto-contida (cores
  Dracula, escudo "G" SVG inline, sem dependências externas; link `href="/"` + um
  `<script>` mínimo que recarrega ao evento `online`, autorizado por hash na CSP).
  Precacheada no `install`.
- **`src/components/service-worker-register.tsx`** — componente client
  (`"use client"`) que registra `/sw.js` com `{ scope: "/", updateViaCache: "none" }`,
  **apenas em produção** (evita o SW atrapalhar o HMR do `pnpm dev`). Montado no
  `layout.tsx`.
- **`next.config.ts`** — `headers()` específicos para `/sw.js` (Content-Type
  `application/javascript`, `Cache-Control: no-cache, no-store, must-revalidate`,
  CSP `default-src 'self'; script-src 'self'`) e para `/offline.html` (CSP estático
  permitindo `style-src 'unsafe-inline'`, já que ela não passa pelo proxy/nonce).
- **`src/proxy.ts`** — adiciona `sw.js` e `offline.html` ao lookahead de exclusão do
  matcher, para que NÃO recebam CSP-com-nonce nem `updateSession` do Supabase (o
  nonce quebraria o `<style>` inline da offline; o getUser é desperdício). Atualiza o
  guard `src/proxy.test.ts`.

## Capabilities

- **Nova**: `service-worker` (camada de runtime: registro do SW, estratégia de cache
  e fallback offline).
- **Modificada**: `design-system` › "Instalabilidade como PWA" — a frase que adiava o
  offline passa a apontar para a nova capability.

## Impact

- **Novo**: `public/sw.js`, `public/offline.html`,
  `src/components/service-worker-register.tsx`.
- **Editado**: `src/app/layout.tsx` (monta o registrador), `next.config.ts` (headers
  do SW/offline), `src/proxy.ts` + `src/proxy.test.ts` (exclusão do matcher).
- **Sem mudança**: lógica de negócio, dados, RLS, Server Actions, rotas. Nenhum dado
  do usuário é gravado em cache (só assets públicos imutáveis).
- **Risco**: baixo–médio. Pontos de atenção cobertos no `design.md`: nonce de CSP +
  cache de HTML, atualização do SW entre deploys, e o SW não interferir em auth/
  realtime. Validar com **`pnpm build && pnpm start`** (o SW só registra em prod) em
  390px, simulando offline no DevTools.
