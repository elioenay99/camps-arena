## ADDED Requirements

### Requirement: Encerramento de partida pelo dono do torneio
O sistema SHALL permitir que SOMENTE o dono do torneio encerre uma partida (status → `encerrada`) via Server Action, com sessão válida e propriedade conferida no servidor (resposta única para partida inexistente/torneio alheio — sem oráculo). Partida já encerrada NÃO SHALL ser encerrada de novo.

#### Scenario: Dono encerra partida em aberto
- **WHEN** o dono do torneio aciona Encerrar numa partida não-encerrada
- **THEN** o status vira `encerrada`, a partida sai do dashboard de ativas e passa a pontuar na classificação

#### Scenario: Participante não encerra
- **WHEN** um participante (não-dono) tenta encerrar — pela UI (botão ausente) ou por POST direto
- **THEN** a action rejeita e, em última instância, o trigger do banco bloqueia a mudança de status

#### Scenario: Sem sessão é rejeitado
- **WHEN** a action é invocada sem usuário autenticado
- **THEN** retorna erro e nada muda no banco

### Requirement: Reabertura de partida pelo dono
O sistema SHALL permitir que o dono do torneio reabra uma partida `encerrada` (status → `em_andamento`) para correção de placar. Reabrir partida não-encerrada NÃO SHALL ser permitido. Em torneio `encerrado`, encerrar e reabrir NÃO SHALL ser permitidos (a partida reaberta ficaria invisível e ineditável — beco sem saída).

#### Scenario: Dono reabre para corrigir
- **WHEN** o dono aciona Reabrir numa partida encerrada de torneio não-encerrado
- **THEN** o status volta a `em_andamento`, a partida sai da classificação/histórico e volta ao dashboard de ativas

#### Scenario: Transição inválida rejeitada
- **WHEN** a reabertura é tentada numa partida que não está encerrada
- **THEN** a action rejeita sem tocar o banco

#### Scenario: Torneio encerrado congela o lifecycle
- **WHEN** encerrar ou reabrir é tentado numa partida de torneio com status `encerrado`
- **THEN** a action rejeita com a resposta única de propriedade e os botões não aparecem na página

### Requirement: Placar e clube imutáveis em partida encerrada
O sistema NÃO SHALL aceitar alteração de placar NEM de clube (`time_1`/`time_2`) em partida `encerrada` — nem pelo participante, nem pelo dono (o fluxo de correção é reabrir → corrigir → re-encerrar). O clube alimenta a classificação de clubes, logo em encerrada é tão imutável quanto o placar. A regra SHALL valer nas Server Actions (mensagem precisa) e no banco (trigger, contra POST direto).

#### Scenario: Placar em encerrada é rejeitado com mensagem clara
- **WHEN** um participante tenta salvar placar numa partida encerrada
- **THEN** a action retorna que a partida está encerrada, sem UPDATE

#### Scenario: Clube em encerrada é rejeitado
- **WHEN** um participante tenta trocar o clube de uma partida encerrada
- **THEN** a action rejeita e o trigger bloqueia o POST direto

### Requirement: Console do dono na página do torneio
A página do torneio SHALL listar as partidas em aberto (não-encerradas) e, PARA O DONO, exibir o botão Encerrar nelas e o botão Reabrir nas partidas do histórico. Para quem não é o dono, os botões NÃO SHALL aparecer (a autorização real permanece no servidor/RLS).

#### Scenario: Dono vê os controles
- **WHEN** o dono do torneio abre a página do torneio
- **THEN** vê Encerrar nas partidas em aberto e Reabrir nas encerradas

#### Scenario: Visitante/participante não vê controles
- **WHEN** quem não é dono abre a página
- **THEN** vê as listas sem botões de transição
