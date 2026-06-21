## ADDED Requirements

### Requirement: Criar copa
O sistema SHALL permitir que um usuário autenticado crie uma **copa** (`cup_competitions`) com nome, abrangência (`nacional` ou `continental`), formato, `por_nome` (clube ou rótulo), critério de desempate, cores e visibilidade (`is_public`). A copa é imortal e pertence ao criador (`created_by`), nascendo com `status='ativa'` (domínio `cup_competition_status` = `ativa`|`arquivada`). A abrangência é **rótulo informativo** (exibição/filtro), sem invariante estrutural.

#### Scenario: Copa criada com sucesso
- **WHEN** o dono submete o wizard com nome, abrangência, formato e ao menos uma regra de qualificação válidos
- **THEN** o sistema cria a `cup_competitions` (status `ativa`) e suas `cup_qualification_rules`, e redireciona para a página da copa

#### Scenario: Nome obrigatório
- **WHEN** o dono submete sem nome
- **THEN** o sistema rejeita com erro de validação por campo e não cria nada

### Requirement: Formato configurável da copa
O sistema SHALL permitir o formato `mata_mata` (chave eliminatória, com ida-e-volta e terceiro lugar opcionais) ou `grupos_mata_mata` (fase de grupos seguida de mata-mata, com `qtd_grupos` e `classificados_por_grupo`). Os campos de geometria de grupos MUST estar presentes e coerentes quando o formato é `grupos_mata_mata` e ausentes/nulos caso contrário.

#### Scenario: Mata-mata sem geometria de grupos
- **WHEN** o dono escolhe formato `mata_mata`
- **THEN** o sistema aceita sem exigir `qtd_grupos`/`classificados_por_grupo`

#### Scenario: Grupos+mata exige geometria coerente
- **WHEN** o dono escolhe `grupos_mata_mata` com `qtd_grupos` ou `classificados_por_grupo` ausentes ou cujo produto não é uma chave válida (potência de 2)
- **THEN** o sistema rejeita com erro de validação

### Requirement: Regra de qualificação por divisão de liga
O sistema SHALL permitir regras cuja origem é uma **divisão de liga** (`origem_tipo=divisao`), identificada por `origem_competition_id` e `origem_nivel`, com uma faixa `posicao_inicio`..`posicao_fim` (≥1, fim≥início) e uma `prioridade`. A faixa indexa um **rank de seeding contíguo** (1..n) derivado da classificação final da origem (ordem `posicao_final asc, competitor_id asc`), NÃO o valor cru de `posicao_final`; `num_vagas` = `posicao_fim − posicao_inicio + 1`.

#### Scenario: Top-4 da Série A
- **WHEN** o dono adiciona uma regra origem divisão, pirâmide "Brasileirão", nível 1, posições 1..4
- **THEN** a regra é salva como 4 vagas correspondentes aos índices 1..4 do rank de seeding daquela divisão

#### Scenario: Faixa invertida rejeitada
- **WHEN** o dono define `posicao_inicio=5` e `posicao_fim=2`
- **THEN** o sistema rejeita a regra com erro de validação

### Requirement: Regra de qualificação por copa
O sistema SHALL permitir regras cuja origem é o **resultado de outra copa** (`origem_tipo=copa`), identificada por `origem_cup_id`, com faixa de posições do rank de seeding da classificação final da copa (campeão=1, vice=2, …). Uma regra MUST especificar exatamente uma origem (divisão XOR copa).

#### Scenario: Campeão da copa nacional classifica para a continental
- **WHEN** o dono adiciona à continental uma regra origem copa = "Copa do Brasil", posições 1..1
- **THEN** a regra é salva como 1 vaga para o campeão daquela copa

#### Scenario: Origem ambígua rejeitada
- **WHEN** uma regra informa tanto `origem_competition_id` quanto `origem_cup_id`
- **THEN** o sistema rejeita (origem deve ser exatamente uma)

