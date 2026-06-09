# Proposal — add-security-headers

## Why

O app não envia NENHUM header de segurança: sem CSP (XSS roda livre), sem
anti-clickjacking (a página pode ser embutida em `<iframe>` de terceiro), sem
`X-Content-Type-Options`/`Referrer-Policy`/`Permissions-Policy`/HSTS. É a
primeira frente das transversais e a de maior ganho por menor risco —
autocontida, sem dependência externa nem credencial.

## What Changes

- **CSP estrita por nonce** (no `proxy.ts`, per-request): `script-src` só
  executa o que carrega o nonce do request (`'strict-dynamic'`) — fecha XSS por
  inline/script injetado. `style-src 'self' 'unsafe-inline'` (SEM nonce — os
  atributos `style=` inline de `UserAvatar`/`TeamCrest` exigem; e um nonce em
  style-src faria o browser IGNORAR `'unsafe-inline'`). `connect-src` libera o
  Supabase (REST `https://` + Realtime `wss://`); `img-src` libera `blob:`
  (preview de avatar), `data:` e os hosts de imagem; `frame-ancestors 'none'`.
- **Nonce no `next-themes`**: o ThemeProvider injeta um `<script>` inline
  anti-flash que o nonce automático do Next NÃO cobre — o root layout lê o
  `x-nonce` do request (`headers()`) e passa `nonce` ao ThemeProvider.
- **Renderização dinâmica**: nonce exige todas as páginas dinâmicas (o nonce é
  aplicado no SSR por request; página estática nasce sem nonce e teria os
  scripts do framework bloqueados). Root layout: `export const dynamic =
  "force-dynamic"`. Sem PPR/Cache Components no projeto, o custo é só perder o
  cache estático de 2–3 páginas de auth — aceitável num app autenticado.
- **Headers estáticos** (no `next.config.ts headers()`, todas as rotas inclusive
  assets): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`
  (camera/microphone/geolocation desligados), e `Strict-Transport-Security`
  (HSTS) SÓ em produção.
- **`proxy.ts` + `updateSession`**: o proxy gera o nonce e injeta `x-nonce` +
  `Content-Security-Policy` nos request headers que o `updateSession` repassa ao
  `NextResponse.next` (para o RSC ler o nonce e os cookies seguirem), e fixa o
  header de CSP na resposta (inclusive no redirect de auth).
- **Builder puro `src/lib/security/csp.ts`**: monta a string de CSP a partir de
  `{ nonce, isDev, supabaseUrl }` — testável isoladamente.

## Capabilities

### Added Capabilities

- `security-headers`: CSP por nonce + headers de segurança em todas as respostas.

## Impact

- **`proxy.ts`**: gera nonce, monta CSP, injeta nos headers de request/response;
  delega auth ao `updateSession` (assinatura ganha os request headers).
- **`src/lib/supabase/middleware.ts`**: `updateSession` aceita request headers
  preparados e os usa no `NextResponse.next` (nonce chega ao render; cookies ok).
- **`src/app/layout.tsx`**: vira async, lê `x-nonce`, passa ao ThemeProvider;
  `force-dynamic`.
- **`next.config.ts`**: bloco `headers()` com os headers estáticos (+HSTS prod).
- **Novo**: `src/lib/security/csp.ts` + teste.
- **Renderização**: todas as rotas passam a dinâmicas (verificado no build).
- **Não muda**: lógica de auth/RLS, Server Actions, motores, Realtime (só
  liberado no connect-src). Sem DDL. Sem credencial.
- **Risco/validação**: CSP quebra silenciosamente se faltar uma origem —
  validação ao vivo obrigatória (carregar páginas, console sem violação,
  hidratação ok, tema sem flash, Realtime conecta).
