## ADDED Requirements

### Requirement: RLS de wo_perdoes (SELECT gated, escrita só via RPC)
A tabela `public.wo_perdoes` SHALL ter RLS habilitada com policy SELECT-only que
libera a leitura apenas a quem `pode_ver_bastidores_torneio(tournament_id)` OU
`pode_gerir_torneio(tournament_id)`. NÃO SHALL existir policy de INSERT/UPDATE/DELETE
— a escrita ocorre exclusivamente via `perdoar_wo_tecnico` (`SECURITY DEFINER`). Para
fechar o auto-grant do Supabase (que concede `ALL`, incluindo SELECT e escrita, a
`anon`/`authenticated` em tabela nova), o sistema SHALL emitir `revoke insert, update,
delete, truncate, references, trigger on public.wo_perdoes from anon, authenticated`,
`revoke select on public.wo_perdoes from anon` e conceder apenas `grant select ... to
authenticated` (a leitura de `authenticated` fica gated pela policy; `anon` passa a
falhar-fechado 42501).

#### Scenario: Cliente não insere direto em wo_perdoes
- **WHEN** um cliente `anon` ou `authenticated` tenta `insert` direto em `wo_perdoes`
- **THEN** a operação falha com erro de permissão (42501), pois não há grant nem policy de escrita

#### Scenario: anon não lê wo_perdoes
- **WHEN** um cliente `anon` tenta `select` em `wo_perdoes`
- **THEN** a operação falha com erro de permissão (42501), pois o SELECT de anon foi revogado

#### Scenario: Só gestor/bastidores lê os perdões
- **WHEN** um usuário `authenticated` que não gere nem vê os bastidores do torneio consulta `wo_perdoes`
- **THEN** a policy SELECT não devolve nenhuma linha daquele torneio

### Requirement: Gate de execução das funções disciplinares
O helper `wo_sofridos_do_tecnico(uuid, uuid)` SHALL ter `EXECUTE` revogado de
`public, anon, authenticated` (só as funções `SECURITY DEFINER` que precisam o
chamam). As RPCs `sequencia_disciplina_torneio(uuid)`, `perdoar_wo_tecnico(uuid,
uuid)` e `expulsar_tecnico_wo(uuid, uuid)` SHALL ter `EXECUTE` revogado de `public,
anon` e concedido a `authenticated`, com gate INTERNO de autorização
(`pode_gerir_torneio` → `NAO_AUTORIZADO`) e exigência de `auth.uid()` não-nulo
(`NAO_AUTENTICADO`). Como `expulsar_tecnico_wo` é `SECURITY DEFINER` e IGNORA a RLS de
`tournament_slots`, o gate `pode_gerir_torneio` SHALL ser a única defesa da escrita —
por isso é obrigatório e a vaga SHALL ser amarrada ao `tournament_id` no `where`
(anti-tamper).

#### Scenario: Helper interno não é executável pelo cliente
- **WHEN** um usuário `authenticated` tenta executar `wo_sofridos_do_tecnico`
- **THEN** a chamada falha com erro de permissão (42501)

#### Scenario: Gate interno barra não-gestor autenticado
- **WHEN** um usuário `authenticated` não-gestor executa `sequencia_disciplina_torneio`, `perdoar_wo_tecnico` ou `expulsar_tecnico_wo`
- **THEN** a função levanta `NAO_AUTORIZADO` antes de ler ou escrever qualquer dado
