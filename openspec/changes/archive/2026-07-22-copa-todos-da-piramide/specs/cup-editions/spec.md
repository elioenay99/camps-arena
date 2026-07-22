## ADDED Requirements

### Requirement: Derivar vagas da origem "todos" (temporada corrente, sem faixa)
Para uma regra `divisao_todos`, a derivação SHALL ler **todos** os competidores da divisão na
**temporada corrente** (maior `numero`) via `inscritos_divisao`, consumindo a **lista inteira** da
origem (uma vaga por competidor), **sem** expandir uma faixa de posições. O motor SHALL usar uma
**chave de origem distinta** da origem clássica (`todos:…` ≠ `div:…`), porque as leituras vêm de RPCs
diferentes; o dedup global por identidade de edição SHALL continuar evitando duplicar um mesmo clube
entre regras.

#### Scenario: Divisão inteira vira vagas
- **WHEN** a Série A corrente tem 20 competidores e a copa tem uma regra `divisao_todos` para ela
- **THEN** a derivação produz 20 `cup_entries` (uma por competidor), sem lacunas de faixa

#### Scenario: Duas divisões somam 40
- **WHEN** a copa tem "todos da Série A" (20) e "todos da Série B" (20)
- **THEN** a derivação produz 40 participantes distintos (dedup global inalterado)

#### Scenario: Regra clássica e todos da mesma divisão não se confundem
- **WHEN** existem uma regra `divisao` (faixa 1..4, temporada encerrada) e uma `divisao_todos`
  (temporada corrente) apontando para a mesma competição+nível
- **THEN** cada uma lê sua própria RPC (cache separado por chave de origem) e um clube não é
  duplicado entre elas

### Requirement: Técnico dinâmico resolvido do slot na derivação
A derivação de uma origem `divisao_todos` SHALL resolver o técnico **vivo** de cada clube a partir do
**slot** da temporada corrente (`league_division_entries.slot_id → tournament_slots.user_id`), **não**
do `league_competitors.holder_user_id` (vestigial), e SHALL gravá-lo em `cup_entries.tecnico_user_id`.
A montagem (`montar_copa`) SHALL semear o técnico do slot da copa com
`coalesce(cup_entries.tecnico_user_id, league_competitors.holder_user_id)`, mantendo o mecanismo de
dedup de técnico por edição (mesmo técnico não ocupa duas vagas). Re-derivar uma edição SHALL repegar
os técnicos atuais.

#### Scenario: Técnico atual aparece na copa
- **WHEN** um competidor da Série A tem técnico X no slot da temporada corrente e a edição é derivada
- **THEN** `cup_entries.tecnico_user_id = X` e, ao montar, o slot da copa recebe `user_id = X`

#### Scenario: Quem assume o clube antes da derivação aparece
- **WHEN** um técnico assume o slot de um clube e a edição é (re)derivada em seguida
- **THEN** esse técnico passa a constar na entry do clube (a derivação repega o slot atual)

#### Scenario: Dedup de técnico por edição preservado
- **WHEN** o mesmo técnico responde por dois clubes que entram na mesma edição
- **THEN** apenas a primeira vaga recebe `user_id`; a segunda fica sem técnico (mantendo o clube),
  como no comportamento existente de `montar_copa`

### Requirement: Clube órfão entra sem técnico
Um clube cuja vaga na divisão corrente não tem técnico (slot sem `user_id`) SHALL entrar na copa
mesmo assim, com `cup_entries.tecnico_user_id` nulo e, ao montar, slot da copa sem `user_id`.

#### Scenario: Divisão com órfãos
- **WHEN** a Série B corrente tem 5 clubes com técnico e 15 órfãos, e a copa leva "todos da Série B"
- **THEN** os 20 clubes entram; os 15 órfãos ficam com `tecnico_user_id` nulo (sem técnico no slot)

### Requirement: Origem "todos" não regride o caminho clássico
A introdução da origem `divisao_todos` SHALL NÃO alterar o comportamento das origens `divisao`/`copa`:
para elas `cup_entries.tecnico_user_id` permanece nulo e a semeadura de técnico cai no
`holder_user_id` (vestigial) como antes; o gate de ativação diferida (`ORIGEM_NAO_ENCERRADA`)
continua valendo apenas para as origens clássicas.

#### Scenario: Copa clássica inalterada
- **WHEN** uma edição é derivada apenas de origens `divisao`/`copa` encerradas
- **THEN** o resultado (participantes, técnicos, ordem de seeding) é idêntico ao comportamento atual
