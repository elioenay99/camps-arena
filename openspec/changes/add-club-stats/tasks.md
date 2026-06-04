## 1. Data

- [ ] 1.1 `getTournamentClassificacao.ts`: select ganha `time_1`/`time_2` + embeds `t1/t2:teams!matches_time_*_fkey (id, nome)`; retorno ganha `clubes` (motor re-chaveado por clube)

## 2. UI

- [ ] 2.1 `src/app/dashboard/torneios/[id]/page.tsx`: seção "Clubes" com StandingsTable (omitida quando vazia)

## 3. Testes

- [ ] 3.1 `getTournamentClassificacao.test.ts`: clubes computados com regras do torneio; partida sem os dois clubes não pontua; embeds/colunas travados; participantes e clubes derivam do mesmo snapshot

## 4. Validação

- [ ] 4.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [ ] 4.2 `openspec validate add-club-stats --strict`
- [ ] 4.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [ ] 4.4 `pnpm build` verde
