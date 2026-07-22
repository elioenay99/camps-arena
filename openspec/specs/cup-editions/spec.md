# cup-editions Specification

## Purpose
TBD - created by archiving change add-copas-continentais. Update Purpose after archive.
## Requirements
### Requirement: Criar edição da copa
O sistema SHALL permitir que o dono crie uma **edição** (`cup_seasons`) de uma copa, numerada sequencialmente (1-based, única por copa), iniciando em status `rascunho`.

#### Scenario: Primeira edição
- **WHEN** o dono cria a primeira edição de uma copa
- **THEN** o sistema cria `cup_seasons` com `numero=1` e status `rascunho`

#### Scenario: Numeração sequencial
- **WHEN** já existe a edição 1 e o dono cria outra
- **THEN** a nova edição recebe `numero=2` e referencia a anterior (`previous_season_id`)

### Requirement: Derivar vagas das origens encerradas
O sistema SHALL derivar os participantes lendo, por regra, a **classificação final** da origem via RPC SECURITY DEFINER (consentimento por `is_public`/dono). Para origem divisão, a fonte é `league_division_entries.posicao_final` da temporada **encerrada de maior `numero`** daquela pirâmide, nível `origem_nivel`, join `league_competitors`. Para origem copa, é `cup_entries.posicao_final` da edição **encerrada de maior `numero`**. A faixa da regra seleciona um **rank de seeding contíguo** (ordem `posicao_final asc, competitor_id asc`). A derivação SHALL gravar as `cup_entries` preview com `origem_rule_id`, `origem_season_id` (a season/edição consumida), `seed` e descrição da origem.

#### Scenario: Pool derivado das regras
- **WHEN** o dono dispara a derivação e todas as origens têm temporada/edição encerrada e legível
- **THEN** o sistema cria as `cup_entries` correspondentes às faixas (sobre o rank de seeding) de cada regra, ordenadas por prioridade e rank, registrando a season-origem consumida

#### Scenario: Empate e lacuna na origem não quebram a faixa
- **WHEN** a divisão de origem tem `posicao_final` com empates e lacunas (ex.: 1,1,3,3,5) e a regra pede a faixa 1..4
- **THEN** o sistema seleciona deterministicamente os 4 primeiros do rank de seeding (4 vagas), independentemente dos valores crus de `posicao_final`

#### Scenario: Origem não-legível recusada
- **WHEN** a pirâmide/copa de origem é privada de terceiro ou está inacessível ao dono da copa
- **THEN** a derivação recusa com `ORIGEM_INVISIVEL` em vez de produzir vaga vazia silenciosa

#### Scenario: Nível inexistente na temporada consumida
- **WHEN** a regra referencia um `origem_nivel` que não existe na temporada encerrada consumida (a pirâmide encolheu)
- **THEN** a derivação recusa com `NIVEL_INEXISTENTE`

#### Scenario: Re-derivar preserva manuais e exclusões
- **WHEN** o dono re-dispara a derivação de uma edição em rascunho
- **THEN** o sistema recompõe as entries derivadas, preserva as `manual=true` como âncoras (consumindo identidade no dedup) e não reintroduz entries derivadas que o dono havia removido

### Requirement: Ativação diferida (só origens encerradas)
A derivação SHALL considerar apenas temporadas/edições de origem com status `encerrada`, escolhendo a de **maior `numero`**. Se nenhuma existir para uma origem, o sistema MUST recusar a montagem.

#### Scenario: Origem ainda em andamento
- **WHEN** a divisão de origem ainda não encerrou nenhuma temporada
- **THEN** o sistema recusa com `ORIGEM_NAO_ENCERRADA`

#### Scenario: Copa criada não afeta a temporada corrente
- **WHEN** o dono cria uma copa durante a temporada N em andamento de uma pirâmide
- **THEN** nenhuma edição é montada até que uma temporada da origem encerre

### Requirement: Deduplicação por prioridade com queda
Quando um mesmo participante (mesma identidade de edição = `team_id` ou `lower(trim(rotulo))`) se qualifica por mais de uma regra, o sistema SHALL mantê-lo apenas na ocorrência de **maior prioridade** e SHALL puxar o próximo elegível via **cursor único por origem** (compartilhado entre as regras da mesma origem). Se a origem se esgota, a vaga MAY ficar vazia — sem criar `cup_entry` placeholder.

