## ADDED Requirements

### Requirement: Adiar partida em liga ou fase de grupos
Quem tem capacidade de ARBITRAR o torneio (dono, admin ou árbitro) SHALL poder ADIAR uma partida ABERTA (não `encerrada`) de liga ou fase de grupos, com um motivo em texto livre OPCIONAL. Ao adiar, a partida SHALL passar para o status `adiada`, registrando `adiada_em` (timestamp) e `adiada_por` (quem adiou); o motivo, quando informado, SHALL ser gravado em `adiamento_motivo`. Uma partida `adiada` NÃO SHALL contar como resultado (não pontua na classificação) até ser resolvida normalmente.

#### Scenario: Adiar com motivo
- **WHEN** quem arbitra adia uma partida aberta de liga informando um motivo
- **THEN** a partida vira `adiada`, o motivo fica registrado e ela some da classificação até ser resolvida

#### Scenario: Adiar sem motivo
- **WHEN** quem arbitra adia uma partida sem preencher o motivo
- **THEN** a operação é aceita normalmente, com `adiamento_motivo` nulo

#### Scenario: Só quem arbitra adia
- **WHEN** alguém sem capacidade de arbitrar o torneio tenta adiar uma partida
- **THEN** a operação é negada

#### Scenario: Partida já encerrada não adia
- **WHEN** quem arbitra tenta adiar uma partida já `encerrada`
- **THEN** a operação é negada (corrigir = reabrir, depois decidir normalmente)

### Requirement: Chave não adia
Partidas de CHAVE (`posicao` não nula — mata-mata, incluindo a chave de formatos com fase de grupos) NÃO SHALL poder ser adiadas: o motor de avanço de fase depende de partidas de chave chegarem a `encerrada` para parear a fase seguinte, e o adiamento quebraria essa dependência estrutural. A restrição SHALL valer tanto na ação quanto no banco (backstop contra POST direto à função que adia).

#### Scenario: Botão ausente em chave
- **WHEN** quem arbitra abre uma partida de mata-mata
- **THEN** não há opção de adiar disponível

#### Scenario: Tentativa direta é recusada
- **WHEN** uma chamada tenta adiar uma partida com `posicao` não nula, contornando a UI
- **THEN** a operação é recusada com mensagem clara

### Requirement: Adiar cancela propostas e solicitações pendentes
Ao adiar uma partida, o sistema SHALL cancelar automaticamente qualquer proposta de placar (`match_score_proposals`) e qualquer solicitação de W.O. (`match_wo_requests`) que estejam `pendente` para aquela partida — evitando que uma pendência anterior ao adiamento seja aprovada depois com um resultado desatualizado. O cancelamento e a mudança de status da partida SHALL ser atômicos (mesma transação). Pendências de OUTRAS partidas NÃO SHALL ser afetadas.

#### Scenario: Proposta pendente é cancelada ao adiar
- **WHEN** uma partida tem uma proposta de placar pendente e é adiada
- **THEN** a proposta passa a `rejeitada` e a partida vira `adiada` na mesma operação

#### Scenario: Solicitação de W.O. pendente é cancelada ao adiar
- **WHEN** uma partida tem uma solicitação de W.O. pendente e é adiada
- **THEN** a solicitação passa a `recusado` e a partida vira `adiada` na mesma operação

#### Scenario: Falha em qualquer etapa não deixa estado parcial
- **WHEN** a operação de adiar falha em qualquer ponto (autorização, estado da partida)
- **THEN** nem o status da partida nem as pendências são alterados

### Requirement: Reverter o adiamento
Quem tem capacidade de ARBITRAR o torneio SHALL poder REVERTER o adiamento de uma partida `adiada` a qualquer momento, por um botão dedicado, voltando-a ao estado aberto normal (sem placar) e limpando `adiada_em`, `adiada_por` e `adiamento_motivo`. Reverter NÃO SHALL afetar propostas ou solicitações criadas DEPOIS do adiamento (enquanto a partida já estava aberta de novo para resolução normal) — só desfaz o próprio adiamento.

