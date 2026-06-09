# Design — add-sentry-observability

Fundamentado por pesquisa multi-lente (workflow `wf_0a6558d7-25f`) + crítico de
completude. Decisões e armadilhas abaixo.

## Scrubbing de PII — 3 camadas, nenhuma basta sozinha

1. **`sendDefaultPii: false`** (3 runtimes) — corta IP, geoloc, user automático,
   cookies. **Insuficiente**: NÃO bloqueia body/URL/query da request no server.
2. **`requestDataIntegration({ include: { cookies:false, data:false,
   headers:false, ip:false, query_string:false } })`** (server) — elimina o
   VETOR 1 (FormData de `signup`/`atualizarPerfil` com celular) na raiz. (`user`
   NÃO é chave de `include` na 10.56 — a anexação de user é governada por
   `sendDefaultPii:false`; o scrub ainda força `event.user={id}`.)
3. **`beforeSend: scrubEvent` + `beforeSendTransaction: scrubTransactionEvent` +
   `beforeBreadcrumb: scrubBreadcrumb`** (3 runtimes) — rede de segurança por
   regex BR. **Os DOIS ganchos de evento são obrigatórios**: transações de
   performance NÃO passam pelo `beforeSend` (achado do adversarial), então têm
   seu próprio gancho. O scrub (genérico `scrubCommon<T extends Event>`) cobre
   message, transaction, exception.value, request.*, **tags**, extra, contexts,
   breadcrumbs e **spans** (description/data); neutraliza `wa.me/<num>`; força
   `event.user` a `{ id }`. `exception.stacktrace.frames` NÃO é redigido — o SDK
   JS não captura variáveis locais (só arquivo/função/linha), sem PII.
   Identidade só por `Sentry.setUser({ id })` (UUID).

### Regex de telefone (corrigida pelo crítico — domínio é só-dígitos)

`celularBR` (authSchema) armazena **11 dígitos** (`^[1-9]{2}9\d{8}$`);
`linkWhatsApp` gera `wa.me/55`+11 = 13 dígitos. A regex cobre os 3 formatos reais
(idênticos a `whatsapp.test.ts`): `11912345678`, `5511912345678`,
`(11) 91234-5678` — DDI 55 opcional, par/espaço/traço opcionais, com o `9` do 3º
dígito ancorando (evita casar timestamps de 13 dígitos, que não têm `9` ali).
`wa.me/\d+` é redigido à parte. Testado contra os 3 formatos.

### scrubDeep robusto (crítico R3)

Recursão com `WeakSet` de visitados + limite de profundidade — eventos Sentry
(`contexts`/`extra`) podem ter ciclos; sem guarda, `beforeSend` entraria em loop
e descartaria o evento silenciosamente.

## Transporte: túnel same-origin (CSP no-op)

`tunnelRoute: "/sentry-tunnel"` (string FIXA — `true` geraria path aleatório por
deploy, impossível de fixar no matcher). O browser POSTa `/sentry-tunnel`
(same-origin → `connect-src 'self'` já cobre; **CSP inalterada**); o route
handler do Sentry faz o relay server-side ao ingest (fora da CSP do browser).
O matcher do `proxy.ts:37` exclui `sentry-tunnel` como PRIMEIRO termo do
negative-lookahead — senão o POST passa pelo `updateSession` do Supabase e falha
silenciosamente (Turbopack, default no Next 16).

## Arquivos do Next 16 (renomes)

`sentry.client.config.ts` NÃO existe mais → `src/instrumentation-client.ts`
(convenção nativa desde Next 15.3). Server/edge seguem `sentry.*.config.ts` ao
lado, importados por caminho relativo no `register()`. `onRequestError =
captureRequestError` (SDK ≥8.28, Next ≥15) cobre RSC/Server Actions/route
handlers. `global-error.tsx` (crítico B1) captura erros do ROOT layout que
escapam dos 4 error boundaries existentes.

## Source maps / no-op gracioso

`withSentryConfig(nextConfig, { org: process.env.SENTRY_ORG, project:
process.env.SENTRY_PROJECT, authToken: process.env.SENTRY_AUTH_TOKEN,
tunnelRoute: "/sentry-tunnel", silent: !process.env.CI })`. **org/project de env,
não hardcoded** (crítico B2 — placeholder quebraria upload se token presente).
Sem token/org/project, upload é pulado, build passa. `deleteSourcemapsAfterUpload`
default true; NÃO setar `hideSourceMaps` (removido v9) nem opções `webpack.*`
(ignoradas sob Turbopack). `import "./src/lib/env"` permanece no topo (fail-fast).

## Testes / no-op sem credencial (crítico P2)

`Sentry.init(dsn=undefined)` é no-op total — sem DSN nada é enviado; app/dev/build
intactos. A suíte Vitest só importa `scrub.ts` (puro) — NÃO carrega os configs
nem dispara `Sentry.init`. `scrub.test.ts` alimenta evento sintético com celular
(11 e 13 dígitos) em message/request.data/breadcrumb + href `wa.me/...` e asserta
redação total.

## Pendências do usuário (anotadas, não bloqueiam)

- `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_AUTH_TOKEN` + `SENTRY_ORG`/`SENTRY_PROJECT`
  no `.env.local` e no Vercel.
- Vercel Deployment Protection em previews pode dar 401 no túnel (crítico C2) —
  conferir no painel.
- Validação final: disparar erro proposital numa Server Action que recebe o
  celular e confirmar no painel Sentry que NADA contém o número.

## Fora de escopo

Session Replay (PII visual; exigiria máscara total + `worker-src 'self' blob:`).
Alertas/dashboards no painel Sentry. Cron monitors.
