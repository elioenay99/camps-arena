## 1. DDL (defesa em profundidade — usuário aplica)

- [x] 1.1 `supabase/schema.sql`: policy `matches_update_tournament_owner`
- [x] 1.2 `supabase/schema.sql`: função+trigger `lock_match_lifecycle` (status só dono; placar travado em encerrada; service_role isento)

## 2. Server Actions

- [x] 2.1 `src/actions/match.ts`: `encerrarPartida(matchId)` — sessão; partida + propriedade do torneio por filtro; transição não-encerrada→encerrada; revalidate dashboard+torneio
- [x] 2.2 `src/actions/match.ts`: `reabrirPartida(matchId)` — idem; encerrada→em_andamento
- [x] 2.3 `updateMatchScore`: rejeitar partida encerrada (select ganha status)

## 3. Data

- [x] 3.1 `getTournamentClassificacao.ts`: `torneio.created_by` no select; projeção `partidasAbertas` (não-encerradas: id, nomes, placar, status)

## 4. UI

- [x] 4.1 `src/features/match/components/MatchStatusButton.tsx` (client: action + toast + pending)
- [x] 4.2 página do torneio: seção "Partidas em aberto" (botão Encerrar só dono) + Reabrir no histórico (só dono)

## 5. Testes

- [x] 5.1 actions: propriedade por filtro; transições inválidas rejeitadas; sem sessão; erro de banco; sucesso revalida
- [x] 5.2 `updateMatchScore` em encerrada rejeita com mensagem específica
- [x] 5.3 fetcher: partidasAbertas só não-encerradas; created_by no select

## 6. Validação

- [x] 6.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 6.2 `openspec validate add-match-lifecycle --strict`
- [x] 6.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [x] 6.4 `pnpm build` verde
- [x] 6.5 `docs/pendencias-manuais.md` seção 7 (policy + trigger)
- [ ] 6.6 (usuário) Aplicar o DDL no Supabase
