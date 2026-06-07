# Tasks — add-match-engagement

## 1. Helper

- [x] 1.1 `src/lib/whatsapp.ts`: `linkWhatsApp(celular, texto?)` (normalização
      extraída do modal + `?text=` encoded) e `mensagemConvocacao` (fallbacks
      de nome/título; URL absoluta via env) + testes (formatos, encoding,
      null, mensagem)
- [x] 1.2 `MatchScoreModal`: troca a função local pelo helper, com a
      mensagem de convocação POR COLUNA (`ParticipantePartida.mensagemWhatsApp`)
      + teste novo do modal (fiação por lado, sem cross-wiring; compat sem
      mensagem) — achado do adversarial: o modal não tinha NENHUM teste

## 2. Superfícies

- [x] 2.1 Dashboard: `MatchCard` ganha o atalho no card (gate: userId é
      participante + adversário com celular normalizável); página passa
      userId; testes (gate, href, ausência p/ não-participante)
- [x] 2.2 Página do torneio: `getTournamentClassificacao` embeds com
      `celular`; `PartidaAberta` ganha ids/celulares; `OpenMatchesList`
      ganha o atalho com o MESMO gate (props userId/título/tournamentId);
      testes (fetcher + lista)

## 3. Validação e fechamento

- [x] 3.1 Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [x] 3.2 Validação adversarial enxuta (2 lentes + juiz): approved_with_nits,
      0 must_fix; should_fix aplicado (teste do modal por coluna) + nits
      (asserts estáveis, borda 'A definir', guard de regressão da fronteira
      RSC, spec com escopo honesto da contenção, wart da auto-chamada
      registrado)
- [x] 3.3 Commits (proposal/impl/archive) + push + CI verde
- [x] 3.4 Archive + memória (zero DDL — sem pendência manual)
