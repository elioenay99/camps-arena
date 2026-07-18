# push-notifications Specification

## Purpose
Notificações Web Push (PWA Fase 3): opt-in por dispositivo na Conta, e envio
best-effort, gated por co-participação, em eventos do domínio (rodada liberada, placar,
convite aceito, W.O.). Sem `service_role` em runtime; degrada sem chaves VAPID.
## Requirements
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
falhar nem bloquear sua resposta. O conteúdo da notificação SHALL conter apenas dados que
o destinatário já pode ver (é co-participante) e SHALL incluir uma URL de destino. Quando
as chaves VAPID não estiverem configuradas, o envio SHALL ser um no-op silencioso.

O envio NÃO SHALL somar sua latência de rede ao caminho crítico da resposta quando o push
puder ser dispensado do bloqueio: no `updateMatchScore` (registro de placar), a ação SHALL
agendar o envio via `after()` (executa DEPOIS do flush da resposta, mantido vivo pela
plataforma), retornando o resultado imediatamente. `after()` — e NÃO uma promessa solta,
que em serverless é cortada — SHALL ser o mecanismo. Nas ações que redirecionam após a
mutação, o envio SHALL continuar sendo aguardado antes do redirecionamento (a promessa
solta seria cortada).

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

#### Scenario: Placar salvo retorna sem esperar a rede de push

- **WHEN** o organizador salva um placar via `updateMatchScore`
- **THEN** a action retorna `{ ok: true }` sem aguardar a RPC de subscriptions nem os POSTs webpush externos — o envio é agendado por `after()` e roda após o flush da resposta, sem que uma promessa solta seja cortada em serverless

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

### Requirement: Notificação de nomeação para a equipe

O sistema SHALL enviar uma notificação push best-effort ao novo membro quando ele for
adicionado à equipe de um campeonato (por busca direta ou por aceite de link), com título
indicando o papel e o campeonato e URL para o campeonato. O envio SHALL ser não-bloqueante
(nunca lança nem atrasa a action) e SHALL ocorrer **após** a inserção do membro, para que
a co-participação exigida pela RPC `subscriptions_de` já valha.

#### Scenario: Novo árbitro recebe aviso

- **WHEN** o dono adiciona alguém como árbitro de um torneio
- **THEN** o novo árbitro recebe uma notificação "Você virou árbitro em &lt;torneio&gt;"
  apontando para o torneio, sem que a action de adição falhe caso o push não seja entregue

#### Scenario: Falha de push não quebra a nomeação

- **WHEN** a entrega do push falha (sem subscription, VAPID ausente, endpoint expirado)
- **THEN** a adição do membro permanece efetivada e a action retorna sucesso

### Requirement: Push de temporada encerrada
Ao encerrar uma temporada de liga, o sistema SHALL disparar um push best-effort
"Temporada encerrada: veja o campeão, quem subiu e quem caiu" aos participantes
da temporada, gated por co-participação (via o mesmo contrato de
`enviarNotificacoes`, que NUNCA lança e é no-op sem VAPID), apontando para a
página da liga. O envio SHALL ser aguardado (`await`) antes de qualquer
redirecionamento/revalidação e NÃO SHALL bloquear nem derrubar o encerramento.

#### Scenario: Participantes recebem o push
- **WHEN** uma temporada é encerrada e há participantes com subscription válida
- **THEN** um push de temporada encerrada é enviado a eles, exceto ao próprio autor da ação

#### Scenario: Falta de VAPID não quebra o encerramento
- **WHEN** o encerramento ocorre sem VAPID configurada
- **THEN** o push é no-op e o encerramento conclui normalmente

