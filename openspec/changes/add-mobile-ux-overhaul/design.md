# Design — overhaul mobile/PWA

Todas as decisões preservam o RSC-first e a autorização por perfil. Nada de banco/
action/tipo muda. Referências `arquivo:linha` são do estado atual (HEAD).

## 1. Padrão ÚNICO de cluster de botão (partidas + vagas + downstream)

Problema: clusters com vários `<Button>` (que são `shrink-0 whitespace-nowrap`)
num `flex` sem empilhamento estouram a viewport e o último botão é cortado.

Padrão aplicado **no container** do cluster (nunca nas folhas client):

```
flex w-full flex-col gap-2
sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6 sm:gap-y-3
[&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto
```

Por que funciona sem editar as folhas: todo shadcn `Button` (inclusive `asChild`/
âncora) emite `data-slot="button"` (`button.tsx`). O seletor de descendente
`[&_[data-slot=button]]:w-full` pega todos os botões do cluster e os deixa
full-width empilhados no mobile; no `sm+` voltam à largura natural inline. O
seletor **não alcança** o conteúdo de um `Dialog` (portalado para fora do DOM do
container), então botões de modal ficam intactos. Espelha o padrão já aprovado do
`MatchCard` (footer `flex-col` + botões `w-full`).

## 2. Abas do torneio — segmented sem rolagem

`ui/tabs.tsx` é consumido SÓ por `TournamentTabs` (confirmado) — seguro editar a
base. `TabsList` (`:34`) troca `flex overflow-x-auto` por
`grid auto-cols-fr grid-flow-col` no mobile (N colunas iguais para 2–4 abas, sem
classe dinâmica) e restaura `sm:flex sm:overflow-x-auto` no desktop. `TabsTrigger`
(`:53`): `justify-center px-1 sm:justify-start sm:px-3`, `shrink-0`→`sm:shrink-0`,
`min-h-11` preservado.

`TournamentTabs.tsx:60`: o rótulo (hoje texto cru) vira dois nós —
`<span aria-hidden className="... sm:hidden">{labelCurto}</span>` (curto, visível
só no mobile) + `<span className="sr-only sm:not-sr-only">{label}</span>` (nome
acessível SEMPRE no a11y tree; visível no desktop). **Crucial**: usar `sr-only`,
nunca `hidden` — `hidden`=`display:none` removeria o nome acessível no mobile e
quebraria screen reader + testes que casam por accessible name. Adicionar
`labelCurto?: string` ao tipo `AbaTorneio` e preencher no array `abas`
(`page.tsx:623-659`): Classificação→"Class.", Partidas→"Part.", Rodadas→"Rod.",
Vagas/Participantes→"Vagas"/"Times". O badge de pendências fica sempre visível.

## 3. Classificação — dois modos via data-attribute (sem prop drilling)

`StandingsTable` continua **RSC pura**. Novo client fino
`ClassificacaoResponsiva` envolve o `classificacaoContent` inteiro
(`page.tsx:357`), renderiza o segmented "Rolar | Caber tudo" e um
`<div className="group/standings ..." data-modo={modo}>{children}</div>`. A tabela
reage por named-group variants `group-data-[modo=caber]/standings:*` (padrão já
usado em `card.tsx`) — um clique reconfigura grupos + geral + clubes juntos.

- Modo `rolar` (base, atual): `min-w-[34rem]`, `overflow-x-auto`,
  `whitespace-nowrap`, `text-sm`.
- Modo `caber`: `group-data-[modo=caber]/standings:min-w-0`,
  `...:text-xs`, `...:px-1` nas stats **e na coluna `Pro`/promédio**. O nome
  **quebra** em vez de truncar: `min-w-0` no `<td>` e no `<span>` flex (mantendo
  `whitespace-nowrap` base) + `group-data-[modo=caber]/standings:whitespace-normal`
  no `<span>`. Truncate em `table-layout:auto` não reticencia nem cede largura
  (e o ramo de texto cru é string nua, sem elemento p/ classe); já a quebra é
  confiável: com o `min-w-0` removendo o `min-w-[34rem]`, a tabela vira `w-full`
  (largura do container) e o nome quebrável absorve o excesso, cabendo as 8 stats.
  Mantém as 8 stats.
- Aplicado no torneio, **em copas (grupos, mesmo shape)** e **em ligas (divisões,
  um toggle p/ todas)**. **Sem** o wrapper (skeleton/loading e outros) = base
  `rolar` → zero regressão. A decisão de envolver é feita no **servidor** (só
  quando há ao menos uma `StandingsTable`; mata-mata puro/vazios ficam crus).
- Estado: `useState<'rolar'|'caber'>('rolar')` **determinístico no SSR**. Em
  `useEffect` (pós-hidratação, sem mismatch): ler `localStorage`
  (`goliseu:standings-modo`); se ausente, default por viewport
  (`matchMedia('(max-width: 640px)')` → `caber` no mobile). `onChange` grava no
  localStorage; listener de `storage` sincroniza instâncias/abas.
- `aria-pressed` nos dois botões do segmented.

## 4. Dialog rolável (conserta todos os modais)

**Não** usar `grid-rows-[auto_1fr_auto]` rígido: os consumidores têm de 2 a 4
filhos diretos (RemoveMemberButton/CupActions = header+footer; MatchScoreModal
proposta = header+card+foto+footer; PhoneField = header+input+lista), e um grid
de 3 trilhas fixas ou estica o footer dos modais curtos ou deixa o miolo dos
altos fora do scroll. Em vez disso, um **slot explícito**:

