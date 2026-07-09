## ADDED Requirements

### Requirement: Tenures e carreira incluem copas via a vaga herdada
O sistema SHALL abrir uma tenure de copa no INSERT da vaga que carrega
`competitor_id` + `user_id` (via o trigger `fn_registrar_coach_tenure`, SEM
alteração), com `season_id`/`division_season_id` NULOS — pois
`fn_resolver_season_divisao` não resolve torneio de copa —, na MESMA forma das
tenures de playoff/barragem/grande final já existentes. A carreira do técnico
(`getTecnicoCampanha`) e o confronto entre técnicos (`getConfrontoTecnicos`) SHALL
INCLUIR os jogos de copa creditáveis (vaga do técnico com `competitor_id`, partida
encerrada), sob o MESMO `competitor_id` do clube de liga (carreira unificada
liga+copa). Nenhuma tenure de copa SHALL ser aberta para vaga sem `competitor_id`.

#### Scenario: Jogo de copa entra na campanha do técnico
- **WHEN** o técnico comandou (por herança) a vaga de um clube numa copa e disputou uma partida encerrada
- **THEN** essa partida é creditada à campanha de sempre e ao confronto do técnico, sob o clube de liga correspondente

#### Scenario: Vaga de copa sem competidor não gera tenure
- **WHEN** a vaga de copa é por-nome/manual/origem-copa (sem `competitor_id`)
- **THEN** nenhuma tenure de técnico é aberta e seus jogos não entram em carreira nenhuma

### Requirement: Consumidores de coach_tenures tratam a tenure de copa sem regressão
Os consumidores de `coach_tenures` e de `tournament_slots.competitor_id` SHALL
continuar corretos com a introdução das tenures de copa (`season_id` nulo). A
contagem de temporadas em `getTecnicoProfile` SHALL ignorar tenures sem `season_id`
(já ocorre) e o flag de vigência ("· atual") SHALL considerar apenas tenures de
temporada (`season_id NOT NULL`), de modo que uma tenure de copa aberta NÃO marque o
clube como atual. A timeline de técnicos do clube (`getTecnicosDoCompetidor`) SHALL
tratar a tenure de copa como as de playoff/barragem (não a exibindo como temporada
fantasma). Os troféus herdados (`getConquistasDoTecnico`, cruzando
`(competitor_id, season_id)`) NÃO SHALL atribuir troféu de liga a uma tenure de copa
(season nula). As classificações POR-TORNEIO (escopadas por `tournament_id`) e a
materialização de conquistas de temporada (`registrar_conquistas_temporada`,
escopada a season/divisão) NÃO SHALL ser afetadas. A inclusão dos jogos de copa nos
consumidores AGREGADOS por competidor (`getCompetidorInsights`, `getConfrontoDireto`,
`getArtilheirosDoCompetidor`) SHALL ser tratada como intencional — paridade com os
jogos de playoff/barragem/grande final, que já compartilham o `competitor_id`.

#### Scenario: Copa não infla temporadas nem marca clube como atual
- **WHEN** o técnico tem uma tenure de copa aberta num clube mas nenhuma tenure de temporada aberta ali
- **THEN** o total de temporadas não conta a copa e o clube não é marcado "· atual" pela copa

#### Scenario: Copa não gera troféu de liga herdado
- **WHEN** existe uma tenure de copa (season nula) para um competidor
- **THEN** nenhum troféu de temporada de liga é atribuído a ela

#### Scenario: Classificação da liga não muda
- **WHEN** um competidor passa a ter vaga de copa com o mesmo `competitor_id`
- **THEN** a tabela/classificação por-torneio da liga (escopada por `tournament_id`) permanece inalterada
