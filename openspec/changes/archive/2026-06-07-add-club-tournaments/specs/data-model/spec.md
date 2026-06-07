# data-model — Delta Spec

## ADDED Requirements

### Requirement: Tabela de vagas de clube
O schema SHALL ter `tournament_slots` (id uuid PK, tournament_id FK CASCADE, team_id FK teams RESTRICT NOT NULL, user_id FK users SET NULL anulável, created_at) com UNIQUE (tournament_id, team_id) e índice único parcial (tournament_id, user_id) WHERE user_id IS NOT NULL.

#### Scenario: Clube único por torneio
- **WHEN** uma segunda vaga com o mesmo clube é inserida no mesmo torneio
- **THEN** o banco recusa (unique)

#### Scenario: Conta apagada não derruba o torneio
- **WHEN** o usuário técnico de uma vaga apaga a conta
- **THEN** a vaga fica com user_id nulo e o restante intacto

### Requirement: Tabela de convites de vaga
O schema SHALL ter `slot_invites` (slot_id PK FK tournament_slots CASCADE, code text UNIQUE, created_at) — o código é segredo do dono e mora FORA de tabela com SELECT amplo.

#### Scenario: Regenerar mata o link antigo
- **WHEN** o dono regenera o convite da vaga
- **THEN** o code é substituído atomicamente (PK 1:1) e o link anterior deixa de funcionar

## MODIFIED Requirements

### Requirement: Tabela de partidas
A tabela `matches` SHALL registrar partidas com DOIS modelos de lado mutuamente exclusivos (CHECK `matches_lado_vaga_ou_user`): partidas AVULSAS usam `participante_1/2` (FK users, SET NULL) com `time_1/2` opcionais; partidas de formatos COMPETITIVOS usam `vaga_1/vaga_2` (FK tournament_slots, RESTRICT — `vaga_2` nula representa bye). Placares com default 0, status enum, `rodada`/`posicao`/`perna`/`grupo` para os formatos gerados como já especificado. A barreira de dupla geração da liga SHALL ter índice único por VAGA: UNIQUE (tournament_id, rodada, vaga_1, vaga_2) WHERE rodada IS NOT NULL.

#### Scenario: Partida competitiva referencia vagas
- **WHEN** uma partida de liga/mata-mata/grupos é gerada
- **THEN** os lados são vagas (vaga_1/vaga_2) e participante_1/2 ficam nulos

#### Scenario: Modelos não se misturam
- **WHEN** um INSERT tenta preencher participante_1 E vaga_1 na mesma partida
- **THEN** o CHECK recusa

#### Scenario: Avulso continua entre pessoas
- **WHEN** uma partida avulsa é criada
- **THEN** os lados são usuários (participante_1/2) com clube opcional por partida

### Requirement: Tabela de participantes
A tabela `participants` SHALL existir EXCLUSIVAMENTE para o formato AVULSO (participação confirmada em torneio de partidas manuais). Formatos competitivos NÃO SHALL usar participants — a participação é a vaga.

#### Scenario: Participants só no avulso
- **WHEN** um torneio competitivo é criado
- **THEN** nenhuma linha de participants é criada para ele
