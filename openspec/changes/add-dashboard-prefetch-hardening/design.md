## Contexto

- **Diagnóstico (já feito, validação ao vivo + logs):** backend saudável (Supabase
  100% HTTP 200, DB rápido). Os 503 são a **borda da Vercel** descartando uma rajada de
  prefetches RSC concorrentes ANTES de invocar a função (edge concurrency/rate-limit,
  sem log de função). Logo: a cura é cortar a rajada de prefetch; o backend NÃO precisa
  de ação.
- **Convenção já no repo** (change `add-liga-prefetch-fix`, no `main`):
  `StandingsTable.tsx:221-227` — `<Link>` de competidor com `prefetch={false}` +
  comentário curto do porquê. Esta change replica exatamente esse padrão.
- **Duas fontes remanescentes da rajada:**
  1. `NavLinks` (header, presente em TODA página) prefetcha as ~6 rotas de seção.
  2. Índices/listas e links "Abrir …" prefetcham N rotas `[id]` caras no viewport.

## 1. Por que `prefetch={false}` (doc do Next 16 INSTALADO)

`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`, App Router:

- `link.md:298` — "Prefetching happens when a `<Link />` component enters the user's
  viewport ... Next.js prefetches and loads the linked route and its data in the
  background." (Só em produção.)
- `link.md:300-304` — valores da prop `prefetch`: `"auto"`/`null` (default, prefetcha
  até o `loading.js` mais próximo em rota dinâmica), `true` (rota inteira), e **`false`:
  "Prefetching will never happen both on entering the viewport and on hover."**

`prefetch={false}` é o único valor que elimina o prefetch-no-viewport (a rajada). O
default e `true` mantêm a rajada. Navegação por clique preservada (prefetch é só
pré-carga; ao clicar o Next busca a rota-alvo na hora). Next `16.2.6`
(`node_modules/next/package.json`).

## 2. Escopo cirúrgico — quais links SIM, quais NÃO

**SIM (12 links / 9 arquivos)** — critério: aparece em quantidade (lista/map) OU numa
tela de alto tráfego (a nav em toda página) E aponta para rota RSC cara (`[id]` de
torneio/liga/copa/competidor/edição):

| # | Arquivo | Link |
|---|---------|------|
| 1 | `src/features/nav/components/NavLinks.tsx` | `<Link>` do `links.map` (6 seções) — **maior alavanca** |
| 2 | `src/app/dashboard/ligas/[id]/page.tsx` | "Abrir torneio" |
| 3 | `src/app/dashboard/ligas/[id]/page.tsx` | "Abrir Apertura" |
| 4 | `src/app/dashboard/ligas/[id]/page.tsx` | "Abrir Clausura" |
| 5 | `src/features/league/components/PlayoffsPanel.tsx` | "Abrir chave" |
| 6 | `src/features/league/components/GrandeFinalPanel.tsx` | "Abrir grande final" |
| 7 | `src/app/dashboard/torneios/page.tsx` | card em `torneios.map` |
| 8 | `src/app/dashboard/explorar/page.tsx` | `CardVitrine` (lista mais longa) |
| 9 | `src/app/dashboard/ligas/page.tsx` | card em `piramides.map` |
| 10 | `src/app/dashboard/copas/page.tsx` | `CartaoCopa` |
| 11 | `src/app/dashboard/copas/[id]/page.tsx` | edição em `copa.edicoes.map` → `copas/edicao/[id]` (bracket + classificação) |
| 12 | `src/features/match/components/MatchCard.tsx` | título do torneio (link secundário) |

Nos casos `<Button asChild><Link>…</Link></Button>` (2, 3, 4, 5, 6), a prop vai no
`<Link>` INTERNO — o `<Button asChild>` só clona o filho, e é o `<Link>` que dispara o
prefetch.

**NÃO** (prefetch é boa UX, sem rajada):
- Botões "Nova/Criar/Novo" → rotas de FORMULÁRIO leves (1 por página, sem N+1).
- A marca (`layout.tsx:46`) e o avatar (`layout.tsx:57`) → 1 link cada, rota leve.
- `CompetidorHero.tsx`, links já DENTRO de páginas `[id]` de detalhe
  (`competidor/[id]`, `torneios/[id]`) → contexto de detalhe, não de lista.
- `StandingsTable.tsx:221` → JÁ resolvido pela change anterior; NÃO mexer.

## 3. Custo aceito: some o prefetch-on-hover (App Router)

No App Router, `false` desliga viewport E hover (`link.md:304`) — não existe valor
"sem viewport, com hover 1-a-1" (só `auto`/`true`/`false`). Aceitável: o objetivo é
matar a rajada síncrona; perder o hover-prefetch custa, no pior caso, um render a mais
no clique — exatamente o comportamento desejado (1 sob demanda, não N de uma vez). A
alternativa (wrapper client com `onMouseEnter` + `router.prefetch()`) seria infra nova
e client-component em folhas hoje RSC-friendly — desproporcional. Mesma análise de
`add-liga-prefetch-fix/design.md` §2.

## 4. Teste

`next/link` NÃO reflete a prop `prefetch` no DOM. Modelo idiomático (de
`StandingsTable.test.tsx`): `vi.mock("next/link")` capturando `prefetch` num
`data-prefetch`, e asserção. Foco no **`NavLinks`** — a alavanca sistêmica (prefetcha em
toda página): asserção de que TODOS os links de seção renderizam com
`data-prefetch="false"`. O `NavLinks.test.tsx` já existia; o mock repassa `...rest`
(aria-current, className), então os testes existentes (disclosure, item ativo) seguem
valendo. Os demais 10 links são cobertos pelo gate (typecheck/lint/test/build) + a
validação visual ao vivo do orquestrador (Network sem a rajada); NÃO se força teste
frágil nos 11 nem se cria harness pesado.

## 5. Por que fora de escopo (documentado na proposal)

- `loading.tsx` nos boundaries de `ligas/[id]` e `copas/[id]`: reduz o CUSTO de um
  prefetch remanescente, não a rajada em si — frente independente.
- Dedupe do `getTournamentClassificacao` (2× por request): otimização ortogonal.
- 429/`Retry-After`/pooling no backend: o diagnóstico provou backend saudável; seria
  over-engineering para uma rajada que este fix elimina na origem.
