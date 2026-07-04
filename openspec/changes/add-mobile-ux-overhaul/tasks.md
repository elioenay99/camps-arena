## 0. Baseline

- [x] 0.1 Capturar baseline do HEAD antes de tocar código: `pnpm typecheck`,
  `pnpm lint`, `pnpm test`, `pnpm build` — anotar qualquer falha pré-existente
  (verde final = "igual ao baseline").

## 1. Abas do torneio (sem rolagem no mobile)

- [x] 1.1 `src/components/ui/tabs.tsx:34` (`TabsList`): trocar
  `flex items-stretch gap-1 overflow-x-auto ...` por segmented no mobile +
  flex no desktop: `-mb-px grid auto-cols-fr grid-flow-col gap-1 border-b
  border-border sm:flex sm:items-stretch sm:overflow-x-auto
  sm:[scrollbar-width:none] sm:[&::-webkit-scrollbar]:hidden`.
- [x] 1.2 `tabs.tsx:53` (`TabsTrigger`): adicionar `justify-center px-1
  sm:justify-start sm:px-3` e trocar `shrink-0` por `sm:shrink-0`; manter
  `min-h-11` e `gap-2`. (Manter o `group` existente — não conflita com
  `group/standings`.)
- [x] 1.3 `src/features/tournament/components/TournamentTabs.tsx`: adicionar
  `labelCurto?: string` ao tipo `AbaTorneio`. No trigger, aplicar
  `className="flex-col gap-1 sm:flex-row sm:gap-2"` e reestruturar o miolo para
  NÃO cair em 3 linhas no mobile: envolver ícone + badge numa linha
  (`<span className="flex items-center gap-1">{icone}{badge}</span>`), depois o
  rótulo. Rótulo = DOIS nós: `<span aria-hidden="true" className="text-[11px]
  leading-none font-medium sm:hidden">{a.labelCurto ?? a.label}</span>` (curto,
  só mobile) + `<span className="sr-only sm:not-sr-only">{a.label}</span>` (nome
  acessível SEMPRE; visível no desktop). **NUNCA** `hidden` no rótulo completo.
- [x] 1.4 `src/app/dashboard/torneios/[id]/page.tsx:623-659`: preencher
  `labelCurto` — Classificação→"Class.", Partidas→"Part.", Rodadas→"Rod.",
  Vagas→"Vagas" (Participantes→"Times").

## 2. Classificação — dois modos (Rolar / Caber tudo)

- [x] 2.1 NOVO `src/features/standings/components/ClassificacaoResponsiva.tsx`
  (`"use client"`): recebe `children` (conteúdo RSC). Estado
  `useState<'rolar'|'caber'>('rolar')` (inicial determinístico p/ SSR — evita
  mismatch). `useEffect` pós-hidratação: ler `localStorage['goliseu:standings-modo']`;
  se ausente, default por viewport com **guard defensivo p/ jsdom**:
  `const mql = typeof window !== 'undefined' && typeof window.matchMedia ===
  'function' ? window.matchMedia('(max-width: 640px)') : null` → `'caber'` quando
  `mql?.matches`. Registrar listener `storage` p/ sincronizar. `setModo` dentro do
  effect leva `// eslint-disable-next-line react-hooks/set-state-in-effect`
  (mesmo padrão de `TournamentTabs.tsx:41`). `onChange` grava no localStorage.
  Render: segmented (dois botões `aria-pressed`, "Rolar" | "Caber tudo",
  `ml-auto`) + `<div className="group/standings flex flex-col gap-6"
  data-modo={modo}>{children}</div>`.
- [x] 2.2 `StandingsTable.tsx` — reagir ao ancestral SEM virar client:
  - `:102` `<table>`: `+ group-data-[modo=caber]/standings:min-w-0
    group-data-[modo=caber]/standings:text-xs`.
  - stats `<th>`/`<td>` (`:118`, `:181`, `:232-241`) **e a coluna `Pro`/promédio
    (`:201`)**: `+ group-data-[modo=caber]/standings:px-1`.
  - nome — no modo caber deixar **QUEBRAR** (não truncar): truncate em
    `table-layout:auto` não reticencia nem cede largura, e o ramo de texto cru
    (`:228`) é uma string nua (sem elemento p/ className). Solução: `<td>` (`:205`)
    `+ min-w-0`; `<span>` flex (`:206`) mantém `whitespace-nowrap` base e ganha
    `min-w-0 group-data-[modo=caber]/standings:whitespace-normal`. **NÃO** usar
    truncate; **NÃO** tocar no `<Link>` (`:220`) nem no texto cru (`:228`). Como o
    `min-w-0` no `<table>` remove o `min-w-[34rem]`, a tabela vira `w-full` =
    largura do container; o nome (agora quebrável) absorve o excesso e quebra em 2
    linhas, e as 8 stats cabem (altura de linha variável é aceitável).
  - Sem `data-modo` no ancestral = comportamento atual intacto.
