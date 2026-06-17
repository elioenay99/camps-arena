# Design — add-pwa-push

> Revisado após o gate `wrt17n6qw` (changes_required): 4ª policy (UPDATE) para o upsert;
> envio SEMPRE aguardado antes de `redirect()`; SW SEM bump de VERSION; `PushToggle` via
> `getRegistration('/')` (não `.ready`); destinatários derivados das PARTIDAS do evento
> (não do torneio inteiro), com filtro de NULL e do caller dentro do helper; try/catch
> cobrindo todo o envio; poda por `statusCode`.

## Contexto apurado

- **Nenhuma infra de notificação existe**; `web-push` não instalada (`@types/web-push`
  3.6.4 disponível).
- O projeto **não usa `service_role` em runtime** — cross-user privilegiado é via RPC
  `SECURITY DEFINER` que valida por dentro (padrão `celulares_de_contato`,
  `schema.sql:912`, que chama `eh_co_participante` de dentro do DEFINER — funciona em
  PROD apesar do EXECUTE revogado, pois roda como owner).
- `eh_co_participante(uuid)` (`schema.sql:877`): true se `auth.uid()` e o argumento
  compartilham um torneio. `auth.uid()` resolve dentro do DEFINER.
- SW da Fase 2 (`public/sw.js`): `install`/`activate`/`fetch`. O `activate` poda toda
  cache cujo nome ≠ `VERSION` — por isso **bumpar VERSION sem mudar o precache é
  prejudicial** (apaga o `/offline.html` à toa).
- Actions de convite (`participants.ts:88`, `slots.ts:91`) terminam em `redirect()`, que
  **lança `NEXT_REDIRECT`** e encerra a invocação — qualquer promessa não-aguardada antes
  dele é cortada em serverless.
- `liberarRodadas` (`tournaments.ts:1499`) hoje faz `.select('id')` e retorna só a
  contagem. `participants` é **avulso-only** (`schema.sql:171`); no modelo competitivo os
  destinatários vêm de `matches.vaga_1/2 → tournament_slots.user_id` (que pode ser NULL:
  vaga por-nome ou conta apagada).

## Decisões

### D1 — Tabela `push_subscriptions` com RLS self-service (4 policies)
```
create table public.push_subscriptions (
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null, p256dh text not null, auth text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
```
RLS para `authenticated`, todas com `user_id = auth.uid()`: **SELECT, INSERT, UPDATE,
DELETE**. A policy de **UPDATE é obrigatória** porque o `subscribeUser` usa
`ON CONFLICT DO UPDATE` (renovação de chave do push service com o mesmo endpoint), e o
caminho de conflito é avaliado contra a policy de UPDATE — sem ela o upsert é negado
silenciosamente (precedente: `tournament_invites_update_owner`, `schema.sql:1436`). Sem
policy para `anon` (nega por ausência). `endpoint`/chaves nunca legíveis por terceiros.

### D2 — Leitura cross-user via RPC gated por co-participação (NÃO service_role)
```
create function public.subscriptions_de(p_user_ids uuid[])
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.user_id = any (p_user_ids)
    and (s.user_id = (select auth.uid()) or public.eh_co_participante(s.user_id));
$$;
revoke execute on function public.subscriptions_de(uuid[]) from public, anon;
grant execute on function public.subscriptions_de(uuid[]) to authenticated;
```
A RPC PODE retornar a sub do próprio caller (ramo `auth.uid()`) — por isso a exclusão do
caller é feita ANTES, no helper (D5). Caller malicioso só lê subs de quem já compartilha
torneio com ele (mesmo modelo do `celular`); endpoint sozinho não permite enviar push.

### D3 — Poda de subs expiradas via RPC por endpoint exato
```
create function public.remover_push_endpoint(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
grant execute ... to authenticated; revoke ... from public, anon;
```
`endpoint` é opaco/secreto (só quem recebeu o 410 o conhece) → não é oráculo; risco
desprezível. **Dívida documentada**: subs órfãs de ex-coparticipantes não são podadas por
idade (follow-up). Endurecimento opcional do gate (gate por co-participação no delete) NÃO
adotado nesta fase (custo > benefício).

