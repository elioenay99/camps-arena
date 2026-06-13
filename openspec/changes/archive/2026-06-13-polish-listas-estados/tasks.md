# Tasks — polish-listas-estados

## 1. Listas de partidas (markup/classe; RSC preservado)

- [x] 1.1 `MatchHistoryList`: linha com `bg-card/40` + hover sutil
      (`hover:border-primary/30`), placar em `font-display tabular-nums`, badge
      de W.O. refinada — preservar textos `W.O.`/`2 x 1` e os `sr-only`.
- [x] 1.2 `OpenMatchesList`: mesma profundidade nas linhas, placar
      `font-display tabular-nums`, status em pílula discreta, "(vaga aberta)"
      refinada; cabeçalho de rodada `font-display` + acento `aria-hidden`
      (nome acessível "Rodada N" intacto, botão "Fechar rodada N" mantido).
      NÃO adicionar `"use client"` (guard de PII).

## 2. W.O. (refino leve, sem mudança de comportamento)

- [x] 2.1 `WoButtons`: caixa sutil (`bg-muted/40`) na escolha "Vitória de:";
      rótulos e actions idênticos ("W.O.", "Solicitar W.O.", "Fechar rodada",
      "Aceitar"/"Recusar", "Solicitando…"/"Fechando…").

## 3. Skeleton de classificação + loading da página do torneio

- [x] 3.1 `StandingsTableSkeleton.tsx` (novo): espelha cabeçalho + N linhas da
      `StandingsTable` (coluna de nome mais larga), `aria-hidden`. Replica a
      caixa de overflow real (`overflow-x-auto rounded-lg border` + grade
      interna `min-w-[34rem]`, espelhando `StandingsTable.tsx:31-34`).
- [x] 3.2 `torneios/[id]/loading.tsx`: header-hero de esqueleto (chip de ícone +
      título + chips) + cabeçalho de seção (`size-4.5`, = ao real) +
      `StandingsTableSkeleton`; `role="status"`/`aria-live` e `sr-only`
      "Carregando classificação…" preservados.

## 4. Estados de erro/ausência vestidos com a identidade

- [x] 4.1 `boundary-card.tsx` (novo, sem `"use client"`): chip de ícone + título
      `font-display` + `.elevate animate-rise` + descrição + slot de ações; tom
      (destrutivo/neutro) recolore SÓ o chip (`aria-hidden`, limiar 3.0). Título
      no `foreground`, descrição em `muted-foreground` — `text-destructive` NÃO
      vaza para texto (cairia ~4.08 no dark, < AA 4.5).
- [x] 4.2 `boundary-retry-actions.tsx` (novo): corpo compartilhado dos error
      boundaries (dica + retry `default`/primary + digest). Remove a cópia
      byte-a-byte dos 4 `error.tsx` e fixa o AA do digest
      (`text-muted-foreground` cheio, ~6:1; era `/70` ~3.2/3.7 — achado da
      revisão adversarial).
- [x] 4.3 Aplicar aos quatro `error.tsx` (tom destrutivo, `TriangleAlert`,
      `unstable_retry ?? reset`, `console.error` no `useEffect`) e ao
      `not-found.tsx` (tom neutro, `Compass`, "Voltar ao painel").
      `global-error.tsx` INTOCADO.

## 5. Validação (gates automáticos)

- [x] 5.1 Gates: typecheck / lint / test (853/853 inalterados) / build.
- [x] 5.2 Ao vivo (Playwright): página do torneio (lista em aberto por rodada +
      W.O.), not-found e loading skeleton — 2 temas (Dracula/Canarinho) + 390px;
      screenshots conferidos.
- [x] 5.3 Workflow de verificação da proposal (approved, 0 must_fix) + revisão
      adversarial do diff (approved_with_nits, 0 must_fix). Fixes aplicados (AA
      do digest + DRY via `BoundaryRetryActions`; `size-4.5` no skeleton).
      Commit + push + CI + archive.
