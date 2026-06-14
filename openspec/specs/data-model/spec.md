# data-model Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Tabela de usuários
O sistema SHALL manter uma tabela `users` com `id`, `nome`, `celular` e `avatar`.

#### Scenario: Usuário persistido
- **WHEN** um usuário é criado
- **THEN** seus dados de `nome`, `celular` e `avatar` ficam disponíveis para consulta

### Requirement: Tabela de torneios
O sistema SHALL manter uma tabela `tournaments` com `id`, `titulo`, `status`, `created_at`, dono (`created_by`, referência anulável a `users`), visibilidade (`is_public`, padrão público), regras de pontuação (`pontos_vitoria` padrão 3, `pontos_empate` padrão 1, `pontos_derrota` padrão 0), formato (`formato`, enum `tournament_format` com valores `avulso`/`liga`/`mata_mata`/`grupos_mata_mata`/`fase_liga`, padrão `avulso` — preserva os legados), `ida_e_volta` (boolean, padrão false, significativo nos formatos gerados), `terceiro_lugar` (boolean, padrão false, significativo nos formatos com chave) e `classificados_por_grupo` (integer anulável, gravado AO INICIAR um formato de grupos — CHECK `>= 1` quando presente). Uma CHECK SHALL garantir a coerência `0 <= pontos_derrota <= pontos_empate <= pontos_vitoria <= 100`.

#### Scenario: Torneio com status
- **WHEN** um torneio é criado
- **THEN** ele possui um `status` que reflete seu estado atual

#### Scenario: Torneio com dono e visibilidade
- **WHEN** um torneio é criado por um usuário autenticado
- **THEN** ele registra o `created_by` do criador e um `is_public` que controla sua visibilidade

#### Scenario: Torneio com regras de pontuação
- **WHEN** um torneio é criado sem pontuação explícita
- **THEN** ele assume 3/1/0 (vitória/empate/derrota) pelos defaults

#### Scenario: Pontuação incoerente é rejeitada no banco
- **WHEN** uma escrita tenta gravar derrota valendo mais que empate ou empate mais que vitória
- **THEN** a CHECK rejeita a operação

#### Scenario: Formato com default avulso
- **WHEN** um torneio é criado sem formato explícito (incluindo todos os legados)
- **THEN** ele assume `formato = 'avulso'`, `ida_e_volta = false`, `terceiro_lugar = false` e `classificados_por_grupo` nulo pelos defaults

#### Scenario: Formato fora do enum é rejeitado
- **WHEN** uma escrita tenta gravar um formato que não existe no enum `tournament_format`
- **THEN** o banco rejeita a operação

#### Scenario: Classificados por grupo inválido é rejeitado
- **WHEN** uma escrita tenta gravar `classificados_por_grupo` menor que 1
- **THEN** a CHECK rejeita a operação

### Requirement: Tabela de partidas
A tabela `matches` SHALL registrar partidas com DOIS modelos de lado mutuamente exclusivos (CHECK `matches_lado_vaga_ou_user`): partidas AVULSAS usam `participante_1/2` (FK users, SET NULL) com `time_1/2` opcionais; partidas de formatos COMPETITIVOS usam `vaga_1/vaga_2` (FK tournament_slots, RESTRICT — `vaga_2` nula representa bye). Placares com default 0, status enum, `rodada`/`posicao`/`perna`/`grupo` para os formatos gerados como já especificado. A barreira de dupla geração da liga SHALL ter índice único por VAGA: UNIQUE (tournament_id, rodada, vaga_1, vaga_2) WHERE rodada IS NOT NULL.

#### Scenario: Partida competitiva referencia vagas
- **WHEN** uma partida de liga/mata-mata/grupos é gerada
- **THEN** os lados são vagas (vaga_1/vaga_2) e participante_1/2 ficam nulos

#### Scenario: Modelos não se misturam
- **WHEN** um INSERT tenta preencher participante_1 E vaga_1 na mesma partida
- **THEN** o CHECK recusa

#### Scenario: Avulso continua entre pessoas
- **WHEN** uma partida avulsa é criada
- **THEN** os lados são usuários (participante_1/2) com clube opcional por partida

