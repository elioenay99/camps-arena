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
O sistema SHALL manter uma tabela `tournaments` com `id`, `titulo`, `status`, `created_at`, dono (`created_by`, referência anulável a `users`) e visibilidade (`is_public`, padrão público).

#### Scenario: Torneio com status
- **WHEN** um torneio é criado
- **THEN** ele possui um `status` que reflete seu estado atual

#### Scenario: Torneio com dono e visibilidade
- **WHEN** um torneio é criado por um usuário autenticado
- **THEN** ele registra o `created_by` do criador e um `is_public` que controla sua visibilidade

### Requirement: Tabela de partidas
O sistema SHALL manter uma tabela `matches` com `id`, referência ao torneio, `participante_1`, `participante_2`, `placar_1`, `placar_2` e `status`.

#### Scenario: Partida entre dois participantes
- **WHEN** uma partida é criada vinculada a um torneio
- **THEN** ela referencia dois participantes e mantém os placares de cada um

#### Scenario: Placar atualizável
- **WHEN** o placar de uma partida é alterado
- **THEN** os campos `placar_1` e `placar_2` refletem os novos valores

