## 0. Baseline

- [x] 0.1 Baseline HEAD `7e464e9`: `pnpm typecheck` ✓ (exit 0), `pnpm lint` ✓ (exit 0),
  `pnpm test` ✓ (exit 0). Zero falhas pré-existentes — verde final = igual ao baseline.

## 1. Ler o doc do Next 16 instalado (convenção já validada na change anterior)

- [x] 1.1 Confirmar em
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` que, no
  App Router, o prefetch-no-viewport é o default (`:298`) e `prefetch={false}` = "never
  happen both on entering the viewport and on hover" (`:304`). Next `16.2.6`. Ver
  `design.md` §1. (Já estabelecido por `add-liga-prefetch-fix`.)

## 2. As 12 edições (`prefetch={false}`, espelhando `StandingsTable.tsx:227`)

- [x] 2.1 `src/features/nav/components/NavLinks.tsx` — `<Link>` do `links.map` (as ~6
  rotas de seção). Comentário do porquê (rajada em toda página → borda Vercel 503).
  **Maior alavanca.**
- [x] 2.2 `src/app/dashboard/ligas/[id]/page.tsx` — 3 links "Abrir torneio / Apertura /
  Clausura" (`<Button asChild><Link>`; prop no `<Link>` interno). Comentário na 1ª
  ocorrência.
- [x] 2.3 `src/features/league/components/PlayoffsPanel.tsx` — "Abrir chave"
  (`<Button asChild><Link>`). Comentário.
- [x] 2.4 `src/features/league/components/GrandeFinalPanel.tsx` — "Abrir grande final"
  (`<Button asChild><Link>`). Comentário.
- [x] 2.5 `src/app/dashboard/torneios/page.tsx` — `<Link>` do card em `torneios.map`.
  Comentário.
- [x] 2.6 `src/app/dashboard/explorar/page.tsx` — `<Link>` de `CardVitrine` (lista mais
  longa; ligas/[id] E torneios/[id]). Comentário.
- [x] 2.7 `src/app/dashboard/ligas/page.tsx` — `<Link>` do card em `piramides.map`.
  Comentário.
- [x] 2.8 `src/app/dashboard/copas/page.tsx` — `<Link>` de `CartaoCopa`. Comentário.
- [x] 2.9 `src/app/dashboard/copas/[id]/page.tsx` — `<Link>` da edição em
  `copa.edicoes.map` (→ `copas/edicao/[id]`, que renderiza bracket + classificação, RSC
  cara). Comentário na 1ª ocorrência do arquivo.
- [x] 2.10 `src/features/match/components/MatchCard.tsx` — `<Link>` do título do torneio
  (link secundário; a ação primária é o modal). Comentário.
- [x] 2.11 NÃO tocar: botões "Nova/Criar/Novo", marca/avatar do `layout.tsx`,
  `CompetidorHero.tsx`, links dentro de `competidor/[id]`/`torneios/[id]`, e
  `StandingsTable.tsx:221` (já resolvido).

## 3. Teste

- [x] 3.1 `src/features/nav/components/NavLinks.test.tsx`: `vi.mock("next/link")`
  capturando `prefetch` num `data-prefetch` (repassando `...rest` p/ não quebrar os
  testes de disclosure/aria-current existentes); asserção de que TODOS os links de
  seção renderizam com `data-prefetch="false"`. Espelha `StandingsTable.test.tsx`.
- [x] 3.2 Demais links: cobertos pelo gate + validação visual do orquestrador (não se
  força teste frágil nos 11 nem se cria harness pesado).

## 4. Gate

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — verde (igual ao
  baseline 0.1). (Gate autoritativo roda no pane irmão do orquestrador.)
- [x] 4.2 `openspec validate add-dashboard-prefetch-hardening --strict` = valid.
- [ ] 4.3 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 4.4 Validação visual ao vivo (390px): abrir dashboard, índices (torneios/ligas/
  copas/explorar), página da liga e partidas; confirmar no Network que as rotas de
  seção do header e as rotas `[id]` das listas NÃO disparam prefetch ao abrir; clicar
  ainda navega. (ORQUESTRADOR)
