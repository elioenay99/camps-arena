# standings-engine Specification

## Purpose
TBD - created by archiving change add-scoring-rules. Update Purpose after archive.
## Requirements
### Requirement: Cálculo de classificação por regras do torneio
O sistema SHALL prover uma função pura `computeStandings` que, dadas as regras de pontuação do torneio (vitória/empate/derrota) e suas partidas, devolve a tabela de classificação. Somente partidas `encerrada` com ambos os participantes definidos SHALL pontuar; as demais SHALL ser ignoradas. Os pontos SHALL ser `vitórias × pontos_vitoria + empates × pontos_empate + derrotas × pontos_derrota`.

#### Scenario: Resultados convertem em pontos pela regra do torneio
- **WHEN** um torneio 3/1/0 tem A vencendo B e empatando com C
- **THEN** A soma 4 pontos, C soma 1 e B soma 0, com gols pró/contra e saldo acumulados

#### Scenario: Regras customizadas mudam a tabela
- **WHEN** o mesmo conjunto de partidas é calculado com regras 2/1/0
- **THEN** os pontos refletem a regra customizada

#### Scenario: Partida não encerrada ou sem participantes não pontua
- **WHEN** existem partidas `agendada`/`em_andamento` ou com participante nulo
- **THEN** elas não afetam pontos, jogos nem gols

### Requirement: Cadeia de desempate
A ordenação SHALL seguir: pontos → vitórias → saldo de gols → gols pró → confronto direto → empate persistente. O confronto direto SHALL ser aplicado apenas quando exatamente 2 participantes permanecem empatados (com 3 ou mais, o critério é pulado), considerando os pontos nas partidas elegíveis entre eles com as mesmas regras do torneio. Participantes indistinguíveis SHALL dividir a mesma posição (estilo 1º, 1º, 3º) com ordem de apresentação determinística.

#### Scenario: Desempate por saldo e gols pró
- **WHEN** dois participantes têm os mesmos pontos e vitórias
- **THEN** o de maior saldo fica à frente; persistindo, o de mais gols pró

#### Scenario: Confronto direto decide entre dois
- **WHEN** dois participantes seguem empatados após pontos/vitórias/saldo/gols pró
- **THEN** quem somou mais pontos nos jogos entre eles fica à frente

#### Scenario: Três ou mais empatados pulam o confronto direto
- **WHEN** três participantes seguem empatados após os critérios anteriores
- **THEN** o confronto direto não é aplicado e o empate persiste

#### Scenario: Confronto direto inconclusivo persiste o empate
- **WHEN** dois empatados nunca se enfrentaram ou somaram os mesmos pontos entre si
- **THEN** o empate persiste e ambos dividem a posição

#### Scenario: Empate persistente divide a posição
- **WHEN** dois participantes são indistinguíveis por toda a cadeia
- **THEN** ambos recebem a mesma posição e o seguinte pula (1º, 1º, 3º)

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

