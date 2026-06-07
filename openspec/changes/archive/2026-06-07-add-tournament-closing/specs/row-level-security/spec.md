# row-level-security — Delta Spec

## MODIFIED Requirements

### Requirement: Políticas de participants
O sistema SHALL permitir SELECT em `participants` quando o torneio
correspondente for visível ao solicitante; INSERT direto apenas para o DONO do
torneio inserindo a si mesmo (`user_id = auth.uid()`) — convidados entram
exclusivamente pela função `aceitar_convite`; DELETE para o próprio
participante (sair) ou para o dono do torneio (remover), EXCETO em torneio
`mata_mata` com a chave GERADA — `status = 'ativo'`, ou qualquer status com
partidas geradas (`rodada` não nula) — porque a chave em andamento depende de
cada participante e o torneio encerrado é reabrível (ver capabilities
`knockout-format` e `tournament-lifecycle`). UPDATE NÃO SHALL ser permitido.

#### Scenario: Lista visível junto com o torneio
- **WHEN** um usuário que enxerga o torneio consulta os participantes dele
- **THEN** as linhas são retornadas

#### Scenario: Entrada direta de terceiro é negada
- **WHEN** um usuário tenta INSERT direto em `participants` de torneio que não é dele (sem passar pela função de aceite)
- **THEN** a política RLS rejeita a operação

#### Scenario: Sair e remover cobertos por DELETE
- **WHEN** o próprio participante (ou o dono do torneio) executa DELETE da linha em torneio que não é mata-mata com chave gerada
- **THEN** a operação é aceita; para qualquer outro usuário é rejeitada

#### Scenario: Mata-mata com chave gerada bloqueia DELETE no banco
- **WHEN** um DELETE direto em `participants` referencia mata-mata ativo, ou encerrado com partidas geradas
- **THEN** a política RLS rejeita a operação, mesmo para o dono ou o próprio participante
