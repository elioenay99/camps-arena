# standings-page Specification (delta)

## ADDED Requirements

### Requirement: Exibição de rodada nas listas de partidas
As listas de partidas da página do torneio SHALL identificar a rodada quando a
partida a tiver (`rodada` não nula): as partidas em aberto SHALL ser ordenadas
por rodada (ordem natural de disputa) com a rodada visível; o histórico de
encerradas SHALL manter a ordenação por encerramento, exibindo a rodada como
informação adicional. Partidas sem rodada (torneio avulso) SHALL renderizar
exatamente como hoje, sem rótulo de rodada. O fetcher
`getTournamentClassificacao` SHALL incluir `rodada` na mesma consulta única de
partidas (sem viagem extra).

#### Scenario: Liga lista partidas em aberto por rodada
- **WHEN** um usuário abre a página de uma liga iniciada
- **THEN** as partidas em aberto aparecem ordenadas por rodada com o número da rodada visível

#### Scenario: Histórico identifica a rodada
- **WHEN** partidas de liga encerradas aparecem no histórico
- **THEN** cada item exibe a rodada, mantendo a ordenação por encerramento

#### Scenario: Avulso permanece sem rótulo
- **WHEN** um usuário abre a página de um torneio avulso
- **THEN** as listas não exibem rótulo de rodada
