## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Reabrir limpa o W.O.
Reabrir uma partida W.O. SHALL voltá-la a aberta limpando `wo`, `wo_vencedor` E `wo_duplo` (o placar 0x0 é descartável), tanto no W.O. simples quanto no duplo. As travas de chave (fase seguinte congela as anteriores) SHALL continuar valendo.

#### Scenario: Reabrir um W.O. simples
- **WHEN** o dono reabre uma partida que estava como W.O. simples
- **THEN** ela volta a aberta, sem marca de W.O., sem vencedor e com `wo_duplo` falso

#### Scenario: Reabrir um duplo W.O.
- **WHEN** o dono reabre uma partida que estava como duplo W.O.
- **THEN** ela volta a aberta com `wo`, `wo_vencedor` e `wo_duplo` limpos
