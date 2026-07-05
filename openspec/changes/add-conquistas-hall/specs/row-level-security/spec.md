## ADDED Requirements

### Requirement: Conquistas são somente-leitura via cliente; escrita só pela RPC autoritativa
A tabela `public.conquistas` SHALL ter RLS habilitado. A LEITURA (SELECT, para
`anon` e `authenticated`) SHALL espelhar a visibilidade do competidor
(`league_competitors_select_visivel`): um troféu é legível quando a competição do
competidor está `ativa`, OU o solicitante é o dono da competição, OU tem
capacidade de ver bastidores (`pode_ver_bastidores_competition`). NÃO SHALL haver
policy NEM grant de INSERT/UPDATE/DELETE para qualquer papel — o ÚNICO writer
SHALL ser a RPC `SECURITY DEFINER` de premiação (que ignora RLS). Os grants
SHALL conceder APENAS `select` a `anon` e `authenticated`. Isto garante, no
banco, que nenhum troféu é gravado por caminho não-autoritativo.

#### Scenario: Leitura acompanha a visibilidade do competidor
- **WHEN** um anônimo lê os troféus de um competidor de uma competição pública (ativa)
- **THEN** os troféus são retornados

#### Scenario: Escrita direta pelo cliente é negada
- **WHEN** um usuário autenticado tenta inserir/atualizar/apagar uma linha em `conquistas` via PostgREST
- **THEN** a operação é negada (não há grant nem policy de escrita)

#### Scenario: Troféu de competição privada não vaza
- **WHEN** um usuário sem posse nem bastidores lê troféus de uma competição não-ativa/privada
- **THEN** nenhuma linha é retornada

### Requirement: RPC de premiação re-verifica posse, estado e pertencimento
A RPC `registrar_conquistas_temporada(uuid, jsonb)` SHALL ser `SECURITY DEFINER`
com `search_path = ''`, com EXECUTE revogado de `public`/`anon` e concedido a
`authenticated`. Ela SHALL exigir `auth.uid()` como dono da liga e a temporada no
estado de fechamento (`em_fluxo` ou `encerrada`) ANTES de gravar. SHALL ser
idempotente (delete-then-insert do escopo da temporada) e SHALL validar que o
competidor de cada prêmio do payload PERTENCE à temporada antes de aceitá-lo. Os
casts do payload SHALL ser guardados por tipo (`jsonb_typeof` em `nivel`/
`valor_num`; validação de UUID em `competitor_id`) — uma linha malformada SHALL
ser IGNORADA, nunca abortando a RPC (que é fatal no caminho de encerramento).

#### Scenario: Não-dono é recusado
- **WHEN** um usuário que não é dono da liga chama `registrar_conquistas_temporada` para aquela temporada
- **THEN** a RPC lança exceção e nada é gravado

#### Scenario: Prêmio para competidor fora da temporada é ignorado
- **WHEN** o payload traz um prêmio para um competidor que não pertence à temporada
- **THEN** esse prêmio é descartado (não gravado)

#### Scenario: Payload malformado não aborta a premiação
- **WHEN** o payload traz um elemento com `competitor_id` não-UUID ou `valor_num` não-numérico
- **THEN** esse elemento é ignorado e os demais troféus são gravados normalmente
