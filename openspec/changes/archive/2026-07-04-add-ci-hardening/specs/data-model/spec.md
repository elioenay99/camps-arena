## ADDED Requirements

### Requirement: Policies idempotentes em push_subscriptions no schema.sql

`supabase/schema.sql` SHALL definir as quatro policies de
`public.push_subscriptions` (`push_subscriptions_select_self`,
`push_subscriptions_insert_self`, `push_subscriptions_update_self`,
`push_subscriptions_delete_self`) de forma idempotente: cada `create policy` SHALL
ser precedido do seu `drop policy if exists`, de modo que um segundo apply do
`schema.sql` (ou um apply sobre um banco que já as tem) não falhe com
`policy ... already exists`. Isto honra o contrato de idempotência já declarado no
próprio arquivo. A correção
é COSMÉTICA/idempotência: o banco APLICADO em produção NÃO muda (as policies foram
aplicadas uma vez; o `drop if exists` é no-op num apply limpo) e NÃO há DDL para o
dono aplicar. A semântica por-linha das policies (dono só mexe na própria
subscription, `user_id = auth.uid()`) permanece idêntica.

#### Scenario: Segundo apply do schema não falha

- **WHEN** `supabase/schema.sql` é aplicado duas vezes seguidas (ou sobre um banco que já contém as policies de `push_subscriptions`)
- **THEN** o segundo apply conclui sem erro `policy ... already exists`, pois cada `create policy` é precedido do seu `drop policy if exists`

#### Scenario: Banco aplicado não muda

- **WHEN** o `schema.sql` é aplicado por completo, antes e depois de adicionar os guardas `drop policy if exists`
- **THEN** o conjunto de policies vigente em `push_subscriptions` é idêntico (mesma semântica), sem diferença no banco aplicado
