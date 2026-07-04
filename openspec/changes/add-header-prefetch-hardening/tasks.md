## 0. Baseline

- [x] 0.1 Baseline HEAD `f1e12c6`: `pnpm typecheck` ✓ (exit 0), `pnpm lint` ✓ (exit 0).
  Zero falhas pré-existentes — verde final = igual ao baseline.

## 1. Doc do Next 16 instalado (convenção já validada nas changes anteriores)

- [x] 1.1 Confirmado em
  `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` que, no
  App Router, o prefetch-no-viewport é o default (`:298`) e `prefetch={false}` = "never
  happen both on entering the viewport and on hover" (`:304`). Next `16.2.6`. Ver
  `design.md` §1.

## 2. As 9 edições (`prefetch={false}`, espelhando `StandingsTable.tsx:227`)

- [x] 2.1 `src/app/dashboard/layout.tsx` — marca "GOLISEU" (→ `/dashboard`). Comentário
  do porquê na 1ª ocorrência do arquivo (header em toda página → borda Vercel 503).
- [x] 2.2 `src/app/dashboard/layout.tsx` — avatar (→ `/dashboard/conta`).
- [x] 2.3 `src/app/dashboard/ligas/[id]/page.tsx` — "Equipe" (`<Button asChild><Link>`;
  prop no `<Link>` interno). Comentário na 1ª ocorrência do arquivo.
- [x] 2.4 `src/app/dashboard/ligas/[id]/page.tsx` — "Identidade" (`<Button asChild>`).
- [x] 2.5 `src/app/dashboard/torneios/[id]/page.tsx` — "Ver liga" (→ `ligas/[id]`;
  1ª ocorrência do arquivo → comentário aqui).
- [x] 2.6 `src/app/dashboard/torneios/[id]/page.tsx` — "Cores"/Identidade
  (→ `torneios/[id]/cores`).
- [x] 2.7 `src/app/dashboard/torneios/[id]/page.tsx` — "Equipe"
  (→ `torneios/[id]/equipe`).
- [x] 2.8 `src/features/league/components/competidor/CompetidorHero.tsx` — back para a
  pirâmide (→ `ligas/[id]`). Comentário.
- [x] 2.9 `src/app/dashboard/ligas/competidor/[id]/page.tsx` — "Voltar à pirâmide"
  (→ `ligas/[id]`, `<Button asChild>`). Comentário.
- [x] 2.10 NÃO tocar: botões "Nova/Criar/Novo" (ex.: "Nova partida"), e todos os links
  já resolvidos pelas changes `add-liga-prefetch-fix` e `add-dashboard-prefetch-hardening`.

## 3. Teste

- [x] 3.1 Sem teste novo (decisão justificada): `layout.tsx` é Server Component `async`
  sem teste existente (mock de Supabase/sessão = harness frágil, desproporcional para
  prop de UI); os demais são páginas/componentes RSC de detalhe. A alavanca sistêmica
  (`NavLinks`) já é testada pela change anterior. Cobertura: gate + validação visual do
  orquestrador. Ver `design.md` §4 / proposal.

## 4. Gate

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — verde (igual ao
  baseline 0.1). (Gate autoritativo roda no pane irmão do orquestrador.)
- [x] 4.2 `openspec validate add-header-prefetch-hardening --strict` = valid.
- [ ] 4.3 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 4.4 Validação visual ao vivo (390px): abrir o dashboard e as páginas de liga,
  torneio e competidor; confirmar no Network que a marca/avatar do header, os botões
  Equipe/Identidade e os back-links "Ver liga"/"Voltar à pirâmide" NÃO disparam prefetch
  ao abrir; clicar ainda navega. (ORQUESTRADOR)
