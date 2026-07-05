## ADDED Requirements

### Requirement: Confronto direto exposto como função pura reutilizável
O sistema SHALL expor o cálculo de pontos de confronto direto entre dois
participantes (usado no desempate de exatamente 2) como uma função PURA exportada
(`pontosDoConfronto(eu, rival, partidas, regras)`), e o motor `computeStandings`
SHALL passar a consumi-la no desempate SEM alterar o resultado da classificação.
A função SHALL considerar apenas as partidas elegíveis entre os dois, com as
mesmas regras do torneio, respeitando W.O. (vitória/derrota pelo vencedor
explícito) e duplo W.O. (derrota para os dois) — comportamento idêntico ao da
lógica anterior embutida no motor.

#### Scenario: Classificação inalterada após a extração
- **WHEN** a classificação é computada em qualquer cenário de desempate por confronto direto (incluindo W.O. e duplo W.O. entre os dois)
- **THEN** a ordem e as posições são idênticas às produzidas antes da extração

#### Scenario: Função pura reutilizável fora do motor
- **WHEN** um consumidor externo chama `pontosDoConfronto(eu, rival, partidas, regras)` com as partidas de uma competição
- **THEN** recebe os pontos somados por `eu` nos jogos entre os dois, sem executar nenhum IO
