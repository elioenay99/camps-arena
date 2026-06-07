# Tasks — add-match-engagement

## 1. Helper

- [ ] 1.1 `src/lib/whatsapp.ts`: `linkWhatsApp(celular, texto?)` (normalização
      extraída do modal + `?text=` encoded) e `mensagemConvocacao` (fallbacks
      de nome/título; URL absoluta via env) + testes (formatos, encoding,
      null, mensagem)
- [ ] 1.2 `MatchScoreModal`: troca a função local pelo helper, com a
      mensagem de convocação (testes do modal seguem verdes)

## 2. Superfícies

- [ ] 2.1 Dashboard: `MatchCard` ganha o atalho no card (gate: userId é
      participante + adversário com celular normalizável); página passa
      userId; testes (gate, href, ausência p/ não-participante)
- [ ] 2.2 Página do torneio: `getTournamentClassificacao` embeds com
      `celular`; `PartidaAberta` ganha ids/celulares; `OpenMatchesList`
      ganha o atalho com o MESMO gate (props userId/título/tournamentId);
      testes (fetcher + lista)

## 3. Validação e fechamento

- [ ] 3.1 Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] 3.2 Validação adversarial enxuta (2 lentes + juiz); aplicar achados
- [ ] 3.3 Commits (proposal/impl/archive) + push + CI verde
- [ ] 3.4 Archive + memória (zero DDL — sem pendência manual)
