# match-lifecycle — Delta Spec

## MODIFIED Requirements

### Requirement: Encerramento de partida pelo dono do torneio
O sistema SHALL permitir que SOMENTE o dono do torneio encerre uma partida (status → `encerrada`) via Server Action, com sessão válida e propriedade conferida no servidor (resposta única para partida inexistente/torneio alheio — sem oráculo). Partida já encerrada NÃO SHALL ser encerrada de novo. Em torneio `mata_mata`, o encerramento SHALL adicionalmente exigir resultado decisivo conforme a capability `knockout-format` (jogo único sem empate; volta com agregado desempatado e ida já encerrada).

#### Scenario: Dono encerra partida em aberto
- **WHEN** o dono do torneio aciona Encerrar numa partida não-encerrada
- **THEN** o status vira `encerrada`, a partida sai do dashboard de ativas e passa a pontuar na classificação

#### Scenario: Participante não encerra
- **WHEN** um participante (não-dono) tenta encerrar — pela UI (botão ausente) ou por POST direto
- **THEN** a action rejeita e, em última instância, o trigger do banco bloqueia a mudança de status

#### Scenario: Sem sessão é rejeitado
- **WHEN** a action é invocada sem usuário autenticado
- **THEN** retorna erro e nada muda no banco

#### Scenario: Empate em mata-mata não encerra
- **WHEN** o encerramento é tentado num jogo decisivo de mata-mata sem vencedor (placar igual em jogo único; agregado igual na volta)
- **THEN** a action rejeita com mensagem clara e o trigger bloqueia o POST direto

### Requirement: Reabertura de partida pelo dono
O sistema SHALL permitir que o dono do torneio reabra uma partida `encerrada` (status → `em_andamento`) para correção de placar. Reabrir partida não-encerrada NÃO SHALL ser permitido. Em torneio `encerrado`, encerrar e reabrir NÃO SHALL ser permitidos (a partida reaberta ficaria invisível e ineditável — beco sem saída). Em torneio `mata_mata`, reabrir SHALL ser adicionalmente bloqueado quando a fase seguinte já foi gerada, e partida-bye NÃO SHALL ser reaberta (capability `knockout-format`).

#### Scenario: Dono reabre para corrigir
- **WHEN** o dono aciona Reabrir numa partida encerrada de torneio não-encerrado
- **THEN** o status volta a `em_andamento`, a partida sai da classificação/histórico e volta ao dashboard de ativas

#### Scenario: Transição inválida rejeitada
- **WHEN** a reabertura é tentada numa partida que não está encerrada
- **THEN** a action rejeita sem tocar o banco

#### Scenario: Torneio encerrado congela o lifecycle
- **WHEN** encerrar ou reabrir é tentado numa partida de torneio com status `encerrado`
- **THEN** a action rejeita com a resposta única de propriedade e os botões não aparecem na página

#### Scenario: Fase avançada congela as anteriores no mata-mata
- **WHEN** a reabertura é tentada numa partida de mata-mata com fase posterior já gerada
- **THEN** a action rejeita com mensagem clara e o trigger bloqueia o POST direto