### Requirement: Tabela de participantes
A tabela `participants` SHALL existir EXCLUSIVAMENTE para o formato AVULSO (participação confirmada em torneio de partidas manuais). Formatos competitivos NÃO SHALL usar participants — a participação é a vaga.

#### Scenario: Participants só no avulso
- **WHEN** um torneio competitivo é criado
- **THEN** nenhuma linha de participants é criada para ele

### Requirement: Tabela de convites de torneio
O sistema SHALL manter uma tabela `tournament_invites` com `tournament_id`
como chave primária (1:1, `on delete cascade`), `code` único e `created_at`.
O código SHALL ficar FORA de `tournaments` para não vazar pela visibilidade
pública do torneio.

#### Scenario: Um convite por torneio
- **WHEN** o código é regenerado
- **THEN** a mesma linha é atualizada (o torneio nunca tem dois códigos válidos)

#### Scenario: Código globalmente único
- **WHEN** um INSERT/UPDATE tenta gravar um código já existente
- **THEN** a constraint UNIQUE rejeita a operação

### Requirement: Tabela de vagas de clube
O schema SHALL ter `tournament_slots` (id uuid PK, tournament_id FK CASCADE, team_id FK teams RESTRICT NOT NULL, user_id FK users SET NULL anulável, created_at) com UNIQUE (tournament_id, team_id) e índice único parcial (tournament_id, user_id) WHERE user_id IS NOT NULL.

#### Scenario: Clube único por torneio
- **WHEN** uma segunda vaga com o mesmo clube é inserida no mesmo torneio
- **THEN** o banco recusa (unique)

#### Scenario: Conta apagada não derruba o torneio
- **WHEN** o usuário técnico de uma vaga apaga a conta
- **THEN** a vaga fica com user_id nulo e o restante intacto

### Requirement: Tabela de convites de vaga
O schema SHALL ter `slot_invites` (slot_id PK FK tournament_slots CASCADE, code text UNIQUE, created_at) — o código é segredo do dono e mora FORA de tabela com SELECT amplo.

#### Scenario: Regenerar mata o link antigo
- **WHEN** o dono regenera o convite da vaga
- **THEN** o code é substituído atomicamente (PK 1:1) e o link anterior deixa de funcionar

### Requirement: Colunas de W.O. em matches
A tabela `matches` SHALL ter `wo boolean not null default false` e
`wo_vencedor uuid null` (FK `tournament_slots`, `on delete restrict`). Uma
CHECK `matches_wo_coerente` SHALL impor: `wo` falso ⇒ `wo_vencedor` nulo; `wo`
verdadeiro ⇒ `wo_vencedor` não-nulo, `placar_1 = 0`, `placar_2 = 0` e
`wo_vencedor` ∈ {`vaga_1`, `vaga_2`}.

#### Scenario: Estado normal
- **WHEN** uma partida não é W.O.
- **THEN** `wo` é falso e `wo_vencedor` é nulo

#### Scenario: W.O. coerente
- **WHEN** uma partida é W.O.
- **THEN** placar é 0x0, `wo_vencedor` é um dos lados e a CHECK aceita

### Requirement: Tabela de solicitações de W.O.
SHALL existir `match_wo_requests` com `id` (PK), `match_id` (FK matches, on
delete cascade), `solicitante_slot` (FK tournament_slots), `motivo` text nulo,
`status text` em {`pendente`,`aceito`,`recusado`} default `pendente`,
`created_at` e `resolved_at` nulo. Um índice único parcial SHALL garantir no
máximo UMA solicitação `pendente` por `match_id`.

#### Scenario: Uma pendente por partida
- **WHEN** já há uma solicitação pendente para a partida
- **THEN** o índice único parcial rejeita uma segunda pendente

### Requirement: Bucket de avatares com RLS por dono

O storage SHALL ter um bucket `avatars` com leitura pública e escrita restrita:
INSERT/UPDATE/DELETE de um objeto SHALL ser permitido apenas ao usuário
autenticado cuja pasta-raiz do caminho é o seu próprio id
(`(storage.foldername(name))[1] = auth.uid()::text`). A URL pública resultante é
gravada em `public.users.avatar` (coluna já existente; sem mudança de tabela).

