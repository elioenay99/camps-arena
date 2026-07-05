# goal-scorers — Delta Spec

## MODIFIED Requirements

### Requirement: Ranking de artilharia por competição
O sistema SHALL expor um ranking de artilharia de uma competição (torneio, ou o
conjunto de torneios de uma temporada/pirâmide), agregando os gols por
`(competidor, nome_normalizado)` — a mesma grafia sob competidores diferentes
conta SEPARADAMENTE ("Endrick (do Ataias)" ≠ "Endrick (do João)"). Cada linha
SHALL trazer o competidor (id + nome do clube/rótulo), o ESCUDO do clube do
competidor quando houver (`escudoUrl`, `null` para competidor por-nome/avulso),
o nome do artilheiro e o total de gols, ordenado por gols decrescente. A UI do
ranking SHALL exibir o escudo real do clube em cada linha, caindo para o
monograma (iniciais + cor estável) apenas quando `escudoUrl` é `null`. O ranking
SHALL respeitar a visibilidade das partidas (gols de rodada oculta não entram
para quem não pode vê-la). Partidas sem competidor persistente (avulso) NÃO
SHALL entrar no ranking.

#### Scenario: Artilheiros agregados e ordenados
- **WHEN** "Endrick (do Ataias)" fez 3 gols e "Vini (do Ataias)" fez 5 no torneio
- **THEN** o ranking lista "Vini" (5) acima de "Endrick" (3), ambos atribuídos ao competidor Ataias

#### Scenario: Mesmo nome sob competidores diferentes é separado
- **WHEN** "Endrick (do Ataias)" fez 2 gols e "Endrick (do João)" fez 4
- **THEN** o ranking mostra DUAS linhas de "Endrick" (uma por competidor), não uma soma de 6

#### Scenario: Escudo real identifica o competidor
- **WHEN** o competidor "Ataias" tem clube com `escudo_url` definido
- **THEN** cada linha de artilheiro daquele competidor traz `escudoUrl` = a URL do escudo, e a UI mostra o escudo real no lugar do monograma

#### Scenario: Competidor por-nome cai no monograma
- **WHEN** o competidor é por-nome/avulso (sem clube)
- **THEN** a linha traz `escudoUrl` = `null` e a UI exibe o monograma (iniciais + cor estável), sem quebrar
