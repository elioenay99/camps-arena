# data-model Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Tabela de usuários
O sistema SHALL manter uma tabela `users` com `id`, `nome`, `celular` e `avatar`.

#### Scenario: Usuário persistido
- **WHEN** um usuário é criado
- **THEN** seus dados de `nome`, `celular` e `avatar` ficam disponíveis para consulta

### Requirement: Tabela de torneios
O sistema SHALL manter uma tabela `tournaments` com `id`, `titulo`, `status`, `created_at`, dono (`created_by`, referência anulável a `users`), visibilidade (`is_public`, padrão público), regras de pontuação (`pontos_vitoria` padrão 3, `pontos_empate` padrão 1, `pontos_derrota` padrão 0), formato (`formato`, enum `tournament_format` com valores `avulso`/`liga`/`mata_mata`/`grupos_mata_mata`/`fase_liga`, padrão `avulso` — preserva os legados), `ida_e_volta` (boolean, padrão false, significativo nos formatos gerados), `terceiro_lugar` (boolean, padrão false, significativo nos formatos com chave) e `classificados_por_grupo` (integer anulável, gravado AO INICIAR um formato de grupos — CHECK `>= 1` quando presente). Uma CHECK SHALL garantir a coerência `0 <= pontos_derrota <= pontos_empate <= pontos_vitoria <= 100`.

#### Scenario: Torneio com status
- **WHEN** um torneio é criado
- **THEN** ele possui um `status` que reflete seu estado atual

#### Scenario: Torneio com dono e visibilidade
- **WHEN** um torneio é criado por um usuário autenticado
- **THEN** ele registra o `created_by` do criador e um `is_public` que controla sua visibilidade

#### Scenario: Torneio com regras de pontuação
- **WHEN** um torneio é criado sem pontuação explícita
- **THEN** ele assume 3/1/0 (vitória/empate/derrota) pelos defaults

#### Scenario: Pontuação incoerente é rejeitada no banco
- **WHEN** uma escrita tenta gravar derrota valendo mais que empate ou empate mais que vitória
- **THEN** a CHECK rejeita a operação

#### Scenario: Formato com default avulso
- **WHEN** um torneio é criado sem formato explícito (incluindo todos os legados)
- **THEN** ele assume `formato = 'avulso'`, `ida_e_volta = false`, `terceiro_lugar = false` e `classificados_por_grupo` nulo pelos defaults

#### Scenario: Formato fora do enum é rejeitado
- **WHEN** uma escrita tenta gravar um formato que não existe no enum `tournament_format`
- **THEN** o banco rejeita a operação

#### Scenario: Classificados por grupo inválido é rejeitado
- **WHEN** uma escrita tenta gravar `classificados_por_grupo` menor que 1
- **THEN** a CHECK rejeita a operação

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

### Requirement: Tabela de convites de torneio
O sistema SHALL manter uma tabela `tournament_invites` com `tournament_id`
como chave primária (1:1, `on delete cascade`), `code` único e `created_at`.
O código SHALL ficar FORA de `tournaments` para não vazar pela visibilidade
pública do torneio.

#### Scenario: Um convite por torneio
- **WHEN** o código é regenerado
- **THEN** a mesma linha é atualizada (o torneio nunca tem dois códigos válidos)

#### Scenario: Código globalmente único
- **WHEN** um INSERT/UPDATE tenta gravar um código já existente
- **THEN** a constraint UNIQUE rejeita a operação

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

