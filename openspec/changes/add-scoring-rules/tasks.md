## 1. DDL (defesa em profundidade — usuário aplica)

- [x] 1.1 `supabase/schema.sql`: `tournaments` ganha `pontos_vitoria` (default 3), `pontos_empate` (default 1), `pontos_derrota` (default 0), `integer not null`
- [x] 1.2 `supabase/schema.sql`: CHECK `tournaments_pontuacao_coerente` (`0 <= derrota <= empate <= vitoria <= 100`)

## 2. Schema e Action

- [x] 2.1 `src/schema/tournamentSchema.ts`: 3 campos inteiros 0–100 com defaults 3/1/0 + refine de coerência
- [x] 2.2 `src/actions/tournaments.ts`: converter strings do form explicitamente e inserir as 3 colunas
- [x] 2.3 `src/lib/supabase/database.types.ts`: Row/Insert/Update de `tournaments`

## 3. Motor de classificação

- [x] 3.1 `src/features/standings/computeStandings.ts`: função pura — elegibilidade (encerrada + 2 participantes), acumuladores, pontos por regras do torneio, cadeia de desempate (pontos → vitórias → saldo → gols pró → confronto direto entre 2 → empate persistente com posição dividida)

## 4. UI

- [x] 4.1 `src/features/tournament/components/TournamentForm.tsx`: 3 inputs numéricos pré-preenchidos (3/1/0) com erros por campo

## 5. Testes

- [x] 5.1 `src/features/standings/computeStandings.test.ts`: bateria exaustiva — vitória/empate/derrota; regras custom; partidas não-encerradas/TBD ignoradas; cada nível da cadeia de desempate; confronto direto só entre 2; ciclo com 3+ pula o critério; empate persistente divide posição; determinismo
- [x] 5.2 `src/schema/tournamentSchema.test.ts`: limites 0/100, coerência rejeitada (derrota > vitória), defaults
- [x] 5.3 `src/actions/tournaments.test.ts`: insert com as 3 colunas; valores custom; inválido não toca o banco

## 6. Validação

- [x] 6.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 6.2 `openspec validate add-scoring-rules --strict`
- [x] 6.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [x] 6.4 `pnpm build` verde
- [x] 6.5 Atualizar `docs/pendencias-manuais.md` (seção 6) com o DDL desta change
- [ ] 6.6 (usuário) Aplicar o DDL no Supabase
