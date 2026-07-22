## ADDED Requirements

### Requirement: Origem de qualificação "todos os clubes de uma divisão"
O sistema SHALL suportar uma origem de regra de qualificação `divisao_todos` que qualifica **todos**
os competidores de uma divisão de liga da **temporada corrente** (a de maior `numero`), sem depender
de posição/classificação e **sem** exigir temporada `encerrada`. Uma regra `divisao_todos` SHALL
referenciar `origem_competition_id` + `origem_nivel` (como `divisao`), sem `origem_cup_id`, e **sem
faixa de posição** (`posicao_inicio`/`posicao_fim` nulos). A leitura da origem SHALL ocorrer via RPC
SECURITY DEFINER `inscritos_divisao`, que replica o gate de consentimento das RPCs clássicas
(`is_public` da pirâmide OU dono da copa, senão `ORIGEM_INVISIVEL`).

#### Scenario: Regra que leva a divisão inteira
- **WHEN** o dono adiciona uma regra de origem `divisao_todos` para a Série A de uma pirâmide
- **THEN** o sistema persiste a regra com `origem_competition_id`/`origem_nivel` preenchidos,
  `origem_cup_id` nulo e `posicao_inicio`/`posicao_fim` nulos (faixa não se aplica)

#### Scenario: Faixa de posição não se aplica a divisao_todos
- **WHEN** o dono cria/edita uma regra `divisao_todos`
- **THEN** a UI oculta os inputs de faixa e o sistema NÃO exige `posicao_inicio`/`posicao_fim`

#### Scenario: Consentimento replicado na origem todos
- **WHEN** a pirâmide referenciada é privada de terceiro (não pública nem do dono da copa)
- **THEN** a leitura recusa com `ORIGEM_INVISIVEL`, igual à origem clássica

#### Scenario: Mistura por divisão
- **WHEN** o dono adiciona uma regra "todos da Série A" e outra "todos da Série B" na mesma copa
- **THEN** ambas as divisões contribuem seus competidores (misturáveis com quaisquer outras regras),
  sem um caminho de "pirâmide inteira num clique"

### Requirement: Integridade do modelo de regra com divisao_todos
As CHECKs de `cup_qualification_rules` SHALL admitir `divisao_todos` no XOR de origem (competition_id
+ nivel presentes, cup_id nulo) e SHALL exigir faixa **nula** para `divisao_todos` enquanto mantêm a
faixa **obrigatória e válida** (`fim >= inicio >= 1`) para `divisao` e `copa`.

#### Scenario: XOR de origem aceita divisao_todos
- **WHEN** uma regra `divisao_todos` é inserida com `origem_competition_id` + `origem_nivel` e sem
  `origem_cup_id`
- **THEN** a CHECK de origem aprova

#### Scenario: Faixa obrigatória preservada para divisão clássica
- **WHEN** uma regra `divisao` (clássica) é inserida sem `posicao_inicio`/`posicao_fim`
- **THEN** a CHECK de faixa recusa (a origem clássica continua exigindo faixa válida)
