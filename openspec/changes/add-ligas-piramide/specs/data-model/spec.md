# data-model — Delta Spec

## ADDED Requirements

### Requirement: Modelo de dados da pirâmide de ligas

O schema SHALL ganhar seis tabelas aditivas que orquestram a pirâmide acima do modelo de torneio existente, sem alterar o motor: `league_competitions` (pirâmide imortal com config, dono e `is_public boolean not null default true` herdado pelos torneios das divisões), `league_seasons` (temporada com número sequencial único por pirâmide, status, snapshot de config em jsonb e ponteiro para a temporada anterior), `league_division_seasons` (divisão por nível único por temporada, apontando para um `tournaments` via `tournament_id` restrict nullable, com toggle `por_nome`, preset `desempate` e `tamanho`; a UNIQUE `(season_id, nivel)` é a SENTINELA de idempotência da montagem, criada antes dos tournaments), `league_boundaries` (regra sobe/cai por par de divisões adjacentes, com vagas de acesso/rebaixamento e modo), `league_competitors` (competidor persistente identificado por clube XOR rótulo, com `holder_user_id` ANULÁVEL = o técnico humano que acompanha o competidor entre temporadas, ou null = vaga gerida pelo dono) e `league_division_entries` (histórico competidor × divisão-temporada × vaga, com posição final, `destino` em `('sobe','cai','permanece')` e `resolvido_por` em `('classificacao','playoff','sorteio','override')` separando O QUE aconteceu de COMO foi decidido — 'sorteio' é MOTIVO, não destino). Todas SHALL seguir as convenções do schema (PK uuid `gen_random_uuid()`, `created_at` default now, FK de participação `on delete cascade`, FK de posse/técnico `on delete set null`, FK de geometria `on delete restrict`, índices parciais e únicos, CHECK XOR para identidade). Os CHECKs de desempate (`league_competitions.desempate_padrao`, `league_division_seasons.desempate`) SHALL restringir a `('cbf','ingles','custom')` nesta fase (sem `'espanhol'`, que entra na fase de desempate avançado). A DDL SHALL ser aditiva e idempotente, sem backfill nem impacto nos torneios legados.

O pré-preenchimento das vagas das divisões SHALL ocorrer por uma RPC `SECURITY DEFINER` `montar_temporada(p_season_id uuid)` (descrita na spec de row-level-security), nunca por INSERT de cliente, porque pré-preencher `tournament_slots.user_id` com o técnico que acompanha violaria a policy `slots_insert_owner_rascunho` (que exige `user_id is null`). A RPC SHALL detectar a colisão com o UNIQUE `slots_um_clube_por_tecnico (tournament_id, user_id)` quando dois competidores da mesma divisão compartilham o mesmo `holder_user_id`, gravando `user_id = NULL` na vaga em conflito (vaga gerida pelo dono) em vez de falhar.

#### Scenario: Temporada com número único por pirâmide

- **WHEN** uma segunda temporada com o mesmo número é inserida na mesma pirâmide
- **THEN** o índice único `(competition_id, numero)` rejeita a duplicata

#### Scenario: Competidor por clube XOR rótulo

- **WHEN** um competidor é inserido com clube e rótulo ao mesmo tempo (ou com nenhum)
- **THEN** a CHECK `league_competitors_clube_xor_rotulo` rejeita, exigindo exatamente um

#### Scenario: Divisão vinculada a um único torneio

- **WHEN** o mesmo `tournament_id` é atribuído a duas divisões
- **THEN** o índice único parcial `league_division_seasons_tournament_unico` rejeita o segundo vínculo

#### Scenario: Destino separado do motivo na entrada de divisão

- **WHEN** um competidor cai por sorteio no empate da zona de corte
- **THEN** a entrada registra `destino = 'cai'` e `resolvido_por = 'sorteio'` (motivo), nunca `destino = 'sorteio'`, e os CHECKs rejeitam 'sorteio' como destino e qualquer destino como motivo

#### Scenario: Competidor com técnico que acompanha ou vaga gerida pelo dono

- **WHEN** um competidor é criado com `holder_user_id` preenchido (técnico humano) ou nulo (sem técnico dedicado)
- **THEN** ambos são aceitos: nulo significa vaga gerida pelo dono da pirâmide, e o valor preenchido é o técnico que acompanha o competidor ao subir/cair entre temporadas

### Requirement: Vaga ligada ao competidor persistente e preset de desempate do torneio

A tabela `tournament_slots` SHALL ganhar `competitor_id uuid` anulável (FK para `league_competitors` `on delete set null`), um ponteiro de proveniência aditivo que liga a vaga ao competidor persistente da pirâmide SEM alterar o CHECK `slots_clube_xor_rotulo` existente (a identidade visível continua clube XOR rótulo, e o motor permanece intocado). A tabela `tournaments` SHALL ganhar `desempate_criterio text not null default 'cbf'` com CHECK restrito aos valores `cbf`/`ingles`/`custom` nesta fase (o `espanhol` é adicionado ao CHECK na fase de desempate avançado), default que preserva os legados. Ambas as colunas SHALL ser nulas/default em todo torneio legado e standalone, garantindo migração aditiva sem backfill.

#### Scenario: Slot legado sem competidor persistente

- **WHEN** a coluna `competitor_id` é adicionada
- **THEN** todo slot legado fica com `competitor_id` nulo, sem violar o CHECK de identidade nem afetar a geração/classificação

#### Scenario: Preset de desempate inválido rejeitado

- **WHEN** um torneio recebe `desempate_criterio` fora do conjunto permitido nesta fase (`cbf`/`ingles`/`custom`), incluindo `'espanhol'`
- **THEN** a CHECK `tournaments_desempate_valido` rejeita, e o default `cbf` preserva o comportamento dos torneios existentes
