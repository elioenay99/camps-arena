# standings-page Specification

## Purpose
TBD - created by archiving change add-standings-page. Update Purpose after archive.
## Requirements
### Requirement: Página de classificação do torneio
O sistema SHALL oferecer a página protegida `/dashboard/torneios/[id]` exibindo título e status do torneio, suas regras de pontuação e a tabela de classificação calculada pelo motor `computeStandings` com os nomes dos participantes. Sem partida encerrada, a página SHALL exibir um estado vazio orientativo.

#### Scenario: Tabela renderizada com nomes e posições
- **WHEN** um usuário autenticado abre a página de um torneio visível com partidas encerradas
- **THEN** a tabela mostra posição, nome, pontos, jogos, V/E/D, gols e saldo na ordem do motor

#### Scenario: Sem partidas encerradas
- **WHEN** o torneio visível ainda não tem partida encerrada
- **THEN** a página informa que a classificação aparecerá após a primeira partida encerrada

#### Scenario: Torneio invisível ou inexistente
- **WHEN** o id não existe, é de torneio privado de terceiro, ou não é um uuid
- **THEN** a página responde com notFound (404), sem distinguir os casos

### Requirement: Fetcher de classificação
O sistema SHALL prover `getTournamentClassificacao` que busca o torneio (com regras e `created_by`) e as partidas com nomes embutidos numa única viagem por recurso, executa o motor e devolve as linhas com nome resolvido, a lista de partidas encerradas (`partidasEncerradas`), a classificação de clubes (`clubes`) E as partidas em aberto (`partidasAbertas` — não-encerradas, com nomes, placar e status). Torneio não retornado pela RLS SHALL resultar em `null`; falha de query SHALL lançar erro amigável.

#### Scenario: Nomes resolvidos a partir dos embeds
- **WHEN** as partidas retornam embeds de participantes com nomes
- **THEN** cada linha da classificação carrega o nome correspondente (fallback "Sem nome")

#### Scenario: Torneio oculto pela RLS
- **WHEN** a query do torneio devolve vazio
- **THEN** o fetcher devolve null sem consultar partidas

#### Scenario: Todas as projeções do mesmo snapshot
- **WHEN** o fetcher retorna
- **THEN** classificação, histórico, clubes e partidas em aberto derivam da MESMA consulta de partidas