### D4 — Env vars OPCIONAIS, com a chave pública ESTÁTICA no objeto `env`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`: adicionada ao `envSchema` como `.optional()` **E ao
  objeto `env`** com referência literal (`env.ts:59`) — o Next só inlina
  `process.env.NEXT_PUBLIC_*` em referência literal; o `PushToggle` (client) lê
  `env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: **helpers server-only** fora do parse eager
  (padrão `apiFootballKey()`, `env.ts:72`) — nunca no bundle client.
Sem qualquer das três: build/deploy NÃO quebram; UI mostra indisponível; envio é no-op.

### D5 — Módulo de envio best-effort (`src/features/notifications/enviar.ts`)
`import "server-only"`. Assinatura:
`enviarNotificacoes(supabase, destinatarios: (string|null)[], payload, callerId: string)`
— `callerId` é o `user.id` que cada gatilho já tem em mãos (fonte única do uid; não
deriva por dentro):
1. **Todo o corpo num único try/catch** que engole (e opcionalmente
   `Sentry.captureException` com tag) — nada propaga (cobre rpc rejeitada,
   `setVapidDetails` lançando por chave malformada, e o loop).
2. `const ids = [...new Set(destinatarios)].filter((id): id is string => !!id && id !== callerId)`
   — remove NULL, duplicados e o **próprio caller** (defesa em profundidade, além de cada
   gatilho montar a lista certa). Se vazio → return.
3. Guard: se `vapidPublicKey()`/`vapidPrivateKey()`/`vapidSubject()` ausentes → return.
4. `webpush.setVapidDetails(subject, public, private)` (lazy).
5. `subscriptions_de(ids)` via `supabase.rpc`; se `error` → return.
6. `Promise.allSettled` enviando a cada sub; no catch de cada envio, narrow
   `if (err && typeof err === 'object' && 'statusCode' in err && (err.statusCode===404||err.statusCode===410))`
   → `remover_push_endpoint(endpoint)` (a poda não derruba os demais envios).
**Nunca lança.** As actions **sempre `await enviarNotificacoes(...)` ANTES de qualquer
`redirect()`/`return`** (em serverless, promessa solta antes do redirect é cortada).

### D6 — Payload mínimo e seguro
`PushPayload { title: string; body: string; url?: string; tag?: string }`. Só dado que o
destinatário JÁ vê (é co-participante): "Rodada liberada em <torneio>", "<nome> registrou
<placar>". `url` → `/dashboard/torneios/<id>`. `tag` agrupa por torneio.

### D7 — Server Actions de subscription (`src/actions/push.ts`)
- `subscribeUser(sub)`: o `PushSubscription.toJSON()` é ANINHADO
  (`{ endpoint, keys: { p256dh, auth } }`) — o `PushToggle` (D9) ACHATA antes de chamar
  (`{ endpoint, p256dh: keys.p256dh, auth: keys.auth }`), e o Zod valida esse shape plano.
  `upsert` onConflict `(user_id, endpoint)` com `user_id = auth.uid()` (a policy UPDATE de
  D1 habilita o conflito).
- `unsubscribeUser(endpoint)`: delete da própria.
NÃO importam o módulo de envio nem `web-push` (fronteira limpa).

### D8 — Service worker: listeners push/notificationclick (SEM bump de VERSION)
Acrescentar ao fim do `public/sw.js`, **mantendo `VERSION = "goliseu-sw-v1"`** (o browser
ativa o SW novo pelo diff de bytes + `Cache-Control: no-store`; bumpar apagaria o precache
da Fase 2):
```
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(self.registration.showNotification(data.title ?? 'Goliseu', {
    body: data.body, icon: '/icon-192.png', badge: '/icon-192.png',
    tag: data.tag, data: { url: data.url ?? '/dashboard' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/dashboard';
  event.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const hit = all.find((c) => c.url.includes(url));
    return hit ? hit.focus() : clients.openWindow(url);
  })());
});
```
Ortogonais ao `fetch` (não tocam Cache Storage). CSP do `/sw.js` (`script-src 'self'`) já
cobre; nenhuma directive muda.

### D9 — UI de opt-in na Conta
`SecaoCard` (ícone `Bell`) "Notificações" + client `PushToggle`:
- Suporte = `'serviceWorker' in navigator && 'PushManager' in window && !!env.NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
- Registration via `navigator.serviceWorker.getRegistration('/')` (**nunca `.ready`** — em
  dev o SW não registra, `.ready` jamais resolve). Sem registration → indisponível
  ("disponível na versão publicada"). Documenta: push só funciona onde o SW está
  registrado (produção), coerente com a Fase 2.
