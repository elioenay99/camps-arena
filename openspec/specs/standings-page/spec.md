# standings-page Specification

## Purpose
TBD - created by archiving change add-standings-page. Update Purpose after archive.
## Requirements
### Requirement: Página de classificação do torneio
O sistema SHALL oferecer a página protegida `/dashboard/torneios/[id]` exibindo título e status do torneio e a visualização de progresso adequada ao FORMATO: em torneio `avulso` ou `liga`, as regras de pontuação e a tabela de classificação calculada pelo motor `computeStandings` (com a classificação de clubes); em torneio `mata_mata`, a CHAVE eliminatória; em `grupos_mata_mata` e `fase_liga`, uma tabela de classificação POR GRUPO (única na fase de liga) e — quando gerada — a chave (capability `group-stage-format`). Sem partida encerrada (formatos com classificação), a página SHALL exibir um estado vazio orientativo.

#### Scenario: Tabela renderizada com nomes e posições
- **WHEN** um usuário autenticado abre a página de um torneio avulso ou liga visível com partidas encerradas
- **THEN** a tabela mostra posição, nome, pontos, jogos, V/E/D, gols e saldo na ordem do motor

#### Scenario: Mata-mata renderiza a chave
- **WHEN** um usuário autenticado abre a página de um torneio mata-mata iniciado
- **THEN** a página mostra a chave por fases no lugar da classificação por pontos

#### Scenario: Grupos renderizam tabelas por grupo e a chave
- **WHEN** um usuário autenticado abre a página de um torneio de grupos ou fase de liga iniciado
- **THEN** a página mostra a classificação por grupo (única na fase de liga) e, quando gerada, a chave

#### Scenario: Sem partidas encerradas
- **WHEN** o torneio avulso ou liga visível ainda não tem partida encerrada
- **THEN** a página informa que a classificação aparecerá após a primeira partida encerrada

#### Scenario: Torneio invisível ou inexistente
- **WHEN** o id não existe, é de torneio privado de terceiro, ou não é um uuid
- **THEN** a página responde com notFound (404), sem distinguir os casos

### Requirement: Fetcher de classificação
`getTournamentClassificacao` SHALL, em formatos competitivos, embedar as VAGAS dos lados (vaga → team nome/escudo + técnico id/nome/celular/avatar) numa única viagem, rodar os motores sobre slot ids e resolver o display como CLUBE (nome/escudo) com técnico como detalhe; partidas avulsas mantêm o caminho por participante. As projeções (linhas, partidasAbertas/Encerradas, chave, grupos, clubes) mantêm os contratos atuais com o lado competitivo resolvido por vaga; o celular continua restrito à projeção de partidas abertas.

#### Scenario: Linha da classificação é o clube
- **WHEN** o fetcher resolve um torneio competitivo
- **THEN** cada linha carrega nome/escudo do clube e o técnico atual (ou vaga aberta)

#### Scenario: Avulso inalterado
- **WHEN** o torneio é avulso
- **THEN** os lados continuam sendo pessoas como hoje

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

