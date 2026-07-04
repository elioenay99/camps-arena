## 0. Baseline

- [x] 0.1 Baseline HEAD `3ee63f9`: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test`
  1381/1381 ✓, `pnpm build` ✓ (exit 0). Zero falhas pré-existentes — verde final =
  igual ao baseline.

## 1. Ler o doc do Next 16 instalado

- [x] 1.1 Ler `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`
  (App Router). Confirmar a semântica de `prefetch`: viewport-prefetch é o default
  (`:298`); `false` = "never happen both on entering the viewport and on hover"
  (`:304`). Versão do Next: `16.2.6` (`node_modules/next/package.json`). Ver `design.md` §1.

## 2. O fix (cirúrgico)

- [x] 2.1 `src/features/standings/components/StandingsTable.tsx` (~:221): adicionar
  `prefetch={false}` SÓ no `<Link>` do ramo `hrefCompetidorBase` (o único link de
  competidor). NÃO tocar nenhum outro `<Link>` (Equipe/Identidade/Abrir torneio/Voltar).
  Comentário curto explicando o porquê (rajada de RSC → 503).

## 3. Teste

- [x] 3.1 `src/features/standings/components/StandingsTable.test.tsx`: mock de `next/link`
  capturando a prop `prefetch` (`data-prefetch`); asserção de que o link de competidor
  (`hrefCompetidorBase` presente) renderiza com `data-prefetch="false"` E aponta para
  `/dashboard/ligas/competidor/p1` (navegação por clique intacta). Asserção adicional:
  sem `hrefCompetidorBase`, o nome é texto puro, sem `<a>` (torneio avulso inalterado).

## 4. Gate

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — verde (igual ao
  baseline 0.1). (Gate autoritativo roda no pane irmão do orquestrador.)
- [x] 4.2 `openspec validate add-liga-prefetch-fix --strict` = valid.
- [ ] 4.3 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 4.4 Validação visual ao vivo (390px): abrir a pirâmide e confirmar, no
  Network, que os ~40 prefetches de `/dashboard/ligas/competidor/*` NÃO disparam ao
  abrir; clicar num nome ainda navega para o competidor. (ORQUESTRADOR)
