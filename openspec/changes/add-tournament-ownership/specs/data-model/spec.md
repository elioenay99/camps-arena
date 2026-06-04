## MODIFIED Requirements

### Requirement: Tabela de torneios
O sistema SHALL manter uma tabela `tournaments` com `id`, `titulo`, `status`, `created_at`, dono (`created_by`, referência anulável a `users`) e visibilidade (`is_public`, padrão público).

#### Scenario: Torneio com status
- **WHEN** um torneio é criado
- **THEN** ele possui um `status` que reflete seu estado atual

#### Scenario: Torneio com dono e visibilidade
- **WHEN** um torneio é criado por um usuário autenticado
- **THEN** ele registra o `created_by` do criador e um `is_public` que controla sua visibilidade
