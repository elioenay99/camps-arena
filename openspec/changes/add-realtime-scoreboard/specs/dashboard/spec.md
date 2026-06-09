# dashboard — Delta Spec

## ADDED Requirements

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
