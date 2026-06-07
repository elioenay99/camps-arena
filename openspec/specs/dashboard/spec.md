# dashboard Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Listagem de partidas ativas
O dashboard SHALL listar as partidas ativas do usuário: avulsas em que é participante E competitivas em que é TÉCNICO de uma das vagas — mantendo o filtro de torneio encerrado e o comportamento falha-seguro atuais. O card de partida competitiva SHALL exibir os CLUBES (escudo+nome) com o técnico como detalhe.

#### Scenario: Partidas das minhas vagas aparecem
- **WHEN** o usuário é técnico de um clube com partida aberta
- **THEN** a partida aparece no dashboard com os clubes como lados

#### Scenario: Deixei a vaga, partidas somem
- **WHEN** o usuário desiste de uma vaga
- **THEN** as partidas daquele clube deixam de aparecer no dashboard dele

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

