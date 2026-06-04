## MODIFIED Requirements

### Requirement: Escrita restrita ao dono da partida
O sistema SHALL permitir UPDATE em uma partida para o usuário autenticado que é um dos participantes daquela partida OU para o dono do torneio da partida. Um trigger SHALL garantir que (a) a coluna `status` só mude quando o autor é o dono do torneio (`service_role` isento) e (b) o placar de partida `encerrada` não mude para nenhum papel, exceto `service_role`.

#### Scenario: Participante atualiza placar
- **WHEN** um participante autenticado da partida envia um UPDATE de placar em partida não-encerrada
- **THEN** a atualização é aceita

#### Scenario: Terceiro tenta atualizar
- **WHEN** um usuário que não participa da partida nem é dono do torneio tenta o UPDATE
- **THEN** a política RLS rejeita a operação

#### Scenario: Participante tenta mudar status por POST direto
- **WHEN** um participante (não-dono do torneio) envia UPDATE alterando `status`
- **THEN** o trigger bloqueia a operação

#### Scenario: Dono do torneio encerra e reabre
- **WHEN** o dono do torneio envia UPDATE de `status` numa partida do seu torneio
- **THEN** a operação é aceita pela policy e pelo trigger

#### Scenario: Placar de encerrada bloqueado no banco
- **WHEN** qualquer usuário (exceto `service_role`) tenta alterar placar de partida encerrada
- **THEN** o trigger bloqueia a operação