- Ligar: `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly:
  true, applicationServerKey: urlBase64ToUint8Array(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) })`
  → `subscribeUser(sub.toJSON())`.
- Desligar: `sub.unsubscribe()` + `unsubscribeUser(endpoint)`.
- Degrada (toggle off + texto) se sem suporte ou permissão `denied`.

### D10 — Destinatários por gatilho (das PARTIDAS/RPC do evento, nunca do torneio inteiro)
Regra geral: cada gatilho **coleta todos os user_ids relacionados ao evento**; o helper
(D5) filtra NULL, duplicados e o caller. Nunca consultar "todos os participantes do
torneio".
- **liberarRodadas**: trocar `.select('id')` por
  `.select('id, participante_1, participante_2, vaga_1:tournament_slots!matches_vaga_1_fkey(user_id), vaga_2:tournament_slots!matches_vaga_2_fkey(user_id)')`
  — destinatários = união dos 4 campos de TODAS as linhas retornadas pelo UPDATE (= as
  partidas liberadas NESTE batch). Cobre os 2 modelos (avulso=participante_1/2;
  competitivo=vaga→slot.user_id); um modelo por partida (constraint
  `matches_lado_vaga_ou_user`). Payload: "Rodada liberada em <torneio>".
- **updateMatchScore**: carregar a partida com participante_1/2 + vaga_1/2→slot.user_id;
  destinatários = todos esses ids (o helper remove o caller → sobra o adversário). Sem
  lógica de "qual lado". **Forma do embed**: `vaga_N` volta como objeto único
  `{ user_id } | null` (relação many-to-one) — extrair `match.vaga_1?.user_id` (padrão de
  `match.ts:114`/`wo.ts:276`, com o cast de fronteira `as unknown as` já usado no projeto).
  Payload: "<nome> registrou <placar>".
- **aceitarConvite / aceitarConviteVaga**: a RPC devolve só o `tournamentId` →
  `select created_by from tournaments where id = tournamentId`; `await enviarNotificacoes
  ([created_by], payload)` APÓS o `revalidatePath` e ANTES do `redirect()`. (Validar ao
  vivo que o novo participante lê `created_by` pela RLS de tournaments.) Payload: "<nome>
  entrou no seu torneio".
- **solicitarWO**: notifica o dono (`created_by`). Payload: "<nome> solicitou W.O.".
- **responderWO**: `responderWO` NÃO tem hoje um match-com-vagas carregado (só o `req` com
  `solicitante_slot`). ADICIONAR uma nova leitura, UMA vez, usada nos dois ramos
  (aceite/recuse): `matches.select('vaga_1, vaga_2, v1:tournament_slots!matches_vaga_1_fkey(user_id), v2:tournament_slots!matches_vaga_2_fkey(user_id)')`.
  Destinatários = os dois `user_id` das vagas (`v1?.user_id`, `v2?.user_id`); o helper remove
  o caller (o dono que responde), sobrando solicitante + adversário — dispensa mapear por
  `solicitante_slot`. Payload: "Seu W.O. foi aceito/recusado".

## Edge cases e mitigações

- Push best-effort (try/catch total) — actions concluem mesmo com push falho (D5).
- Caller nunca se autonotifica (filtro no helper + por gatilho).
- Destinatário NULL (vaga por-nome, conta apagada) filtrado antes da RPC.
- Multi-device: várias subs por user → envia a todas.
- Sub expirada (404/410) → podada por `statusCode`.
- VAPID ausente → no-op silencioso; build/deploy intactos.
- `userVisibleOnly: true` (Chrome). Private key server-only.

## Alternativas rejeitadas

- `service_role` em runtime: quebra padrão e amplia superfície.
- RPC de subs sem gating: vazaria endpoints de qualquer logado.
- Bump de VERSION do SW: apagaria o precache da Fase 2 sem necessidade.
- Email/SMS, fila/worker: fora do escopo; envio inline best-effort basta.
