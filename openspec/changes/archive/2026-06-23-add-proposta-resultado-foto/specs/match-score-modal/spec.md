## ADDED Requirements

### Requirement: Modo de envio do placar conforme a capacidade

O "Menu da Partida" SHALL operar em dois modos para o placar, conforme quem o abre:
- **Direto** (avulso, OU usuário com capacidade de **arbitrar** num competitivo): o botão grava o
  placar como hoje, sem exigir foto.
- **Proposta** (competitivo, usuário SEM arbitrar mas técnico de uma vaga): o botão SHALL ser
  "Enviar para aprovação" e SHALL exigir o **anexo de uma foto** (com pré-visualização) antes de
  habilitar o envio; ao enviar, cria uma proposta pendente (não altera o placar oficial).

O modo SHALL ser derivado no servidor (capacidade + se a partida é competitiva) e passado ao modal;
o modal não decide autorização por conta própria.

#### Scenario: Técnico vê o modo proposta com foto

- **WHEN** um técnico (sem arbitrar) abre o menu de uma partida competitiva
- **THEN** o botão é "Enviar para aprovação" e só habilita após anexar a foto

#### Scenario: Aprovador vê o modo direto

- **WHEN** o dono/admin/árbitro abre o menu da partida
- **THEN** o botão grava o placar diretamente, sem exigir foto
