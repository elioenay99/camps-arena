## 1. Data

- [ ] 1.1 `getTournamentClassificacao.ts`: select ganha `id`/`updated_at` + order `updated_at` desc; retorno ganha `partidasEncerradas` (nomes resolvidos, placares, data)

## 2. UI

- [ ] 2.1 `src/features/match/components/MatchHistoryList.tsx`: lista RSC pura com data pt-BR
- [ ] 2.2 `src/app/dashboard/torneios/[id]/page.tsx`: seção "Partidas encerradas" (omitida quando vazia)

## 3. Testes

- [ ] 3.1 `getTournamentClassificacao.test.ts`: partidasEncerradas só com encerradas; ordem preservada da query; fallback "A definir"; colunas novas no select; classificação inalterada

## 4. Validação

- [ ] 4.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [ ] 4.2 `openspec validate add-match-history --strict`
- [ ] 4.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [ ] 4.4 `pnpm build` verde
