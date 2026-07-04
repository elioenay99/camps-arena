# match-walkover Specification

## Purpose
TBD - created by archiving change add-rounds-walkover. Update Purpose after archive.
## Requirements
### Requirement: Representação do W.O.
Uma partida resolvida por W.O. SHALL ser uma partida `encerrada` marcada com `wo = true` e placar `0 x 0`, em UMA de duas formas mutuamente exclusivas: **W.O. simples** (um lado ausente) com `wo_duplo = false` e um `wo_vencedor` explícito (o slot vencedor, sempre um dos lados); ou **duplo W.O.** (ambos ausentes) com `wo_duplo = true` e `wo_vencedor` nulo. O W.O. NÃO SHALL usar um status novo (preserva o lifecycle/RLS). O banco SHALL impor a coerência por CHECK `matches_wo_coerente`: fora de W.O. (`wo = false`), `wo_vencedor` é nulo e `wo_duplo` é falso; no W.O. simples, `wo_vencedor` não-nulo entre os lados (`vaga_1`/`vaga_2`) e `wo_duplo` falso; no duplo, `wo_vencedor` nulo, `wo_duplo` verdadeiro, a partida NÃO é de chave (`posicao` nula) e ambos os lados presentes (`vaga_1`/`vaga_2` não nulos).

#### Scenario: W.O. simples é encerramento com vencedor explícito
- **WHEN** uma partida é resolvida por W.O. simples (um lado ausente)
- **THEN** ela aparece como encerrada, placar 0x0, marcada "W.O.", `wo_duplo` falso e com o clube vencedor definido

#### Scenario: Duplo W.O. é encerramento sem vencedor
- **WHEN** uma partida é resolvida por duplo W.O. (ambos ausentes)
- **THEN** ela aparece como encerrada, placar 0x0, marcada "W.O.", `wo_duplo` verdadeiro e sem vencedor (`wo_vencedor` nulo)

#### Scenario: Duplo com vencedor é incoerente
- **WHEN** uma escrita tenta gravar `wo_duplo = true` com `wo_vencedor` não-nulo (ou numa partida de chave)
- **THEN** a CHECK `matches_wo_coerente` rejeita a operação

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
Reabrir uma partida W.O. SHALL voltá-la a aberta limpando `wo`, `wo_vencedor` E `wo_duplo` (o placar 0x0 é descartável), tanto no W.O. simples quanto no duplo. As travas de chave (fase seguinte congela as anteriores) SHALL continuar valendo.

#### Scenario: Reabrir um W.O. simples
- **WHEN** o dono reabre uma partida que estava como W.O. simples
- **THEN** ela volta a aberta, sem marca de W.O., sem vencedor e com `wo_duplo` falso

#### Scenario: Reabrir um duplo W.O.
- **WHEN** o dono reabre uma partida que estava como duplo W.O.
- **THEN** ela volta a aberta com `wo`, `wo_vencedor` e `wo_duplo` limpos

### Requirement: Foto opcional na solicitação de W.O.

A solicitação de W.O. feita pelo técnico (`solicitarWO`) SHALL aceitar uma **foto de evidência
OPCIONAL**, guardada no mesmo armazenamento privado das evidências (`match_evidence`) e servida pela
mesma rota autorizada. Para o W.O., a foto SHALL ser visível a quem **arbitra** OU ao **solicitante**
(a mesma visibilidade da própria solicitação de W.O.). Quando houver foto, o aprovador SHALL poder
vê-la ao responder; a ausência de foto NÃO SHALL impedir a solicitação (diferente do placar, onde a
foto é obrigatória). O upload SHALL ser validado na action (tipo/tamanho), como o placar.

#### Scenario: Solicitar W.O. com foto

- **WHEN** o técnico solicita W.O. anexando uma foto
- **THEN** a solicitação é criada com a foto, visível ao aprovador na hora de responder

#### Scenario: Solicitar W.O. sem foto continua válido

- **WHEN** o técnico solicita W.O. sem anexar foto
- **THEN** a solicitação é criada normalmente (a foto é opcional no W.O.)

### Requirement: Duplo W.O. (ambos ausentes)
A organização (capacidade ARBITRAR — dono, admin ou árbitro) SHALL poder declarar DUPLO W.O. numa partida ABERTA e JOGÁVEL (os dois lados presentes) de torneio ATIVO que NÃO seja de chave, encerrando-a com `wo = true`, `wo_duplo = true`, `wo_vencedor` nulo e placar `0 x 0`. A declaração SHALL ser NEGADA em partida de CHAVE (mata-mata: `posicao` não nula), com mensagem clara (a chave sempre exige um vencedor — usar W.O. a favor de um dos lados), tanto na Server Action quanto por CHECK no banco. NÃO SHALL existir caminho de "solicitar duplo" pelo técnico: o duplo é só declaração da organização (e o fechamento automático de rodada, na capability `round-management`). A declaração SHALL ser idempotente e negada em partida já encerrada (corrigir = reabrir antes).

#### Scenario: Organização declara duplo W.O.
- **WHEN** a organização declara duplo W.O. numa partida aberta e jogável de uma liga/grupos (fora de chave)
- **THEN** a partida encerra como `wo = true`, `wo_duplo = true`, sem vencedor, placar 0x0

#### Scenario: Duplo W.O. negado em partida de chave
- **WHEN** alguém tenta declarar duplo W.O. numa partida de mata-mata (`posicao` não nula)
- **THEN** a operação é negada com mensagem clara e nada é gravado (a chave exige um vencedor)

#### Scenario: Duplo só em partida aberta
- **WHEN** alguém tenta declarar duplo W.O. numa partida já encerrada
- **THEN** a operação é negada (corrigir = reabrir, depois declarar)

