# dashboard — Delta Spec

## MODIFIED Requirements

### Requirement: Listagem de partidas ativas
O dashboard SHALL listar as partidas ativas do usuário: avulsas em que é participante E competitivas em que é TÉCNICO de uma das vagas — mantendo o filtro de torneio encerrado e o comportamento falha-seguro atuais. O card de partida competitiva SHALL exibir os CLUBES (escudo+nome) com o técnico como detalhe.

#### Scenario: Partidas das minhas vagas aparecem
- **WHEN** o usuário é técnico de um clube com partida aberta
- **THEN** a partida aparece no dashboard com os clubes como lados

#### Scenario: Deixei a vaga, partidas somem
- **WHEN** o usuário desiste de uma vaga
- **THEN** as partidas daquele clube deixam de aparecer no dashboard dele
