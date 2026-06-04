## MODIFIED Requirements

### Requirement: Fetcher de classificação
O sistema SHALL prover `getTournamentClassificacao` que busca o torneio (com regras) e as partidas com nomes embutidos numa única viagem por recurso, executa o motor e devolve as linhas com nome resolvido E a lista de partidas encerradas shaped para exibição (`partidasEncerradas`). Torneio não retornado pela RLS SHALL resultar em `null`; falha de query SHALL lançar erro amigável.

#### Scenario: Nomes resolvidos a partir dos embeds
- **WHEN** as partidas retornam embeds de participantes com nomes
- **THEN** cada linha da classificação carrega o nome correspondente (fallback "Sem nome")

#### Scenario: Torneio oculto pela RLS
- **WHEN** a query do torneio devolve vazio
- **THEN** o fetcher devolve null sem consultar partidas

#### Scenario: Classificação e histórico do mesmo snapshot
- **WHEN** o fetcher retorna
- **THEN** classificação e `partidasEncerradas` derivam da MESMA consulta de partidas (sem segunda viagem, sem inconsistência entre as fatias)
