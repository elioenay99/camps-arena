# Design — add-pwa-offline

> Revisado após o gate adversarial `wdu028cae` (changes_required): o cache passou de
> **denylist** para **allowlist estrita** (fecha o vazamento da imagem da rodada,
> `/_next/image` e a fragilidade do bypass RSC); fallback de navegação ganhou Response
> sintético; precache desacoplado; guard de gravação endurecido; página offline reage
> ao evento `online`.

## Contexto técnico apurado

- **Next.js 16.2.6, Turbopack por padrão.** Os docs locais
  (`node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`) recomendam
  **service worker manual em `public/sw.js`** para o caso básico e **Serwist** para
  offline avançado — mas anotam que Serwist "currently requires webpack
  configuration". Como o projeto usa Turbopack, **SW manual** é a escolha: zero
  dependência nova, compatível com o bundler atual, e é o fluxo documentado.
- **CSP por nonce mora no proxy** (`src/proxy.ts` → `buildContentSecurityPolicy`),
  não no `next.config`. O `next.config.headers()` só emite headers estáticos
  (X-Frame, nosniff, Referrer-Policy, Permissions-Policy, HSTS) — **sem CSP**.
- **Matcher do proxy** (`src/proxy.ts:45`) aplica CSP+`updateSession` a tudo, exceto
  `sentry-tunnel|opengraph-image|twitter-image`, `_next/static`, `_next/image`,
  `favicon.ico` e arquivos `.svg|.png|.jpg|.jpeg|.gif|.webp`. **`/sw.js` (.js) e
  `/offline.html` (.html) NÃO estão excluídos** → hoje cairiam no proxy.
- **Root layout é `force-dynamic`** com nonce por request (anti-flash do
  next-themes). Logo, qualquer HTML renderizado carrega um nonce single-use.
- **Há rotas same-origin GET que retornam DADOS PRIVADOS**, não só assets: a rota
  `src/app/dashboard/torneios/[id]/rodada/[rodada]/imagem/route.tsx` (auth-gated por
  `created_by`) devolve um PNG com título/cores/placares; é buscada via `fetch(..., {
  credentials: 'same-origin' })` (GET, mode `cors`, **não** `navigate`, sem `_rsc`).
  E `/_next/image` serve avatares/escudos otimizados. Isso é o que torna **denylist
  inviável** e exige **allowlist**.

## Decisões

### D1 — Service worker manual, versionado, em `public/sw.js`
JS puro, servido estático (Turbopack não o processa). Nome de cache versionado
(`goliseu-sw-v1`); o `activate` deleta qualquer cache cujo nome não seja o da versão
corrente. `skipWaiting()` + `clients.claim()` para que correções no próprio SW
cheguem rápido. **Higiene de release**: ao mudar o conteúdo de `/offline.html`, bumpar
`VERSION` (senão o `activate` não poda o precache antigo) e, se o `<script>` mudou,
regenerar o hash do `offlineHtmlCsp` (comando no `next.config.ts`).

### D2 — Navegação (HTML) é network-only + fallback offline com rede de segurança
Duas razões independentes para **nunca cachear** respostas de navegação:
1. **Nonce de CSP**: o HTML traz um nonce single-use; servir uma cópia cacheada
   reapresentaria um nonce inválido → scripts bloqueados pela CSP.
2. **PII / auth-gate**: páginas do dashboard contêm dados privados.

Comportamento: `fetch(request)` → se ok, retorna (sem gravar); no `catch` (offline):
```
const cached = await caches.match('/offline.html');
return cached ?? new Response('<!doctype html>…Você está offline…', {
  status: 503,
  headers: { 'Content-Type': 'text/html; charset=utf-8' },
});
```
O `??` é **rede de segurança**: se `/offline.html` faltar no cache (precache falhou,
quota podou, storage limpo), o usuário ainda recebe um HTML mínimo — **nunca** um
network error (dino do Chrome), que é justamente o que esta fase elimina.

