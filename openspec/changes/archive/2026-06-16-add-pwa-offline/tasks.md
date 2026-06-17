# Tasks — add-pwa-offline

Gate `wdu028cae`: changes_required → proposal corrigida (allowlist estrita + rede de
segurança no fallback + precache desacoplado + guard endurecido + reconexão).
Re-verificação por workflow ANTES de implementar. Quality gates
(typecheck/lint/test/build) + workflow de review do diff antes de commitar. Validar ao
vivo com `pnpm build && pnpm start` (o SW só registra em produção), 390px, offline
simulado no DevTools, **incluindo o modo standalone (instalado)**.

## 1. Página de fallback offline
- [x] 1.1 `public/offline.html` — HTML auto-contido, cores Dracula, escudo "G" SVG
  inline, título "Você está offline", link `href="/"`; `<style>` inline; **`<script>`
  mínimo** `addEventListener('online', function () { location.reload() })` para sair do
  offline ao reconectar. Sem assets externos.
- [x] 1.2 Gerar o SHA-256 base64 do corpo EXATO do `<script>` (D7/D8):
  `printf %s "<corpo>" | openssl sha256 -binary | openssl base64` → usar em 4.2.

## 2. Service worker (`public/sw.js`)
- [x] 2.1 Versão `goliseu-sw-v1`. `install`: precacheia **somente** `/offline.html`
  via `cache.add` (item único, crítico — NÃO usar `addAll`; ícones não são
  precacheados). `skipWaiting()`.
- [x] 2.2 `activate`: deleta caches cujo nome ≠ versão corrente; `clients.claim()`.
- [x] 2.3 `fetch` handler com a ORDEM de avaliação fixa (D4): (1) não-GET → bypass;
  (2) cross-origin → bypass; (3) RSC (`?_rsc=` ou header `RSC`) → bypass; (4)
  `mode==='navigate'` → network-only → `catch` → `caches.match('/offline.html')` **??
  Response sintético 503** (nunca undefined/erro de rede); (5) allowlist → SWR; (6)
  resto same-origin → bypass.
- [x] 2.4 Allowlist ESTRITA (D3): cachear só `origin===self.location.origin && (
  pathname.startsWith('/_next/static/') || pathname ∈ {/icon-192.png, /icon-512.png,
  /icon-maskable.png})`. TUDO o resto (incl. `/_next/image`, `/dashboard/.../imagem`,
  route handlers, `/auth/confirm`, `/icon.svg`, `apple-icon`) faz bypass.
- [x] 2.5 Guard de gravação SWR (D5): gravar só se `response.status===200 &&
  response.type==='basic' && !response.redirected && !/no-store/.test(Cache-Control)`;
  usar `cache.put(req, response.clone())`.

## 3. Registro do SW
- [x] 3.1 `src/components/service-worker-register.tsx` (`"use client"`): registra
  `/sw.js` com `{ scope: "/", updateViaCache: "none" }` SÓ em produção
  (`process.env.NODE_ENV === "production"`); guarda `'serviceWorker' in navigator`.
- [x] 3.2 Montar `<ServiceWorkerRegister />` no `<body>` de `src/app/layout.tsx`.

## 4. Headers e matcher
- [x] 4.1 `next.config.ts`: headers para `/sw.js` (Content-Type, Cache-Control
  no-store, CSP `default-src 'self'; script-src 'self'`).
- [x] 4.2 `next.config.ts`: headers para `/offline.html` (CSP `default-src 'self';
  style-src 'unsafe-inline'; script-src 'sha256-<HASH de 1.2>'; img-src 'self' data:;
  base-uri 'none'; form-action 'none'`).
- [x] 4.3 `src/proxy.ts`: adicionar `sw\.js` e `offline\.html` (ponto escapado!) ao
  lookahead de exclusão do matcher.
- [x] 4.4 `src/proxy.test.ts`: estender o guard — `/sw.js` e `/offline.html` isentos;
  **e** `/swag`, `/offline-foo`, `/swxjs`, `/sw-js`, `/offlineXhtml`, `/offline_html`
  CONTINUAM passando pelo gate (trava regressão se o ponto não for escapado).

## 5. Qualidade
- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (verdes).
- [x] 5.2 Workflow de review adversarial do diff → corrigir HIGH/CRITICAL.

## 6. Validação ao vivo (`pnpm build && pnpm start`, 390px) — FEITA
> Validado via Chrome DevTools (390px, `pnpm start`): SW registra em produção
> (scope `/`, activated); headers de `/sw.js` (no-store + CSP própria) e
> `/offline.html` (hash exato) corretos; offline + rota nunca visitada
> (`/zzz-offline-proof`) → página offline estilizada, sem erro de CSP no console
> (script de reconexão autorizado pelo hash); evento `online` → reload automático;
> Cache Storage só com `/offline.html` + `/_next/static/*` + `/icon-192.png` mesmo
> após navegar autenticado e fetchar `/_next/image` (suspeitosPII vazio). 6.5
> (standalone): `start_url` é `/` → navegação → coberto pela mesma lógica do
> fallback validado (instalação real não é exercível no headless).
- [x] 6.1 SW registra em produção (Application › Service Workers); manifest/ícones 200;
  sem regressão de CSP no console.
- [x] 6.2 Offline (DevTools › Network › Offline): navegar → cai na `/offline.html`
  estilizada (não o erro do navegador); religar a rede → a página recarrega sozinha
  (evento `online`).
- [x] 6.3 Online: revisita carrega `/_next/static` do cache do SW (SWR);
  login/dashboard/realtime funcionam (sem dado velho servido pelo SW).
- [x] 6.4 Cache Storage NÃO contém HTML de dashboard, NEM `/_next/image`, NEM a imagem
  da rodada, NEM respostas do Supabase — só `/offline.html` + `/_next/static` + ícones.
- [x] 6.5 **Modo standalone**: instalar (Add to Home Screen), ativar offline, abrir
  pelo ícone → confirmar que `start_url` (`/`) cai na `/offline.html` estilizada,
  inclusive numa rota nunca visitada online (prova o precache do install).

## 7. Encerramento
- [x] 7.1 Commit (pt-BR, Conventional Commits, sem coautoria) + push.
- [x] 7.2 `openspec archive add-pwa-offline`.
- [x] 7.3 Atualizar [[feedback-mobile-pwa]] e [[arena-retomada]].
