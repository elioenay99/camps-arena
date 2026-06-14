# data-model — Delta Spec

## ADDED Requirements

### Requirement: Liberação de partida por rodada

O modelo de dados SHALL permitir que cada partida (`matches`) carregue um momento de
liberação `liberada_em` do tipo `timestamptz`, *nullable*, com `DEFAULT now()`.

A semântica de `liberada_em` SHALL ser:
- `NULL` — partida **oculta** (visível apenas para o dono do torneio);
- `<= now()` — partida **liberada** (visível e jogável pelos demais ramos de visibilidade);
- `> now()` — partida **agendada** (suportada pelo tipo para a evolução futura; sem UI no v1).

Toda partida já existente no momento da migração SHALL ser **backfilled** com `liberada_em
= now()`, preservando o comportamento atual (nada deixa de aparecer). O `DEFAULT now()`
SHALL fazer com que qualquer inserção futura nasça liberada, salvo quando o caminho de
geração informar explicitamente `liberada_em = null` (cadência manual).

SHALL existir um índice em `(tournament_id, liberada_em)` para suportar o filtro de
visibilidade por torneio.

A coluna `liberada_em` NÃO SHALL ser incluída na lista de colunas estruturais imutáveis do
trigger `lock_match_relations` (a liberação precisa poder mudar após a criação).

#### Scenario: Partida nova nasce liberada por padrão

- **WHEN** uma partida é inserida sem informar `liberada_em`
- **THEN** o `DEFAULT now()` a torna imediatamente liberada

#### Scenario: Partida pode nascer oculta

- **WHEN** o caminho de geração insere uma partida com `liberada_em = null`
- **THEN** a partida fica oculta até ser liberada

#### Scenario: Partidas existentes permanecem visíveis após a migração

- **WHEN** a coluna é adicionada e o backfill roda
- **THEN** toda partida pré-existente passa a ter `liberada_em = now()` e continua visível

#### Scenario: Reaplicação idempotente

- **WHEN** o bloco de DDL é reaplicado
- **THEN** não há erro (coluna, default, índice e backfill são idempotentes)
