## ADDED Requirements

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

#### Scenario: Empate persistente divide a posição
- **WHEN** dois participantes são indistinguíveis por toda a cadeia
- **THEN** ambos recebem a mesma posição e o seguinte pula (1º, 1º, 3º)
