## ADDED Requirements

### Requirement: Criação de torneio com dono
O sistema SHALL permitir que um usuário autenticado crie um torneio via Server Action, validando `titulo` e visibilidade com Zod antes de gravar. O torneio criado SHALL registrar como dono (`created_by`) o usuário da sessão, definido no servidor — a aplicação NÃO SHALL confiar em um dono informado pelo cliente. A action SHALL exigir sessão válida (defesa em profundidade além da RLS).

#### Scenario: Torneio criado pelo dono
- **WHEN** um usuário autenticado submete um título válido
- **THEN** o torneio é gravado com `created_by` igual ao id da sessão e o usuário é levado ao painel

#### Scenario: Entrada inválida não toca o banco
- **WHEN** a criação é submetida com título fora dos limites (vazio/curto/longo)
- **THEN** a action retorna o erro por campo e nenhuma escrita é feita

#### Scenario: Sem sessão é rejeitada
- **WHEN** a action de criação é invocada sem sessão válida
- **THEN** a criação é rejeitada e nenhum torneio é gravado

#### Scenario: Dono não é forjável pelo cliente
- **WHEN** a requisição tenta indicar um `created_by` diferente do usuário da sessão
- **THEN** o torneio é gravado com o dono igual ao usuário autenticado, ignorando o valor do cliente
