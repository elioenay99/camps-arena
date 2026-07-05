## ADDED Requirements

### Requirement: Forma recente (últimos 5) por participante
O sistema SHALL derivar, sem pedir nenhum dado novo, a FORMA de cada participante:
a sequência CRONOLÓGICA dos seus resultados (Vitória/Empate/Derrota) nos jogos
ENCERRADOS, dos quais a interface exibe os ÚLTIMOS 5. A ordem cronológica SHALL
seguir `rodada` ascendente e, dentro da mesma rodada, `created_at` e `id` da
partida (a mesma ordem de disputa usada nas listas de partidas). O resultado de
cada jogo SHALL espelhar EXATAMENTE a creditação do motor: W.O. conta como
Vitória para o vencedor e Derrota para o perdedor; duplo W.O. conta como Derrota
para os dois. Cada badge de forma SHALL ter um rótulo acessível legível (não
apenas cor) — por exemplo "Vitória", "Empate", "Derrota".

#### Scenario: Sequência cronológica dos últimos jogos
- **WHEN** um participante venceu, empatou e perdeu nesta ordem de rodadas
- **THEN** a forma mostra V, E, D nessa ordem (mais antigo à esquerda, recente à direita)

#### Scenario: Menos de cinco jogos mostra o que houver
- **WHEN** um participante encerrou apenas 3 jogos
- **THEN** a forma mostra 3 badges (nunca inventa jogos inexistentes)

#### Scenario: W.O. na forma segue a creditação do motor
- **WHEN** um participante venceu por W.O. e o outro foi o ausente
- **THEN** o vencedor recebe um V e o ausente um D na forma (ambos marcados como W.O.)

#### Scenario: Participante sem jogos encerrados
- **WHEN** um participante ainda não encerrou nenhum jogo
- **THEN** a forma dele é vazia (a interface trata como sem histórico)

### Requirement: Destaques automáticos do torneio/divisão
O sistema SHALL derivar destaques automáticos de uma competição de pontos
corridos, sem input novo: melhor ataque (maior total de gols pró da
classificação), melhor defesa (menor total de gols contra), maior goleada (maior
diferença absoluta de placar numa única partida), maiores sequências de
invencibilidade, de vitórias consecutivas e de clean sheets (jogos sem sofrer
gol), e a média de gols por jogo. Melhor ataque e melhor defesa SHALL usar os
totais de gols pró/contra da TABELA como já exibidos ao usuário — que INCLUEM os
0 gols creditados em W.O.; a distorção de "W.O.-farming" (vencer por W.O. não
infla nem penaliza o ataque/defesa) é ACEITA. A maior goleada, a sequência de
clean sheets e a média de gols SHALL EXCLUIR partidas de W.O. e duplo W.O. (0x0
sem jogo real); um empate 0x0 REAL SHALL contar como clean sheet (para os dois
lados). As sequências de invencibilidade e de vitórias SHALL usar o resultado
creditado (portanto W.O. a favor conta). Quando não há jogos encerrados
elegíveis, os destaques SHALL ser neutros (sem recordista; média igual a zero).

#### Scenario: Melhor ataque e melhor defesa
- **WHEN** um participante tem o maior total de gols pró e outro o menor total de gols contra
- **THEN** os destaques apontam o primeiro como melhor ataque e o segundo como melhor defesa

#### Scenario: Maior goleada ignora W.O.
- **WHEN** o maior placar por diferença numa partida jogada é 4x0 e existe uma vitória por W.O. (0x0)
- **THEN** a maior goleada é o 4x0 (a partida de W.O. não é considerada goleada)

#### Scenario: Sequência de vitórias interrompida por empate
- **WHEN** um participante vence 3 jogos seguidos, empata e vence de novo
- **THEN** a maior sequência de vitórias registrada é 3

#### Scenario: Média de gols por jogo exclui W.O.
- **WHEN** há jogos jogados com gols e um W.O. 0x0
- **THEN** a média divide o total de gols apenas pelos jogos jogados (o W.O. não entra no numerador nem no denominador)

#### Scenario: Empate 0x0 real estende a sequência de clean sheets, W.O. não
- **WHEN** um participante faz dois 0x0 reais seguidos e depois vence um jogo por W.O.
- **THEN** a maior sequência de clean sheets dele é 2 (os 0x0 reais contam; a vitória por W.O. quebra a sequência)

#### Scenario: Competição sem jogos encerrados
- **WHEN** nenhuma partida elegível foi encerrada
- **THEN** não há recordistas e a média de gols por jogo é zero