- [x] 2.3 `page.tsx` (torneio): decidir **no servidor** se há ao menos uma
  `StandingsTable` no `classificacaoContent` (grupos, ou classificação geral de
  torneio não-mata-mata, ou clubes). Só nesse caso envolver o conteúdo em
  `<ClassificacaoResponsiva>`; mata-mata puro (só `<BracketView>`) e estados
  vazios/aguardando renderizam CRU (sem o segmented por cima de bracket/mensagem).
  Importar o componente.
- [x] 2.4 `StandingsTableSkeleton.tsx`: manter o default `rolar` (loading.tsx não
  tem o wrapper). Sem mudança obrigatória; confirmar que segue casando.
- [x] 2.5 **Estender a COPAS**: `src/app/dashboard/copas/edicao/[id]/page.tsx`
  (grupos, ~`:142`, mesmo shape do torneio) — envolver a classificação de grupos
  em `<ClassificacaoResponsiva>` (mesma decisão condicional: só se houver tabela).
- [x] 2.6 **Estender às LIGAS**: `src/app/dashboard/ligas/[id]/page.tsx`
  (divisões, ~`:514`) — envolver a área de classificação das divisões em um
  `<ClassificacaoResponsiva>` (um toggle controla todas as divisões). Como as
  divisões têm a coluna `Pro` (promédio), confirmar que 2.2 já a compacta.

## 3. Clusters de botão (partidas + vagas) — padrão único

- [x] 3.1 `OpenMatchesList.tsx:112-114` (`<li>`): `flex flex-wrap items-center
  justify-between gap-4` → `flex flex-col items-stretch gap-3 sm:flex-row
  sm:flex-wrap sm:items-center sm:justify-between sm:gap-4`.
- [x] 3.2 `OpenMatchesList.tsx`: **MOVER** (não duplicar) a pill de status
  (`:142-147`) para a linha de info (junto ao span `:116`). NÃO alterar textos/
  spans `sr-only` que os testes casam por `getByText` (MatchListsRodada).
- [x] 3.3 `OpenMatchesList.tsx:141` (span de ações): PADRÃO ÚNICO — `flex w-full
  flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6
  sm:gap-y-3 [&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto`
  (remove `shrink-0` e o `gap-x-6`-no-mobile). Considerar extrair essa string p/
  uma const compartilhada reusada em 3.6/3.7/5.5.
- [x] 3.4 `WoButtons.tsx:70` (painel expandido do `MarcarWoButton`): gap interno
  no mobile `gap-x-6`→`gap-2 sm:gap-x-6`.
- [x] 3.5 `VagasSection.tsx:122` (URL do convite): `truncate` → `break-all`
  (manter `min-w-0`).
- [x] 3.6 `VagasSection.tsx:128` (linha de ações): mesmo PADRÃO ÚNICO do 3.3.
- [x] 3.7 `VagasSection.tsx:82`/`:111-113` (Desistir): tirar do `justify-between`
  e pôr em linha própria abaixo, full-width no mobile via
  `[&_[data-slot=button]]:w-full sm:[&_[data-slot=button]]:w-auto`.

## 4. Dialog rolável (conserta todos os modais) — ALTO

- [x] 4.1 `src/components/ui/dialog.tsx` — **NÃO** usar `grid-rows` rígido de 3
  trilhas (regride modais de 2 filhos). Abordagem por slot:
  - `DialogContent` (`:63-66`): trocar `grid ... gap-4` por
    `flex max-h-[calc(100dvh-2rem)] flex-col gap-4` (mantém `p-4`, centering e
    `sm:max-w-sm`). `dvh`, não `vh`.
  - Adicionar e EXPORTAR `DialogBody`: `<div data-slot="dialog-body"
    className={cn("-mx-4 min-h-0 flex-1 overflow-y-auto px-4", className)} />`
    (o `-mx-4 px-4` preserva o padding lateral enquanto o scroll ocupa a largura).
    É o ÚNICO elemento rolável; header e footer ficam FORA dele (irmãos `shrink-0`).
  - Botão de fechar (`:70-82`): `size-11 md:size-8` no `className` (44px no mobile;
    hoje `icon-sm`=28px não atende). Fica `absolute` no `DialogContent` (fora do
    scroll do body), sempre visível.
