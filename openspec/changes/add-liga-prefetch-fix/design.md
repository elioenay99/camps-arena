## Contexto

- Link que estoura: `src/features/standings/components/StandingsTable.tsx:220-229`
  (ramo `hrefCompetidorBase ?`). É o ÚNICO link de competidor da tabela.
- Quem passa `hrefCompetidorBase`: SÓ a pirâmide
  (`src/app/dashboard/ligas/[id]/page.tsx:533`, `hrefCompetidorBase="/dashboard/ligas/competidor"`),
  via `DivisaoCard` → `StandingsTable`. Uma tabela por divisão × ~20 linhas = ~40 links.
- Alvo do prefetch: `src/app/dashboard/ligas/competidor/[id]/page.tsx` →
  `getCompetitorProfile(id)` (fetch caro no caminho de render).

## 1. Por que `prefetch={false}` (leitura do doc do Next 16 INSTALADO)

Doc instalado, App Router:
`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`.

Mecânica da rajada (`link.md:298`, seção `<AppOnly>`):

> "Prefetching happens when a `<Link />` component enters the user's viewport
> (initially or through scroll). Next.js prefetches and loads the linked route
> (denoted by the `href`) and its data in the background... **Prefetching is only
> enabled in production**."

Valores possíveis da prop `prefetch` no App Router (`link.md:300-304`):

> - **`"auto"` ou `null` (default)**: prefetch depende de rota estática/dinâmica;
>   para rota dinâmica, prefetcha a rota parcial até o `loading.js` mais próximo.
> - `true`: prefetcha a rota inteira.
> - `false`: "**Prefetching will never happen both on entering the viewport and on
>   hover.**" (`link.md:304`)

Decisão: **`prefetch={false}`**. É o único valor que elimina o prefetch-no-viewport
(a rajada de ~40 renders de `getCompetitorProfile`). O default (`auto`/`null`) e `true`
mantêm o prefetch no viewport — não resolvem. A navegação por clique é preservada:
prefetch é só uma otimização de pré-carga; ao clicar, o Next busca a rota-alvo na hora
(comportamento de qualquer `<a>`/`<Link>` sem prefetch).

Tabela de versão do doc (`link.md:1372`) confirma que `"auto"` foi introduzido no
`v15.4.0` como alias do default; o app roda Next `16.2.6` (`node_modules/next/package.json`).

## 2. Custo aceito: some o prefetch-on-hover (App Router ≠ Pages Router)

No **Pages Router**, `false` significa "não prefetcha no viewport, MAS ainda prefetcha
no hover" (`link.md:339`). No **App Router** (que é o nosso — `src/app/`), `false`
desliga OS DOIS (`link.md:304`). Ou seja: não existe, no App Router, um valor de prop
que dê "sem viewport, mas com hover 1-a-1". As opções são só `auto`/`true`/`false`.

Isso é aceitável:
- O objetivo é matar a RAJADA síncrona de ~40 prefetches. `false` mata.
- Perder o hover-prefetch de UM link custa, no pior caso, um render a mais no clique —
  exatamente o que queremos (1 render sob demanda, não 40 de uma vez).
- A alternativa para preservar hover-only seria um wrapper client com
  `onMouseEnter` + `router.prefetch()` — infra nova e client-component numa folha hoje
  RSC-friendly, desproporcional a um fix de uma prop. Fica como não-objetivo.

## 3. Por que o "bônus 429 + Retry-After" fica FORA

O pedido original cogitava responder 429 com `Retry-After` quando a rajada estoura.
Isso exigiria infra de rate-limit NOVA: não há `src/middleware.ts` nem limiter no repo
(`rg`/inspeção). Construir um limiter especulativo para uma rajada que este fix ELIMINA
na origem seria over-engineering — o prefetch desligado já satisfaz todos os critérios
de aceite (sem rajada, navegação intacta). Documentado como follow-up opcional na
proposal; NÃO implementado aqui. Otimizar o N+1 interno de `getCompetitorProfile` é
outra frente independente.

## 4. Teste

`next/link` NÃO reflete a prop `prefetch` como atributo do DOM (é prop interna do Next),
então uma asserção via DOM real do `<a>` não a expõe. Solução idiomática e NÃO frágil:
`vi.mock("next/link")` capturando a prop `prefetch` num `data-prefetch`, e asserção de
que o link de competidor renderiza com `data-prefetch="false"`. O mock não interfere nas
smoke tests existentes (elas renderizam sem `hrefCompetidorBase`, logo sem link). Cobre
também o caminho avulso (sem `hrefCompetidorBase` → nome em texto, sem `<a>`).
