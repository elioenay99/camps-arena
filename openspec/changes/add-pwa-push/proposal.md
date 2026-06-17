# Proposal — add-pwa-push

## Why

A PWA Fase 2 (`add-pwa-offline`) deixou o app instalável e com fallback offline,
mas o Goliseu é usado majoritariamente em celular ([[feedback-mobile-pwa]]) e hoje o
jogador só descobre que uma rodada foi liberada, que o adversário registrou o placar
ou que um convite foi aceito **se abrir o app**. Web Push (Fase 3) entrega
notificações em tempo real à tela do celular, mesmo com o app fechado, fechando o laço
de engajamento dos torneios.

## What Changes

Escopo decidido com o dono (2026-06-16). **Gatilhos** (4): rodada liberada, placar
registrado, convite aceito, e W.O. solicitado/respondido. **Opt-in** por toggle na
página de Conta. **VAPID** geradas nesta sessão.

- **DDL** (via MCP mostrando o SQL; espelhada em `supabase/schema.sql` +
  `local-grants.sql` + `database.types.ts`):
  - Tabela `public.push_subscriptions (user_id, endpoint, p256dh, auth, created_at)`,
    PK `(user_id, endpoint)`, FK `user_id → public.users(id) on delete cascade`. RLS:
    SELECT/INSERT/DELETE gated a `auth.uid() = user_id` (cada um gerencia só as suas).
  - RPC `subscriptions_de(uuid[])` (`SECURITY DEFINER`, espelha `celulares_de_contato`):
    retorna as subscriptions dos destinatários, **gated por co-participação** —
    `id = auth.uid() OR eh_co_participante(id)`. EXECUTE só `authenticated`. É como o
    envio lê subs de OUTROS usuários **sem `service_role` em runtime** e sem virar um
    oráculo de subs arbitrárias (todos os 4 gatilhos envolvem pessoas que compartilham
    o torneio com quem dispara).
  - RPC `remover_push_endpoint(text)` (`SECURITY DEFINER`): apaga a subscription de um
    `endpoint` exato (opaco/secreto) — usada para podar subs expiradas (410/404) que
    pertencem a outro usuário. EXECUTE `authenticated`.
- **Dependência** `web-push` (+ `@types/web-push`).
- **Env** (`src/lib/env.ts`, opcionais — degradam graciosamente se ausentes, sem
  quebrar build/deploy): `NEXT_PUBLIC_VAPID_PUBLIC_KEY` (client),
  `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` (server-only).
- **Módulo de envio** `src/features/notifications/` (server-only): `enviarNotificacoes
  (supabase, destinatarios, payload)` — chama `subscriptions_de`, envia via `web-push`
  com `Promise.allSettled`, poda subs `410/404`. **Best-effort**: nunca lança nem
  bloqueia a action que o chamou; no-op se VAPID ausente.
- **Server Actions** `src/actions/push.ts`: `subscribeUser(sub)` (upsert da própria
  sub), `unsubscribeUser(endpoint)` (delete da própria).
- **Gatilhos**: após a mutação bem-sucedida, as actions chamam `enviarNotificacoes`
  com os destinatários (excluindo quem disparou): `liberarRodadas`, `updateMatchScore`,
  `aceitarConvite`/`aceitarConviteVaga`, `solicitarWO`/`responderWO`.
- **Service worker** (`public/sw.js`, **sem bump de `VERSION`** — continua
  `goliseu-sw-v1`; bumpar apagaria o precache da Fase 2): listeners `push`
  (`showNotification`) e `notificationclick` (foca uma aba aberta ou abre `data.url`).
  Ortogonais ao fetch/cache da Fase 2.
- **UI de opt-in**: `SecaoCard` "Notificações" na página de Conta + componente client
  (Switch) que pede permissão, faz `pushManager.subscribe(applicationServerKey)` e
  chama `subscribeUser`; ao desligar, `unsubscribe()` + `unsubscribeUser`. Degrada se
  o browser não suporta, permissão negada, ou VAPID ausente.

## Capabilities

- **Nova**: `push-notifications`.
- **Modificada**: `service-worker` (adiciona os listeners `push`/`notificationclick`).

## Impact

- **Novo**: tabela + 2 RPCs no banco; `src/actions/push.ts`,
  `src/features/notifications/*`, componente client de opt-in,
  `public/badge.png` (opcional). 
- **Editado**: `public/sw.js`, `src/lib/env.ts`, `.env.example`,
  `database.types.ts`, `schema.sql`, `local-grants.sql`, as 4+ actions de gatilho,
  página de Conta.
- **Infra colaborativa**: o dono cola as 3 VAPID vars no `.env.local` e no Vercel
  (eu gero e entrego). A tabela vai ao PROD via MCP mostrando o SQL.
- **Sem regressão**: a Fase 2 (cache/offline) é intocada; o envio é best-effort e fora
  do caminho crítico das actions; sem VAPID, tudo vira no-op silencioso.
- **Risco**: médio. Pontos de atenção no `design.md`: gating da RPC de subs, envio
  não-bloqueante, não-vazamento da private key, poda de subs expiradas, e o push não
  conter dados além do que o destinatário já pode ver.
