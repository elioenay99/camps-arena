## Why

A change anterior (`add-liga-prefetch-fix`, já no `main`) matou o MAIOR ofensor da
rajada de prefetch — os ~40 links de competidor da `StandingsTable` — pondo
`prefetch={false}` em `StandingsTable.tsx`. Mas o 503 PERSISTE ao abrir páginas do
dashboard: a validação ao vivo + os logs (Vercel + Supabase) provaram que **o backend
está saudável** (Supabase 100% HTTP 200, DB rápido) e que os 503 são a **borda da
Vercel descartando uma rajada de prefetches RSC concorrentes ANTES de invocar a
função** (edge concurrency/rate-limit, sem log de função).

A rajada remanescente tem duas fontes, ambas o mesmo padrão do fix anterior:

1. **A navegação do header (`NavLinks`) aparece em TODA página do dashboard** e
   prefetcha as ~6 rotas de seção de uma vez (torneios, ligas, copas, partidas, etc.),
   cada uma uma rota RSC cara.
2. **Os índices/listas e os links "Abrir …"** renderizam N `<Link>` para rotas `[id]`
   caras no viewport (vitrine "Explorar", índices de torneios/ligas/copas, os links de
   torneio dentro da página da liga, dos painéis de playoff/grande final e dos cards de
   partida). Cada um prefetcha a rota-alvo, repetindo a rajada em telas diferentes.

O `<Link>` do App Router (Next 16.2.6) faz **prefetch automático ao entrar no
viewport** por padrão
(`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:298`).
`prefetch={false}` é o único valor que desliga o prefetch-no-viewport (e o de hover) no
App Router (`link.md:304`), sem afetar a navegação por clique.

Esta change ESTENDE a convenção já estabelecida (`prefetch={false}` + comentário do
porquê, ver `StandingsTable.tsx:221-227`) aos demais links do dashboard que aparecem em
quantidade e apontam para rotas RSC caras.

## What Changes

- **Desligar o prefetch-no-viewport dos links que formam rajada** — 12 `<Link>` em 9
  arquivos, todos recebendo `prefetch={false}` (nos casos `<Button asChild><Link>`, a
  prop vai no `<Link>` INTERNO):
  - **Sistêmico (maior alavanca):** `src/features/nav/components/NavLinks.tsx` — o
    `<Link>` do `links.map` (as ~6 rotas de seção, presentes em toda página). 1 edição.
  - **Links "Abrir …" para rota de torneio (RSC cara):**
    `src/app/dashboard/ligas/[id]/page.tsx` (Abrir torneio / Apertura / Clausura — 3
    links), `src/features/league/components/PlayoffsPanel.tsx` (Abrir chave),
    `src/features/league/components/GrandeFinalPanel.tsx` (Abrir grande final).
  - **Índices de lista / vitrine → rotas `[id]` caras:**
    `src/app/dashboard/torneios/page.tsx`, `src/app/dashboard/explorar/page.tsx`
    (a vitrine é a lista mais longa, aponta pra ligas/[id] E torneios/[id]),
    `src/app/dashboard/ligas/page.tsx`, `src/app/dashboard/copas/page.tsx`,
    `src/app/dashboard/copas/[id]/page.tsx` (a lista de edições da copa → rotas
    copas/edicao/[id], que renderizam bracket + classificação),
    `src/features/match/components/MatchCard.tsx` (título do torneio — link secundário;
    a ação primária do card é o modal de placar).
- **Comentário curto** explicando o porquê UMA vez por arquivo (na 1ª ocorrência),
  referenciando esta change, espelhando o padrão de `StandingsTable.tsx`.
- **Teste** do `NavLinks` (a alavanca sistêmica): mock de `next/link` capturando a prop
  `prefetch` num `data-prefetch` e asserção de que TODOS os links de seção renderizam
  com `prefetch={false}` — espelhando o modelo de `StandingsTable.test.tsx`. Os demais
  links são cobertos pelo gate + validação visual do orquestrador.

**NÃO tocados** (1 link por página, sem rajada, prefetch é boa UX): botões
"Nova/Criar/Novo" (rotas de formulário leves), a marca e o avatar do `layout.tsx`,
`CompetidorHero.tsx`, os links de detalhe já dentro de páginas `[id]`, e
`StandingsTable.tsx:221` (JÁ resolvido pela change anterior — NÃO mexer).

## Impact

- **SEM DDL, SEM mudança de dados, SEM migration.** Uma prop de UI em 12 `<Link>`.
- Arquivos (9): `NavLinks.tsx` (+ `NavLinks.test.tsx`), `ligas/[id]/page.tsx`,
  `PlayoffsPanel.tsx`, `GrandeFinalPanel.tsx`, `torneios/page.tsx`, `explorar/page.tsx`,
  `ligas/page.tsx`, `copas/page.tsx`, `copas/[id]/page.tsx`, `MatchCard.tsx`.
- Custo aceito: some também o prefetch-on-hover desses links (no App Router `false`
  desliga os dois — não há valor "sem viewport, com hover" no App Router; ver a mesma
  análise em `add-liga-prefetch-fix/design.md` §2). É o comportamento desejado: 1 render
  sob demanda no clique, não N prefetches simultâneos.
- A navegação por CLIQUE de todos os links permanece intacta.

### Follow-up OPCIONAL (fora de escopo — NÃO implementar aqui)

- **`loading.tsx`** em `dashboard/ligas/[id]/` e `dashboard/copas/[id]/`: limitaria o
  custo de qualquer prefetch remanescente ao boundary (hoje o prefetch renderiza a
  página inteira). Frente independente.
- **Dedupe do `getTournamentClassificacao`**, que roda 2× por request
  (`generateMetadata` + `page`). Otimização ortogonal.
- **Backend / 429 / pooling:** NÃO fazer — o diagnóstico provou que o backend está
  saudável; a cura é cortar a rajada de prefetch na origem.