- `DialogContent` (`:63`): `grid ... gap-4` → `flex max-h-[calc(100dvh-2rem)]
  flex-col gap-4` (dvh, não vh; mantém `p-4`, centering, `sm:max-w-sm`). Para
  modais curtos (header+footer) isso é equivalente ao `grid gap-4` — sem regressão;
  o `-mb-4` do footer segue colando embaixo.
- Novo `DialogBody` exportado: `<div data-slot="dialog-body" className="-mx-4
  min-h-0 flex-1 overflow-y-auto px-4">` — o ÚNICO elemento rolável. Header e
  footer ficam irmãos FORA dele (`shrink-0` natural). Só os modais ALTOS
  (MatchScoreModal, PhoneField) envolvem o miolo nele; os curtos não precisam.
- Botão de fechar (`:70-82`): `absolute` no `DialogContent` (fora do scroll do
  body) → sempre visível; `size-11 md:size-8` (44px no mobile; `icon-sm`=28px não
  atendia). Assim nenhum modal alto (inclusive com teclado aberto) esconde os
  botões, e os modais curtos não regridem.

## 5. Alvos de toque ≥ 44px no mobile (na fonte)

`input.tsx:11` e `button.tsx:25` (size default) trocam `h-8` por `h-11 md:h-8`
(44px só no mobile, densidade desktop preservada). Downstream:
`NavLinks` pills `min-h-11 py-2`; link do avatar (`layout.tsx:65`) num alvo
`size-11` (avatar 32px visual dentro); `AvatarUpload:107` sobe `sm`→default e
`gap-2`→`gap-3`; `PhoneField` trigger (`:153`) `h-11 md:h-8` e linhas da lista
(`:186`) `min-h-11`; fechar do dialog (`:74`) `size="icon"`. Guarda `md:` evita
adensar o desktop.

## 6. Bracket mobile — Camada 1 (CSS-only, mantém RSC)

Decisão: manter o scroll horizontal (é o primitivo certo pra ler a progressão do
mata-mata) e torná-lo usável. Em `BracketView.tsx`:
- Card responsivo: `w-56`→`w-44 sm:w-56` (extrair p/ constante única em
  `ConfrontoCard:89` e `ConfrontoFuturo:140`).
- Gap: `gap-6`→`gap-3 sm:gap-6` (`:202`).
- Snap por fase: no `overflow-x-auto` (`:201`) `snap-x snap-proximity scroll-px-4`;
  cada `<section>` de fase (`:209`) `snap-start`.
- Affordance: envolver o scroller num `relative` e sobrepor gradientes
  `pointer-events-none absolute inset-y-0 {left|right}-0 w-6 bg-gradient-to-{r|l}
  from-background` revelando conteúdo além das bordas.

## 7. break-words + rede de segurança

`break-words`/`[overflow-wrap:anywhere]` no span/heading que interpola texto livre:
`BracketView:197` (Campeão, Trophy já `shrink-0`), `convite-ui.tsx:67-70`,
`convite/page.tsx:137`, `ligas/[id]/page.tsx:453` (h2 + `min-w-0`, espelhando o h1
da `:186`), `LeagueWizard ~1618`. `FluxoTemporadaPanel.tsx:452` `truncate`→
`break-all` (semente é pra ler/copiar). `globals.css` body `overflow-x: clip` como
guarda global (não substitui os consertos por-elemento).

## 8. Nav hambúrguer no mobile

Não há primitivo de menu em `ui/` — e não se deve trocar a semântica. `NavLinks`
(já client) vira um **disclosure leve** (NÃO `role=menu`), preservando os
landmarks `<nav>`/`<ul>`/`<Link aria-current="page">`: um botão `☰` (`sm:hidden`,
`aria-expanded`/`aria-controls="nav-secoes"`, alvo `size-11`) antes da `<ul>`;
a `<ul>` (`id="nav-secoes"`) alterna a visibilidade **por CSS** (`${aberto ?
"flex" : "hidden"} sm:flex ...`), NUNCA desmontando os links (mantém no DOM p/ os
testes e o a11y tree). No `sm+` fica inline (comportamento atual). a11y do
disclosure: fechar ao navegar (efeito em `pathname`), por `Esc` e ao tocar fora;
foco no 1º link ao abrir e retorno ao toggle ao fechar; links `inline-flex
items-center min-h-11`. Sem dependência nova. Toggle de tema, avatar e "Sair"
seguem no cabeçalho (fora do `NavLinks`).

## Riscos

- Nome acessível das abas: obrigatório `sr-only sm:not-sr-only` (não `hidden`).
- Seletor `[&_[data-slot=button]]:w-full` é amplo: confirmar que o painel expandido
  do `MarcarWoButton` também empilha bem (reduzir gap interno se preciso) e que
  NÃO alcança botões de modal (portalados → seguros).
- Hydration do toggle: ler localStorage/matchMedia só em `useEffect`; inicial
  determinístico `rolar`.
- Dialog grid-rows: o footer e o botão de fechar DEVEM ficar fora do `overflow-y`.
- `h-11 md:h-8` toca primitivos globais → rodar a suíte inteira + validação visual.
- Nav hambúrguer: garantir a11y do toggle e que não quebre os testes de nav
  existentes (nomes de link preservados).
