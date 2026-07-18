## MODIFIED Requirements

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
