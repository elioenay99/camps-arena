## 1. Parte A — push via `after()`

- [x] 1.1 Ler o guia de `after()` em `node_modules/next/dist/docs/` (Next 16):
  import de `next/server`, roda após o flush, mantido vivo pela plataforma.
- [x] 1.2 `src/actions/match.ts`: envolver `enviarNotificacoes(...)` em
  `after(() => ...)` no `updateMatchScore`; `return { ok: true }` imediato.
- [x] 1.3 `src/actions/match.test.ts`: mock de `next/server` (`after` no-op) para o
  teste não estourar fora do request scope.
- [x] 1.4 Demais actions com push no caminho crítico: listadas como follow-up no
  proposal (não alteradas — várias redirecionam e merecem análise própria).

## 2. Parte B — canal realtime escopável

- [x] 2.1 `LiveMatchesProvider`: prop OPCIONAL `tournamentId?: string`; quando
  presente, `filter: 'tournament_id=eq.<id>'` no `.on(...)` e nome de canal
  escopado (`matches-torneio-<id>`); ausente → idêntico ao dashboard.
- [x] 2.2 `useEffect` re-assina quando `tournamentId` muda (deps).
- [x] 2.3 `live.test.tsx`: testes do canal global (dashboard, sem filtro) vs
  escopado (com filtro na origem); dashboard não regride.

## 3. Gate

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test` verde (igual ao baseline).
- [x] 3.2 `openspec validate perf-push-realtime --strict` = valid.
