## MODIFIED Requirements

### Requirement: Tabela de torneios
O sistema SHALL manter uma tabela `tournaments` com `id`, `titulo`, `status`, `created_at`, dono (`created_by`, referência anulável a `users`), visibilidade (`is_public`, padrão público) e regras de pontuação (`pontos_vitoria` padrão 3, `pontos_empate` padrão 1, `pontos_derrota` padrão 0). Uma CHECK SHALL garantir a coerência `0 <= pontos_derrota <= pontos_empate <= pontos_vitoria <= 100`.

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
