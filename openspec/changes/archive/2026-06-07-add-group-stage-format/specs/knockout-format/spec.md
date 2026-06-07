# knockout-format — Delta Spec

## MODIFIED Requirements

### Requirement: Avanço de fase pelo dono
O sistema SHALL expor a Server Action `avancarFase` que, conferindo dono +
formato COM CHAVE (`mata_mata`, `grupos_mata_mata` ou `fase_liga`) + `status =
'ativo'`, opera sobre as partidas de CHAVE (com `posicao`) usando a
rodada-base derivada (menor `rodada` entre elas — a chave dos formatos de
grupos começa após as rodadas de grupos): valida que TODAS as partidas da fase
atual (a maior `rodada` de chave existente) estão `encerrada` e insere a fase
seguinte em lote único. Quando a fase atual é a semifinal e o torneio tem
`terceiro_lugar`, a final (posição 1) e a disputa de 3º lugar (posição 2, com
os perdedores) SHALL ser geradas juntas — o 3º lugar SOMENTE quando ambos os
confrontos da semifinal tiveram perdedor real. Quando a fase atual é a final,
NÃO há o que avançar. Final e 3º lugar SHALL ser jogo único mesmo com
`ida_e_volta = true`. Nos formatos de grupos, `avancarFase` NÃO SHALL operar
antes de a chave existir (a geração inicial é da capability
`group-stage-format`).

#### Scenario: Fase completa avança
- **WHEN** o dono aciona Avançar fase com todas as partidas da fase atual encerradas
- **THEN** a fase seguinte nasce com os vencedores pareados por slot

#### Scenario: Avanço funciona com chave em rodadas contínuas
- **WHEN** a chave de um torneio de grupos começa na rodada R+1 (após R rodadas de grupos)
- **THEN** o avanço identifica fases e geometria pela rodada-base, idêntico ao mata-mata puro

#### Scenario: Fase incompleta não avança
- **WHEN** há partida da fase atual não-encerrada (incluindo perna pendente)
- **THEN** a action rejeita com mensagem clara e nada é inserido

#### Scenario: Semifinal gera final e 3º lugar
- **WHEN** o torneio tem `terceiro_lugar = true` e as duas semifinais encerram com perdedores reais
- **THEN** o avanço insere a final e a disputa de 3º lugar com os perdedores das semifinais

#### Scenario: Semifinal com bye não gera 3º lugar
- **WHEN** uma das semifinais é bye (N = 3) e o torneio pede 3º lugar
- **THEN** apenas a final é gerada

#### Scenario: Avanço duplicado é barrado
- **WHEN** o dono aciona Avançar fase duas vezes (clique duplo ou corrida)
- **THEN** o segundo lote falha no índice único e a action responde "fase já avançada"

#### Scenario: Torneio com final encerrada tem campeão
- **WHEN** a final está encerrada
- **THEN** a página exibe o campeão e Avançar fase não é oferecido

#### Scenario: Grupos sem chave gerada não avançam
- **WHEN** `avancarFase` é acionada num torneio de grupos cuja chave ainda não foi gerada
- **THEN** a action rejeita orientando a gerar o mata-mata primeiro
