# dashboard — Delta Spec

## MODIFIED Requirements

### Requirement: Partidas em aberto agrupadas por rodada
Na página do torneio, as partidas em aberto de formatos competitivos SHALL ser
agrupadas por RODADA, cada grupo com um cabeçalho ("Rodada N" / rótulo de fase)
e — para o dono de torneio ativo — um botão "Fechar rodada N" no cabeçalho da
rodada ativa. O avulso (sem rodada) SHALL manter a lista plana.

#### Scenario: Bloco por rodada com botão de fechar
- **WHEN** o dono abre seu torneio competitivo com partidas abertas em mais de
  uma rodada
- **THEN** vê um bloco por rodada e o botão "Fechar rodada" na rodada ativa

### Requirement: Console de solicitações de W.O. do dono
Quando houver solicitações de W.O. PENDENTES no torneio, o dono SHALL ver, na
página do torneio, cada solicitação (clube solicitante + partida) com as ações
de aceitar e recusar.

#### Scenario: Dono vê e resolve solicitações
- **WHEN** existem solicitações de W.O. pendentes
- **THEN** o dono vê a lista com aceitar/recusar por solicitação
