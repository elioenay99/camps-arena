## Contexto

`MatchScoreModal` é client component. O Dialog (`dialog.tsx`) já tem `DialogContent`
`max-w-[calc(100%-2rem)]` + `max-h-[calc(100dvh-2rem)]` flex-col, `DialogBody` como único
scroll e `DialogFooter` fixo — scaffold correto, NÃO se mexe. `TeamCrest` faz `next/image`
com fallback de iniciais. Mapeamento dos lados em `MatchCard.tsx`:
- **`ladoVaga`** (competitivo, l.92-104): `nome = clube.nome`, `avatarUrl = clube.escudo_url`,
  `clube = { nome, escudoUrl }` — escudo e nome DUPLICADOS entre `Avatar` e `TeamCrest`.
- **`ladoAvulso`** (l.55-64): `nome = a PESSOA`, `avatarUrl = foto da pessoa`, `clube =
  clube COSMÉTICO nullable` (pode existir, escolhido via `onSelecionarClube`). No avulso a
  identidade primária é a PESSOA (foto+nome); o clube é secundário/cosmético.

`ParticipantePartida` (l.25-58) NÃO tem hoje um discriminador competitivo/avulso.

## Decisão 1 — `IdentidadeLado` ramifica por discriminador explícito (não por `clube`)

Adicionar um campo zero-DDL `ehCompetitivo: boolean` a `ParticipantePartida`, setado no
mapeamento (`ladoVaga`→true, `ladoAvulso`→false, em `MatchCard.tsx`). `IdentidadeLado`
ramifica POR ELE (nunca por `clube` truthiness, que quebraria o avulso-com-clube):
- **`ehCompetitivo`**: um `<TeamCrest nome={clube?.nome ?? participante.nome}
  escudoUrl={clube?.escudoUrl} size=40 />` (escudo do clube, fallback iniciais).
- **avulso**: a FOTO da pessoa (`Avatar` interno ~40px, object-cover) com fallback de
  iniciais — preserva a identidade primária da pessoa.
Em ambos: nome UMA vez (`truncate min-w-0`) + `detalhe` (téc.). Remove o `Avatar` de 64px
do topo e o segundo bloco duplicado. O clube COSMÉTICO do avulso NÃO some: ele reaparece
na seção de seleção de clube abaixo do scoreboard (Decisão 3), junto do `TeamSearchInput`.
Testes DEVEM cobrir avulso-com-clube (foto+nome da pessoa na coluna; clube na seção de baixo).

## Decisão 2 — Scoreboard 2-up que REALMENTE cabe (budget real)

Largura real da coluna: `DialogContent` ~358px @390 → `p-4` (dialog) → ~326 → card
`p-4`+border (`MatchScoreModal.tsx:691`) → ~292 úteis → menos gaps e "×" central →
**~130px/coluna @390px, ~116px @360px, ~142px @412px**. Portanto:
- Grid `grid grid-cols-[1fr_auto_1fr] items-start gap-1`; **`min-w-0` nas duas trilhas
  1fr** (senão o conteúdo não encolhe e estoura); `gap-1` (não `gap-6`).
- Cada coluna `flex flex-col items-center gap-2 min-w-0`.
- "×" central `self-center text-muted-foreground`.
- O Stepper é compactado no 2-up (Decisão 5) para caber em ~116px.
Validação visual OBRIGATÓRIA a **360 / 390 / 412px** sem scroll horizontal no card.

## Decisão 3 — "Chamar" e seleção de clube FORA das colunas

Abaixo do scoreboard, largura total: o botão "Chamar {adversário}" (só do lado
convocável, `wa`/`nomeConvocacao`) e, no avulso, o `TeamSearchInput` + o clube cosmético
atual (quando `onSelecionarClube`). Assim as colunas de placar ficam simétricas e curtas,
e o clube do avulso continua visível (só sai da coluna).

## Decisão 4 — Autores dos gols recolhidos, mas ABERTOS quando há preload

