# tournament-lifecycle Specification

## Purpose
TBD - created by archiving change add-tournament-closing. Update Purpose after archive.
## Requirements
### Requirement: Encerramento de torneio pelo dono
O sistema SHALL permitir que SOMENTE o dono encerre um torneio (status →
`encerrado`) via Server Action, com sessão válida e propriedade conferida por
FILTRO no servidor (torneio inexistente, alheio ou já encerrado recebem a
MESMA resposta — sem oráculo). Qualquer status diferente de `encerrado` SHALL
ser encerrável — encerrar um rascunho é o cancelamento de um torneio que não
começou. O encerramento SHALL ser permitido mesmo com partidas em aberto
(decisão de produto): elas ficam congeladas pelo lifecycle existente e fora da
classificação. A escrita SHALL ser confirmada (`select()` — corrida/RLS → 0
linhas → orientação de recarregar).

#### Scenario: Dono encerra torneio ativo
- **WHEN** o dono aciona Encerrar torneio e confirma
- **THEN** o status vira `encerrado`, as partidas dele somem do dashboard de ativas e convites/partidas novas passam a ser rejeitados pelos gates existentes

#### Scenario: Rascunho é cancelável
- **WHEN** o dono encerra um torneio em rascunho (liga/mata-mata que nunca iniciou)
- **THEN** o torneio vira `encerrado` normalmente

#### Scenario: Não-dono ou torneio já encerrado recebem resposta única
- **WHEN** a action é invocada por quem não é dono, em torneio inexistente ou já encerrado
- **THEN** retorna erro único sem revelar qual condição falhou, e nada é escrito

#### Scenario: Sem sessão é rejeitado
- **WHEN** a action é invocada sem usuário autenticado
- **THEN** retorna erro e nada muda no banco

### Requirement: Reabertura de torneio pelo dono
O sistema SHALL permitir que o dono reabra um torneio `encerrado` via Server
Action (mesmas garantias de sessão/propriedade/confirmação). O status de
retorno SHALL ser DERIVADO do estado: torneio de formato gerado
(`liga`/`mata_mata`) sem NENHUMA partida gerada (nenhuma com `rodada`) volta a
`rascunho` (a tabela/chave nunca foi gerada — reabrir como ativo criaria um
torneio ativo sem partidas e sem painel de Iniciar); nos demais casos volta a
`ativo`.

#### Scenario: Reabrir torneio com partidas geradas volta a ativo
- **WHEN** o dono reabre uma liga ou mata-mata cuja tabela/chave já foi gerada
- **THEN** o status volta a `ativo` e os consoles do dono (encerrar/reabrir partida, avançar fase) voltam a funcionar

#### Scenario: Reabrir formato gerado cancelado no rascunho volta a rascunho
- **WHEN** o dono reabre uma liga ou mata-mata encerrada SEM partidas geradas
- **THEN** o status volta a `rascunho` (painel de Iniciar e convites voltam a valer)

#### Scenario: Reabrir avulso volta a ativo
- **WHEN** o dono reabre um torneio avulso encerrado
- **THEN** o status volta a `ativo`

#### Scenario: Só torneio encerrado é reabrível
- **WHEN** a reabertura é tentada num torneio que não está encerrado
- **THEN** a action retorna a resposta única de propriedade e nada é escrito

### Requirement: Console de lifecycle na página do torneio
A página do torneio SHALL exibir, SOMENTE para o dono: "Encerrar torneio"
quando o status não é `encerrado`, com confirmação em DOIS cliques que avisa
quantas partidas em aberto serão congeladas (contagem derivada dos dados que a
página já tem — sem query extra); e "Reabrir torneio" quando o status é
`encerrado`. Para quem não é o dono, os controles NÃO SHALL aparecer (a
autorização real permanece na action + RLS).

#### Scenario: Encerrar exige confirmação com aviso
- **WHEN** o dono clica Encerrar torneio com 3 partidas em aberto
- **THEN** o botão pede confirmação explícita citando as 3 partidas que serão congeladas, e só o segundo clique executa

#### Scenario: Reabrir visível em torneio encerrado
- **WHEN** o dono abre a página de um torneio encerrado
- **THEN** vê o botão Reabrir torneio (único controle de ADMINISTRAÇÃO do torneio nesse estado — a gestão de participantes permanece liberada em encerrado, exceto mata-mata com chave gerada)

#### Scenario: Visitante e participante não veem o console
- **WHEN** quem não é dono abre a página em qualquer status
- **THEN** os botões de encerrar/reabrir torneio não são renderizados

