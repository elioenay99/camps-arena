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
O sistema SHALL manter uma tabela `tournaments` com `id`, `titulo`, `status`, `created_at`, dono (`created_by`, referência anulável a `users`), visibilidade (`is_public`, padrão público), regras de pontuação (`pontos_vitoria` padrão 3, `pontos_empate` padrão 1, `pontos_derrota` padrão 0), formato (`formato`, enum `tournament_format` com valores `avulso`/`liga`, padrão `avulso` — preserva os legados) e `ida_e_volta` (boolean, padrão false, significativo apenas em liga). Uma CHECK SHALL garantir a coerência `0 <= pontos_derrota <= pontos_empate <= pontos_vitoria <= 100`.

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
- **THEN** ele assume `formato = 'avulso'` e `ida_e_volta = false` pelos defaults

#### Scenario: Formato fora do enum é rejeitado
- **WHEN** uma escrita tenta gravar um formato que não existe no enum `tournament_format`
- **THEN** o banco rejeita a operação

### Requirement: Tabela de partidas
O sistema SHALL manter uma tabela `matches` com `id`, referência ao torneio, `participante_1`, `participante_2`, `placar_1`, `placar_2`, `status` e `rodada` (integer anulável — `null` = partida avulsa; em liga, número da rodada gerada). Uma CHECK SHALL garantir `rodada >= 1` quando presente.

#### Scenario: Partida entre dois participantes
- **WHEN** uma partida é criada vinculada a um torneio
- **THEN** ela referencia dois participantes e mantém os placares de cada um

#### Scenario: Placar atualizável
- **WHEN** o placar de uma partida é alterado
- **THEN** os campos `placar_1` e `placar_2` refletem os novos valores

#### Scenario: Partida avulsa sem rodada
- **WHEN** uma partida é criada manualmente (torneio avulso)
- **THEN** `rodada` permanece nula

#### Scenario: Rodada inválida é rejeitada no banco
- **WHEN** uma escrita tenta gravar `rodada` menor que 1
- **THEN** a CHECK rejeita a operação

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

