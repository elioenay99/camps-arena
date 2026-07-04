## ADDED Requirements

### Requirement: Cobertura de testes de integração das policies RLS

O projeto SHALL manter uma suíte de testes de INTEGRAÇÃO que exercita as policies
RLS e os triggers/funções de segurança reais de `supabase/schema.sql` contra um
PostgreSQL de verdade (via pgTAP), e NÃO por mocks. A suíte SHALL simular o usuário
logado de forma realista: um `auth.uid()` que lê o `sub` de `request.jwt.claims`
(injetado por teste) e a execução sob o papel do banco correspondente
(`anon`/`authenticated`), de modo que as policies e os SECURITY DEFINER decidam
como em produção. A suíte SHALL ser SEPARADA do run de testes hermético (que roda
sem banco): um comando próprio (`pnpm test:rls`) e diretório próprio
(`supabase/tests/`). A suíte SHALL provar, no mínimo, tanto ALLOW quanto DENY para
cada área coberta, rodando a MESMA consulta sob identidades diferentes quando isso
distingue autorização de vazamento. A suíte NÃO SHALL tocar nenhum banco de
produção nem exigir segredos — roda contra um Postgres efêmero com dados fictícios.

#### Scenario: Vazamento de rascunho fechado

- **WHEN** o teste consulta, sob a identidade de um terceiro logado, um torneio privado (ou uma pirâmide arquivada) de outro dono
- **THEN** a policy `*_select_visivel` retorna zero linhas, e a MESMA consulta sob a identidade do dono retorna a linha — provando que a visibilidade discrimina por identidade

#### Scenario: Só o participante escreve na própria partida liberada

- **WHEN** o teste, sob a identidade de `participante_1`, atualiza uma partida liberada, e depois, sob a identidade de um terceiro, tenta a mesma atualização
- **THEN** a primeira afeta uma linha (`matches_update_participant`) e a segunda afeta zero linhas (negada pela RLS)

#### Scenario: Invariante de vaga por-nome pelo trigger

- **WHEN** o teste, mesmo sob a identidade do dono do torneio, tenta inserir um convite (`slot_invites`) para uma vaga POR-NOME (`team_id` nulo)
- **THEN** o trigger `block_slot_invite_por_nome` levanta a exceção `SLOT_POR_NOME`, e o convite para uma vaga team-based legítima é aceito

#### Scenario: foto_path amarrado à pasta do autor

- **WHEN** o teste, sob a identidade do técnico, insere uma proposta de placar com `foto_path` apontando para a pasta de OUTRO usuário
- **THEN** a policy `match_score_proposals_insert_tecnico` nega a inserção (erro de RLS), e uma proposta com `foto_path` na própria pasta (`<uid>/<match_id>/...`) é aceita

#### Scenario: PII celular fechada por grant de coluna

- **WHEN** o teste, sob o papel `authenticated` (ou `anon`), seleciona a coluna `celular` de `public.users`
- **THEN** o banco nega por privilégio de coluna (`42501`), enquanto o SELECT de colunas não-PII (ex.: `nome`) é permitido
