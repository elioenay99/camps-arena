# club-slots — Delta Spec

## ADDED Requirements

### Requirement: Vaga por nome não tem convite

Vaga por NOME (sem clube — `team_id` nulo) NÃO SHALL ter convite de vaga
(`slot_invites`): o organizador lança os placares, não há técnico a convidar. A
criação ou regeneração de convite para uma vaga por-nome SHALL ser barrada em
PROFUNDIDADE — pela Server Action (recusa com mensagem clara ao dono, antes de
tocar o banco), pela RLS (`with check` exclui `team_id` nulo) e por um trigger de
integridade (BEFORE INSERT/UPDATE, universal — vale inclusive para
`service_role`). A trava NÃO SHALL afetar vagas de CLUBE: o convite por vaga de
clube continua sendo gerado, regenerado e aceito como antes.

#### Scenario: Convite para vaga por nome é barrado

- **WHEN** o dono tenta gerar/regenerar o convite de uma vaga por nome (por POST
  direto à ação; a UI não expõe o botão nesse caso)
- **THEN** a operação é recusada com mensagem clara e nenhum `slot_invite` é
  criado para a vaga por nome

#### Scenario: Vaga de clube segue com convite

- **WHEN** o dono regenera o convite de uma vaga de clube
- **THEN** o convite é (re)gerado normalmente e pode ser aceito

#### Scenario: Bypass direto também é barrado no banco

- **WHEN** uma escrita em `slot_invites` aponta para uma vaga por nome por um
  caminho que contorna a Server Action
- **THEN** a RLS e o trigger de integridade impedem a escrita
