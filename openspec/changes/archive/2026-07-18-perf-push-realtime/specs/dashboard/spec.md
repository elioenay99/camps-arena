## MODIFIED Requirements

### Requirement: Placar e status ao vivo no painel

O painel SHALL atualizar, em tempo real e sem refresh, o placar e o status das
partidas ativas JÁ visíveis na tela, via Supabase Realtime (eventos `UPDATE` de
`matches`). A atualização SHALL respeitar a RLS existente — o usuário só recebe
eventos de partidas que já pode ler. A composição da lista (partida que entra ou
que encerra e sai do filtro) NÃO é alterada ao vivo: só muda em um novo
carregamento. Se o canal de tempo real não conectar, o painel SHALL se comportar
como hoje (valores do carregamento), sem erro visível.

O `LiveMatchesProvider` SHALL aceitar um parâmetro OPCIONAL de escopo por torneio.
Sem esse parâmetro (dashboard multi-torneio), o provider SHALL assinar todas as
partidas visíveis por RLS e filtrar no cliente (comportamento deliberado, sem
regressão), num canal de nome estável (`dashboard-matches`). Com o parâmetro (uma
página de torneio único), o provider SHALL aplicar `filter:
'tournament_id=eq.<id>'` na assinatura `postgres_changes` (o Postgres filtra na
origem) e SHALL usar um nome de canal escopado por torneio, de modo que dois
providers de páginas distintas nunca compartilhem o mesmo canal.

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

#### Scenario: Dashboard multi-torneio não regride

- **WHEN** o `LiveMatchesProvider` é montado sem `tournamentId` (dashboard)
- **THEN** ele assina o canal global `dashboard-matches` sem `filter` na origem e mantém a filtragem client-side dos ids visíveis

#### Scenario: Página de torneio escopa a assinatura

- **WHEN** o `LiveMatchesProvider` é montado com `tournamentId`
- **THEN** ele assina um canal escopado por torneio e aplica `filter: 'tournament_id=eq.<id>'`, recebendo da origem apenas eventos daquele torneio
