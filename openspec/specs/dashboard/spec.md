# dashboard Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Listagem de partidas ativas
O dashboard SHALL ser um React Server Component que consulta o Supabase e lista as partidas ativas, passando os dados reais ao modal de placar. A listagem SHALL considerar o lifecycle do torneio: partidas cujo torneio está `encerrado` NÃO SHALL aparecer, ainda que a partida em si não esteja `encerrada`; o filtro SHALL ser aplicado no servidor (na query), não em pós-processamento. A exclusão SHALL ser falha-segura — apenas o status `encerrado` oculta; torneios em qualquer outro status (incluindo valores futuros do enum) SHALL continuar aparecendo.

#### Scenario: Partidas ativas exibidas
- **WHEN** um usuário autenticado acessa o dashboard
- **THEN** todas as partidas ativas são listadas com seus dados reais

#### Scenario: Torneio encerrado oculta as partidas
- **WHEN** uma partida não-encerrada pertence a um torneio com status `encerrado`
- **THEN** a partida não aparece na listagem do dashboard

#### Scenario: Status de torneio desconhecido continua visível (falha-segura)
- **WHEN** uma partida ativa pertence a um torneio cujo status não é `encerrado` (ex.: `rascunho`, `ativo` ou um valor futuro do enum)
- **THEN** a partida aparece normalmente na listagem

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

### Requirement: Card de partida linka para o torneio
O card de partida ativa SHALL exibir o título do torneio como link para a página de classificação do torneio (`/dashboard/torneios/[id]`).

#### Scenario: Navegação do card ao torneio
- **WHEN** o usuário aciona o título do torneio no card de uma partida
- **THEN** ele navega para a página de classificação daquele torneio

