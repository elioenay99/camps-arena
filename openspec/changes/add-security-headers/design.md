# Design — add-security-headers

## Por que nonce (e não `unsafe-inline` no script-src)

`script-src 'unsafe-inline'` aceitaria QUALQUER inline script — não protege de
XSS. A proteção real é `script-src 'self' 'nonce-{n}' 'strict-dynamic'`: só roda
o que carrega o nonce do request; `strict-dynamic` propaga a confiança aos
scripts que esses carregarem (e faz o browser ignorar `'self'`/hosts). O Next
aplica o nonce automaticamente aos scripts do framework quando acha
`'nonce-{n}'` no header `Content-Security-Policy` do REQUEST.

## A pegadinha do `style-src`

Os atributos `style=` inline (`UserAvatar`/`TeamCrest` — cor/ tamanho) NÃO são
cobertos por nonce (nonce vale para elementos `<style>`/`<script>`, não para o
atributo `style`). Logo `style-src` precisa de `'unsafe-inline'`. E NÃO pode ter
nonce junto: pela CSP3, a presença de nonce/hash num directive faz o browser
IGNORAR `'unsafe-inline'` ali — o que quebraria os avatares. Então:
`style-src 'self' 'unsafe-inline'` (sem nonce). Risco aceito: injeção de estilo
é vetor muito menor que script; a defesa de XSS mora no `script-src`.

## CSP final (montada em src/lib/security/csp.ts)

```
default-src 'self';
script-src 'self' 'nonce-{n}' 'strict-dynamic'  [+ 'unsafe-eval' em DEV];
style-src 'self' 'unsafe-inline';
img-src 'self' blob: data: https://media.api-sports.io {supabaseOrigin};
font-src 'self';
connect-src 'self' {supabaseOrigin} {supabaseWss};
frame-ancestors 'none';
object-src 'none';
base-uri 'self';
form-action 'self';
[upgrade-insecure-requests  — só PROD]
```

- **DEV `'unsafe-eval'`**: o React usa `eval` para stacks de erro em dev (exigido
  pelo guia do Next). Some em produção.
- **connect-src**: REST do Supabase (`https://`) + Realtime (`wss://`). Origens
  EXATAS derivadas de `env.NEXT_PUBLIC_SUPABASE_URL` (mais apertado que
  `*.supabase.co`). API-Football é chamada SÓ no servidor → não entra.
- **img-src**: next/image serve same-origin (`/_next/image`), mas o preview de
  avatar é `<img src={blob:}>` → `blob:`. `data:` cobre blur placeholders. Os
  hosts remotos entram por segurança (caso de imagem não-otimizada futura).
- **font-src 'self'**: `next/font/google` self-hospeda no build.

## Renderização dinâmica (consequência do nonce)

Página estática nasce no build sem request → sem nonce → scripts do framework
seriam bloqueados por `strict-dynamic`. Por isso TODA rota tem de ser dinâmica.
`export const dynamic = "force-dynamic"` no root layout + o `headers()` (API
dinâmica) que o layout passa a chamar já forçam isso. **Verificação no build**:
nenhuma rota pode aparecer como `○ (Static)` — se aparecer, força `force-dynamic`
na página. Sem PPR/Cache Components no projeto, não há conflito.

## Fluxo no proxy + updateSession

O `updateSession` cria `NextResponse.next({ request })` e PRECISA receber os
request headers com o `x-nonce`/CSP para que (a) o RSC leia o nonce via
`headers()` e (b) o Next extraia o nonce do header de request. Refator:
`updateSession(request, requestHeaders?)` usa `requestHeaders ?? request.headers`
no `NextResponse.next` (nos dois pontos — inicial e no `setAll` de cookies). O
proxy:

1. gera `nonce = crypto.randomUUID()` (UUID já é aleatório/imprevisível e válido
   como nonce de CSP — sem `Buffer`/`btoa`, agnóstico ao runtime do proxy);
2. monta a CSP; clona request headers + seta `x-nonce` e `Content-Security-Policy`;
3. `response = await updateSession(request, requestHeaders)`;
4. seta `Content-Security-Policy` na resposta (inclusive no redirect de auth).

A ordem `getUser()` logo após `createServerClient` é preservada (comentário do
arquivo: não inserir lógica no meio — evita logout aleatório).

## next-themes e o script anti-flash

`ThemeProvider` injeta um `<script>` inline antes do paint (evita flash de tema).
O nonce automático do Next NÃO cobre scripts de terceiros. O wrapper
`theme-provider` repassa `...props`, então o root layout (async) lê
`(await headers()).get("x-nonce")` e passa `nonce={nonce}` — o next-themes 0.4.x
emite o script com o nonce. Sem isso: tema bloqueado → flash/erro no console.

## Headers estáticos (next.config.ts headers())

Em `headers()` (cobre TODAS as rotas, inclusive `_next/static` e imagens, que o
matcher do proxy exclui):
- `X-Frame-Options: DENY` (redundância ao `frame-ancestors` p/ browsers velhos)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
  — SÓ quando `NODE_ENV === "production"` (build roda como prod; dev omite).

## Fora de escopo

- Sentry e analytics (próximas transversais).
- Report-URI/Report-To de CSP (sem coletor ainda).
- SRI hash-based (alternativa ao nonce que manteria estático) — desnecessário:
  o app já é quase todo dinâmico; nonce é mais simples aqui.
