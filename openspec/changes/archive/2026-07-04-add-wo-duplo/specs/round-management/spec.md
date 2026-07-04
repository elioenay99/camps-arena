## MODIFIED Requirements

### Requirement: Fechamento de rodada
O dono SHALL poder FECHAR uma rodada, e a rodada SHALL fechar automaticamente quando a última partida entre clubes COM técnico daquela rodada encerrar. Fechar a rodada SHALL resolver por W.O. AUTOMÁTICO toda partida ainda aberta em que um lado é clube ÓRFÃO (vaga sem técnico) e o outro tem técnico — o lado com técnico vence. Fechar a rodada SHALL adicionalmente resolver por DUPLO W.O. AUTOMÁTICO toda partida ainda aberta FORA DE CHAVE (`posicao` nula) em que AMBOS os lados são clubes órfãos (as duas vagas sem técnico), encerrando-a como `wo = true`, `wo_duplo = true`, `wo_vencedor` nulo e placar `0 x 0`. Órfão × órfão em partida de CHAVE (`posicao` não nula) NÃO SHALL ser tocado (a chave exige um vencedor). Partidas abertas entre dois clubes COM técnico NÃO SHALL ser tocadas pelo fechamento (resultado real ou W.O. manual decide). O fechamento SHALL exigir torneio ATIVO e a propriedade do dono.

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

#### Scenario: Órfão contra órfão vira duplo W.O. fora de chave
- **WHEN** ambos os lados de uma partida aberta FORA de chave (liga/grupos) são clubes órfãos e o dono fecha a rodada (ou ela fecha sozinha)
- **THEN** a partida vira duplo W.O. (`wo_duplo = true`, sem vencedor, 0x0), contando derrota para os dois na classificação

#### Scenario: Órfão contra órfão em chave fica em aberto
- **WHEN** ambos os lados de uma partida aberta de CHAVE (`posicao` não nula) são clubes órfãos
- **THEN** o fechamento não a resolve (a chave exige um vencedor; não há duplo em mata-mata)
