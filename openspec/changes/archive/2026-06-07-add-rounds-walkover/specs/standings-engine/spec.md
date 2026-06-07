# standings-engine — Delta Spec

## ADDED Requirements

### Requirement: Motor de classificação por pontos
O `computeStandings` SHALL continuar puro e agnóstico a id e SHALL aceitar, por
partida, um `woVencedor` opcional (id opaco do slot vencedor; nulo = jogo
normal). Quando `woVencedor` está presente, a partida SHALL creditar ao
vencedor os pontos de VITÓRIA + 1 vitória e ao perdedor os de DERROTA + 1
derrota, SEM somar gols pró/contra/saldo. O critério de desempate por confronto
direto SHALL tratar a partida W.O. como vitória/derrota do `woVencedor` (nunca
empate pelo placar 0x0). Uma partida W.O. de clube órfão (ambos os slots
preenchidos, um sem técnico) SHALL ser elegível como qualquer partida de dois
lados.

#### Scenario: W.O. soma pontos sem gols
- **WHEN** o motor processa uma partida W.O. num torneio 3/1/0
- **THEN** o vencedor recebe 3 pontos e 1 vitória; o saldo de ambos fica
  inalterado

#### Scenario: W.O. no confronto direto
- **WHEN** dois clubes empatados nos critérios objetivos têm entre si um jogo
  W.O.
- **THEN** o desempate por confronto direto credita a vitória ao vencedor do
  W.O., não um empate
