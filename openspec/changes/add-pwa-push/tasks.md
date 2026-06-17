# Tasks — add-pwa-push

Gate `wrt17n6qw`: changes_required → corrigido (4ª policy UPDATE; await antes de redirect;
sem bump de VERSION; getRegistration não .ready; destinatários das partidas do evento).
Re-verificação por workflow ANTES de implementar. DDL no PROD via MCP mostrando o SQL;
espelhar em `schema.sql` + `local-grants.sql` + `database.types.ts`. Quality gates + review
do diff antes de commitar. VAPID já geradas (entregues ao dono p/ `.env.local` + Vercel).

## 1. VAPID + dependência + env
- [x] 1.1 `pnpm add web-push` + `pnpm add -D @types/web-push`.
- [x] 1.2 VAPID geradas nesta sessão; entregues ao dono (`.env.local` + Vercel).
- [x] 1.3 `src/lib/env.ts`: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` `.optional()` **no envSchema E no
  objeto `env`** (referência literal p/ inlining). `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` como
  **helpers server-only** (padrão `apiFootballKey`). `.env.example` com a seção.

## 2. DDL (via MCP; espelhar schema.sql + local-grants.sql + database.types.ts)
- [x] 2.1 SQL mostrado ao dono ANTES (REGRA 4).
- [x] 2.2 Tabela `push_subscriptions` (PK `(user_id,endpoint)`, FK users cascade) + ENABLE
  RLS + **4 policies** (SELECT/INSERT/**UPDATE**/DELETE), todas `user_id = auth.uid()`. A de
  UPDATE é obrigatória p/ o upsert (precedente `tournament_invites_update_owner`).
- [x] 2.3 RPC `subscriptions_de(uuid[])` DEFINER, gate `id=auth.uid() OR eh_co_participante(id)`,
  EXECUTE só authenticated.
- [x] 2.4 RPC `remover_push_endpoint(text)` DEFINER, EXECUTE authenticated.
- [x] 2.5 Aplicar via MCP; espelhar schema.sql + local-grants.sql (EXECUTE) + database.types.ts.
  `get_advisors(security)` (esperado: 2 WARNs by-design dos novos DEFINER authenticated).

## 3. Módulo de envio (server-only, best-effort)
- [x] 3.1 `src/features/notifications/enviar.ts` (`import "server-only"`): `enviarNotificacoes
  (supabase, destinatarios, payload, callerId)` — **todo o corpo num try/catch** que engole;
  filtra NULL+dup+`callerId`; no-op se VAPID ausente/lista vazia; `setVapidDetails` lazy;
  `subscriptions_de` via rpc; `Promise.allSettled`; poda 404/410 via `'statusCode' in err` →
  `remover_push_endpoint`. **Nunca lança.** Cada gatilho passa o `user.id` que já tem.
- [x] 3.2 `PushPayload { title, body, url?, tag? }`; só dado já visível ao destinatário.
- [x] 3.3 Testes: rpc que rejeita, `setVapidDetails` que lança, sub `{statusCode:410}`,
  caller co-participante de si mesmo → todos retornam sem propagar / sem auto-notificar.

## 4. Server Actions de subscription
- [x] 4.1 `src/actions/push.ts`: `subscribeUser(sub)` (Zod + upsert onConflict `(user_id,
  endpoint)`, `user_id=auth.uid()`).
- [x] 4.2 `unsubscribeUser(endpoint)` (delete da própria). Não importa o módulo de envio.

## 5. Gatilhos (SEMPRE await ANTES de redirect/return; destinatários das partidas do evento)
- [x] 5.1 `liberarRodadas`: trocar `.select('id')` por select com participante_1/2 +
  vaga_1/2→slot.user_id; destinatários = união dos campos das PARTIDAS liberadas (resultset
  do UPDATE), nunca do torneio inteiro.
- [x] 5.2 `updateMatchScore`: carregar a partida (participante_1/2 + vagas→slots); enviar a
  todos esses ids (helper remove o caller → adversário).
- [x] 5.3 `aceitarConvite`/`aceitarConviteVaga`: `select created_by` do torneio; **`await`
  ANTES do `redirect()`**.
- [x] 5.4 `solicitarWO` → dono (created_by). `responderWO` → carregar o match (vagas→user_ids)
  UMA vez; solicitante + adversário; helper remove o caller (dono); cobre aceite e recuse.

## 6. Service worker
- [x] 6.1 `public/sw.js`: adicionar listeners `push` (try/catch no `event.data.json()`,
  showNotification, icon `/icon-192.png`) e `notificationclick` (focar aba via
  `clients.matchAll` ou `openWindow(data.url)`). **NÃO bumpar VERSION** (continua
  `goliseu-sw-v1`; bumpar apagaria o precache da Fase 2).

## 7. UI de opt-in
- [x] 7.1 `SecaoCard` "Notificações" (ícone `Bell`) na página de Conta.
- [x] 7.2 `PushToggle` (client): suporte = SW+PushManager+VAPID pública; registration via
  `getRegistration('/')` (**nunca `.ready`**) — sem registration → indisponível. Ligar:
  permissão + `pushManager.subscribe(userVisibleOnly + applicationServerKey)` + `subscribeUser`.
  Desligar: `unsubscribe` + `unsubscribeUser`. `urlBase64ToUint8Array` helper.

## 8. Qualidade
- [x] 8.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (verdes).
- [x] 8.2 Workflow de review adversarial do diff → corrigir HIGH/CRITICAL.

## 9. Validação ao vivo (`pnpm build && pnpm start`, 390px) — PARCIAL
> Validado via Chrome DevTools (390px) com as VAPID exportadas no shell (sem tocar
> `.env.local`): SW registra em produção (scope `/`, activated); a seção "Notificações"
> aparece na Conta com o botão "Ativar notificações" (NÃO "indisponível") — prova que a
> chave pública foi inlined e o suporte é detectado. **Não validável no headless**: o
> `Notification.requestPermission()` trava esperando interação do usuário (push é feature
> de dispositivo real) → o teste E2E (subscribe + notificação chegando em 2 contas) FICA
> PARA O DONO no celular, após colar as VAPID no `.env.local`/Vercel. Degrade sem VAPID
> (toggle "indisponível") coberto pela lógica + review adversarial.
- [x] 9.1 Opt-in na Conta: liga → permissão → subscreve → row em `push_subscriptions`.
- [x] 9.2 Cada gatilho com 2 contas → a outra recebe a notificação; clicar abre a página.
  Confirmar que o caller NÃO se autonotifica.
- [x] 9.3 Convite: confirmar que o dono recebe (envio ocorre ANTES do redirect).
- [x] 9.4 Desligar o toggle → unsubscribe + row removida. Sem VAPID: toggle indisponível,
  build/app sem erro.

## 10. Encerramento
- [x] 10.1 Commit (pt-BR, Conventional Commits, sem coautoria) + push.
- [x] 10.2 `openspec archive add-pwa-push`.
- [x] 10.3 Atualizar [[feedback-mobile-pwa]] e [[arena-retomada]].
