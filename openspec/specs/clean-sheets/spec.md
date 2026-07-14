# clean-sheets Specification

## Purpose
TBD - created by archiving change add-muralha-defesas. Update Purpose after archive.
## Requirements
### Requirement: Ranking de defesas (Muralha) por competidor

O sistema SHALL prover um ranking de defesas ("Muralha") por competidor, derivado das
partidas ENCERRADAS, contando por competidor o número de **clean sheets** (jogos sem
sofrer gol) e os **gols sofridos**, considerando apenas jogos REAIS. Partidas de W.O. e
duplo W.O. NÃO SHALL contar como clean sheet nem como gols sofridos (reusando a regra
de `resultadoDoLado`, que já exclui W.O.). Um lado sem competidor associado (avulso
por-nome) NÃO SHALL entrar no ranking. O ranking SHALL ser ordenado por clean sheets
decrescente, desempatando por gols sofridos crescente, depois por jogos **decrescente**
(defesa sólida sustentada por mais jogos vale mais), depois por nome.

#### Scenario: Clean sheet real conta, W.O. não
- **WHEN** um competidor tem um 0×0 real e um 0×0 por W.O.
- **THEN** só o 0×0 real conta como clean sheet (e o W.O. não entra em jogos nem gols sofridos)

#### Scenario: Ordenação premia consistência
- **WHEN** dois competidores têm o mesmo número de clean sheets
- **THEN** fica na frente o que sofreu menos gols; persistindo o empate, o que jogou MAIS (sustentou a defesa por mais partidas)

### Requirement: Muralha nas superfícies de torneio, pirâmide e competidor

O ranking de defesas SHALL aparecer nas mesmas superfícies da artilharia: na página do
torneio (apenas torneios gerados/competitivos), na pirâmide/temporada da liga
(agregando as divisões da temporada, Apertura+Clausura), e na carreira do competidor
(total de clean sheets). A visibilidade SHALL respeitar a RLS existente (não-dono só vê
o que já enxerga da classificação/artilharia).

#### Scenario: Muralha na página do torneio
- **WHEN** um usuário abre um torneio gerado com partidas encerradas
- **THEN** vê o ranking de defesas junto ao de artilharia

#### Scenario: Muralha da temporada agrega as divisões
- **WHEN** a Muralha é exibida na pirâmide de uma temporada
- **THEN** ela agrega os jogos de todas as divisões da temporada (incluindo o split, se houver)

### Requirement: Ranking de defesas (Muralha) limitado a top 10 com expansão

O ranking de defesas (Muralha) SHALL exibir por padrão apenas os 10 primeiros, com um
controle "Ver mais" que revela a lista completa e alterna para "Ver menos", com alvo de
toque ≥44px e estado acessível (`aria-expanded`/`aria-controls`), espelhando a artilharia.
Com 10 ou menos, o controle NÃO SHALL aparecer.

#### Scenario: Muralha longa mostra top 10 + ver mais
- **WHEN** a Muralha tem mais de 10 competidores
- **THEN** só os 10 primeiros aparecem, com um botão "Ver mais (N)" que expande o restante

