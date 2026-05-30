# dashboard Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Listagem de partidas ativas
O dashboard SHALL ser um React Server Component que consulta o Supabase e lista todas as partidas ativas, passando os dados reais ao modal de placar.

#### Scenario: Partidas ativas exibidas
- **WHEN** um usuário autenticado acessa o dashboard
- **THEN** todas as partidas ativas são listadas com seus dados reais

### Requirement: Estado de carregamento
O dashboard SHALL exibir um esqueleto visual enquanto os dados carregam.

#### Scenario: Skeleton durante carga
- **WHEN** os dados das partidas ainda estão sendo buscados
- **THEN** um esqueleto (Skeleton) é exibido no lugar da lista

### Requirement: Tratamento de erro amigável
O dashboard SHALL apresentar falhas de conexão de forma amigável e sem vazar detalhes sensíveis.

#### Scenario: Falha de conexão
- **WHEN** a consulta ao banco falha
- **THEN** uma mensagem de erro amigável é exibida sem expor detalhes internos

