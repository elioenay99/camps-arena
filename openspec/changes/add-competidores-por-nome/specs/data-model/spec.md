# data-model — Delta Spec

## ADDED Requirements

### Requirement: Vaga por nome no schema

A tabela `tournament_slots` SHALL aceitar uma vaga sem clube: `team_id` torna-se
anulável e ganha uma coluna `rotulo text`, mutuamente exclusivos por CHECK
(`(team_id is null) <> (rotulo is null)`), com o rótulo não-vazio quando presente. A
unicidade SHALL ser garantida por índices parciais — clube único por torneio
(`team_id` não-nulo) e rótulo único por torneio (`lower(trim(rotulo))` não-nulo). A
tabela `tournaments` SHALL ganhar `por_nome boolean not null default false`. O rótulo
SHALL ser imutável após o início do torneio (trigger), e a migração SHALL ser aditiva
(sem backfill: todo slot legado tem `team_id`).

#### Scenario: Inserir vaga por nome

- **WHEN** uma vaga é inserida com `rotulo` preenchido e `team_id` nulo num torneio
  `por_nome`
- **THEN** o banco aceita a vaga e rejeita duplicata de nome (case-insensitive) no
  mesmo torneio

#### Scenario: Coerência clube×rótulo

- **WHEN** uma vaga é inserida com clube e rótulo ao mesmo tempo (ou nenhum dos dois)
- **THEN** o banco rejeita pela CHECK `slots_clube_xor_rotulo`