### D3 — Cache é ALLOWLIST estrita (não denylist)
O SWR grava **apenas** o que casa explicitamente. Isto fecha por construção o
vazamento da imagem da rodada, de `/_next/image`, de route handlers e de qualquer RSC
que escape do filtro de header — nenhum deles casa com a allowlist.

Predicado de elegibilidade ao cache:
```
url.origin === self.location.origin && (
  url.pathname.startsWith('/_next/static/') ||           // chunks/CSS/fontes, hash imutável
  ['/icon-192.png','/icon-512.png','/icon-maskable.png'].includes(url.pathname)
)
```
`/_next/image` (avatares/escudos), `/dashboard/.../imagem`, `/auth/confirm`, route
handlers e RSC **NÃO** estão na allowlist → bypass network-only, sem gravar. Servir
imagens otimizadas pela rede também evita avatar/escudo **stale** após troca de foto.
O favicon real (`/icon.svg`) e o `apple-icon` (path com query de hash) ficam
network-only de propósito — não há `favicon.ico` no projeto.

### D4 — Ordem de avaliação explícita do `fetch` handler
Para que a segurança não dependa de um único filtro, a ordem é fixa e fail-safe
(qualquer coisa que não case com a allowlist termina em network-only):
1. `request.method !== 'GET'` → **bypass** (Server Actions/mutações).
2. `url.origin !== self.location.origin` → **bypass** (Supabase, Sentry, analytics,
   API-Football).
3. RSC (`url.searchParams.has('_rsc')` || `request.headers.get('RSC')`) → **bypass**.
4. `request.mode === 'navigate'` → **network-only + fallback offline** (D2).
5. casa a **allowlist** (D3) → **stale-while-revalidate** (D5).
6. qualquer outra coisa same-origin → **bypass** network-only (não grava).

### D5 — Stale-while-revalidate com guard de gravação endurecido
Para itens da allowlist: responde do cache na hora (se houver) e revalida em
background. Só grava quando:
```
response && response.status === 200 && response.type === 'basic'
  && !response.redirected
  && !/no-store/.test(response.headers.get('Cache-Control') ?? '')
```
e sempre via `cache.put(request, response.clone())` (clonar antes — `put` consome o
body). `status === 200` (não `response.ok`) exclui 206 Partial Content; `!redirected`
e o teste de `no-store` são cinto-e-suspensórios contra redirects/respostas com
cookie. Com a allowlist (D3) esses casos já não chegam aqui, mas o guard é barato.

### D6 — Excluir `/sw.js` e `/offline.html` do matcher do proxy
Adicionar `sw\.js` e `offline\.html` ao primeiro grupo do lookahead negativo
(`src/proxy.ts:45`). Efeitos:
- `/sw.js` deixa de receber CSP-com-nonce do proxy e de rodar `updateSession`.
- `/offline.html` deixa de receber o nonce → seu `<style>`/`<script>` inline funcionam
  via CSP estática própria (D7).
- O guard `src/proxy.test.ts` é estendido afirmando que `/sw.js` e `/offline.html` são
  isentos e que rotas que só compartilham prefixo **continuam** passando pelo gate —
  incluindo casos que pegariam um ponto **não** escapado: `/swag`, `/offline-foo`,
  `/swxjs`, `/sw-js`, `/offlineXhtml`, `/offline_html`.

### D7 — Headers via `next.config.ts`
Acrescentar entradas em `headers()` (acumulam com o `'/:path*'` existente, que não tem
chave CSP — sem duplicação):
- `source: '/sw.js'` → `Content-Type: application/javascript; charset=utf-8`,
  `Cache-Control: no-cache, no-store, must-revalidate`,
  `Content-Security-Policy: default-src 'self'; script-src 'self'`.
