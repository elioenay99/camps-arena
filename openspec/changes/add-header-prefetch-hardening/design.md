## Contexto

- **Diagnóstico (já feito, validação ao vivo + logs):** backend saudável (Supabase
  100% HTTP 200, DB rápido). Os 503 são a **borda da Vercel** descartando uma rajada de
  prefetches RSC concorrentes ANTES de invocar a função. As duas changes anteriores
  (`add-liga-prefetch-fix`, `add-dashboard-prefetch-hardening`) mataram a rajada
  sistêmica; sobra um 503 OCASIONAL (1-2 ×) vindo só dos links de HEADER/GESTÃO/BACK que
  ficaram de fora. Esta change fecha esse trecho.
- **Convenção já no repo:** `StandingsTable.tsx:221-227` e as duas changes no `main` —
  `<Link>` com `prefetch={false}` + comentário curto do porquê. Esta change replica
  exatamente esse padrão.

## 1. Por que `prefetch={false}` (doc do Next 16 INSTALADO)

`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`, App Router:

- `link.md:298` — "Prefetching happens when a `<Link />` component enters the user's
  viewport ... Next.js prefetches and loads the linked route and its data in the
  background." (Só em produção.)
- `link.md:304` — `prefetch={false}`: "Prefetching will never happen both on entering
  the viewport and on hover."

`prefetch={false}` é o único valor que elimina o prefetch-no-viewport (a rajada). O
default e `true` mantêm a rajada. Navegação por clique preservada (prefetch é só
pré-carga; ao clicar o Next busca a rota-alvo na hora). Next `16.2.6`.

## 2. Escopo cirúrgico — quais links SIM, quais NÃO

**SIM (9 links / 5 arquivos)** — critério: link de TOPO (header/gestão/back) presente em
página de alto tráfego OU repetido nas telas de liga/torneio, apontando para rota RSC
cara (`[id]` de liga/torneio ou tela de gestão):

| # | Arquivo | Link | Alvo |
|---|---------|------|------|
| 1 | `src/app/dashboard/layout.tsx` | marca "GOLISEU" | `/dashboard` |
| 2 | `src/app/dashboard/layout.tsx` | avatar | `/dashboard/conta` |
| 3 | `src/app/dashboard/ligas/[id]/page.tsx` | "Equipe" | `.../ligas/[id]/equipe` |
| 4 | `src/app/dashboard/ligas/[id]/page.tsx` | "Identidade" | `.../ligas/[id]/cores` |
| 5 | `src/app/dashboard/torneios/[id]/page.tsx` | "Cores" (Identidade) | `.../torneios/[id]/cores` |
| 6 | `src/app/dashboard/torneios/[id]/page.tsx` | "Equipe" | `.../torneios/[id]/equipe` |
| 7 | `src/features/league/components/competidor/CompetidorHero.tsx` | back para a pirâmide | `ligas/[id]` |
| 8 | `src/app/dashboard/ligas/competidor/[id]/page.tsx` | "Voltar à pirâmide" | `ligas/[id]` |
| 9 | `src/app/dashboard/torneios/[id]/page.tsx` | "Ver liga" | `ligas/[id]` |

Nos casos `<Button asChild><Link>…</Link></Button>` (3–6, 8, 9), a prop vai no `<Link>`
INTERNO — o `<Button asChild>` só clona o filho, e é o `<Link>` que dispara o prefetch.

**NÃO** (mantêm o prefetch padrão):
- Botões "Nova/Criar/Novo" → rotas de FORMULÁRIO leves e destino provável (ex.: "Nova
  partida" em `torneios/[id]/page.tsx:749`).
- Todos os links já resolvidos pelas changes anteriores (`NavLinks`, índices de
  torneios/ligas/copas, vitrine "Explorar", "Abrir …", `MatchCard`,
  `StandingsTable.tsx:221`) — NÃO re-tocar.

## 3. Custo aceito: some o prefetch-on-hover (App Router)

No App Router, `false` desliga viewport E hover (`link.md:304`) — não existe valor "sem
viewport, com hover 1-a-1". Aceitável: o objetivo é matar o 503 residual; perder o
hover-prefetch custa, no pior caso, um render a mais no clique. Como estes são links de
TOPO (1 por página, não em lista), a perda de UX é mínima. A alternativa (wrapper client
com `onMouseEnter` + `router.prefetch()`) seria infra nova e client-component em folhas
hoje RSC-friendly — desproporcional. Mesma análise de `add-liga-prefetch-fix/design.md`
§2.

## 4. Sem teste automatizado novo (decisão)

O único arquivo tocado com teste-alvo plausível seria `layout.tsx`, mas é Server
Component `async` (chama `getPerfil()`), SEM teste existente — testá-lo exigiria mockar
Supabase/sessão, harness frágil e desproporcional para uma prop de UI. Os outros 4
arquivos são páginas/componentes RSC de detalhe sem teste de prop. A change anterior
já testou a única alavanca SISTÊMICA que valia teste (`NavLinks`, prefetcha em toda
página); estes 9 links de topo são cobertos pelo gate (typecheck/lint/test/build) + a
validação visual ao vivo do orquestrador (Network sem prefetch ao abrir).

## 5. Por que fora de escopo

- `loading.tsx` nos boundaries de `ligas/[id]`: reduz o CUSTO de um prefetch
  remanescente, não a rajada — frente independente (já anotada na change anterior).
- 429/`Retry-After`/pooling no backend: o diagnóstico provou backend saudável; seria
  over-engineering para uma rajada que este fix elimina na origem.
