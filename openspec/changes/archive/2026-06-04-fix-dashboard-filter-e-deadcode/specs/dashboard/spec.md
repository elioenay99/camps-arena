## MODIFIED Requirements

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
