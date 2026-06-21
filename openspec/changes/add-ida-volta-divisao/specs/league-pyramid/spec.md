## MODIFIED Requirements

### Requirement: Montar a temporada (uma divisão = um torneio de liga)

Ao montar uma temporada, o sistema SHALL usar a RPC `SECURITY DEFINER` `montar_temporada(p_season_id uuid)` (nunca o fluxo de criação de torneio avulso nem `slot_invites`) para criar, em cada divisão, um `tournaments` de `formato='liga'` em rascunho (espelhando `por_nome`, `desempate_criterio`, **`ida_e_volta`** e herdando `is_public` da pirâmide), inserir as vagas (`tournament_slots`) JÁ preenchidas de cada competidor, criar as entradas de histórico (`league_division_entries`) e vincular o torneio à divisão (`league_division_seasons.tournament_id`). O `ida_e_volta` do torneio SHALL ser copiado de `league_division_seasons.ida_e_volta` (turno único quando `false`, ida-e-volta quando `true`); no ciclo Apertura/Clausura, AMBOS os torneios da divisão SHALL herdar o mesmo `ida_e_volta`. A RPC SHALL validar que o caller é o dono da pirâmide antes de qualquer escrita. A montagem SHALL ser idempotente usando `league_division_seasons.tournament_id` como sentinela (não duplica torneios/slots em retry). Iniciar cada divisão SHALL reusar `iniciarTorneio` sem modificar o motor.

#### Scenario: Montar e iniciar uma divisão

- **WHEN** o dono monta a temporada e inicia uma divisão
- **THEN** um torneio de liga é criado com as vagas dos competidores, `iniciarTorneio` gera a tabela round-robin (vaga_1/vaga_2/rodada) e a classificação roda pelo motor existente

#### Scenario: Montagem idempotente

- **WHEN** a montagem da temporada é re-executada após falha parcial (ou corrida entre abas)
- **THEN** os torneios e vagas já criados não são duplicados e a montagem completa o que faltava

#### Scenario: Divisão ida-e-volta gera o dobro de partidas

- **WHEN** uma divisão de 20 clubes com `ida_e_volta=true` é montada e iniciada
- **THEN** o torneio nasce com `ida_e_volta=true` e `iniciarTorneio` gera 380 partidas em 38 rodadas (turno e returno), enquanto uma divisão com `ida_e_volta=false` gera 190 partidas em 19 rodadas

## ADDED Requirements

### Requirement: Formato de turno por divisão de liga (turno único ou ida-e-volta)

Cada divisão de `formato='liga'` SHALL escolher independentemente disputar em **turno único** (`ida_e_volta=false`, default) ou **ida e volta** (`ida_e_volta=true`), podendo MISTURAR turnos entre divisões da mesma pirâmide. A escolha SHALL ser persistida em `league_division_seasons.ida_e_volta` e materializada em `tournaments.ida_e_volta` na montagem. O wizard de criação SHALL oferecer o toggle SOMENTE para divisões de liga; divisões `grupos_mata_mata` SHALL ter `ida_e_volta=false` forçado pelo servidor (a opção não se aplica ao turno interno dos grupos nesta fase). A configuração SHALL sobreviver às temporadas: ao gerar a temporada N+1, o sistema SHALL copiar o `ida_e_volta` de cada divisão.

#### Scenario: Divisões com turnos diferentes na mesma pirâmide

- **WHEN** o dono cria uma pirâmide com a Série A em ida-e-volta e a Série B em turno único
- **THEN** cada divisão monta seu torneio com o respectivo `ida_e_volta`, e a contagem de partidas/rodadas de cada uma reflete a escolha

#### Scenario: Toggle indisponível em grupos+mata-mata

- **WHEN** o dono marca uma divisão como `grupos_mata_mata`
- **THEN** o toggle de ida-e-volta não é oferecido e o servidor grava `ida_e_volta=false` para essa divisão, ignorando qualquer valor enviado

#### Scenario: Turno preservado na próxima temporada

- **WHEN** uma divisão ida-e-volta encerra e a próxima temporada é montada
- **THEN** a divisão correspondente da temporada N+1 nasce também com `ida_e_volta=true`

### Requirement: Editar o turno de uma divisão em rascunho

O dono (ou admin com capacidade de gerir) SHALL poder alternar `ida_e_volta` de uma divisão de liga **enquanto o torneio da divisão está em rascunho e sem rodadas geradas**, via Server Action dedicada sobre uma RPC `SECURITY DEFINER` transacional, SEM recriar a pirâmide. A escrita SHALL ser TRANSACIONAL (uma só transação), atualizando `league_division_seasons.ida_e_volta` E `tournaments.ida_e_volta` do(s) torneio(s) vinculado(s) (`tournament_id` e, no split, `tournament_id_clausura` quando não-nulo; `final_tournament_id` NÃO é tocado) — nunca via escritas PostgREST separadas (não-transacionais) que poderiam divergir. A RPC SHALL autorizar por CAPACIDADE (`pode_gerir_competition` da pirâmide via join season→competition), NÃO por `created_by` (a tabela `league_division_seasons` não tem essa coluna e a herança de admin de liga exige capacidade); a RLS de UPDATE por capacidade (`pode_gerir_torneio` em `tournaments`, `pode_gerir_competition` em `league_division_seasons`) SHALL servir de backstop. A RPC SHALL RECUSAR (sem escrita) quando a divisão não for de formato liga, quando algum torneio vinculado não estiver em `rascunho`, ou quando existir QUALQUER partida com `rodada` não-nula vinculada (sondar a tabela `matches`, pois `status='rascunho'` sozinho NÃO prova ausência de rodadas — há caminho de recuperação que deixa `matches` em torneio `rascunho`). Após iniciar a divisão, o turno SHALL ficar imutável por essa ação.

#### Scenario: Ligar ida-e-volta antes de iniciar

- **WHEN** o dono ativa ida-e-volta numa divisão de liga ainda em rascunho
- **THEN** a division-season e o torneio passam a `ida_e_volta=true`, e ao iniciar a tabela é gerada em turno e returno

#### Scenario: Edição barrada após iniciar

- **WHEN** alguém tenta alternar o turno de uma divisão cujo torneio já saiu de rascunho (ou já tem rodadas)
- **THEN** a ação é recusada sem escrita e o turno permanece o que foi usado para gerar a tabela

#### Scenario: Edição barrada sem capacidade

- **WHEN** um usuário sem capacidade de gerir a pirâmide tenta alternar o turno de uma divisão
- **THEN** a ação é recusada (gate de capacidade + RLS) sem qualquer escrita
