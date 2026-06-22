## ADDED Requirements

### Requirement: Seleção de clube apenas no avulso

O "Menu da Partida" SHALL oferecer a busca/troca de clube de cada lado (`TeamSearchInput`)
SOMENTE em partidas **avulsas**, onde o clube é cosmético por partida. Em partidas
**competitivas** (liga, mata-mata, grupos, fase de liga — lados por `tournament_slot`/vaga),
o clube vem do torneio e SHALL ser apenas **exibido** (escudo + nome), SEM campo de busca. O
controle apresentacional SHALL ser governado por uma única decisão derivada de a partida ser
competitiva (presença de vaga), de modo que o avulso permaneça inalterado e o competitivo não
exiba a busca.

#### Scenario: Partida de torneio não mostra a busca de clube

- **WHEN** o usuário abre o "Menu da Partida" de uma partida competitiva (clube vindo do torneio)
- **THEN** o clube de cada lado é exibido (escudo + nome), sem o campo "Buscar clube"

#### Scenario: Partida avulsa mantém a busca de clube

- **WHEN** o usuário abre o "Menu da Partida" de uma partida avulsa
- **THEN** cada lado oferece o campo de busca para escolher/trocar o clube
