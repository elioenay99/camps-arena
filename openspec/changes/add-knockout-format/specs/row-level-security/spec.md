# row-level-security — Delta Spec

## MODIFIED Requirements

### Requirement: Escrita restrita ao dono da partida
O sistema SHALL permitir UPDATE em uma partida para o usuário autenticado que é um dos participantes daquela partida OU para o dono do torneio da partida. Triggers SHALL garantir que (a) a coluna `status` só mude quando o autor é o dono do torneio (`service_role` isento); (b) o placar de partida `encerrada` não mude para nenhum papel, exceto `service_role`; (c) `participante_1/2`, `tournament_id`, `rodada`, `posicao` e `perna` sejam imutáveis após o INSERT (exceto `service_role`); e (d) em torneio `mata_mata`, o encerramento exija resultado decisivo e a reabertura seja bloqueada com fase posterior gerada ou em partida-bye (trigger `valida_resultado_mata_mata`).

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
- **WHEN** um UPDATE direto tenta encerrar jogo decisivo de mata-mata sem vencedor (jogo único empatado; volta com agregado igual; volta antes da ida)
- **THEN** o trigger `valida_resultado_mata_mata` rejeita a operação

#### Scenario: Reabertura pós-avanço bloqueada no banco
- **WHEN** um UPDATE direto tenta reabrir partida de mata-mata com fase posterior existente ou partida-bye
- **THEN** o trigger rejeita a operação

### Requirement: Criação de partida restrita ao dono do torneio
O sistema SHALL permitir INSERT em `matches` apenas quando o usuário autenticado for o dono (`created_by`) do torneio referenciado em `tournament_id`, o torneio não estiver `encerrado`, cada participante informado (não nulo) for participante confirmado do torneio em `participants` E o formato for respeitado: em torneio `avulso`, INSERT livre dessas condições; em formato GERADO (`liga`, `mata_mata`), apenas INSERT com `rodada` preenchida (caminho da geração de tabela/chave — partida manual sem rodada é barrada). As demais operações de escrita não cobertas por policy permanecem negadas.

#### Scenario: Dono cria partida no próprio torneio
- **WHEN** o dono de um torneio avulso não encerrado insere uma partida com participantes do torneio (ou nulos)
- **THEN** a inserção é aceita

#### Scenario: Terceiro não cria partida em torneio alheio
- **WHEN** um usuário autenticado tenta inserir partida em torneio cujo dono é outra pessoa
- **THEN** a política RLS rejeita a operação

#### Scenario: Torneio encerrado não recebe partidas
- **WHEN** o dono tenta inserir partida em torneio com status `encerrado`
- **THEN** a política RLS rejeita a operação

#### Scenario: Participante fora da lista é barrado no banco
- **WHEN** um INSERT direto referencia como participante um usuário que não está em `participants` do torneio
- **THEN** a política RLS rejeita a operação

#### Scenario: Geração de liga e de chave passam pela policy
- **WHEN** o dono insere as partidas geradas (com `rodada`) numa liga ou mata-mata em rascunho, ou avança a fase de um mata-mata ativo
- **THEN** a inserção é aceita

#### Scenario: Partida manual em formato gerado é barrada no banco
- **WHEN** um INSERT direto sem `rodada` é tentado em torneio de formato liga ou mata-mata
- **THEN** a política RLS rejeita a operação

### Requirement: Políticas de participants
O sistema SHALL permitir SELECT em `participants` quando o torneio
correspondente for visível ao solicitante; INSERT direto apenas para o DONO do
torneio inserindo a si mesmo (`user_id = auth.uid()`) — convidados entram
exclusivamente pela função `aceitar_convite`; DELETE para o próprio
participante (sair) ou para o dono do torneio (remover), EXCETO em torneio
`mata_mata` com `status = 'ativo'` (a chave em andamento depende de cada
participante — ver capability `knockout-format`). UPDATE NÃO SHALL ser
permitido.

#### Scenario: Lista visível junto com o torneio
- **WHEN** um usuário que enxerga o torneio consulta os participantes dele
- **THEN** as linhas são retornadas

#### Scenario: Entrada direta de terceiro é negada
- **WHEN** um usuário tenta INSERT direto em `participants` de torneio que não é dele (sem passar pela função de aceite)
- **THEN** a política RLS rejeita a operação

#### Scenario: Sair e remover cobertos por DELETE
- **WHEN** o próprio participante (ou o dono do torneio) executa DELETE da linha em torneio que não é mata-mata ativo
- **THEN** a operação é aceita; para qualquer outro usuário é rejeitada

#### Scenario: Mata-mata ativo bloqueia DELETE no banco
- **WHEN** um DELETE direto em `participants` referencia torneio mata-mata com status ativo
- **THEN** a política RLS rejeita a operação, mesmo para o dono ou o próprio participante

### Requirement: Funções SECURITY DEFINER de convite
O sistema SHALL definir as funções `eh_participante(uuid)`, `aceitar_convite(text)` e `info_convite(text)` como `SECURITY DEFINER` com `search_path = ''`.
`aceitar_convite` SHALL exigir usuário autenticado, validar o código, rejeitar
torneio `encerrado`, rejeitar formato gerado já iniciado (`formato` em
`('liga', 'mata_mata')` com `status <> 'rascunho'`) e inserir SOMENTE o
próprio `auth.uid()` de forma idempotente. `info_convite` SHALL expor apenas
dados mínimos do torneio (id, título, status, formato, se já participa) a
partir de um código válido. A recriação das funções SHALL re-aplicar
REVOKE/GRANT explícitos (CREATE FUNCTION concede EXECUTE a PUBLIC):
`eh_participante` para anon+authenticated; funções de convite apenas para
authenticated.

#### Scenario: Aceite sem sessão é rejeitado
- **WHEN** `aceitar_convite` é chamada sem usuário autenticado
- **THEN** a função falha sem inserir nada

#### Scenario: Função não insere terceiros
- **WHEN** `aceitar_convite` é executada
- **THEN** a única linha possível de inserção é a do próprio `auth.uid()`

#### Scenario: Código inválido falha de forma única
- **WHEN** `aceitar_convite` ou `info_convite` recebem código inexistente
- **THEN** a resposta não distingue inexistente de revogado

#### Scenario: Liga iniciada rejeita aceite no banco
- **WHEN** `aceitar_convite` é chamada com código de liga cujo status não é `rascunho`
- **THEN** a função falha com mensagem clara e nada é inserido

#### Scenario: Mata-mata iniciado rejeita aceite no banco
- **WHEN** `aceitar_convite` é chamada com código de mata-mata cujo status não é `rascunho`
- **THEN** a função falha com mensagem clara e nada é inserido

#### Scenario: Grants re-aplicados na recriação
- **WHEN** as funções são recriadas pela DDL desta change
- **THEN** `anon` não executa `aceitar_convite`/`info_convite` e as policies seguem avaliando `eh_participante` para anon e authenticated
