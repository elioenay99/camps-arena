# data-model — Delta Spec

## ADDED Requirements

### Requirement: Tabelas de equipe do campeonato

O schema SHALL ter `tournament_members` e `league_members`, cada uma com PK composta
`(escopo_id, user_id)`, coluna `papel text not null check (papel in
('admin','arbitro','moderador'))`, `created_at`, `created_by` (FK users, SET NULL) e FK do
escopo e do usuário com `ON DELETE CASCADE`. O **dono NÃO** SHALL constar nessas tabelas
(é `created_by` da tabela do campeonato), preservando o anti-lockout. RLS SHALL estar
ativa nas duas.

#### Scenario: Um papel por pessoa por campeonato

- **WHEN** uma pessoa é adicionada duas vezes ao mesmo campeonato
- **THEN** a PK composta força uma única linha; a segunda inclusão atualiza o papel

#### Scenario: Remoção do campeonato limpa a equipe

- **WHEN** um torneio ou pirâmide é apagado
- **THEN** as linhas de membros e convites de equipe associadas são removidas por CASCADE

### Requirement: Convites de equipe por papel

O schema SHALL ter `member_invites (id, escopo, tournament_id, competition_id, papel, code
unique, created_by, created_at)` com CHECK de XOR entre `tournament_id` e `competition_id`
conforme `escopo`, e dois índices únicos parciais garantindo **um convite ativo por
`(campeonato, papel)`** (regenerável). O `code` SHALL ser secreto (lido apenas por gestores
via RLS; validado por RPC security definer).

#### Scenario: Link regenerável por papel

- **WHEN** um gestor regenera o link de admin
- **THEN** o código anterior é substituído e o índice único garante um só link ativo de
  admin para aquele campeonato
