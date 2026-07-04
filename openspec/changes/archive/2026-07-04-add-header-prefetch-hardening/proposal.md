## Why

Duas changes já no `main` mataram a rajada SISTÊMICA de prefetch: `add-liga-prefetch-fix`
(os ~40 links de competidor da `StandingsTable`) e `add-dashboard-prefetch-hardening`
(a nav do header, os índices/vitrine e os links "Abrir …"). A validação ao vivo mostrou
o app praticamente curado — mas SOBRA 1-2 × 503 OCASIONAL, disparado só pelos links de
HEADER/GESTÃO/BACK que ficaram deliberadamente de fora daquelas changes (lá marcados
como "prefetch é boa UX"). Com o backend comprovadamente saudável (Supabase 100% HTTP
200), esses 503 são a mesma **borda da Vercel descartando uma rajada de prefetches RSC
concorrentes** antes de invocar a função — só que agora a rajada residual vem desses
poucos links de topo, que ainda prefetcham rotas RSC caras ao abrir cada página.

O dono decidiu DESLIGAR também esse último trecho — trocar o pouco de UX do
prefetch-de-topo pela eliminação completa do 503 residual. Esta change é o 3º e último
trecho da frente de prefetch: estende a MESMA convenção (`prefetch={false}` + comentário
do porquê, ver `StandingsTable.tsx:227` e as duas changes anteriores) aos links de
header, aos botões de gestão (Equipe/Identidade nas telas de liga e torneio) e aos
back-links isolados que apontam para rotas RSC caras.

O `<Link>` do App Router (Next 16.2.6) faz **prefetch automático ao entrar no viewport**
por padrão (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:298`).
`prefetch={false}` é o único valor que desliga o prefetch-no-viewport (e o de hover) no
App Router (`link.md:304`), sem afetar a navegação por clique.

## What Changes

- **Desligar o prefetch-no-viewport dos links de topo remanescentes** — 9 `<Link>` em
  5 arquivos, todos recebendo `prefetch={false}` (nos casos `<Button asChild><Link>`, a
  prop vai no `<Link>` INTERNO):
  - **Header (aparece em TODA página do dashboard):**
    `src/app/dashboard/layout.tsx` — a marca "GOLISEU" (→ `/dashboard`) e o avatar
    (→ `/dashboard/conta`). 2 edições.
  - **Botões de gestão (Equipe/Identidade), presentes nas telas de liga e torneio:**
    `src/app/dashboard/ligas/[id]/page.tsx` (Equipe → `.../equipe`, Identidade →
    `.../cores` — 2 links) e `src/app/dashboard/torneios/[id]/page.tsx` (Identidade
    "Cores" → `.../cores`, Equipe → `.../equipe` — 2 links).
  - **Back-links isolados para rota RSC cara (completar a disciplina):**
    `src/features/league/components/competidor/CompetidorHero.tsx` (→ `ligas/[id]`),
    `src/app/dashboard/ligas/competidor/[id]/page.tsx` ("Voltar à pirâmide" →
    `ligas/[id]`) e `src/app/dashboard/torneios/[id]/page.tsx` ("Ver liga" →
    `ligas/[id]`, quando o torneio é de uma liga).
- **Comentário curto** explicando o porquê UMA vez por arquivo (na 1ª ocorrência),
  referenciando esta change, espelhando o padrão de `StandingsTable.tsx`.

**NÃO tocados** (mantêm o prefetch padrão): os botões "Nova/Criar/Novo" (rotas de
formulário leves, destino provável — ex.: "Nova partida" em `torneios/[id]/page.tsx`) e
todos os links já resolvidos pelas duas changes anteriores (`NavLinks`, índices,
"Abrir …", vitrine, cards de partida, `StandingsTable.tsx:221`).

## Impact

- **SEM DDL, SEM mudança de dados, SEM migration.** Uma prop de UI em 9 `<Link>`.
- Arquivos (5): `layout.tsx`, `ligas/[id]/page.tsx`, `torneios/[id]/page.tsx`,
  `CompetidorHero.tsx`, `ligas/competidor/[id]/page.tsx`.
- Custo aceito: some também o prefetch-on-hover desses links (no App Router `false`
  desliga os dois — não há valor "sem viewport, com hover" no App Router; ver a mesma
  análise em `add-liga-prefetch-fix/design.md` §2). É o comportamento desejado: 1 render
  sob demanda no clique, não N prefetches simultâneos. Estes são links de topo (1 por
  página, não em lista), então a perda de UX é mínima e o ganho é matar o 503 residual.
- A navegação por CLIQUE de todos os links permanece intacta.

### Sem teste automatizado novo (justificado)

O único arquivo com `<Link>` tocado que teria teste-alvo seria `layout.tsx`, mas ele é
um Server Component `async` (chama `getPerfil()`), sem teste existente; um teste exigiria
mockar Supabase/sessão — harness frágil e desproporcional para uma prop de UI. Os demais
4 arquivos são páginas/componentes RSC de detalhe sem teste de prop. Seguindo a mesma
disciplina da change anterior (que só testou a alavanca sistêmica `NavLinks`), estes 9
links são cobertos pelo gate (typecheck/lint/test/build) + a validação visual ao vivo do
orquestrador (Network sem prefetch ao abrir).

### Follow-up OPCIONAL (fora de escopo — NÃO implementar aqui)

- **`loading.tsx`** em `dashboard/ligas/[id]/` e `dashboard/copas/[id]/`: limitaria o
  custo de qualquer prefetch remanescente ao boundary. Frente independente (já anotada
  na change anterior).
- **Backend / 429 / pooling:** NÃO fazer — o diagnóstico provou backend saudável; a cura
  é cortar a rajada de prefetch na origem.