"Autores dos gols (opcional)" (os dois `AutoresLado`) vão para um `<details>` com
`<summary>` "Autores dos gols (opcional)" (o texto EXATO em nó próprio, para
`MatchScoreModal.test.tsx:254/261` continuar casando; chevron/"+" como ícone `aria-hidden`
à parte) estilizado como botão, toque ≥44px. **Abertura CONTROLADA por estado** (NÃO
`open={cond}` cru — isso re-afirmaria `open=true` a cada re-render do modal, ex.: ao mexer
no Stepper, e o `<details>` reabriria sozinho): `const [autoresAbertos, setAutoresAbertos]
= useState(() => temPreload)` + `<details open={autoresAbertos} onToggle={(e) =>
setAutoresAbertos(e.currentTarget.open)}>`, ressincronizando `temPreload` no
`handleOpenChange` (junto de `setAutores1/2`). `temPreload` = o preload editável
(`autoresIniciais`→`preloadDoLado`, `MatchScoreModal.tsx:544-567`) traz linhas não vazias
— senão o organizador (superfície REPLACE) não veria os autores já gravados. O estado
React (`autores1`/`autores2` no pai, l.503-504) PERSISTE — o `<details>` só oculta via
CSS, não desmonta `AutoresLado`. A foto de evidência (modo proposta) fica FORA do `<details>`.

## Decisão 5 — Stepper compacto no 2-up (cede o 44px para caber)

O Stepper principal tem footprint mínimo hoje de ~152px (`size-11` seria pior; `min-w-12`
= 48px no número, `MatchScoreModal.tsx:208-250`) — maior que a coluna. Para caber 2-up:
botões `size-10` (40px — MANTÉM o toque atual, não sobe para 44px: o 44px conflita com o
2-up que o dono priorizou), número **SEM min-width fixo** (`tabular-nums`, remover
`min-w-12`; no máximo `min-w-6`=24px — NÃO `min-w-8`, que estoura) e fonte
`text-4xl`→`text-2xl sm:text-3xl`, `gap-1`. Conta real (min-content) = `40 + gap(4) +
número + gap(4) + 40 = 88 + número`: 1 dígito ~102px, 2 dígitos ~115px — cabe nos ~116px
@360. `PLACAR_MAX=999` permite 3 dígitos → a validação visual a 360px COM placar de 2
dígitos (10×10) é o gate desse limite. Os steppers do `AutoresLado` (empilhados, largura
total) permanecem como estão.

## Decisão 6 — Safe-area no rodapé (defensivo; hoje um piso de 1rem)

Adicionar `pb-[max(1rem,env(safe-area-inset-bottom))]` ao rodapé do modal. Como o app NÃO
declara `viewport-fit: cover`, `env(safe-area-inset-bottom)` resolve para 0 e isso é
efetivamente `pb-4` HOJE (a reserva de safe-area vem do próprio navegador) — é um seguro
para o dia em que se adotar `viewport-fit: cover`, não uma proteção ativa agora. NÃO ligar
`viewport-fit: cover` (fora de escopo).

## Decisão 7 — Top 10 + expandir (`RankingExpansivel` renderiza o `<ol>`)

Os rankings usam `<ol>` (`ArtilhariaRanking.tsx:36`, `MuralhaRanking.tsx:33`) — e um
`<button>` NÃO pode ser filho de `<ol>`. Então o client leaf `RankingExpansivel({
children })` (`src/features/league/components/`) RENDERIZA ele mesmo o `<ol>` (com `id`
para `aria-controls` e as classes `list-none flex flex-col gap-2 p-0`) a partir dos `<li>`
recebidos como children: `const itens = React.Children.toArray(children)`; mostra
`itens.slice(0, 10)` e, se `itens.length > 10`, um `<button aria-expanded aria-controls
min-h-11>` "Ver mais (N) / Ver menos" como IRMÃO do `<ol>` (fora dele) que alterna a lista
completa. `ArtilhariaRanking`/`MuralhaRanking` passam só os `<li>` como children (deixam de
renderizar o próprio `<ol>`). Total derivado de `React.Children.count` (sem prop `total`).

## Riscos

- **Overflow horizontal**: mitigado por `min-w-0` + Stepper compacto + validação
  360/390/412px.
- **Regressão de identidade no avulso**: mitigada pelo discriminador `ehCompetitivo` + teste
  de avulso-com-clube.
- **Regressão do fluxo de placar**: preservar 100% (steppers com updater funcional, autores
  no pai, foto fora do `<details>`, modos, Chamar, seleção de clube, `placarInicial`). Os
  testes existentes do modal (`MatchScoreModal.test.tsx`, `MatchListsRodada.test.tsx`) verdes.
