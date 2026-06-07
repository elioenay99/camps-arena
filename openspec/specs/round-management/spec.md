# round-management Specification

## Purpose
TBD - created by archiving change add-rounds-walkover. Update Purpose after archive.
## Requirements
### Requirement: Rodada ativa derivada
O sistema SHALL tratar como rodada ativa a MENOR `rodada` entre as partidas
ainda não encerradas de um torneio competitivo (liga, mata-mata, grupos, fase
de liga). A rodada ativa SHALL ser DERIVADA das partidas, sem coluna ou tabela
de estado de rodada. O avulso não tem rodada e SHALL ficar fora deste
comportamento.

#### Scenario: Rodada ativa avança ao encerrar a anterior
- **WHEN** todas as partidas da rodada 1 encerram e a rodada 2 ainda tem
  partidas abertas
- **THEN** a rodada ativa exibida passa a ser a 2

#### Scenario: Sem partidas abertas não há rodada ativa
- **WHEN** todas as partidas do torneio estão encerradas
- **THEN** não há rodada ativa (nenhum bloco de "rodada em aberto")

### Requirement: Fechamento de rodada
O dono SHALL poder FECHAR uma rodada, e a rodada SHALL fechar automaticamente
quando a última partida entre clubes COM técnico daquela rodada encerrar.
Fechar a rodada SHALL resolver por W.O. AUTOMÁTICO toda partida ainda aberta
em que um lado é clube ÓRFÃO (vaga sem técnico) e o outro tem técnico — o lado
com técnico vence. Partidas abertas entre dois clubes COM técnico NÃO SHALL ser
tocadas pelo fechamento (resultado real ou W.O. manual decide). O fechamento
SHALL exigir torneio ATIVO e a propriedade do dono.

#### Scenario: Fechar rodada resolve órfãos por W.O.
- **WHEN** o dono fecha a rodada e há uma partida aberta contra um clube órfão
- **THEN** essa partida vira W.O. com vitória para o clube que tem técnico

#### Scenario: Fechamento automático ao último resultado real
- **WHEN** o último jogo entre clubes com técnico da rodada encerra e ainda
  restam partidas abertas só contra órfãos
- **THEN** essas partidas viram W.O. automaticamente, sem ação do dono

#### Scenario: Partida disputável não é forçada
- **WHEN** o dono fecha a rodada mas há uma partida aberta entre dois clubes
  COM técnico
- **THEN** essa partida permanece aberta (o fechamento não inventa resultado)

#### Scenario: Órfão contra órfão fica em aberto
- **WHEN** ambos os lados de uma partida aberta são clubes órfãos
- **THEN** o fechamento não a resolve (não há vencedor possível)

