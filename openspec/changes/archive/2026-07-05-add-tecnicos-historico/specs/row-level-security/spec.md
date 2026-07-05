## ADDED Requirements

### Requirement: coach_tenures são somente-leitura via cliente; escrita só pelo trigger
A tabela `public.coach_tenures` SHALL ter RLS habilitado. A LEITURA (SELECT, para
`anon` e `authenticated`) SHALL espelhar a visibilidade do competidor
(`conquistas_select` via `league_competitors`): uma tenure é legível quando a
competição do competidor está `ativa`, OU o solicitante é o dono da competição, OU
tem capacidade de ver bastidores (`pode_ver_bastidores_competition`). NÃO SHALL
haver policy NEM grant de INSERT/UPDATE/DELETE para qualquer papel — o ÚNICO
writer SHALL ser a função de trigger `SECURITY DEFINER` (que ignora RLS). Os
grants SHALL conceder APENAS `select` a `anon` e `authenticated`, e o DDL SHALL
executar um REVOKE explícito de `insert, update, delete, truncate, references,
trigger` desses papéis (defesa em profundidade contra o auto-grant de escrita do
Supabase em tabela nova). Isto garante, no banco, que nenhuma tenure é gravada por
caminho não-autoritativo.

#### Scenario: Leitura acompanha a visibilidade do competidor
- **WHEN** um anônimo lê as tenures de um competidor de uma competição pública (ativa)
- **THEN** as tenures são retornadas

#### Scenario: Escrita direta pelo cliente é negada
- **WHEN** um usuário autenticado tenta inserir/atualizar/apagar uma linha em `coach_tenures` via PostgREST
- **THEN** a operação é negada (não há grant nem policy de escrita)

#### Scenario: Tenure de competição privada não vaza
- **WHEN** um usuário sem posse nem bastidores lê as tenures de uma competição não-ativa/privada
- **THEN** nenhuma linha é retornada

### Requirement: Writer das tenures é o trigger na coluna user_id
A função de trigger `public.fn_registrar_coach_tenure()` SHALL ser `SECURITY
DEFINER` com `search_path = ''` e SHALL ser o ÚNICO caminho de escrita em
`coach_tenures` (via o trigger `AFTER INSERT OR UPDATE OF user_id ON
tournament_slots`). A função NÃO SHALL lançar exceção, para não reverter a
atribuição/limpeza do técnico na tabela `tournament_slots`. A função SHALL agir
apenas quando `competitor_id IS NOT NULL` (escopo LIGA-only).

#### Scenario: Atribuir técnico grava tenure pelo trigger
- **WHEN** `aceitar_convite_vaga` grava `user_id` numa vaga de liga
- **THEN** o trigger abre a tenure correspondente sem qualquer INSERT direto do cliente

#### Scenario: Falha ao gravar tenure não reverte a atribuição
- **WHEN** ocorre uma condição inesperada no corpo do trigger
- **THEN** a função não lança exceção e a atribuição do técnico em `tournament_slots` é preservada
