# push-notifications — Delta Spec

## ADDED Requirements

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