- [x] 4.2 Migrar os consumidores ALTOS ao `DialogBody` (só quem tem miolo alto):
  - `MatchScoreModal.tsx` (~`:354-453`, modo proposta): envolver o MIOLO (card do
    placar + bloco da foto) em `<DialogBody>`; `DialogHeader` e `DialogFooter`
    ficam irmãos fora. Assim o footer/enviar nunca somem (inclusive com teclado).
  - `PhoneField.tsx` (~`:167-209`): envolver Input + `<ul>` da lista de países em
    `<DialogBody>` (a `<ul>` pode manter seu próprio scroll interno).
  - `RemoveMemberButton.tsx` e `CupActions.tsx` (header+footer, curtos): **NÃO**
    precisam de `DialogBody`; só confirmar que `flex-col gap-4` não regride o
    espaçamento (equivalente ao `grid gap-4` anterior) e o footer segue colado
    embaixo pelo `-mb-4`.
- [x] 4.3 `MatchScoreModal.tsx:381` (steppers): `grid grid-cols-2 gap-4` →
  `grid grid-cols-1 gap-6 sm:grid-cols-2` (empilha os lados em 360-390px).

## 5. Alvos de toque ≥ 44px no mobile (na fonte)

- [x] 5.1 `src/components/ui/input.tsx:11`: `h-8` → `h-11 md:h-8`.
- [x] 5.2 `src/components/ui/button.tsx:25` (size **default**): `h-8` → `h-11
  md:h-8` (manter `shrink-0 whitespace-nowrap`). Conferir que `sm`/`lg`/`icon`/
  `icon-sm` não regridem. (Nota: `size="sm"` segue ~40px — aceitável; documentar.)
- [x] 5.3 `NavLinks.tsx:33` (pill): `min-height` é INERTE em `<a>` inline —
  adicionar `inline-flex items-center min-h-11` (o py vira redundante p/ altura).
- [x] 5.4 `src/app/dashboard/layout.tsx:65` (link do avatar): alvo `flex size-11
  items-center justify-center` (avatar 32px visual dentro).
- [x] 5.5 `AvatarUpload.tsx:107` (cluster Trocar/Enviar/Cancelar): aplicar o
  PADRÃO ÚNICO de cluster (const do 3.3) — full-width empilhado no mobile, inline
  no desktop; subir `size="sm"`→default.
- [x] 5.6 `PhoneField.tsx`: trigger (`:153`) `h-11 md:h-8`; linhas da lista
  (`:186`) `min-h-11`.
- [x] 5.7 (coberto em 4.1) fechar do dialog `size-11 md:size-8`.

## 6. Nav hambúrguer no mobile

- [x] 6.1 `NavLinks.tsx` (já client): implementar um **disclosure leve** (NÃO
  `role=menu`) preservando os landmarks `<nav>`/`<ul>`/`<Link aria-current>`.
  Adicionar `useState(false)` de aberto. Antes da `<ul>`, um botão `☰`
  (`sm:hidden`, alvo `size-11`, `aria-label`, `aria-expanded={aberto}`,
  `aria-controls="nav-secoes"`). Dar `id="nav-secoes"` à `<ul>`; visibilidade por
  CSS (NÃO desmontar — mantém os links no DOM p/ testes): `className` da `<ul>` =
  `${aberto ? "flex" : "hidden"} sm:flex flex-col sm:flex-row sm:flex-wrap ...`.
- [x] 6.2 a11y do disclosure: fechar ao navegar (`useEffect` em `pathname`),
  por `Esc` e ao tocar fora; foco no 1º link ao abrir e retorno do foco ao toggle
  ao fechar (refs). Links viram `inline-flex items-center min-h-11` (do 5.3).
  Toggle de tema, avatar e "Sair" seguem no cabeçalho (fora deste componente).