#### Scenario: Clube classificado por dois caminhos
- **WHEN** um clube é 1º na liga (regra A, prioridade alta) e campeão da copa nacional (regra B, prioridade baixa)
- **THEN** o clube ocupa a vaga da regra A e a vaga da regra B avança o cursor da origem B para o próximo elegível

#### Scenario: Origem esgotada reduz o pool
- **WHEN** a queda exige um participante além do último rank disponível na origem
- **THEN** nenhuma `cup_entry` é criada para essa vaga; o pool final fica com N reduzido e a UI sinaliza a lacuna

### Requirement: Ajuste manual de participantes
O sistema SHALL permitir que o dono adicione, remova ou reordene participantes de uma edição em `rascunho` antes da montagem. Entries adicionadas/editadas manualmente MUST ser marcadas (`manual=true`); adicionar um participante já presente (mesmo `team_id` ou rótulo normalizado) MUST ser recusado com `PARTICIPANTE_DUPLICADO`.

#### Scenario: Dono troca um participante
- **WHEN** o dono remove uma entry derivada e adiciona outro clube manualmente
- **THEN** a edição reflete o ajuste, com a nova entry marcada como manual e a remoção persistida

#### Scenario: Duplicata manual recusada
- **WHEN** o dono tenta adicionar manualmente um clube/rótulo já presente na edição
- **THEN** o sistema recusa com `PARTICIPANTE_DUPLICADO`

### Requirement: Montar edição
O sistema SHALL montar a edição via RPC `montar_copa` (SECURITY DEFINER), criando **um** `tournaments` (formato da copa) e `tournament_slots` na ordem de seeding a partir de `cup_entries`, com `competitor_id`/`user_id` NULL (participante de copa não é `league_competitor`), e gravando `cup_entries.slot_id`. A montagem MUST validar dono (`created_by` direto), pertinência das entries (`ENTRY_DE_OUTRA_EDICAO`), homogeneidade (`COPA_HETEROGENEA`) e capacidade/geometria; MUST ser idempotente (sentinela `cup_seasons.tournament_id`) e serializada (advisory lock próprio).

#### Scenario: Montagem cria o torneio e os slots
- **WHEN** o dono monta uma edição em rascunho com participantes válidos
- **THEN** o sistema cria o torneio, insere os slots na ordem de seeding (sem `competitor_id`), grava `tournament_id`/`slot_id` e marca a edição como `montada`

#### Scenario: Montagem idempotente
- **WHEN** o dono dispara a montagem novamente de uma edição já montada
- **THEN** o sistema não cria um segundo torneio e retorna o existente

#### Scenario: Entry de outra edição rejeitada
- **WHEN** `p_seeded_entry_ids` inclui um id que não pertence à edição
- **THEN** o sistema recusa com `ENTRY_DE_OUTRA_EDICAO`

#### Scenario: Não-dono não monta
- **WHEN** um usuário que não é o dono tenta montar a edição
- **THEN** a operação é negada

### Requirement: Validação de tamanho por formato
Antes de criar o torneio, o sistema SHALL validar o número de participantes **efetivos** (vagas vazias excluídas) contra o formato: `mata_mata` exige `2 ≤ N ≤ 32`; `grupos_mata_mata` exige `validarGeometria(N, qtd_grupos, classificados_por_grupo)` (produto potência de 2). Excesso MUST ser recusado com `COPA_LOTADA`; geometria não-fechável MUST ser recusada com erro claro.

#### Scenario: Pool maior que 32
- **WHEN** a derivação (ex.: continental) produz mais de 32 participantes
- **THEN** a montagem é recusada com `COPA_LOTADA` e o dono é orientado a recortar manualmente

#### Scenario: Grupos sem geometria fechável
- **WHEN** o N efetivo é incompatível com `qtd_grupos`/`classificados_por_grupo` (produto não-potência-de-2)
- **THEN** a montagem é recusada e o dono é orientado a ajustar manualmente

### Requirement: Iniciar e jogar a edição
Após montada, o sistema SHALL iniciar a edição reusando o motor existente: `gerarChaveSemeada` (mata-mata, **honrando `cup_entries.seed`**) ou `gerarFaseGruposSemeada` (grupos+mata, **sorteio semeado** — o seed posicional não separa potes). A edição é jogada como um torneio comum, sob as RLS de `tournaments`/`match`.

