# match-walkover — Delta Spec

## ADDED Requirements

### Requirement: Representação do W.O.
Uma partida resolvida por W.O. SHALL ser uma partida `encerrada` marcada com
`wo = true`, placar `0 x 0` e um `wo_vencedor` explícito (o slot vencedor,
sempre um dos lados da partida). O W.O. NÃO SHALL usar um status novo (preserva
o lifecycle/RLS). O banco SHALL impor a coerência: `wo` verdadeiro exige
`wo_vencedor` não-nulo, placar `0x0` e vencedor entre os lados; fora de W.O.,
`wo_vencedor` é nulo.

#### Scenario: W.O. é encerramento com vencedor explícito
- **WHEN** uma partida é resolvida por W.O.
- **THEN** ela aparece como encerrada, placar 0x0, marcada "W.O." e com o
  clube vencedor definido

### Requirement: Efeito do W.O. na classificação
Na classificação por pontos o W.O. SHALL conceder ao vencedor os pontos de
VITÓRIA do torneio e ao perdedor os de DERROTA, e NÃO SHALL contar gols pró,
gols contra nem saldo (zero gols). No critério de confronto direto o W.O. SHALL
contar como vitória/derrota (nunca empate pelo placar 0x0).

#### Scenario: Pontos sem gols
- **WHEN** um clube vence por W.O. num torneio 3/1/0
- **THEN** soma 3 pontos e 1 vitória, sem alterar seu saldo de gols

#### Scenario: Confronto direto por W.O.
- **WHEN** dois clubes empatados nos critérios objetivos se enfrentaram e o
  jogo foi W.O.
- **THEN** o desempate por confronto direto credita a vitória ao vencedor do
  W.O. (não trata como empate)

### Requirement: W.O. decide o confronto na chave
Em formato com chave o W.O. SHALL decidir o confronto INTEIRO: em jogo único, o
`wo_vencedor` avança; em ida-e-volta, um W.O. em qualquer perna decide o
confronto sem exigir a outra perna nem o agregado. O 3º lugar SHALL tratar o
perdedor por W.O. como perdedor de semifinal normal.

#### Scenario: W.O. avança na chave
- **WHEN** uma partida de chave é resolvida por W.O.
- **THEN** o vencedor avança para a próxima fase como em qualquer decisão

#### Scenario: W.O. na ida decide o confronto
- **WHEN** a perna de ida de um confronto ida-e-volta é W.O.
- **THEN** o confronto está decidido (a volta não precisa acontecer)

### Requirement: Adm marca W.O. direto
O dono SHALL poder marcar W.O. numa partida ABERTA do torneio ATIVO, apontando
o clube vencedor (entre os dois lados). A marcação SHALL ser negada em partida
já encerrada, em torneio encerrado, ou por quem não é o dono.

#### Scenario: Adm marca W.O. por não-comparecimento
- **WHEN** o dono marca W.O. numa partida aberta indicando o vencedor
- **THEN** a partida encerra como W.O. com o vencedor apontado

#### Scenario: W.O. só em partida aberta
- **WHEN** alguém tenta marcar W.O. numa partida já encerrada
- **THEN** a operação é negada (corrigir = reabrir, depois marcar)

### Requirement: Solicitação de W.O. pelo adversário
O TÉCNICO de um lado de uma partida ABERTA SHALL poder SOLICITAR um W.O. (o
vencedor pretendido é o próprio clube); o DONO SHALL aceitar (encerra a
partida como W.O. a favor do solicitante) ou recusar. SHALL haver no máximo uma
solicitação pendente por partida. O solicitante SHALL ver a própria
solicitação; o dono SHALL ver as solicitações pendentes do seu torneio.

#### Scenario: Adversário solicita e dono aceita
- **WHEN** o técnico solicita W.O. e o dono aceita
- **THEN** a partida vira W.O. com vitória do solicitante e a solicitação fica
  "aceita"

#### Scenario: Dono recusa a solicitação
- **WHEN** o dono recusa a solicitação
- **THEN** a partida permanece aberta e a solicitação fica "recusada"

#### Scenario: Uma solicitação viva por partida
- **WHEN** já existe uma solicitação pendente para a partida
- **THEN** uma segunda solicitação é recusada

### Requirement: Reabrir limpa o W.O.
Reabrir uma partida W.O. SHALL voltá-la a aberta limpando `wo` e `wo_vencedor`
(o placar 0x0 é descartável). As travas de chave (fase seguinte congela as
anteriores) SHALL continuar valendo.

#### Scenario: Reabrir um W.O.
- **WHEN** o dono reabre uma partida que estava como W.O.
- **THEN** ela volta a aberta, sem marca de W.O. e sem vencedor
