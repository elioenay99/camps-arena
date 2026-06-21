## ADDED Requirements

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
