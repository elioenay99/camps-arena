# Design — add-realtime-scoreboard

## Contexto

`MatchCard` é RSC e calcula MUITA coisa derivada no servidor (lados normalizados
avulso/competitivo, link de convocação com o celular do adversário, mensagens de
WhatsApp por lado). Esse cálculo NÃO pode migrar para o cliente sem vazar PII
(celular) no payload Flight para quem não joga a partida. Logo, o realtime tem
de tocar SÓ os bits que mudam — os dois números e a cápsula de status — mantendo
todo o resto RSC.

## Arquitetura: provider client + folhas client, card continua RSC

```
dashboard/page.tsx (RSC)
  └─ <LiveMatchesProvider initial={[{id, placar_1, placar_2, status}, …]}>  (client)
       └─ <ul>{partidas.map(p => <MatchCard partida={p} userId/>)}</ul>      (RSC children)
              └─ MatchCard (RSC) usa:
                   <LiveStatusBadge matchId initial={status}/>   (client folha — header)
                   <LiveScore matchId field="placar_1" initial={placar_1}/>  (client folha)
                   <LiveScore matchId field="placar_2" initial={placar_2}/>
```

**Por que funciona**: um client provider pode receber RSC como `children`; o
React Context é resolvido por POSIÇÃO NA ÁRVORE em runtime, não pela fronteira
server/client. Folhas client renderizadas dentro dos RSC children (que estão
dentro do provider) leem o context do provider normalmente. O card permanece
RSC, sem `"use client"`.

**Uma assinatura só**: o provider abre UM canal Realtime para a página inteira e
distribui por `matchId`. Evita N websockets (um por card) e o teto de canais do
Supabase.

## Assinatura e RLS

- Browser client `@/lib/supabase/client` (anon key + sessão por cookie via
  `@supabase/ssr`). O canal é autenticado ⇒ o Realtime aplica a policy de SELECT
  de `matches`: o usuário só recebe eventos de partidas que já pode ler. Sem
  ampliar visibilidade; nenhuma policy nova.
- Evento: `postgres_changes`, `event: 'UPDATE'`, `schema: 'public'`,
  `table: 'matches'`. SEM filtro de id no servidor (postgres_changes não filtra
  por lista) — filtra-se no cliente pelos ids presentes no mapa inicial. RLS já
  limita o fluxo ao que é visível.
- Ao receber UPDATE: se `payload.new.id` está no mapa, atualiza
  `{placar_1, placar_2, status}` daquele id; senão IGNORA (granularidade: só
  cards já na tela).
- Cleanup: `removeChannel` no unmount do provider (effect com cleanup).

## Edge cases e decisões

- **Partida encerra (status→encerrada)**: `getActiveMatches` filtra encerradas,
  mas o evento chega para uma partida que ESTÁ na tela. Decisão de produto: a
  cápsula passa a "encerrada" ao vivo; o card só SOME no próximo refresh. Aceito
  (granularidade "só placar/status; lista no refresh"). A cápsula "encerrada"
  reusa o estilo neutro já existente no card.
- **Partida nova (INSERT)**: ignorada pelo realtime (não está no mapa). Aparece
  no próximo refresh. Coerente com o escopo.
- **Reconexão/sem websocket**: estado inicial vem da RSC; se o canal nunca
  conecta, o painel é idêntico ao de hoje. Realtime é estritamente aditivo.
- **Corrida render↔evento**: o valor inicial é a fonte; o primeiro evento
  sobrescreve. Se um evento chegar com snapshot mais novo que o render, o
  cliente converge para o último UPDATE recebido (last-write-wins, igual ao
  banco). Não reordena nem recalcula standings (fora de escopo).
- **Acessibilidade**: o `sr-only` "Placar atual: …" é renderizado pela folha
  client (`LiveScoreSr`) para refletir o valor vivo sem divergir do número
  visível. Ele é uma região live `role="status" aria-live="polite"
  aria-atomic="true"` — anuncia a mudança de placar quando o Realtime atualiza
  (gols são raros, então `polite` não tagarela; nunca `assertive`). Espelha o
  padrão já usado no `MatchScoreModal`. A cápsula de status NÃO recebe live
  region (mudança de status some/encerra o card no refresh; foco do anúncio ao
  vivo é o placar).

## Fora de escopo (registrado)

- Página do torneio e modal de placar ao vivo (decisão: só painel).
- Recalcular classificação/histórico ao vivo.
- Presence/"fulano está digitando o placar"; broadcast de cursores.
- Lista viva (card aparece/some em tempo real).
