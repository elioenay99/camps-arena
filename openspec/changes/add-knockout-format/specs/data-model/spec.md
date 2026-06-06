# data-model — Delta Spec

## MODIFIED Requirements

### Requirement: Tabela de torneios
O sistema SHALL manter uma tabela `tournaments` com `id`, `titulo`, `status`, `created_at`, dono (`created_by`, referência anulável a `users`), visibilidade (`is_public`, padrão público), regras de pontuação (`pontos_vitoria` padrão 3, `pontos_empate` padrão 1, `pontos_derrota` padrão 0), formato (`formato`, enum `tournament_format` com valores `avulso`/`liga`/`mata_mata`, padrão `avulso` — preserva os legados), `ida_e_volta` (boolean, padrão false, significativo em liga e mata-mata) e `terceiro_lugar` (boolean, padrão false, significativo apenas em mata-mata). Uma CHECK SHALL garantir a coerência `0 <= pontos_derrota <= pontos_empate <= pontos_vitoria <= 100`.

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
- **THEN** ele assume `formato = 'avulso'`, `ida_e_volta = false` e `terceiro_lugar = false` pelos defaults

#### Scenario: Formato fora do enum é rejeitado
- **WHEN** uma escrita tenta gravar um formato que não existe no enum `tournament_format`
- **THEN** o banco rejeita a operação

### Requirement: Tabela de partidas
O sistema SHALL manter uma tabela `matches` com `id`, referência ao torneio, `participante_1`, `participante_2`, `placar_1`, `placar_2`, `status`, `rodada` (integer anulável — `null` = partida avulsa; em formato gerado, número da fase/rodada), `posicao` (integer anulável — slot do confronto dentro da fase de mata-mata; `null` fora do mata-mata) e `perna` (smallint anulável — 1|2 em confronto ida-e-volta de mata-mata; `null` em jogo único). CHECKs SHALL garantir `rodada >= 1`, `posicao >= 1` e `perna IN (1, 2)` quando presentes. Um índice único parcial em `(tournament_id, rodada, posicao, perna)` com `NULLS NOT DISTINCT` (onde `posicao` não é nula) SHALL garantir unicidade de slot na chave.

#### Scenario: Partida entre dois participantes
- **WHEN** uma partida é criada vinculada a um torneio
- **THEN** ela referencia dois participantes e mantém os placares de cada um

#### Scenario: Placar atualizável
- **WHEN** o placar de uma partida é alterado
- **THEN** os campos `placar_1` e `placar_2` refletem os novos valores

#### Scenario: Partida avulsa sem rodada
- **WHEN** uma partida é criada manualmente (torneio avulso)
- **THEN** `rodada`, `posicao` e `perna` permanecem nulas

#### Scenario: Rodada inválida é rejeitada no banco
- **WHEN** uma escrita tenta gravar `rodada` menor que 1
- **THEN** a CHECK rejeita a operação

#### Scenario: Posição ou perna inválida é rejeitada no banco
- **WHEN** uma escrita tenta gravar `posicao` menor que 1 ou `perna` fora de 1/2
- **THEN** a CHECK rejeita a operação

#### Scenario: Slot único na chave
- **WHEN** um INSERT repete (torneio, rodada, posição, perna) com `posicao` preenchida — pernas nulas inclusive
- **THEN** o índice único rejeita a operação
