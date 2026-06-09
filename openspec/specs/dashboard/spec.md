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

### Requirement: Partidas em aberto agrupadas por rodada
Na página do torneio, as partidas em aberto de formatos competitivos SHALL ser
agrupadas por RODADA, cada grupo com um cabeçalho ("Rodada N" / rótulo de fase)
e — para o dono de torneio ativo — um botão "Fechar rodada N" no cabeçalho da
rodada ativa. O avulso (sem rodada) SHALL manter a lista plana.

#### Scenario: Bloco por rodada com botão de fechar
- **WHEN** o dono abre seu torneio competitivo com partidas abertas em mais de
  uma rodada
- **THEN** vê um bloco por rodada e o botão "Fechar rodada" na rodada ativa

### Requirement: Console de solicitações de W.O. do dono
Quando houver solicitações de W.O. PENDENTES no torneio, o dono SHALL ver, na
página do torneio, cada solicitação (clube solicitante + partida) com as ações
de aceitar e recusar.

#### Scenario: Dono vê e resolve solicitações
- **WHEN** existem solicitações de W.O. pendentes
- **THEN** o dono vê a lista com aceitar/recusar por solicitação

### Requirement: Placar e status ao vivo no painel

O painel SHALL atualizar, em tempo real e sem refresh, o placar e o status das
partidas ativas JÁ visíveis na tela, via Supabase Realtime (eventos `UPDATE` de
`matches`). A atualização SHALL respeitar a RLS existente — o usuário só recebe
eventos de partidas que já pode ler. A composição da lista (partida que entra ou
que encerra e sai do filtro) NÃO é alterada ao vivo: só muda em um novo
carregamento. Se o canal de tempo real não conectar, o painel SHALL se comportar
como hoje (valores do carregamento), sem erro visível.

#### Scenario: Placar muda sozinho

- **WHEN** o adversário registra um gol em uma partida visível no meu painel
- **THEN** o placar daquela partida atualiza na minha tela sem eu dar refresh

#### Scenario: Status muda sozinho

- **WHEN** uma partida visível passa de agendada para em andamento
- **THEN** a cápsula de status do card atualiza ao vivo

#### Scenario: Sem ampliar visibilidade

- **WHEN** chega um evento de uma partida que eu não tenho permissão de ver
- **THEN** o painel não exibe essa partida nem seus dados (RLS no canal)

#### Scenario: Degradação sem websocket

- **WHEN** a conexão de tempo real não é estabelecida
- **THEN** o painel exibe os valores do carregamento e nada quebra

