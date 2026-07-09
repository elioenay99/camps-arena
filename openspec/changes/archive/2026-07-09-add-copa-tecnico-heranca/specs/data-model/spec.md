## ADDED Requirements

### Requirement: `cup_entries` guarda a proveniência de liga (`competitor_id`)
A tabela `public.cup_entries` SHALL ter uma coluna `competitor_id uuid` NULLABLE,
`references public.league_competitors(id) on delete set null`, representando o
`league_competitor` do qual o participante POR-CLUBE da copa se classificou. A coluna
SHALL ser preenchida APENAS para a entrada por-CLUBE (`team_id` presente) vinda de
origem-DIVISÃO; SHALL ser NULA para por-NOME/rótulo (mesmo de divisão), classificados
de OUTRA COPA e MANUAIS. Um índice parcial SHALL cobrir `competitor_id` apenas onde
não-nulo. A RLS de leitura de `cup_entries` NÃO SHALL mudar.

#### Scenario: Entry por-clube de divisão guarda o competidor de origem
- **WHEN** uma `cup_entry` por-CLUBE (`team_id`) é derivada da classificação de uma divisão de liga
- **THEN** `competitor_id` é preenchido com o `league_competitor` de origem

#### Scenario: Entry sem herança fica sem competidor
- **WHEN** a `cup_entry` é por-nome/rótulo (mesmo de divisão), de origem-copa ou manual
- **THEN** `competitor_id` é NULL