### Requirement: Painel de confronto direto histórico entre dois competidores
O sistema SHALL expor, para dois competidores da mesma competição, o histórico de
confronto direto entre eles derivado das partidas encerradas: a lista cronológica
dos jogos (placar, rodada e resultado) e o agregado de Vitórias/Empates/Derrotas
de cada lado, dos duplos W.O. e dos gols pró/contra no confronto. Um competidor
tem UM slot por temporada, então o painel SHALL unificar todos os slots de cada
lado num identificador canônico do competidor ANTES de casar os jogos (sem essa
unificação, competidores que se enfrentaram em temporadas diferentes casariam
zero jogos). O resultado de cada jogo SHALL respeitar a creditação de W.O.; o
duplo W.O. NÃO SHALL contar como vitória de nenhum dos lados — SHALL ser
contabilizado à parte (`duplo W.O.`), preservando as invariantes: total de jogos
= vitórias de A + vitórias de B + empates + duplos W.O.; derrotas de A = vitórias
de B + duplos W.O.; derrotas de B = vitórias de A + duplos W.O. Quando os dois
nunca se enfrentaram, o painel SHALL indicar ausência de histórico (lista vazia,
agregados zerados). A seleção do rival é a única parte interativa (client) do
painel — ao escolher um rival, o cliente SHALL buscar o confronto sob demanda via
uma server action de LEITURA (sem lista de links prefetcháveis nem navegação que
re-execute a rota), evitando a rajada de prefetch da classe do incidente 503.

#### Scenario: Histórico agregado entre dois
- **WHEN** dois competidores se enfrentaram três vezes (2 vitórias de A, 1 empate)
- **THEN** o painel lista os três jogos em ordem cronológica e mostra o agregado 2 vitórias de A, 1 empate, 0 de B

#### Scenario: Confronto entre temporadas diferentes casa os jogos
- **WHEN** A e B se enfrentaram numa temporada (com um par de slots) e de novo em outra temporada (com outro par de slots)
- **THEN** o painel casa os jogos das DUAS temporadas (a identidade do competidor é unificada além do slot)

#### Scenario: Duplo W.O. no confronto não vira vitória de ninguém
- **WHEN** o único confronto entre A e B foi um duplo W.O. (ambos ausentes)
- **THEN** o painel lista 1 jogo rotulado "W.O. duplo", com 0 vitórias de A, 0 empates, 0 de B, 1 duplo W.O. e gols zerados

#### Scenario: Sem confronto anterior
- **WHEN** dois competidores nunca se enfrentaram
- **THEN** o painel indica que não há histórico entre eles (sem jogos, agregados zerados)

### Requirement: Insights de carreira do competidor
O sistema SHALL expor, na página de um competidor persistente, a sua forma
recente e destaques de CARREIRA agregados por todas as competições/temporadas que
disputou: forma (últimos resultados), maior goleada dele, maiores sequências
(invencibilidade, vitórias, clean sheets), média de gols marcados por jogo e o
agregado de Vitórias/Empates/Derrotas e gols pró/contra. Os destaques de carreira
NÃO SHALL usar melhor ataque/defesa relativos (não há tabela de um só). Como a
carreira cruza competições — em que a rodada é numerada por competição —, a ordem
cronológica dos insights de carreira SHALL usar a DATA das partidas (não a
rodada). Os slots do competidor (um por temporada) SHALL ser unificados na
identidade canônica do competidor antes do cálculo.

#### Scenario: Carreira ordenada por data cruza temporadas
- **WHEN** o competidor jogou em duas temporadas diferentes (com slots distintos)
- **THEN** a forma de carreira ordena os jogos pela data (a rodada 1 de uma temporada posterior não é tratada como anterior à rodada final de uma temporada mais antiga)

#### Scenario: Destaques de carreira sem ataque/defesa relativos
- **WHEN** os destaques de carreira do competidor são exibidos
- **THEN** eles mostram as sequências, a maior goleada e a média de gols dele, sem "melhor ataque/defesa" (que só fazem sentido comparando participantes de uma mesma tabela)

### Requirement: Insights derivados sem input novo nem mudança de schema
O sistema SHALL computar forma, destaques e confronto direto exclusivamente a
partir das partidas já existentes (placar, status, W.O., rodada, data), sem pedir
nenhum dado adicional ao usuário e sem qualquer mudança de schema ou migração. Os
insights SHALL respeitar a visibilidade das partidas: quando o leitor só enxerga
rodadas liberadas, os insights SHALL refletir apenas essas partidas (nenhum
insight vaza rodada oculta).

#### Scenario: Nenhum dado novo é solicitado
- **WHEN** a aba de classificação e a página do competidor são exibidas
- **THEN** forma e destaques aparecem sem qualquer formulário ou input adicional

#### Scenario: Insights respeitam a rodada liberada
- **WHEN** um leitor não-dono só tem acesso às rodadas liberadas
- **THEN** a forma e os destaques dele consideram apenas as partidas liberadas (as ocultas não entram)
