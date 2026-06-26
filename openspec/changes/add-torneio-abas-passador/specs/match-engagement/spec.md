# match-engagement — Delta Spec

## ADDED Requirements

### Requirement: Listagem de partidas paginada por rodada

A listagem de partidas de um formato competitivo (partidas com `rodada`) SHALL mostrar UMA rodada
por vez, com um passador que permite ir à rodada anterior / próxima e PULAR direto para uma
rodada específica, em vez de empilhar todas as rodadas. As
partidas EM ABERTO SHALL abrir na rodada ATIVA; as partidas ENCERRADAS SHALL abrir na ÚLTIMA
rodada. O controle "Fechar rodada" (organizador, na rodada ativa) SHALL ficar no cabeçalho do
passador. Partidas AVULSAS (sem `rodada`) SHALL manter a lista plana atual, sem passador. O
passador SHALL ser apresentação client-side, recebendo as partidas já renderizadas no servidor —
o atalho de contato (`wa.me`) continua com a PII embutida no link e NUNCA crua no cliente.

#### Scenario: Uma rodada por vez com passador

- **WHEN** um torneio competitivo tem várias rodadas com partidas
- **THEN** a lista mostra só uma rodada por vez e oferece ir à anterior/próxima e pular para outra

#### Scenario: Abertas abrem na rodada ativa

- **WHEN** a lista de partidas em aberto é exibida
- **THEN** o passador começa na rodada ativa

#### Scenario: Fechar rodada no passador

- **WHEN** o organizador está na rodada ativa
- **THEN** o controle "Fechar rodada" aparece no cabeçalho do passador

#### Scenario: Avulso mantém lista plana

- **WHEN** as partidas não têm rodada (torneio avulso)
- **THEN** a lista é plana, sem passador
