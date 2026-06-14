# round-management Specification

## Purpose
TBD - created by archiving change add-rounds-walkover. Update Purpose after archive.
## Requirements
### Requirement: Rodada ativa derivada

O sistema SHALL tratar como rodada ativa a MENOR `rodada` entre as partidas ainda não
encerradas de um torneio competitivo (liga, mata-mata, grupos, fase de liga). A rodada
ativa SHALL ser DERIVADA das partidas, sem coluna ou tabela de estado de rodada. O avulso
não tem rodada e SHALL ficar fora deste comportamento.

Como a visibilidade das partidas passa a depender da liberação, a rodada ativa SHALL ser
derivada do conjunto de partidas que o solicitante enxerga: para o dono, de todas; para o
não-dono, apenas das rodadas liberadas. Os controles de gestão de rodada (fechar/liberar)
SHALL permanecer restritos ao dono, que enxerga todas as rodadas.

#### Scenario: Rodada ativa avança ao encerrar a anterior

- **WHEN** todas as partidas da rodada 1 encerram e a rodada 2 ainda tem partidas abertas
- **THEN** a rodada ativa exibida passa a ser a 2

#### Scenario: Sem partidas abertas não há rodada ativa

- **WHEN** todas as partidas do torneio estão encerradas
- **THEN** não há rodada ativa (nenhum bloco de "rodada em aberto")

#### Scenario: Não-dono não considera rodadas ocultas como ativas

- **WHEN** o não-dono vê só a rodada 1 (as demais ocultas) e ela tem partidas abertas
- **THEN** a rodada ativa para ele é a 1, independentemente de existirem rodadas futuras
  geradas e ocultas

### Requirement: Fechamento de rodada
O dono SHALL poder FECHAR uma rodada, e a rodada SHALL fechar automaticamente
quando a última partida entre clubes COM técnico daquela rodada encerrar.
Fechar a rodada SHALL resolver por W.O. AUTOMÁTICO toda partida ainda aberta
em que um lado é clube ÓRFÃO (vaga sem técnico) e o outro tem técnico — o lado
com técnico vence. Partidas abertas entre dois clubes COM técnico NÃO SHALL ser
tocadas pelo fechamento (resultado real ou W.O. manual decide). O fechamento
SHALL exigir torneio ATIVO e a propriedade do dono.

#### Scenario: Fechar rodada resolve órfãos por W.O.
- **WHEN** o dono fecha a rodada e há uma partida aberta contra um clube órfão
- **THEN** essa partida vira W.O. com vitória para o clube que tem técnico

#### Scenario: Fechamento automático ao último resultado real
- **WHEN** o último jogo entre clubes com técnico da rodada encerra e ainda
  restam partidas abertas só contra órfãos
- **THEN** essas partidas viram W.O. automaticamente, sem ação do dono

#### Scenario: Partida disputável não é forçada
- **WHEN** o dono fecha a rodada mas há uma partida aberta entre dois clubes
  COM técnico
- **THEN** essa partida permanece aberta (o fechamento não inventa resultado)

#### Scenario: Órfão contra órfão fica em aberto
- **WHEN** ambos os lados de uma partida aberta são clubes órfãos
- **THEN** o fechamento não a resolve (não há vencedor possível)

### Requirement: Liberação de rodadas pelo dono

O dono de um campeonato SHALL poder LIBERAR rodadas ocultas com cadência manual, tornando
as partidas correspondentes visíveis e jogáveis. SHALL existir uma Server Action
`liberarRodadas(tournamentId, alvo)` restrita ao dono (checagem de posse por
`tournaments.created_by` e torneio não encerrado), onde `alvo` SHALL cobrir:

- `{ tipo: "rodada", rodada: N }` — libera todas as partidas da rodada `N`;
- `{ tipo: "ate", rodada: N }` — libera todas as rodadas até `N` (base para "próximas N");
- `{ tipo: "faseGrupos" }` — libera todas as partidas de fase de grupos (`grupo` não nulo);
- `{ tipo: "tudo" }` — libera todas as partidas ocultas do torneio.

