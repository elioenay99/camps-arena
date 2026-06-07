# Tasks — add-tournament-closing

## 1. Actions

- [x] 1.1 `tournaments.ts` — `encerrarTorneio(tournamentId)`: sessão; UPDATE
      por filtro (`eq created_by` + `neq status 'encerrado'`) com `.select()`
      de confirmação; resposta única sem oráculo; revalidate das 3 rotas
- [x] 1.2 `tournaments.ts` — `reabrirTorneio(tournamentId)`: sessão; busca o
      torneio por filtro (dono + encerrado → select formato); deriva o status
      de retorno (gerado sem partidas com `rodada` → `rascunho`; senão
      `ativo`); UPDATE confirmado; revalidate
- [x] 1.3 Testes das duas actions: filtros por spy, transições, derivação do
      retorno (gerado sem partidas → rascunho; com partidas → ativo; avulso →
      ativo), sem sessão, erros de query/corrida, revalidatePath

## 2. UI

- [x] 2.1 Novo componente client `TournamentLifecycleButtons` (feature
      tournament): Encerrar com confirmação em dois cliques + aviso de N
      partidas abertas; Reabrir em encerrado; useTransition + toast (padrão
      MatchStatusButton)
- [x] 2.2 `page.tsx` do torneio: renderizar o console para `ehDono` (Encerrar
      fora do gate `podeGerirPartidas`; Reabrir quando `status ===
      'encerrado'`), passando `partidasAbertas.length`
- [x] 2.3 Testes do componente: confirmação em dois cliques, aviso com a
      contagem, reabrir sem confirmação dupla

## 3. Validação e fechamento

- [x] 3.1 Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [x] 3.2 Validação adversarial (2 lentes + juiz por achado): approved_with_nits,
      0 must_fix; should_fix aplicado — congelamento de participants do
      mata-mata estendido para encerrado-com-chave (encerrar→sair→reabrir
      recriaria o travamento do avanço; action+policy+UI+specs+seção 11);
      nits de redação corrigidos; gates re-rodados (487/487)
- [ ] 3.3 Commits (proposal/impl/archive) + push + CI verde
- [ ] 3.4 `openspec archive add-tournament-closing` + memória (sem pendência
      manual — zero DDL)
