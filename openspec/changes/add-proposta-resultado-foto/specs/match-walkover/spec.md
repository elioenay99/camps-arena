## ADDED Requirements

### Requirement: Foto opcional na solicitação de W.O.

A solicitação de W.O. feita pelo técnico (`solicitarWO`) SHALL aceitar uma **foto de evidência
OPCIONAL**, guardada no mesmo armazenamento privado das evidências (`match_evidence`) e servida pela
mesma rota autorizada. Para o W.O., a foto SHALL ser visível a quem **arbitra** OU ao **solicitante**
(a mesma visibilidade da própria solicitação de W.O.). Quando houver foto, o aprovador SHALL poder
vê-la ao responder; a ausência de foto NÃO SHALL impedir a solicitação (diferente do placar, onde a
foto é obrigatória). O upload SHALL ser validado na action (tipo/tamanho), como o placar.

#### Scenario: Solicitar W.O. com foto

- **WHEN** o técnico solicita W.O. anexando uma foto
- **THEN** a solicitação é criada com a foto, visível ao aprovador na hora de responder

#### Scenario: Solicitar W.O. sem foto continua válido

- **WHEN** o técnico solicita W.O. sem anexar foto
- **THEN** a solicitação é criada normalmente (a foto é opcional no W.O.)
