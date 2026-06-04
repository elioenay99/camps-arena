## 1. Data

- [x] 1.1 `src/features/standings/data/getTournamentClassificacao.ts`: torneio (titulo/status/regras) + partidas com embeds de nome; roda computeStandings; null se invisível
- [x] 1.2 `src/features/match/data/getActiveMatches.ts`: `id` no embed tournament + tipo

## 2. UI

- [x] 2.1 `src/features/standings/components/StandingsTable.tsx`: tabela RSC pura (Pos/Participante/P/J/V/E/D/GP/GC/SG)
- [x] 2.2 `src/app/dashboard/torneios/[id]/page.tsx`: RSC protegida; uuid inválido/torneio invisível → notFound; estado vazio
- [x] 2.3 `src/features/match/components/MatchCard.tsx`: título do torneio vira Link

## 3. Testes

- [x] 3.1 `getTournamentClassificacao.test.ts`: mapeamento de nomes; torneio null; erro de query; só encerradas pontuam (integração com o motor)
- [x] 3.2 `getActiveMatches.test.ts`: embed inclui `id`

## 4. Validação

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 4.2 `openspec validate add-standings-page --strict`
- [x] 4.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [x] 4.4 `pnpm build` verde