## 7. Bracket mobile — Camada 1 (CSS-only, mantém RSC)

- [x] 7.1 `BracketView.tsx`: card `w-56`→`w-44 sm:w-56` em `ConfrontoCard`
  (`:89`) e `ConfrontoFuturo` (`:140`) — extrair p/ uma constante única.
- [x] 7.2 `BracketView.tsx:202`: gap `gap-6`→`gap-3 sm:gap-6`.
- [x] 7.3 `BracketView.tsx:201` (`overflow-x-auto`): `+ snap-x snap-proximity
  scroll-px-4`; cada `<section>` de fase (`:209`) `+ snap-start`.
- [x] 7.4 `BracketView.tsx`: wrapper `relative` no scroller + gradientes de
  affordance (`pointer-events-none absolute inset-y-0 {right|left}-0 w-6
  bg-gradient-to-{l|r} from-background`).

## 8. break-words + rede de segurança

- [x] 8.1 `BracketView.tsx:197` (span "Campeão: {nome}"): `+ min-w-0 break-words`.
- [x] 8.2 `convite/[codigo]/convite-ui.tsx:67-70`: `break-words` no nome do clube
  e no subtítulo do torneio.
- [x] 8.3 `convite/[codigo]/page.tsx:137`: `break-words` no título.
- [x] 8.4 `ligas/[id]/page.tsx:453` (h2 do `DivisaoCard`): `min-w-0` no h2 +
  `break-words` no nome (`:465`), espelhando o h1 (`:186`). Idem no resumo
  "sobe/cai" do `LeagueWizard` (~`:1618`).
- [x] 8.5 `FluxoTemporadaPanel.tsx:452` (semente): `truncate` → `break-all`.
- [x] 8.6 `globals.css` (@layer base, body ~`:158`): `+ overflow-x: clip`
  (rede de segurança; NÃO substitui os consertos por-elemento).

## 9. Testes

- [x] 9.1 NOVO `ClassificacaoResponsiva.test`: alterna `data-modo` rolar↔caber ao
  clicar; inicial `rolar`; `aria-pressed` correto. O guard de `matchMedia` (2.1)
  faz o teste rodar no jsdom sem stub; opcionalmente stubar `window.matchMedia`
  no setup do teste.
- [x] 9.2 `StandingsTable` (smoke): renderiza e o `<table>` contém as classes
  `group-data-[modo=caber]/standings:*`.
- [x] 9.3 **`page.test.tsx:498-499`** (torneio): o rótulo das abas passa a ter 2
  spans (curto + completo) → `getAllByRole('tab').textContent` viraria
  "Class.Classificação". EDITAR o teste p/ assertar por accessible name
  (`getByRole('tab',{name:/Classificação/})` por aba) em vez de `textContent`.
  (Corrigir a alegação anterior de "sem edição".)
- [x] 9.4 NOVO `NavLinks.test`: links presentes no DOM mesmo colapsado (visibilidade
  por CSS), `aria-expanded`/`aria-controls` do toggle, fecha ao navegar.
- [x] 9.5 Suíte existente VERDE: TournamentTabs (accessible names via `sr-only`),
  VagasSection (`getByText` da URL — `break-all` não muda textContent — e botões
  por role), MatchListsRodada, testes de dialog/button/input (conferir se algum
  casa a classe `h-8` literal — se sim, ajustar p/ `h-11 md:h-8`).

## 10. Qualidade e validação

- [x] 10.1 Gate mecânico: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  — verde (ou igual ao baseline 0.1).
- [x] 10.2 `grep` de sanidade: `[&_[data-slot=button]]:w-full` em OpenMatchesList,
  VagasSection E AvatarUpload; `sr-only` no rótulo completo das abas; `DialogBody`
  em MatchScoreModal.
- [ ] 10.3 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 10.4 Validação visual ao vivo **390px E 360px** (conta ataiasclash@gmail.com
  / Teste123): torneio 4 abas + partidas (5 ações + W.O. expandido); classificação
  nos 2 modos (torneio, copa, liga); vagas; bracket 8/16; MatchScoreModal modo
  proposta (com "teclado"); RemoveMember/CupActions (não regrediram); cadastro
  (PhoneField + submit); aba Conta; nav hambúrguer (Esc/foco). (ORQUESTRADOR)
- [x] 10.5 `openspec validate add-mobile-ux-overhaul --strict` = valid.
