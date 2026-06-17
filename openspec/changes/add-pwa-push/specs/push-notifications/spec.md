# push-notifications — Delta Spec

## ADDED Requirements

### Requirement: Inscrição em notificações (opt-in)

A aplicação SHALL permitir que um usuário autenticado ative notificações push a partir
da página de Conta. Ao ativar, a aplicação SHALL solicitar a permissão do navegador e,
se concedida, criar uma `PushSubscription` com `userVisibleOnly: true` e a chave VAPID
pública, persistindo-a (endpoint + chaves) associada ao próprio `user_id`. Ao desativar,
a aplicação SHALL cancelar a subscription no navegador e removê-la do servidor. A
persistência SHALL ser idempotente por `(user_id, endpoint)` (re-inscrição do mesmo
device atualiza as chaves), o que exige policies de RLS para SELECT, INSERT, UPDATE e
DELETE, todas restritas a `user_id = auth.uid()`. Cada usuário SHALL acessar e modificar
SOMENTE as próprias subscriptions. Quando o navegador não suportar push, a chave VAPID
pública estiver ausente, ou a permissão for negada, o controle SHALL degradar
(indisponível) sem erro.

#### Scenario: Usuário ativa notificações

- **WHEN** um usuário autenticado liga o controle de notificações e concede a permissão
- **THEN** uma subscription é criada e persistida com o `user_id` do próprio usuário, e
  passa a receber notificações dos seus torneios

#### Scenario: Usuário desativa notificações

- **WHEN** o usuário desliga o controle
- **THEN** a subscription é cancelada no navegador e removida do servidor

#### Scenario: Ambiente sem suporte degrada

- **WHEN** o navegador não suporta push, ou a chave VAPID pública não está configurada,
  ou a permissão foi negada
- **THEN** o controle aparece indisponível e nada quebra

### Requirement: Envio de notificações por eventos do domínio

O sistema SHALL enviar notificações push, após a conclusão bem-sucedida da mutação, nos
eventos: **rodada liberada** (aos participantes/técnicos das rodadas liberadas), **placar
registrado** (ao adversário), **convite aceito** (ao dono do torneio) e **W.O.
solicitado/respondido** (ao dono; e, na resposta, ao solicitante e ao adversário). O
remetente do evento NÃO SHALL ser notificado de sua própria ação. O envio SHALL ser
**best-effort**: uma falha de envio (parcial ou total) NÃO SHALL fazer a ação de domínio
falhar nem bloquear sua resposta. O conteúdo da notificação SHALL conter apenas dados
que o destinatário já pode ver (é co-participante) e SHALL incluir uma URL de destino.
Quando as chaves VAPID não estiverem configuradas, o envio SHALL ser um no-op silencioso.

#### Scenario: Rodada liberada notifica os envolvidos

- **WHEN** o dono libera rodadas de um torneio
- **THEN** os participantes/técnicos dessas rodadas (exceto o dono) recebem uma
  notificação que leva ao torneio

#### Scenario: Falha de push não quebra a ação

- **WHEN** o envio de push falha (rede, VAPID ausente, subscription inválida)
- **THEN** a ação de domínio (liberar rodada, registrar placar, etc.) ainda conclui e
  retorna seu resultado normalmente

#### Scenario: Subscription expirada é podada

- **WHEN** o serviço de push responde `404`/`410` para uma subscription
- **THEN** essa subscription é removida do servidor para não ser tentada de novo

### Requirement: Leitura de subscriptions gated por co-participação

O sistema SHALL ler as subscriptions de outros usuários (para envio) apenas por uma
função `SECURITY DEFINER` que retorna a subscription de um id SOMENTE quando esse id é o
próprio solicitante OU um co-participante (`eh_co_participante`). O sistema NÃO SHALL
usar `service_role` em runtime para isso, e a função NÃO SHALL ser executável por `anon`.
Endpoints de subscription NÃO SHALL ser legíveis por terceiros via PostgREST (RLS).

#### Scenario: Não-coparticipante não obtém subscriptions

- **WHEN** um usuário autenticado solicita as subscriptions de alguém com quem não
  compartilha nenhum torneio
- **THEN** a função não retorna essas subscriptions (fail-closed)
