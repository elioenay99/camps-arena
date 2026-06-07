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
O sistema SHALL manter uma tabela `matches` com `id`, referência ao torneio, `participante_1`, `participante_2`, `placar_1`, `placar_2`, `status`, `rodada` (integer anulável — `null` = partida avulsa; em formato gerado, número da fase/rodada), `posicao` (integer anulável — slot do confronto dentro da fase de CHAVE; `null` fora dela), `perna` (smallint anulável — 1|2 em confronto ida-e-volta de chave; `null` em jogo único) e `grupo` (integer anulável — número do grupo na fase de grupos; `null` fora dela). CHECKs SHALL garantir `rodada >= 1`, `posicao >= 1`, `perna IN (1, 2)` e `grupo >= 1` quando presentes, e que `grupo` e `posicao` NÃO coexistem na mesma partida (uma partida é de grupo OU de chave). Um índice único parcial em `(tournament_id, rodada, posicao, perna)` com `NULLS NOT DISTINCT` (onde `posicao` não é nula) SHALL garantir unicidade de slot na chave.

#### Scenario: Partida entre dois participantes
- **WHEN** uma partida é criada vinculada a um torneio
- **THEN** ela referencia dois participantes e mantém os placares de cada um

#### Scenario: Placar atualizável
- **WHEN** o placar de uma partida é alterado
- **THEN** os campos `placar_1` e `placar_2` refletem os novos valores

#### Scenario: Partida avulsa sem rodada
- **WHEN** uma partida é criada manualmente (torneio avulso)
- **THEN** `rodada`, `posicao`, `perna` e `grupo` permanecem nulas

#### Scenario: Rodada inválida é rejeitada no banco
- **WHEN** uma escrita tenta gravar `rodada` menor que 1
- **THEN** a CHECK rejeita a operação

#### Scenario: Posição, perna ou grupo inválido é rejeitado no banco
- **WHEN** uma escrita tenta gravar `posicao` menor que 1, `perna` fora de 1/2 ou `grupo` menor que 1
- **THEN** a CHECK rejeita a operação

#### Scenario: Grupo e posição não coexistem
- **WHEN** um INSERT/UPDATE tenta gravar `grupo` e `posicao` simultaneamente não-nulos
- **THEN** a CHECK rejeita a operação

#### Scenario: Slot único na chave
- **WHEN** um INSERT repete (torneio, rodada, posição, perna) com `posicao` preenchida — pernas nulas inclusive
- **THEN** o índice único rejeita a operação

### Requirement: Tabela de participantes
O sistema SHALL manter uma tabela `participants` com chave primária composta
(`tournament_id`, `user_id`), referências com `on delete cascade` para
`tournaments` e `users`, e `created_at`. Cada linha representa um participante
CONFIRMADO do torneio.

#### Scenario: Participação persistida
- **WHEN** um usuário entra num torneio
- **THEN** existe exatamente uma linha (torneio, usuário); nova tentativa não duplica

#### Scenario: Cascata na exclusão
- **WHEN** o torneio (ou o usuário) é excluído
- **THEN** as linhas de participação correspondentes são removidas

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

