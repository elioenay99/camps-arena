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

### Requirement: Base de ranking por divisão (promedios — Fase 4)

A tabela `league_division_seasons` SHALL ganhar `ranking_base public.league_ranking_base not null default 'posicao'` (o enum `('posicao','ppg','promedios')` já existe da fundação) — um snapshot da config da divisão, igual a `desempate`/`por_nome`/`tamanho`. `'posicao'` (default) SHALL preservar byte-a-byte o corte por posição da tabela; `'promedios'` SHALL fazer o corte de sobe/cai pela média plurianual de pontos-por-jogo (vida toda, todas as divisões). O valor `'ppg'` é latente nesta fase (dentro de uma divisão equivale a `'posicao'`). A coluna SHALL ser imutável após o rascunho (trigger `lock_league_division_season` estendido) e SHALL ser copiada para a temporada N+1 por `montarProximaTemporada` (sem a cópia, a N+1 cairia para `posicao` silenciosamente). A DDL SHALL ser aditiva/idempotente e espelhada em `supabase/schema.sql`.

#### Scenario: Divisão por posição preserva o comportamento atual

- **WHEN** uma divisão é criada sem escolher base (ou com `ranking_base = 'posicao'`)
- **THEN** o corte de sobe/cai segue a posição da tabela exatamente como na Fase 1, e nenhuma coluna de promedio aparece nas standings

#### Scenario: Base de ranking imutável após rascunho

- **WHEN** se tenta alterar `ranking_base` de uma divisão cuja temporada já saiu de `rascunho`
- **THEN** o trigger `lock_league_division_season` rejeita a alteração (snapshot congelado)

#### Scenario: Base de ranking copiada para a próxima temporada

- **WHEN** `montarProximaTemporada` gera a temporada N+1 de uma pirâmide com uma divisão `promedios`
- **THEN** a divisão correspondente da N+1 nasce com `ranking_base = 'promedios'` (config preservada entre temporadas)

### Requirement: Ciclos Apertura/Clausura — split season (Fase 5.1)

A tabela `league_seasons` SHALL ganhar `ciclo text not null default 'anual'` com CHECK `in ('anual','apertura_clausura')` — marcador POR TEMPORADA (o split mistura os dois turnos de uma season inteira; não é por divisão). `'anual'` (default) SHALL preservar byte-a-byte o caminho de um torneio por divisão. A tabela `league_division_seasons` SHALL ganhar `tournament_id_clausura uuid` e `final_tournament_id uuid` (ambos FK para `tournaments` `on delete restrict`, nullable): `tournament_id` passa a ser o torneio da APERTURA (segue sendo o liga único quando `anual`), `tournament_id_clausura` o da CLAUSURA (gravado na montagem, em rascunho), e `final_tournament_id` o da GRANDE FINAL (mata_mata ida-e-volta, gravado APÓS as duas meias encerrarem). Cada coluna SHALL ter índice único parcial próprio (`where not null`), espelhando `league_division_seasons_tournament_unico` (um torneio em um papel). Um CHECK `split_so_liga` (`tournament_id_clausura is null or formato = 'liga'`) SHALL reforçar que o split só se aplica a divisões de pontos corridos (decisão de produto 5.1b; `grupos_mata_mata` em split é follow-up). A RPC `montar_temporada` SHALL, quando `ciclo = 'apertura_clausura'`, criar DOIS torneios por divisão (Apertura e Clausura) com sentinelas idempotentes INDEPENDENTES, inserindo os slots da Clausura sobre TODAS as entries da divisão sem alterar `entries.slot_id` (que permanece único, ligado à Apertura). Uma RPC nova `montar_grande_final(p_division_season_id uuid, p_competitor_ids uuid[])` `SECURITY DEFINER` SHALL criar a grande final ida-e-volta entre os dois campeões (espelhando `montar_playoff`: posse transitiva, advisory lock, sentinela `final_tournament_id`, degradação de `user_id`, `revoke/grant`). O trigger `lock_league_division_season` SHALL congelar `tournament_id_clausura` pós-rascunho (como `tournament_id`) mas NÃO `final_tournament_id` (gravada pós-rascunho). O trigger `lock_division_tournament_reopen` SHALL barrar reabrir o torneio da Clausura de season `em_fluxo`/`encerrada` (como faz com a Apertura), mas NÃO o da grande final (decorativa, jogável após o fluxo). `montarProximaTemporada` SHALL copiar `ciclo` para a N+1 (sem a cópia, a pirâmide degrada para single-stage). A DDL SHALL ser aditiva/idempotente, sem backfill, espelhada em `supabase/schema.sql`.

#### Scenario: Temporada split monta dois torneios por divisão

- **WHEN** `montar_temporada` roda numa season com `ciclo = 'apertura_clausura'`
- **THEN** cada divisão recebe um torneio de Apertura (`tournament_id`) e um de Clausura (`tournament_id_clausura`), ambos liga, com os mesmos competidores; re-rodar após falha parcial completa só a meia que faltou (duas sentinelas independentes)

#### Scenario: Reabrir a Clausura de temporada congelada é barrado

- **WHEN** o dono tenta reabrir (`encerrado`→`ativo`) o torneio da Clausura de uma divisão cuja season está `em_fluxo`/`encerrada`
- **THEN** o trigger `lock_division_tournament_reopen` rejeita (a Clausura decide a tabela combinada que já gerou o sobe/cai)

#### Scenario: Grande final é decorativa e não congela

- **WHEN** a season já está `em_fluxo`/`encerrada` e a grande final ainda não foi jogada
- **THEN** o torneio da grande final pode ser montado/jogado normalmente (não entra no freeze de reabertura nem no lock de geometria via `final_tournament_id`)

#### Scenario: Split só em divisões liga

- **WHEN** se tenta marcar `ciclo = 'apertura_clausura'` com alguma divisão `grupos_mata_mata`
- **THEN** a criação é rejeitada (superRefine do schema) e, no banco, uma divisão com `tournament_id_clausura` preenchido exige `formato = 'liga'` (CHECK `split_so_liga`)

#### Scenario: Ciclo copiado para a próxima temporada

- **WHEN** `montarProximaTemporada` gera a N+1 de uma pirâmide split
- **THEN** a season N+1 nasce com `ciclo = 'apertura_clausura'` e a RPC recria os dois torneios por divisão (o ciclo não degrada após um turno)
