# Proposal — add-realtime-scoreboard

## Why

O painel (`/dashboard`) é uma RSC pura: `getActiveMatches` lê `placar_1/2` e
`status` no momento do render. Quando um lado atualiza o placar pela Server
Action, só a tela de QUEM disparou a ação revalida — o adversário (e qualquer
espectador da mesma partida) continua vendo o placar velho até dar refresh
manual. O selo "Ao vivo na arena" mente: nada é ao vivo. Para um app de
acompanhar partidas, o placar mudar sozinho na tela é a função central que falta.

## What Changes

- **Placar e status ao vivo no painel** via **Supabase Realtime**
  (`postgres_changes`, evento `UPDATE` da tabela `matches`, websocket no
  browser). Os cards já visíveis atualizam os dois números e a cápsula de
  status (agendada/em andamento/encerrada) sem refresh.
- **Uma única assinatura por página**: um client provider (`LiveMatchesProvider`)
  assina o canal uma vez e mantém um mapa `matchId → {placar_1, placar_2,
  status}`; as folhas client (`LiveScore`, `LiveStatusBadge`) leem do context e
  caem nos valores iniciais (vindos da RSC) até o primeiro evento. O `MatchCard`
  continua **RSC** — só os bits dinâmicos viram client (PII permanece no
  servidor; ver design).
- **Escopo deliberadamente enxuto** (decisões de produto fechadas): SÓ o painel;
  SÓ placar e status dos cards JÁ na tela. Partida nova que entra ou partida que
  encerra (e some do filtro) só aparecem/somem no próximo refresh — o realtime
  não mexe na composição da lista.
- **RLS no canal**: o cliente do browser assina autenticado (sessão via
  `@supabase/ssr`); o Realtime só entrega eventos de partidas que o usuário já
  pode ler (mesma policy de SELECT de `matches`). Sem ampliar visibilidade.
- **Config manual**: publicar `public.matches` na publication
  `supabase_realtime` (nova seção nas pendências). Sem mudança de tabela/coluna.

## Capabilities

### Modified Capabilities

- `dashboard`: o placar e o status das partidas ativas atualizam em tempo real,
  sem refresh, enquanto a partida está na tela.

### Added Capabilities

- `data-model`: a tabela `matches` é publicada no Realtime (replication) para
  emissão de eventos `postgres_changes` respeitando RLS.

## Impact

- **Banco/config**: `ALTER PUBLICATION supabase_realtime ADD TABLE
  public.matches` (config manual). RLS de `matches` inalterada — o canal reusa a
  policy de SELECT existente. Nenhuma DDL de tabela/coluna.
- **Código**: novo `src/features/match/live/` (provider client + hook +
  `LiveScore`/`LiveStatusBadge`); `MatchCard` passa a usar as folhas no lugar dos
  números crus e da cápsula; `dashboard/page.tsx` envolve a lista no provider
  passando os valores iniciais. `getActiveMatches` inalterado.
- **Não muda**: motores (computeStandings/chaveamento/W.O.), Server Actions de
  placar/lifecycle, página do torneio, modal de placar, fetchers, RLS de tabelas.
- **Degradação graciosa**: se o websocket não conectar, o painel se comporta
  exatamente como hoje (valores do render; refresh atualiza). Realtime é
  aditivo, nunca um caminho crítico.