A liberação SHALL ser idempotente: só altera partidas com `liberada_em is null`, setando
`liberada_em = now()`. A action SHALL revalidar a página do torneio. A unidade canônica de
liberação SHALL ser a coluna `rodada` (em liga = rodada global; em fase de grupos = rodada
de todos os grupos juntos; o avulso, sem rodada, fica fora). Como divisões de pirâmide são
`tournaments`, a action SHALL valer igualmente para ligas.

#### Scenario: Liberar a próxima rodada oculta

- **WHEN** o dono libera a rodada `N` (a menor ainda oculta)
- **THEN** as partidas da rodada `N` passam a ter `liberada_em = now()` e ficam visíveis;
  as rodadas seguintes seguem ocultas

#### Scenario: Liberar tudo

- **WHEN** o dono escolhe "Liberar tudo"
- **THEN** todas as partidas ocultas do torneio são liberadas de uma vez

#### Scenario: Liberar a fase de grupos inteira

- **WHEN** o dono de um torneio de grupos escolhe "Liberar fase de grupos"
- **THEN** todas as partidas com `grupo` não nulo são liberadas; a chave (se houver) não

#### Scenario: Liberação é só do dono

- **WHEN** um usuário que não é dono tenta liberar rodadas
- **THEN** a operação é negada (checagem de posse na action + policy de UPDATE do dono)

#### Scenario: Reliberar não tem efeito colateral

- **WHEN** o dono libera uma rodada já liberada
- **THEN** nada muda (o filtro `liberada_em is null` torna a ação idempotente)

### Requirement: Cadência inicial na geração da tabela

Ao gerar a tabela de um torneio standalone, o dono SHALL escolher a cadência inicial:
`iniciarTorneio` (liga) e `iniciarTorneioGrupos` (fase de grupos) SHALL aceitar
`liberarTudo` (default `true`). Com `liberarTudo = true`, as rodadas SHALL nascer liberadas
(comportamento atual preservado). Com `liberarTudo = false`, as rodadas SHALL nascer
**ocultas** (`liberada_em = null`), cabendo ao dono liberá-las.

A escolha SHALL estar disponível como um controle no painel de início do torneio
standalone. O default SHALL ser "liberar tudo agora", de modo que campeonatos existentes e
quem não usar a cadência não percebam diferença.

#### Scenario: Largada com liberação total (padrão)

- **WHEN** o dono inicia o torneio mantendo "Liberar todas as rodadas agora"
- **THEN** todas as rodadas nascem liberadas, como hoje

#### Scenario: Largada com liberação manual

- **WHEN** o dono inicia o torneio escolhendo "Vou liberar manualmente"
- **THEN** todas as rodadas nascem ocultas e só o dono as vê até liberar

### Requirement: Mata-mata e geração sob demanda nascem liberados

As partidas geradas sob demanda SHALL nascer liberadas (`liberada_em = now()` via default).
Isso vale para a primeira fase de mata-mata, o avanço de fase, a chave a partir dos grupos,
a chave da pirâmide (playoff, barragem e grande final) e a fase de grupos de divisão de
pirâmide. A razão é que a chave já serializa naturalmente pelo fluxo de "Avançar fase" e não
comporta liberação antecipada (a fase futura ainda não existe como partida). As partidas de
bye, que nascem encerradas, SHALL nascer igualmente liberadas para não sumirem da visão
pública.

#### Scenario: Próxima fase do mata-mata já nasce visível

- **WHEN** o dono avança a fase do mata-mata
- **THEN** as partidas da nova fase nascem liberadas e visíveis

#### Scenario: Bye permanece visível

- **WHEN** uma fase com bye é gerada
- **THEN** a partida de bye (encerrada) nasce liberada e aparece na chave