### Requirement: Consentimento de origem
Uma regra de qualificação SHALL apontar apenas para origem **pública** (`is_public`) ou **do próprio dono** da copa. Origem privada de terceiro MUST ser recusada, tanto na criação da regra quanto na derivação.

#### Scenario: Origem pública aceita
- **WHEN** o dono cria uma regra apontando para uma pirâmide pública de outro dono
- **THEN** o sistema aceita a regra

#### Scenario: Origem privada de terceiro recusada
- **WHEN** o dono cria uma regra apontando para uma pirâmide privada de outro dono
- **THEN** o sistema recusa com erro `ORIGEM_INVISIVEL`

### Requirement: Copa homogênea por identidade de participante
Uma copa SHALL ser homogênea quanto a `por_nome`. A autoridade da checagem é o pré-check de `montar_copa`, que lê `por_nome` da `league_division_seasons` (ou copa) **efetivamente consumida** na derivação; incompatibilidade MUST recusar a montagem com `COPA_HETEROGENEA`. A checagem na criação de regra é best-effort (aviso).

#### Scenario: Regra por clube numa copa por clube
- **WHEN** a copa é por clube e a divisão consumida também é por clube
- **THEN** a montagem prossegue

#### Scenario: Origem por nome numa copa por clube
- **WHEN** a copa é por clube e a divisão consumida é por nome
- **THEN** a montagem é recusada com `COPA_HETEROGENEA`

### Requirement: Continental cruza múltiplas pirâmides
O sistema SHALL permitir que uma copa tenha regras cujas origens pertencem a **pirâmides diferentes**, compondo um único pool. A abrangência `continental` é permissiva (não exige ≥2 pirâmides).

#### Scenario: Libertadores junta duas pirâmides
- **WHEN** a copa tem uma regra origem divisão da pirâmide "Brasileirão" e outra da pirâmide "Argentino"
- **THEN** ambas as origens compõem o pool da mesma copa

### Requirement: Sem ciclo entre copas
O sistema SHALL proibir ciclos no grafo de origens de copa (server-side): se A tem origem em B, então B (direta ou transitivamente) MUST NOT ter origem em A.

#### Scenario: Ciclo transitivo rejeitado
- **WHEN** B tem origem em A e C tem origem em B, e o dono tenta adicionar a A uma regra origem copa C
- **THEN** o sistema rejeita com `CICLO_DE_COPAS`

### Requirement: Autorização e visibilidade da copa
O sistema SHALL restringir criação, edição e exclusão de uma copa e suas regras ao dono (`created_by` direto). A leitura SHALL ser pública quando `is_public`, e restrita ao dono caso contrário; o `status` (ativa/arquivada) NÃO é gate de privacidade. A RLS das tabelas `cup_*` MUST impor isso no banco.

#### Scenario: Não-dono não edita
- **WHEN** um usuário que não é o dono tenta alterar uma regra da copa
- **THEN** a operação é negada pela RLS

#### Scenario: Copa privada não é listada para terceiros
- **WHEN** a copa tem `is_public=false` e um terceiro consulta
- **THEN** a copa e suas regras/edições/participantes não aparecem para ele

### Requirement: Arquivar ou apagar copa
O sistema SHALL permitir ao dono **arquivar** a copa (`status='arquivada'`: some das listagens públicas, edições preservadas) e **apagar** a copa apenas quando ela não tiver edição materializada. Apagar copa com edição em `montada`/`ativa`/`encerrada` (com `tournament_id` setado) MUST ser bloqueado para preservar o histórico de partidas.

#### Scenario: Arquivar copa
- **WHEN** o dono arquiva uma copa
- **THEN** o `status` vira `arquivada`, a copa some das listagens públicas e as edições continuam consultáveis

#### Scenario: Apagar copa com edição materializada é bloqueado
- **WHEN** o dono tenta apagar uma copa que já tem uma edição montada
- **THEN** o sistema bloqueia a exclusão e orienta arquivar
