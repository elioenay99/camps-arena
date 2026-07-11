# wo-discipline Specification

## Purpose
TBD - created by archiving change add-contador-wo-tecnico. Update Purpose after archive.
## Requirements
### Requirement: Escada disciplinar de W.O. seguidos por técnico
O sistema SHALL computar, por competição (torneio) e por técnico (conta `user_id`),
o número de W.O.-derrota SEGUIDOS (streak consecutivo, NÃO acumulado) a partir das
partidas encerradas atribuídas ao técnico pela janela de `coach_tenures` (predicado
meio-aberto `(rodada_inicio is null or rodada >= rodada_inicio) and (rodada_fim is
null or rodada < rodada_fim)`, idêntico a `partidaNaJanela`). A regra SHALL residir
num módulo puro em TypeScript (`calcularStreakWo`) como fonte única da verdade,
exposto com o limiar `LIMITE_WO_SEGUIDOS = 3`. A classificação de cada partida
encerrada SHALL ser:
- `wo_loss` (ausente) quando `wo=true` e (`wo_duplo=true` OU (`wo_duplo=false` e
  `wo_vencedor` é a vaga OPOSTA à do técnico));
- `wo_win` (presente) quando `wo=true`, `wo_duplo=false` e `wo_vencedor` é a vaga DELE;
- `jogou` (presente) quando `wo=false`.
Um técnico sem conta (`user_id` nulo) ou vaga órfã NÃO SHALL ter streak.

#### Scenario: W.O.-derrota consecutivos somam
- **WHEN** o técnico sofre W.O.-derrota em rodadas consecutivas sem estar presente entre elas
- **THEN** o streak cresce em 1 a cada W.O.-derrota não-perdoado

#### Scenario: Duplo W.O. conta para os dois ausentes
- **WHEN** uma partida termina em duplo W.O. (ambos os técnicos ausentes)
- **THEN** ela conta como W.O.-derrota (`wo_loss`) no streak de AMBOS os técnicos

### Requirement: Perdão automático até o limite; trava a partir de 3
O sistema SHALL zerar automaticamente o streak quando o técnico está PRESENTE
(`jogou` OU `wo_win`) E o streak corrente é menor que `LIMITE_WO_SEGUIDOS`. A partir
de streak igual ou maior que `LIMITE_WO_SEGUIDOS`, estar presente NÃO SHALL mais
zerar o streak (o perdão automático TRAVA); só uma ação explícita do ADM resolve. Um
W.O.-derrota marcado como perdoado (baseline) SHALL zerar o streak naquele ponto.

#### Scenario: Streak 1 ou 2 e o técnico joga
- **WHEN** o técnico tem streak 1 ou 2 e disputa uma partida de verdade (ou vence por W.O.)
- **THEN** o streak é zerado automaticamente (perdão automático)

#### Scenario: Streak 3 e o técnico volta a jogar
- **WHEN** o técnico tem streak 3 (ou mais) e depois está presente numa partida
- **THEN** o streak NÃO é zerado — permanece travado até uma ação do ADM

#### Scenario: W.O.-vitória não é neutro
- **WHEN** o técnico vence por W.O. (o adversário faltou) com streak menor que o limite
- **THEN** ele é tratado como PRESENTE e o streak é zerado (não fica inalterado)

### Requirement: Ações disciplinares do ADM (perdoar e expulsar)
O sistema SHALL oferecer a quem `pode_gerir_torneio` (dono + admins de torneio/liga),
para técnicos com streak igual ou maior que `LIMITE_WO_SEGUIDOS`, duas ações: PERDOAR
(materializa o perdão dos W.O.-derrota atuais do técnico, zerando a contagem sem tocar
`matches`/standings) e EXPULSAR (remove o técnico da vaga via a RPC dedicada
`expulsar_tecnico_wo`, gated por `pode_gerir_torneio`). AMBAS as ações SHALL ser
liberadas ao mesmo gate `podeGerir` — a expulsão disciplinar NÃO SHALL ser dono-only
(a `expulsarTecnico` dono-only original permanece intacta para outros fluxos). O
PERDÃO SHALL ser idempotente e persistido como baseline auditável em `wo_perdoes`. A
EXPULSÃO SHALL apenas esvaziar a vaga; o próximo técnico que assumir SHALL começar do
zero (nova tenure, streak 0). Para streak abaixo do limite, a UI SHALL exibir apenas
a contagem, sem ações (o auto-perdão cuida). O feedback de sucesso do perdão SHALL
declarar apenas que a contagem foi zerada, sem expor o número de perdões
materializados.

#### Scenario: ADM perdoa um técnico reincidente
- **WHEN** o gestor aciona "Perdoar" para um técnico com streak igual ou maior que o limite
- **THEN** os W.O.-derrota atuais dele viram perdões persistidos, o streak zera, e nenhum resultado ou classificação é alterado

#### Scenario: Gestor não-dono expulsa um técnico reincidente
- **WHEN** um admin de torneio/liga que NÃO é o dono aciona "Expulsar" para um técnico com streak igual ou maior que o limite
- **THEN** a RPC `expulsar_tecnico_wo` (gated por `pode_gerir_torneio`) esvazia a vaga, a tenure é fechada e o próximo técnico começa com streak 0

#### Scenario: Streak abaixo do limite não oferece ações
- **WHEN** um técnico tem streak 1 ou 2
- **THEN** a UI mostra só a contagem, sem botões de perdoar/expulsar

### Requirement: Leitura disciplinar restrita ao gestor
O sistema SHALL restringir a leitura da sequência disciplinar
(`sequencia_disciplina_torneio`) e a materialização do perdão
(`perdoar_wo_tecnico`) a quem `pode_gerir_torneio`, via gate INTERNO nas funções
`SECURITY DEFINER` (que levanta `NAO_AUTORIZADO`). A seção de UI SHALL aparecer só
na área de administração do torneio (gate `podeGerir`). Um usuário anônimo ou
autenticado não-gestor NÃO SHALL obter a sequência nem perdoar.

#### Scenario: Não-gestor é barrado
- **WHEN** um usuário autenticado que não gere o torneio chama a sequência disciplinar ou o perdão
- **THEN** a função levanta `NAO_AUTORIZADO` e nada é lido nem escrito

