## 1. Implementação

- [x] 1.1 `MatchScoreModalConnected.tsx`: prop `permitirEscolherClube` (default `false`); fia `onSelecionarClube` só quando `true`.
- [x] 1.2 `MatchCard.tsx`: passa `permitirEscolherClube={!ehCompetitivo}`.

## 2. Testes

- [x] 2.1 `MatchScoreModal.test.tsx`: competitivo (sem `onSelecionarClube`) NÃO mostra "Buscar clube"; avulso (com) mostra os 2 campos.

## 3. Gates de qualidade

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (1196 testes).
- [x] 3.2 Comportamento coberto por teste RTL (renderiza o `MatchScoreModal` real: competitivo sem "Buscar clube", avulso com 2). Conferência visual no browser (390px) agendada junto da validação ao vivo do T3 (stack de pé).

## 4. Arquivar

- [x] 4.1 `openspec archive fix-menu-partida-clube-do-torneio`; commit (pt-BR, sem coautoria); push; derrubar Docker.
