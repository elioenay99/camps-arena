## Why

Os cards de partida da tela de torneio estão ilegíveis no celular — exatamente a
superfície que o produto mais usa (PWA, uso diário do organizador no estádio/sofá).
Medição real a 390px de viewport, na aba Partidas de um torneio de produção:

- largura útil do `<li>`: **342px**
- grupo de AÇÕES (`shrink-0`, `flex-wrap`): **253px** — 74% da linha, e não encolhe
- sobra para a identidade (rodada + nome_1 + placar + nome_2): **39px**

Com nomes curtos ("A1"/"A2") ainda cabia. Com "Remo"/"Botafogo" a identidade precisa de
~180px, não tem, e o resultado é o print do dono: o gatilho "Artilheiros" **sobreposto ao
nome do time** e "Compartilhar resultado" **cortado fora da viewport**. O placar — o dado
mais importante do app — é o primeiro a sumir. (`MatchHistoryList.tsx:92-129`)

A lista irmã (`OpenMatchesList.tsx:139-265`) não tem overflow (já empilha no mobile), mas
tem o problema oposto: **densidade**. Cada partida agendada gasta ~300px de altura com 3-4
botões full-width empilhados; cabem 2 partidas por tela e uma rodada de 10 vira 4 telas de
rolagem.

A direção do produto veio do dono: **escudo no mobile, nome na tela grande, e um
"detalhes" que ao abrir mostra tudo**. O insumo já existe no servidor — `PartidaEncerrada`
e `PartidaAberta` já carregam `escudo_1`/`escudo_2`, e `TeamCrest` já resolve escudo com
fallback de iniciais + cor estável. É **zero-DDL e zero-fetch**: só ligar os fios.

**Decisões travadas (não reabrir):**

1. **Só apresentação.** Nenhuma mudança em Server Action, RPC, RLS, fetcher, schema ou
   regra de autorização. Zero DDL. `proxy.ts`/middleware intocados.
2. **As duas listas continuam RSC puro.** Nada de `"use client"` — em `OpenMatchesList`
   isso é contenção de PII (celular do adversário), já protegida por guard de teste.
3. **Disclosure NATIVO (`<details>`/`<summary>`), não estado React.** Evita a fronteira
   RSC onde o projeto já se queimou (JSX de client component como prop de server
   component chegava com `isValidElement=false` e o botão sumia — `fix-editar-placar-rsc`).
4. **As ações de `OpenMatchesList` continuam VISÍVEIS.** Editar placar / Encerrar / W.O. /
   Chamar são o uso diário; a densidade se resolve por grid de 2 colunas, não escondendo.
5. **Nenhuma lógica de gate muda**: `mostrarEncerrar`, `temPropostaPendente`,
   `podeMarcarWo`, `podeSolicitarWo` e o atalho de WhatsApp/PII ficam idênticos.

## What Changes

- **NOVO `src/features/match/components/PartidaIdentidade.tsx`** (RSC puro) — bloco de
  identidade compartilhado pelas duas listas: rótulo de rodada, `TeamCrest` de cada lado,
  nome de cada lado **oculto no mobile e visível de `sm:` para cima** (`hidden sm:inline`,
  `min-w-0` + `truncate`), e um slot central para o placar/W.O. O placar ganha o maior
  peso visual da linha (`font-display`, `tabular-nums`, `text-base sm:text-sm`).

- **`MatchHistoryList`** — a linha vira um `<details>` nativo. O `<summary>` (alvo de
  toque ≥44px, marcador nativo removido, chevron que gira com `group-open:`) mostra
  rodada · escudo · **PLACAR dominante** · escudo (+ nomes de `sm:` para cima, + data de
  `sm:` para cima) e carrega o texto `sr-only` do resultado. O CORPO do details traz nomes
  completos, data (no mobile), gols contra, badge "faltam N artilheiros" e as AÇÕES
  (`ArtilheirosEncerrada`, `CompartilharResultadoButton`, reabrir). Nenhum controle
  interativo dentro do `<summary>`. W.O./W.O. duplo continuam sinalizados na linha
  principal — são resultado, não detalhe.

- **`OpenMatchesList`** — mesma identidade (escudo + placar dominante, nome só de `sm:`
  para cima). O cluster de ações troca o empilhamento full-width por **grid de 2 colunas
  no mobile** (`grid grid-cols-2`, uma coluna quando há só uma ação), com a ação primária
  ("Editar placar") e o indicador de proposta pendente ocupando a linha inteira
  (`col-span-2`). De `sm:` para cima o wrapper vira `display: contents` e o cluster volta
  a ser exatamente o `flex` de hoje — desktop preservado.

- **Testes** — atualiza/estende `MatchListsRodada.test.tsx`: details recolhido não expõe
  as ações e expandido expõe; escudo com e sem `escudo_url` (fallback de iniciais); W.O. e
  W.O. duplo continuam rotulados; `sr-only` do resultado íntegro; nome no DOM em ambos os
  breakpoints (a ocultação é por CSS). Novo `PartidaIdentidade.test.tsx`.

## Impact

- **Specs:** `match-history` (MODIFIED — apresentação: disclosure + identidade por escudo),
  `match-lifecycle` (ADDED — densidade e identidade da lista de partidas em aberto).
- **Código (alterado):** `src/features/match/components/MatchHistoryList.tsx`,
  `OpenMatchesList.tsx`, novo `PartidaIdentidade.tsx`, testes.
  **Intocados:** fetchers (`getTournamentClassificacao.ts`), Server Actions, RPCs, RLS,
  `TeamCrest`, `RoundPager`, `MatchScoreModalConnected`, `proxy.ts`, banco.
- **Risco:** baixo-médio. É layout, mas mexe na superfície mais usada do app. O risco real
  é regressão de conteúdo/acessibilidade (nome, placar, `sr-only`, W.O.), coberto por
  teste, e a perda de "ações inline" no histórico em desktop — trade-off consciente,
  registrado em `design.md`.
