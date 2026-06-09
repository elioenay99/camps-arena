# data-model — Delta Spec

## ADDED Requirements

### Requirement: Tabela matches publicada no Realtime

A tabela `public.matches` SHALL ser publicada na publication `supabase_realtime`
para emitir eventos `postgres_changes` de `UPDATE`. A emissão SHALL respeitar a
RLS de SELECT existente de `matches` (nenhuma policy nova; o canal não amplia
visibilidade). Nenhuma coluna ou constraint é adicionada. A publicação é
aplicada manualmente pelo usuário (config de banco), com a fonte de verdade
registrada em `supabase/schema.sql` e o passo em `docs/pendencias-manuais.md`.

#### Scenario: Evento de UPDATE emitido para quem pode ver

- **WHEN** uma linha de `matches` visível ao usuário é atualizada
- **THEN** o Realtime emite um evento `UPDATE` que o cliente autenticado recebe

#### Scenario: Sem emissão fora da RLS

- **WHEN** uma linha de `matches` que o usuário não pode ler é atualizada
- **THEN** o cliente daquele usuário não recebe o evento
