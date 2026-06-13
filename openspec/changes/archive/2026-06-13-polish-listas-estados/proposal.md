# Proposal — polish-listas-estados

## Why

Item **#7 (último)** do backlog de UI ([[arena-ui-backlog]]). Depois do overhaul
visual (`glow-up-visual`) e dos polish de criação, página do torneio, painéis de
início, modal de placar, nova partida e conta, sobraram as superfícies de
**listas densas e estados de sistema** ainda no visual PRÉ-overhaul:

- **Listas de partidas** (`MatchHistoryList`, `OpenMatchesList`): linhas
  `rounded-lg border px-4 py-3` chapadas, placar em fonte de corpo (o resto do
  app usa `font-display tabular-nums` em placares — `MatchCard`, `BracketView`,
  `StandingsTable`), cabeçalho de rodada `text-sm font-medium` sem peso de
  display, status da partida como texto solto, sem hover/profundidade.
- **W.O.** (`WoButtons`): controles funcionais, mas sem o refino de espaçamento/
  affordance das demais folhas client.
- **Carregamento da página do torneio** (`loading.tsx`): a tabela é um bloco
  cinza genérico `h-64` — não espelha a geometria real (header-hero + tabela),
  gerando layout shift e leitura "quebrada".
- **Estados de erro/ausência** (`error.tsx` ×4 + `not-found.tsx`): `Card`
  chapado, título sem `font-display`, sem ícone, sem `.elevate` nem `animate-rise`
  — destoam dos estados vazios já polidos (`EmptyActiveMatches`,
  `EstadoVazioSecao`). Além disso, os quatro `error.tsx` são cópias byte-a-byte
  (duplicação que convida à divergência).

Uso majoritário é em **celular** ([[feedback-mobile-pwa]]): validar tudo em 390px
primeiro, nos 2 temas (Dracula/Canarinho), em WCAG AA.

## What Changes

**Apresentação apenas.** Nenhuma mudança de comportamento, dados, contrato de
props, papéis acessíveis ou texto acessível. Os textos visíveis-chave que os
testes fixam (`R2`, `W.O.`, `2 x 1`, headings `Rodada N`, rótulos de botão,
blocos `sr-only`) permanecem byte-idênticos. `OpenMatchesList` e `MatchCard`
permanecem **Server Components** (guard de contenção de PII no teste).

- **Listas de partidas**: linhas ganham profundidade sutil (`bg-card/40` +
  `motion-safe:transition-colors hover:border-primary/30`), placar em
  `font-display tabular-nums` (consistente com o resto), badge de W.O. e dica
  "(vaga aberta)" refinadas, status da partida em pílula discreta. Em
  `OpenMatchesList`, o cabeçalho de rodada ganha tratamento `font-display` com
  marcador de acento (mantendo o nome acessível "Rodada N" e o botão
  "Fechar rodada N").
- **W.O.** (`WoButtons`): refino leve de espaçamento/rótulos de pendência
  (`Solicitando…`/`Fechando…` já existem), sem tocar actions nem rótulos que os
  testes fixam ("W.O.", "Solicitar W.O.", "Fechar rodada", "Aceitar"/"Recusar").
- **Skeleton de classificação** (`StandingsTableSkeleton`, novo) + reescrita de
  `torneios/[id]/loading.tsx` para espelhar a página real: header-hero
  (chip de ícone + título + chips) + cabeçalho de seção + tabela. O boundary de
  rota é **format-blind** (não sabe liga/grupos/mata-mata antes de buscar), então
  o esqueleto representa o caso dominante (tabela); um esqueleto de chave não tem
  consumidor sem um boundary por formato e seria código morto — fora de escopo,
  com o estado vazio da chave ("A chave aparece quando…") já cobrindo o resto.
- **Estados de erro/ausência**: componente presentacional compartilhado
  `BoundaryCard` (chip de ícone + título `font-display` + `.elevate` +
  `animate-rise` + slot de ações) aplicado aos quatro `error.tsx` (tom
  destrutivo, `AlertTriangle`, retry preservado) e ao `not-found.tsx` (tom neutro,
  ícone do primário, "Voltar ao painel"). `global-error.tsx` permanece
  **intocado** (último recurso com estilos inline, independente do CSS do app —
  mexer ali aumentaria risco sem ganho).

## Capabilities

Nenhuma capability nova. Adiciona requisitos de **APRESENTAÇÃO** (comportamento/
dados/contrato inalterados) a três capabilities existentes: `match-history`
(histórico), `standings-page` (lista de partidas em aberto + carregamento da
página do torneio) e `app-shell` (estados de erro/ausência vestidos com a
identidade).

## Impact

- **Novos**:
  - `src/features/standings/components/StandingsTableSkeleton.tsx` — esqueleto que
    espelha a `StandingsTable` (cabeçalho + N linhas), `aria-hidden`.
  - `src/components/boundary-card.tsx` — cartão presentacional de estado de
    fronteira (erro/ausência), sem `"use client"` (markup puro, usável por
    boundaries client e por RSC).
  - `src/components/boundary-retry-actions.tsx` — corpo compartilhado dos error
    boundaries (dica + botão de retry + código do erro), eliminando a cópia
    byte-a-byte dos quatro `error.tsx`.
- **Editados (markup/classe apenas)**:
  - `src/features/match/components/MatchHistoryList.tsx`
  - `src/features/match/components/OpenMatchesList.tsx`
  - `src/features/match/components/WoButtons.tsx` (refino leve)
  - `src/app/dashboard/torneios/[id]/loading.tsx`
  - `src/app/dashboard/error.tsx`, `src/app/dashboard/torneios/error.tsx`,
    `src/app/dashboard/torneios/[id]/error.tsx`,
    `src/app/dashboard/torneios/[id]/partidas/nova/error.tsx`
  - `src/app/dashboard/not-found.tsx`
- **Sem mudança**: `global-error.tsx`, todas as Server Actions, fetchers, motores,
  RLS, schema, `page.tsx` e os testes existentes (`MatchListsRodada.test.tsx`,
  `WoButtons.test.tsx`, `page.test.tsx` devem passar inalterados).
- **Risco**: baixo (presentational). Pontos de atenção: preservar textos/roles/
  sr-only que os testes fixam; manter `OpenMatchesList` como RSC; contraste AA do
  tom destrutivo nos 2 temas; layout das linhas e do skeleton no 390px.
