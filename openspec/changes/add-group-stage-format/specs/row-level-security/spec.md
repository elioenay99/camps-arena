# row-level-security — Delta Spec

## MODIFIED Requirements

### Requirement: Escrita restrita ao dono da partida
O sistema SHALL permitir UPDATE em uma partida para o usuário autenticado que é um dos participantes daquela partida OU para o dono do torneio da partida. Triggers SHALL garantir que (a) a coluna `status` só mude quando o autor é o dono do torneio (`service_role` isento); (b) o placar de partida `encerrada` não mude para nenhum papel, exceto `service_role`; (c) `participante_1/2`, `tournament_id`, `rodada`, `posicao`, `perna` e `grupo` sejam imutáveis após o INSERT (exceto `service_role`); e (d) nos formatos com CHAVE (`mata_mata`, `grupos_mata_mata`, `fase_liga`), o encerramento de partida de chave exija resultado decisivo e a reabertura seja bloqueada com fase posterior gerada ou em partida-bye (trigger `valida_resultado_mata_mata` — partidas de GRUPO seguem livres para empatar, como na liga).

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

#### Scenario: Empate decisivo bloqueado no banco
- **WHEN** um UPDATE direto tenta encerrar jogo decisivo de chave sem vencedor (jogo único empatado; volta com agregado igual; volta antes da ida) em qualquer formato com chave
- **THEN** o trigger `valida_resultado_mata_mata` rejeita a operação

#### Scenario: Partida de grupo empata livremente
- **WHEN** um UPDATE encerra uma partida de GRUPO (coluna `grupo` não nula) com placar igual
- **THEN** o trigger NÃO bloqueia (empate pontua na classificação do grupo)

#### Scenario: Reabertura pós-avanço bloqueada no banco
- **WHEN** um UPDATE direto tenta reabrir partida de chave com fase posterior existente ou partida-bye
- **THEN** o trigger rejeita a operação

### Requirement: Políticas de participants
O sistema SHALL permitir SELECT em `participants` quando o torneio
correspondente for visível ao solicitante; INSERT direto apenas para o DONO do
torneio inserindo a si mesmo (`user_id = auth.uid()`) — convidados entram
exclusivamente pela função `aceitar_convite`; DELETE para o próprio
participante (sair) ou para o dono do torneio (remover), EXCETO nos formatos
COM CHAVE (`mata_mata`, `grupos_mata_mata`, `fase_liga`) quando `status =
'ativo'` ou quando existem partidas geradas (`rodada` não nula) fora de
rascunho — a chave (atual ou futura, no caso dos grupos) depende de cada
participante, e torneio encerrado é reabrível. UPDATE NÃO SHALL ser permitido.

#### Scenario: Lista visível junto com o torneio
- **WHEN** um usuário que enxerga o torneio consulta os participantes dele
- **THEN** as linhas são retornadas

#### Scenario: Entrada direta de terceiro é negada
- **WHEN** um usuário tenta INSERT direto em `participants` de torneio que não é dele (sem passar pela função de aceite)
- **THEN** a política RLS rejeita a operação

#### Scenario: Sair e remover cobertos por DELETE
- **WHEN** o próprio participante (ou o dono do torneio) executa DELETE da linha em torneio fora dos formatos com chave congelada
- **THEN** a operação é aceita; para qualquer outro usuário é rejeitada

#### Scenario: Formatos com chave bloqueiam DELETE no banco
- **WHEN** um DELETE direto em `participants` referencia mata-mata, grupos ou fase de liga em estado congelado (ativo, ou com partidas geradas fora do rascunho)
- **THEN** a política RLS rejeita a operação, mesmo para o dono ou o próprio participante
