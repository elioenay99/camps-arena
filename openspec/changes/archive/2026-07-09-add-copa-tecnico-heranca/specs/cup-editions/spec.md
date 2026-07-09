## ADDED Requirements

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
