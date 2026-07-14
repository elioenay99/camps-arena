## Why

O modal "LANÇAR PLACAR" (`MatchScoreModal`) NÃO é responsivo no mobile/PWA (~390px,
onde está o uso majoritário): a UI fica "toda cagada" e exige muito scroll. O scaffold
do Dialog está correto (altura em `dvh`, corpo rolável, rodapé fixo — não se mexe nele);
a causa é **altura de conteúdo excessiva**, diagnosticada por um workflow de 5 lentes:

1. **Identidade duplicada por lado** — cada lado renderiza escudo+nome DUAS vezes: um
   `Avatar` de 64px + nome + técnico e, logo abaixo, um `TeamCrest` menor + o MESMO nome
   (no competitivo `participante.avatarUrl == clube.escudoUrl` e `nome == clube.nome`).
2. **Lados empilhados verticalmente no mobile** — `grid grid-cols-1 sm:grid-cols-2` só
   vira 2 colunas em ≥640px; num PWA de 390px um lado fica inteiro sobre o outro,
   dobrando a altura. Um placar é conceitualmente 2 colunas ("A × B").
3. **Elementos inflam a altura** — avatar 64px, gaps largos, botão "Chamar" e a busca de
   clube DENTRO da coluna (desalinham os lados), "Autores dos gols" sempre expandido, e o
   Stepper com toque de 40px (abaixo do padrão 44px do próprio app).

Além disso, os rankings de **Artilheiros** e **Muralha** renderizam TODAS as linhas sem
teto — em ligas grandes viram listas enormes.

**Decisões de produto (travadas pelo dono):**
1. **Placar lado a lado** (formato "A × B") já no mobile, colunas compactas.
2. **"Autores dos gols (opcional)" recolhido** por padrão (abre ao tocar).

É **ZERO-DDL** — só UI.

## What Changes

- **Scoreboard lado a lado** em `MatchScoreModal`: substituir o `grid grid-cols-1
  sm:grid-cols-2` por um layout de placar de 2 colunas JÁ na base (`grid-cols-[1fr_auto_1fr]`
  com um "×" central), cada coluna compacta: UMA identidade (escudo ~40px + nome
  truncado + "téc. X") + Stepper embaixo. Corta ~metade da altura.
- **Uma identidade por lado** (novo helper interno `IdentidadeLado`): um único
  escudo/foto ~40px, ramificando por um discriminador explícito `ehCompetitivo` (novo
  campo, zero-DDL) — NÃO por `clube` (o avulso pode ter clube cosmético): competitivo →
  `TeamCrest` (escudo do clube, fallback de iniciais); avulso → `Avatar` (foto DA PESSOA);
  iniciais quando não há — + nome (uma vez) + `detalhe` (técnico). Remove o `Avatar` de
  64px e o bloco duplicado. No avulso, o clube cosmético não some — reaparece na seção de
  seleção de clube abaixo do scoreboard.
- **Busca de clube e "Chamar" saem da coluna:** o `TeamSearchInput` (só existe no avulso,
  quando `onSelecionarClube`) e o botão "Chamar {adversário}" passam para uma linha
  própria de largura total ABAIXO do scoreboard — assim as duas colunas ficam simétricas
  e curtas.
- **Autores dos gols recolhidos:** a seção "Autores dos gols (opcional)" (os dois
  `AutoresLado`) vai para dentro de um `<details>` nativo, fechado por padrão no caso
  comum, mas ABERTO quando há preload editável de autores (superfícies REPLACE do
  organizador — senão ele não veria os autores já gravados). O estado dos autores
  persiste; só a visibilidade é toggle. Zero lib nova.
- **Stepper compacto (2-up):** o Stepper principal do placar é compactado para caber lado
  a lado — botões mantêm 40px (`size-10`), número perde a largura fixa (`min-w-12`), fonte
  menor no mobile — sem subir para 44px, que não caberia num placar de 2 colunas a 360px.
- **Safe-area do PWA (defensivo):** o app usa `statusBarStyle: "black-translucent"`;
  adicionar `pb-[max(1rem,env(safe-area-inset-bottom))]` ao rodapé do modal para o
  "Salvar/Fechar" nunca cair sob a barra de gestos. NÃO ligar `viewport-fit: cover`
  (mudaria o comportamento de pintura sob as barras — fora de escopo).
- **Top 10 + expandir nos rankings:** wrapper client mínimo `RankingExpansivel`
  ("use client") que recebe os itens já renderizados pelo RSC como `children`, mostra os
  10 primeiros e revela o restante com um `<button aria-expanded aria-controls>` "Ver
  mais (N) / Ver menos" (toque 44px). Aplicado em `ArtilhariaRanking` e `MuralhaRanking`;
  os fetchers/RSC não mudam.

## Capabilities

### Modified Capabilities
- `match-score-modal`: layout de placar lado a lado responsivo no mobile/PWA, uma
  identidade por lado (sem duplicação), autores recolhidos, stepper compacto (40px) e
  padding de safe-area no rodapé.
- `goal-scorers`: ranking de artilharia limitado a top 10 com "ver mais".
- `clean-sheets`: ranking de defesas (Muralha) limitado a top 10 com "ver mais".

## Impact

- **Banco de dados:** NENHUM. Zero DDL — só UI.
- **Código:** refatoração do render de `MatchScoreModal` (scoreboard 2-up, `IdentidadeLado`,
  `<details>` dos autores, stepper compacto (40px), "Chamar"/busca fora da coluna); `pb` de safe-area
  no rodapé; novo `RankingExpansivel` + fiação em `ArtilhariaRanking`/`MuralhaRanking`.
- **Segurança:** nenhuma mudança (UI). O `MatchScoreModal` já é client component — sem
  fronteira RSC nova; o `RankingExpansivel` recebe children serializáveis de RSC.
- **Risco:** o modal de placar é peça crítica (fluxo principal + bug recente `e559a9f`).
  Preservar TODA a lógica (steppers, autores por lado, foto de evidência, modos
  direto/proposta, "Chamar", seleção de clube); a mudança é de LAYOUT, não de comportamento.
- **Testes:** Vitest do `MatchScoreModal` (identidade única por lado — sem nome
  duplicado; scoreboard 2 colunas; autores dentro do `<details>`; a lógica de salvar/
  autores/foto intacta), `RankingExpansivel` (mostra 10, expande para todos, aria), e os
  testes existentes do modal continuam verdes.