#### Scenario: Dono envia na própria pasta

- **WHEN** um usuário autenticado envia um objeto em `avatars/<seu-id>/…`
- **THEN** a policy de INSERT permite

#### Scenario: Envio na pasta de outro é negado

- **WHEN** um usuário tenta enviar em `avatars/<id-de-outro>/…`
- **THEN** a RLS de storage nega

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

### Requirement: Vaga por nome no schema

A tabela `tournament_slots` SHALL aceitar uma vaga sem clube: `team_id` torna-se
anulável e ganha uma coluna `rotulo text`, mutuamente exclusivos por CHECK
(`(team_id is null) <> (rotulo is null)`), com o rótulo não-vazio quando presente. A
unicidade SHALL ser garantida por índices parciais — clube único por torneio
(`team_id` não-nulo) e rótulo único por torneio (`lower(trim(rotulo))` não-nulo). A
tabela `tournaments` SHALL ganhar `por_nome boolean not null default false`. O rótulo
SHALL ser imutável após o início do torneio (trigger), e a migração SHALL ser aditiva
(sem backfill: todo slot legado tem `team_id`).

#### Scenario: Inserir vaga por nome

- **WHEN** uma vaga é inserida com `rotulo` preenchido e `team_id` nulo num torneio
  `por_nome`
- **THEN** o banco aceita a vaga e rejeita duplicata de nome (case-insensitive) no
  mesmo torneio

#### Scenario: Coerência clube×rótulo

- **WHEN** uma vaga é inserida com clube e rótulo ao mesmo tempo (ou nenhum dos dois)
- **THEN** o banco rejeita pela CHECK `slots_clube_xor_rotulo`

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

### Requirement: Identidade de cor por campeonato e por divisão

O modelo de dados SHALL permitir que cada campeonato (torneio e pirâmide) e cada
divisão de uma pirâmide carregue uma identidade de **duas cores** — `cor_primaria` e
`cor_secundaria` — armazenadas como hexadecimal `#rrggbb` minúsculo, ou ausentes.

As colunas `cor_primaria` e `cor_secundaria` SHALL existir em `tournaments`,
`league_competitions` e `league_division_seasons`, SHALL ser *nullable*, e SHALL ser
restringidas por CHECK ao padrão `^#[0-9a-f]{6}$` quando não nulas.

A resolução da cor efetiva SHALL seguir herança, sem exigir gravação redundante: uma
divisão usa a sua cor, senão a da competição; um torneio usa a sua cor. Ausência total
de cor SHALL resultar no tema padrão do app (sem tematização), preservando o visual de
todo campeonato já existente.

As cores de uma divisão SHALL persistir entre temporadas: ao montar a próxima temporada,
`cor_primaria`/`cor_secundaria` de cada divisão SHALL ser copiada para a temporada N+1,
junto com a demais configuração da divisão.

#### Scenario: Hex inválido é rejeitado pelo banco

- **WHEN** se tenta gravar `cor_primaria = 'red'` ou `'#ABC'` ou `'#xyz123'` em qualquer
  das três tabelas
- **THEN** o CHECK rejeita a escrita; somente `NULL` ou `#rrggbb` minúsculo é aceito

#### Scenario: Campeonato sem cor mantém o tema do app

- **WHEN** um torneio ou divisão tem ambas as cores `NULL`
- **THEN** a página renderiza no tema base do app (Dracula/Canarinho), sem wrapper de cor

#### Scenario: Cor da divisão sobrevive à virada de temporada

- **WHEN** uma pirâmide com cores por divisão monta a temporada N+1
- **THEN** cada divisão da nova temporada nasce com as mesmas `cor_primaria`/`cor_secundaria`
  da divisão correspondente na temporada anterior

#### Scenario: Só o dono altera as cores

- **WHEN** um usuário que não é dono do campeonato tenta atualizar as cores
- **THEN** a operação é negada (checagem de posse na action + policy de UPDATE por-linha),
  enquanto o dono consegue atualizar a qualquer momento

