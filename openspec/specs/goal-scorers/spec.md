# goal-scorers Specification

## Purpose
TBD - created by archiving change add-artilharia. Update Purpose after archive.
## Requirements
### Requirement: Captura opcional de autores de gols no lançamento de placar
Ao lançar o placar (fluxo direto ou proposta), o sistema SHALL permitir informar
OPCIONALMENTE quem fez cada gol, como uma lista de `{lado, jogador, gols}` onde
`jogador` é NOME LIVRE (`btrim`, 1..60 caracteres) e `gols` é inteiro 1..99. A
soma de `gols`
por lado SHALL ser menor ou igual ao placar daquele lado; um mesmo autor NÃO
SHALL aparecer duplicado no mesmo lado (comparação case-insensitive). Informar
MENOS gols atribuídos que o placar é permitido. Quando nenhum autor é informado,
o lançamento SHALL preservar o comportamento atual (só placar).

#### Scenario: Autores válidos aceitos
- **WHEN** a organização lança 2x1 informando `[{lado:1,jogador:"Endrick",gols:2},{lado:2,jogador:"João",gols:1}]`
- **THEN** o placar é salvo e os autores são registrados na partida

#### Scenario: Soma por lado acima do placar é rejeitada
- **WHEN** o placar do lado 1 é 1 mas os autores somam 2 gols no lado 1
- **THEN** o lançamento é rejeitado com erro de validação (nenhum placar/gol é gravado)

#### Scenario: Placar sem autores segue o fluxo atual
- **WHEN** o placar é lançado sem informar autores
- **THEN** o placar é salvo e a partida não tem autores de gols registrados

### Requirement: Autor de gol é nome livre com autocomplete por competidor
O sistema SHALL sugerir, ao digitar o autor de um gol, os nomes que AQUELE
competidor já usou anteriormente, ordenados por frequência (mais usados
primeiro). As sugestões SHALL ser escopadas ao competidor do lado em questão —
os nomes de um competidor NÃO SHALL vazar para o autocomplete de outro.

#### Scenario: Sugestões vêm do histórico do competidor
- **WHEN** o competidor "Ataias" já registrou gols de "Endrick" e "Vini" em partidas anteriores
- **THEN** o autocomplete daquele competidor sugere "Endrick" e "Vini"

#### Scenario: Autocomplete não mistura competidores
- **WHEN** o competidor "João" nunca registrou "Endrick"
- **THEN** "Endrick" não aparece no autocomplete do competidor "João"

### Requirement: Ranking de artilharia por competição
O sistema SHALL expor um ranking de artilharia de uma competição (torneio, ou o
conjunto de torneios de uma temporada/pirâmide), agregando os gols por
`(competidor, nome_normalizado)` — a mesma grafia sob competidores diferentes
conta SEPARADAMENTE ("Endrick (do Ataias)" ≠ "Endrick (do João)"). Cada linha
SHALL trazer o competidor (id + nome do clube/rótulo), o nome do artilheiro e o
total de gols, ordenado por gols decrescente. O ranking SHALL respeitar a
visibilidade das partidas (gols de rodada oculta não entram para quem não pode
vê-la). Partidas sem competidor persistente (avulso) NÃO SHALL entrar no ranking.

#### Scenario: Artilheiros agregados e ordenados
- **WHEN** "Endrick (do Ataias)" fez 3 gols e "Vini (do Ataias)" fez 5 no torneio
- **THEN** o ranking lista "Vini" (5) acima de "Endrick" (3), ambos atribuídos ao competidor Ataias

#### Scenario: Mesmo nome sob competidores diferentes é separado
- **WHEN** "Endrick (do Ataias)" fez 2 gols e "Endrick (do João)" fez 4
- **THEN** o ranking mostra DUAS linhas de "Endrick" (uma por competidor), não uma soma de 6

### Requirement: Artilheiros na carreira do competidor
A página de um competidor persistente SHALL exibir seus artilheiros —
`{jogador, gols}` agregados por nome normalizado ao longo de todas as partidas
do competidor, ordenados por gols decrescente. O conjunto SHALL casar com a
identidade do competidor usada por `getCompetitorProfile` (mesmo `competitor_id`).

#### Scenario: Carreira soma através de temporadas
- **WHEN** o competidor marcou com "Endrick" em duas temporadas diferentes (2 + 1 gols)
- **THEN** a seção de artilheiros do competidor mostra "Endrick" com 3 gols

### Requirement: Assistências e MVP fora de escopo
Esta capacidade SHALL registrar apenas AUTORES DE GOLS. Assistências, cartões e
MVP da partida NÃO fazem parte do escopo e podem ser adicionados depois sem
migração destrutiva (a tabela é aditiva).

#### Scenario: Só gols são capturados
- **WHEN** um gol é registrado
- **THEN** apenas autor e contagem de gols são persistidos, sem assistência/MVP

