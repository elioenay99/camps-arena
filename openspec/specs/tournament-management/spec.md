# tournament-management Specification

## Purpose
TBD - created by archiving change add-tournament-ownership. Update Purpose after archive.
## Requirements
### Requirement: Criação de torneio com dono
O sistema SHALL permitir que um usuário autenticado crie um torneio via Server Action, validando `titulo`, visibilidade e regras de pontuação (vitória/empate/derrota, inteiros 0–100, coerência `derrota <= empate <= vitoria`) com Zod antes de gravar. O torneio criado SHALL registrar como dono (`created_by`) o usuário da sessão, definido no servidor — a aplicação NÃO SHALL confiar em um dono informado pelo cliente. A action SHALL exigir sessão válida (defesa em profundidade além da RLS).

#### Scenario: Torneio criado pelo dono
- **WHEN** um usuário autenticado submete um título válido
- **THEN** o torneio é gravado com `created_by` igual ao id da sessão e o usuário é levado ao painel

#### Scenario: Pontuação customizada é gravada
- **WHEN** o usuário submete vitória/empate/derrota customizados e coerentes
- **THEN** o torneio é gravado com essas regras

#### Scenario: Campos de pontuação vazios assumem os defaults
- **WHEN** o usuário não altera os campos de pontuação (ou os deixa vazios)
- **THEN** o torneio é gravado com 3/1/0

#### Scenario: Pontuação incoerente é rejeitada
- **WHEN** a criação é submetida com derrota > empate ou empate > vitória, valor negativo, não-inteiro ou acima de 100
- **THEN** a action retorna erro por campo e nenhuma escrita é feita

#### Scenario: Entrada inválida não toca o banco
- **WHEN** a criação é submetida com título fora dos limites (vazio/curto/longo)
- **THEN** a action retorna o erro por campo e nenhuma escrita é feita

#### Scenario: Sem sessão é rejeitada
- **WHEN** a action de criação é invocada sem sessão válida
- **THEN** a criação é rejeitada e nenhum torneio é gravado

#### Scenario: Dono não é forjável pelo cliente
- **WHEN** a requisição tenta indicar um `created_by` diferente do usuário da sessão
- **THEN** o torneio é gravado com o dono igual ao usuário autenticado, ignorando o valor do cliente

