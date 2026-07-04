## ADDED Requirements

### Requirement: Job de integração das policies RLS

O pipeline SHALL executar, em cada pull request e push para `main`, um job
DEDICADO que roda a suíte de integração RLS (pgTAP) contra um PostgreSQL efêmero
cuja major casa a do projeto (`postgres:17`, conforme `supabase/config.toml`), sem
depender de segredo algum (o Postgres é um service container local ao runner; nada
aponta para produção). O job SHALL aplicar os pré-requisitos da plataforma
(`supabase/ci-bootstrap.sql`), o `schema.sql` em dois passes (tolerante + estrito),
os grants (`supabase/local-grants.sql`), o pgTAP vendorizado e o setup/seed de
teste, e então executar os arquivos `supabase/tests/rls_*.sql`, FALHANDO o job se
qualquer asserção reportar `not ok` ou se um arquivo abortar por erro SQL. Este job
SHALL ser SEPARADO do job hermético `quality` (que roda sem banco) e NÃO SHALL
alterar seu comportamento.

#### Scenario: Suíte RLS verde

- **WHEN** o job `rls-tests` aplica o schema no Postgres efêmero e roda os arquivos `rls_*.sql`
- **THEN** todas as asserções pgTAP reportam `ok` e o job conclui com sucesso (exit 0)

#### Scenario: Regressão de policy reprova o job

- **WHEN** um pull request altera uma policy de modo que uma asserção de ALLOW ou DENY passa a divergir (ex.: uma partida oculta vaza para um terceiro)
- **THEN** a asserção correspondente emite `not ok` e o job `rls-tests` reporta status vermelho

#### Scenario: Job hermético inalterado

- **WHEN** o pipeline roda
- **THEN** o job `quality` (typecheck + lint + test) continua rodando sem banco e sem segredos, independente do job `rls-tests`

#### Scenario: Sem segredo do dono

- **WHEN** o job `rls-tests` roda
- **THEN** ele não usa `DATABASE_URL`, `service_role` nem qualquer segredo — o Postgres é um service container local ao runner com dados fictícios