- `source: '/offline.html'` →
  `Content-Security-Policy: default-src 'self'; style-src 'unsafe-inline'; script-src 'sha256-<HASH>'; img-src 'self' data:; base-uri 'none'; form-action 'none'`.
  O `<HASH>` é o SHA-256 base64 do conteúdo exato do `<script>` de reconexão (D8),
  gerado na implementação:
  `printf %s "<corpo-do-script>" | openssl sha256 -binary | openssl base64`. Se o
  script mudar, regenerar o hash (guard de implementação documentado na task).

### D8 — Página offline auto-contida que reage à reconexão
`public/offline.html`: HTML único, `<style>` inline (Dracula: `#282a36` fundo,
`#bd93f9` roxo, `#f8f8f2` texto), escudo "G" como SVG inline, título "Você está
offline", texto curto e um **link** `href="/"` ("Tentar novamente"). Além disso, um
**`<script>` mínimo** que recarrega assim que a conexão volta:
`addEventListener('online', function () { location.reload() })`. Decisão de produto:
em vez de exigir clique manual repetido, a página sai sozinha do estado offline quando
o SO sinaliza rede — barato e relevante para o uso mobile ([[feedback-mobile-pwa]]). O
script é autorizado por hash na CSP (D7), não por `'unsafe-inline'`.

## Edge cases e mitigações

- **ChunkLoadError pós-deploy em abas longevas (risco residual ACEITO)**: com
  `skipWaiting()`+`clients.claim()`, o SW novo assume uma aba do build antigo e o
  `activate` poda o cache da versão anterior; se o documento antigo fizer lazy-load de
  um chunk de rota nunca visitada, o hash mudou no servidor → possível ChunkLoadError.
  É risco conhecido de qualquer SW com `skipWaiting`, agravado marginalmente pela
  poda. **Aceito** para o escopo mínimo; documentado aqui honestamente. Mitigação
  opcional fora desta fase: prompt de "nova versão" ou network-first em
  `/_next/static/chunks/*`.
- **Logout / troca de conta**: com a allowlist (D3), o cache só contém `/_next/static`
  + ícones de marca — públicos e idênticos para qualquer conta. Não há PII nem
  conteúdo cross-conta a invalidar.
- **`/auth/confirm`** (GET same-origin com token de uso único na query): não está na
  allowlist → bypass; e o guard (D5) jamais grava redirect/`status≠200`. Coberto por
  cenário no spec.
- **HTTPS**: SW exige contexto seguro. Prod (Vercel) é HTTPS; `localhost` conta como
  seguro para o teste de `pnpm start`.
- **Precache não-atômico**: só `/offline.html` é precacheado (item único, crítico) via
  `cache.add` — sem `addAll`, então não há risco de um item arrastar o install. Os
  ícones NÃO são precacheados (a página offline usa SVG inline; os ícones entram no
  cache sob demanda pela allowlist quando a UI online os pede).
- **iOS/Safari**: suporta SW, Cache Storage e evento `online`; sem
  `beforeinstallprompt` (isso é da Fase 1). Fallback e SWR funcionam.

## Nota de vocabulário

"App shell" foi evitado no texto: **nenhum HTML é cacheado** (D2). Online, o SW entrega
**cache de assets para revisita rápida**; offline, aparece **apenas** a página de
fallback — a UI do app **não** funciona sem rede (escopo deliberado).

## Alternativas rejeitadas

- **Serwist / `@ducanh2912/next-pwa`**: exigem webpack; conflitam com Turbopack
  (padrão no Next 16). Não compensam para o escopo mínimo.
- **Cache como denylist** ("grava o resto same-origin"): rejeitado pelo gate — vaza a
  imagem da rodada e `/_next/image`, e amarra a segurança ao detalhe do header RSC.
- **Cachear navegação/HTML (offline real do dashboard)**: recusado pelo dono (dados
  realtime) e arriscado (nonce + PII).
- **Rota `/offline` (RSC)**: herdaria `force-dynamic` + nonce; HTML estático em
  `public/` é mais robusto.
