## ADDED Requirements

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