#### Scenario: Reverter volta ao estado aberto
- **WHEN** quem arbitra desfaz o adiamento de uma partida `adiada`
- **THEN** ela volta a aberta sem placar, e os campos de adiamento ficam nulos

#### Scenario: Reverter só funciona numa partida adiada
- **WHEN** alguém tenta desfazer o adiamento de uma partida que não está `adiada`
- **THEN** a operação é negada

### Requirement: Retomada normal de uma partida adiada
Uma partida `adiada` SHALL poder ser resolvida como QUALQUER partida aberta — placar direto, proposta de placar (com aprovação) ou W.O. (simples ou duplo, fora de chave) — sem exigir reverter o adiamento antes. Ao ser resolvida, ela sai de `adiada` diretamente para `encerrada` e passa a contar normalmente na classificação.

#### Scenario: Placar resolve uma partida adiada
- **WHEN** o dono edita o placar de uma partida `adiada`
- **THEN** ela encerra normalmente com o placar informado e passa a pontuar

#### Scenario: W.O. resolve uma partida adiada
- **WHEN** quem arbitra marca W.O. numa partida `adiada`
- **THEN** ela encerra como W.O. normalmente, igual a qualquer partida aberta

### Requirement: Notificar técnicos ao adiar
Depois que uma partida é adiada com sucesso, o sistema SHALL notificar (push, melhor esforço) os DOIS técnicos do confronto, excluindo quem executou a ação — mesmo padrão já usado por outras ações que resolvem ou cancelam uma pendência de um técnico (ex.: `responderWO` notifica os dois mesmo ao recusar um pedido de W.O.). Falha no envio da notificação NÃO SHALL impedir nem reverter o adiamento em si (best-effort).

#### Scenario: Os dois técnicos são notificados
- **WHEN** quem arbitra adia uma partida com os dois lados tendo técnico
- **THEN** ambos recebem uma notificação informando que a partida foi adiada (com o motivo, se houver)

#### Scenario: Quem adiou não recebe a própria notificação
- **WHEN** o próprio técnico de um dos lados (com capacidade de arbitrar) adia a partida
- **THEN** ele não recebe notificação da própria ação; o técnico do outro lado recebe

#### Scenario: Falha no envio não derruba o adiamento
- **WHEN** o envio da notificação falha por qualquer motivo
- **THEN** a partida permanece adiada normalmente (a falha é absorvida, best-effort)

### Requirement: Partida adiada fora do compartilhamento de rodada no WhatsApp
A mensagem de "Compartilhar rodada no WhatsApp" SHALL excluir partidas `adiada` da lista de confrontos — elas não devem aparecer convocando os técnicos a combinar um jogo que já foi adiado administrativamente (a pendência já é sinalizada por outro canal, a pílula de status). As demais superfícies que listam partidas em aberto (ex.: o console do dono) NÃO SHALL ser afetadas por esta exclusão — o filtro é específico da mensagem de WhatsApp.

#### Scenario: Partida adiada não aparece no compartilhamento de rodada no WhatsApp
- **WHEN** o dono compartilha uma rodada que tem uma partida `adiada` no WhatsApp
- **THEN** a mensagem gerada NÃO inclui essa partida (as demais partidas da rodada aparecem normalmente)

#### Scenario: Console do dono continua listando a partida adiada
- **WHEN** o dono abre o console de partidas em aberto do torneio
- **THEN** a partida `adiada` continua aparecendo ali (a exclusão vale só para a mensagem de WhatsApp)

### Requirement: Indicação visual da partida adiada
A partida `adiada` SHALL exibir uma pílula de status distinta de "Aberta" e "Encerrada" (rótulo "adiada", cor neutra/amarela). Quando houver motivo registrado, ele SHALL ficar visível a quem arbitra (ex.: tooltip ou texto auxiliar junto ao status).

#### Scenario: Pílula distinta
- **WHEN** uma partida está `adiada`
- **THEN** sua pílula de status mostra "adiada" com cor diferente das demais

#### Scenario: Motivo visível a quem arbitra
- **WHEN** uma partida adiada tem motivo registrado
- **THEN** quem arbitra o torneio consegue ver o motivo perto do status
