# standings-page Specification

## Purpose
TBD - created by archiving change add-standings-page. Update Purpose after archive.
## Requirements
### Requirement: Página de classificação do torneio
O sistema SHALL oferecer a página protegida `/dashboard/torneios/[id]` exibindo título e status do torneio e a visualização de progresso adequada ao FORMATO: em torneio `avulso` ou `liga`, as regras de pontuação e a tabela de classificação calculada pelo motor `computeStandings` (com a classificação de clubes); em torneio `mata_mata`, a CHAVE eliminatória (capability `knockout-format`) — sem tabela de pontos nem classificação de clubes. Sem partida encerrada (avulso/liga), a página SHALL exibir um estado vazio orientativo.

#### Scenario: Tabela renderizada com nomes e posições
- **WHEN** um usuário autenticado abre a página de um torneio avulso ou liga visível com partidas encerradas
- **THEN** a tabela mostra posição, nome, pontos, jogos, V/E/D, gols e saldo na ordem do motor

#### Scenario: Mata-mata renderiza a chave
- **WHEN** um usuário autenticado abre a página de um torneio mata-mata iniciado
- **THEN** a página mostra a chave por fases no lugar da classificação por pontos

#### Scenario: Sem partidas encerradas
- **WHEN** o torneio avulso ou liga visível ainda não tem partida encerrada
- **THEN** a página informa que a classificação aparecerá após a primeira partida encerrada

#### Scenario: Torneio invisível ou inexistente
- **WHEN** o id não existe, é de torneio privado de terceiro, ou não é um uuid
- **THEN** a página responde com notFound (404), sem distinguir os casos

### Requirement: Fetcher de classificação
O sistema SHALL prover `getTournamentClassificacao` que busca o torneio (com regras, formato, opções de formato e `created_by`) e as partidas com nomes embutidos numa única viagem por recurso, executa o motor e devolve as linhas com nome resolvido, a lista de partidas encerradas (`partidasEncerradas`), a classificação de clubes (`clubes`) E as partidas em aberto (`partidasAbertas` — não-encerradas, com nomes, placar e status). A consulta de partidas SHALL incluir `posicao` e `perna` (mesma viagem — a chave do mata-mata deriva do mesmo snapshot). Torneio não retornado pela RLS SHALL resultar em `null`; falha de query SHALL lançar erro amigável.

#### Scenario: Nomes resolvidos a partir dos embeds
- **WHEN** as partidas retornam embeds de participantes com nomes
- **THEN** cada linha da classificação carrega o nome correspondente (fallback "Sem nome")

#### Scenario: Torneio oculto pela RLS
- **WHEN** a query do torneio devolve vazio
- **THEN** o fetcher devolve null sem consultar partidas

#### Scenario: Todas as projeções do mesmo snapshot
- **WHEN** o fetcher retorna
- **THEN** classificação, histórico, clubes, partidas em aberto e a chave do mata-mata derivam da MESMA consulta de partidas

### Requirement: Exibição de rodada nas listas de partidas
As listas de partidas da página do torneio SHALL identificar a rodada quando a
partida a tiver (`rodada` não nula): as partidas em aberto SHALL ser ordenadas
por rodada (ordem natural de disputa) com a rodada visível; o histórico de
encerradas SHALL manter a ordenação por encerramento, exibindo a rodada como
informação adicional. Partidas sem rodada (torneio avulso) SHALL renderizar
exatamente como hoje, sem rótulo de rodada. O fetcher
`getTournamentClassificacao` SHALL incluir `rodada` na mesma consulta única de
partidas (sem viagem extra).

#### Scenario: Liga lista partidas em aberto por rodada
- **WHEN** um usuário abre a página de uma liga iniciada
- **THEN** as partidas em aberto aparecem ordenadas por rodada com o número da rodada visível

#### Scenario: Histórico identifica a rodada
- **WHEN** partidas de liga encerradas aparecem no histórico
- **THEN** cada item exibe a rodada, mantendo a ordenação por encerramento

#### Scenario: Avulso permanece sem rótulo
- **WHEN** um usuário abre a página de um torneio avulso
- **THEN** as listas não exibem rótulo de rodada

