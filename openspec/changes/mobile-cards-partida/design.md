## Contexto

Duas listas de partida convivem na mesma aba do torneio e hoje divergem em layout:

| | `MatchHistoryList` (encerradas) | `OpenMatchesList` (em aberto) |
|---|---|---|
| container | `flex justify-between` (uma linha) | `flex-col` no mobile, `flex-row` de `sm:` |
| falha em 390px | **overflow**: ações `shrink-0` comem 253/342px | **densidade**: ~300px de altura por card |
| ações | eventuais (artilheiros, compartilhar, reabrir) | diárias (editar placar, encerrar, W.O., chamar) |

A diferença de natureza das ações governa a solução: no histórico as ações podem recolher
atrás de um toque; nas partidas em aberto, não.

## Decisões

### 1. Identidade: escudo no mobile, nome de `sm:` para cima

`hidden sm:inline` no nome, `TeamCrest` sempre. O `TeamCrest` já tem fallback de iniciais
com cor estável derivada do nome, então **clube sem escudo cadastrado e lado por-nome
(avulso/competitivo por nome) continuam identificáveis** — não existe estado "quadrado
vazio". O nome permanece no DOM em todos os breakpoints (a ocultação é CSS), o que
preserva busca do navegador, testes por texto e — sobretudo — o `sr-only` de resultado,
que já nomeia os dois lados.

`min-w-0` + `truncate` no nome (lição do projeto: filho flex não encolhe sem `min-w-0`).

### 2. Placar dominante

O placar deixa de competir de igual para igual com metadados: `font-display`,
`tabular-nums`, `text-base sm:text-sm` e `shrink-0`. É o único elemento com peso
tipográfico próprio na linha principal.

### 3. Disclosure nativo no histórico — e por que não estado React

`<details>`/`<summary>`:

- `MatchHistoryList` é RSC puro e **precisa continuar sendo**. Estado exigiria
  `"use client"` na lista inteira ou um wrapper client recebendo as ações como JSX —
  exatamente o padrão que já quebrou neste projeto (`fix-editar-placar-rsc`: `<Button>`
  client passado como prop para server component chegava com `isValidElement=false` e
  sumia silenciosamente). Não reintroduzir.
- Zero JS, estado nativo, acessível (o `<summary>` é o botão de disclosure e seu conteúdo
  é o nome acessível — aqui, o próprio `sr-only` do resultado).

Cuidados aplicados: nenhum `<button>`/link dentro do `<summary>` (controle interativo
aninhado quebra em vários navegadores — as ações ficam no corpo); marcador nativo removido
(`list-none` + `[&::-webkit-details-marker]:hidden`); alvo de toque `min-h-11`;
`cursor-pointer`; chevron girando com `group-open:rotate-180`.

### 4. Trade-off assumido: no histórico, as ações também recolhem no desktop

`<details>` não é responsivo — não há como mantê-lo aberto por breakpoint sem duplicar a
árvore (dois clusters de ação = dois modais montados por partida) ou recorrer a
`::details-content`, cujo suporte ainda é irregular. As alternativas com paridade de
desktop foram descartadas:

- **hack do checkbox + `peer`** (`hidden peer-checked:flex sm:flex`): daria disclosure só
  no mobile, mas anuncia como *checkbox*, não como disclosure — a11y pior, e contraria a
  diretriz de usar o elemento nativo.
- **duplicar o cluster** (um `sm:hidden`, outro `hidden sm:flex`): monta `ArtilheirosEncerrada`
  e `CompartilharResultadoButton` duas vezes por partida. Custo de bundle/estado
  desproporcional ao ganho.

Mitigação: os **metadados** que hoje ficam inline no desktop (data) continuam inline de
`sm:` para cima; só os três botões (eventuais, não diários) passam a exigir um toque. As
ações **diárias** — as de `OpenMatchesList` — não recolhem em nenhum breakpoint.

### 5. Densidade em `OpenMatchesList`: grid, não disclosure

`grid grid-cols-2 gap-2` no mobile (uma coluna quando há só uma ação), com "Editar placar"
e o indicador de proposta pendente em `col-span-2` — a ação primária ocupa a linha inteira
e o card cai de ~3 linhas de botão para ~2. De `sm:` para cima os wrappers viram
`display: contents` e o cluster volta a ser **exatamente** o `flex flex-wrap` de hoje: o
desktop não muda um pixel.

O seletor de descendente já existente (`[&_[data-slot=button]]:w-full`) continua atingindo
as folhas client sem editá-las. `max-sm:[&_[data-slot=button]]:min-h-11` garante 44px no
mobile mesmo nas folhas que nasceram com `min-h-9` (`ArtilheirosEncerrada`) sem inflar o
desktop.

### 6. Extração compartilhada

`PartidaIdentidade` só existe porque as duas listas passaram a repetir literalmente o mesmo
bloco (rodada + escudo + nome + slot central). Ele recebe o miolo central por `children`
(placar, ou badge de W.O.), e nada mais: pill de status, "(vaga aberta)" e gols contra
continuam nos respectivos consumidores — não é uma abstração de "card de partida".

## Riscos

| Risco | Mitigação |
|---|---|
| Regressão de conteúdo (nome/placar/W.O./`sr-only`) | Testes já existentes por texto + novos casos de W.O. duplo e `sr-only` |
| `<details>` esconder ação que o organizador usa direto | Só no histórico (ações eventuais); `OpenMatchesList` mantém tudo visível |
| Lista virar client component por descuido | Guard de regressão já existente em `MatchListsRodada.test.tsx` (estendido para `MatchHistoryList` e `PartidaIdentidade`) |
| jsdom não esconder o corpo do `<details>` | O teste do estado recolhido assere pelo atributo `open` do elemento e pela relação summary→corpo, não por visibilidade computada |