#### Scenario: Início gera a chave semeada
- **WHEN** o dono inicia uma edição mata-mata montada
- **THEN** o sistema gera a chave semeada com os slots na ordem de `seed` e a edição vira `ativa`

### Requirement: Encerrar edição e registrar classificação final
O sistema SHALL permitir ao dono encerrar a edição quando o `tournaments` estiver encerrado, transicionando `cup_seasons.status` para `encerrada` e gravando `cup_entries.posicao_final` (classificação final derivada do torneio: campeão→vice→fase alcançada, empates por seed). Essa classificação SHALL alimentar regras `origem_tipo=copa` e a exibição.

#### Scenario: Campeão registrado
- **WHEN** o dono encerra uma edição cujo torneio terminou
- **THEN** a edição fica `encerrada`, `cup_entries.posicao_final` é gravado e o campeão fica disponível como origem para outra copa

#### Scenario: Não encerra com torneio em andamento
- **WHEN** o dono tenta encerrar uma edição cujo torneio ainda não encerrou
- **THEN** o sistema recusa

### Requirement: Montagem da copa herda técnico da divisão de origem
`classificacao_final_divisao` SHALL expor `competitor_id` no seu `returns table` (o
valor já disponível no join interno com `league_competitors`);
`classificacao_final_copa` NÃO SHALL ser alterada. Adicionar `competitor_id` ao
`returns table` SHALL ser feito por DROP + CREATE (não `create or replace`, que
falha ao mudar o tipo de retorno), re-emitindo os privilégios (`revoke` de
public/anon, `grant` a authenticated) após o DROP. A derivação de vagas
(`derivarVagasCopa`/`derivarPool`) SHALL gravar `cup_entries.competitor_id` APENAS
para a entrada por-CLUBE (`team_id` presente) vinda de origem-DIVISÃO, e NULL para
origem-copa, manual e por-nome/rótulo (mesmo quando o competidor de divisão de
origem for por-nome). Ao montar
a edição, `montar_copa` SHALL, para cada participante com `competitor_id NOT NULL`,
resolver `league_competitors.holder_user_id` como técnico e inserir a vaga com
`competitor_id` + `user_id`, REPLICANDO a deduplicação de técnico dos torneios
derivados (`v_holders_usados`: quando o mesmo técnico já foi usado na edição, a vaga
seguinte grava `user_id` NULL mantendo `competitor_id`, respeitando
`slots_um_clube_por_tecnico`). Participantes com `competitor_id NULL` SHALL continuar
gerando vaga com `competitor_id`/`user_id` NULOS. Toda a validação atual de
`montar_copa` (elegibilidade da entry, homogeneidade por-nome, geometria, sentinela
de idempotência) SHALL ser preservada. A mudança SHALL ser forward-only — edições já
montadas NÃO SHALL ser alteradas.

#### Scenario: Vaga de copa vinda de divisão herda clube e técnico
- **WHEN** uma edição de copa é montada com um participante classificado de uma divisão de liga cujo competidor tem técnico-âncora
- **THEN** a vaga nasce com `competitor_id` do competidor e `user_id` do `holder_user_id`

#### Scenario: Participante sem origem-divisão fica sem técnico
- **WHEN** o participante é por-nome/rótulo, de origem-copa ou manual
- **THEN** a vaga nasce com `competitor_id` e `user_id` NULOS

#### Scenario: Participante por-nome de divisão por-nome também fica sem técnico
- **WHEN** o participante é por-NOME (rótulo) mesmo tendo se classificado de uma divisão cujo competidor é por-nome (e tem técnico)
- **THEN** a vaga nasce com `competitor_id`/`user_id` NULOS (a regra de herança é `team_id` presente)

#### Scenario: Técnico repetido na mesma copa degrada o segundo
- **WHEN** dois participantes da mesma edição têm o mesmo técnico-âncora
- **THEN** a segunda vaga grava `user_id` NULL mantendo `competitor_id` (dedup, respeitando o índice de um clube por técnico)

#### Scenario: Edições já montadas não mudam
- **WHEN** a mudança entra e existem edições de copa montadas antes dela
- **THEN** essas edições e suas vagas permanecem inalteradas (sem técnico retroativo)

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

