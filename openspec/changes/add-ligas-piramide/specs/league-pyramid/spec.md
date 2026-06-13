# league-pyramid — Delta Spec

Capability NOVA: pirâmide de ligas com acesso/rebaixamento multi-temporada. Cada divisão de uma temporada É um torneio de `formato='liga'` — reúso máximo do motor existente (`gerarTabelaLiga`, `iniciarTorneio`, `computeStandings`, RLS de slots/matches). A camada nova só orquestra acima.

## ADDED Requirements

### Requirement: Criar pirâmide de ligas com presets

O dono SHALL poder criar uma pirâmide (`league_competitions`) com N divisões organizadas por nível (1 = topo), configurando entre cada par de divisões adjacentes quantos competidores SOBEM e quantos CAEM (`league_boundaries`). A criação SHALL oferecer presets mobile-first (Brasileirão 4-4, Premier 3-3, Personalizado) que pré-preenchem divisões e fronteiras. A primeira temporada (`league_seasons`, numero 1) SHALL nascer em rascunho. A pirâmide SHALL ser imortal (sobrevive às temporadas) e visível publicamente quando ativa (`is_public`, herdado pelos torneios das divisões); só o dono edita. A criação de UMA única divisão (N=1) SHALL ser permitida (liga multi-temporada sem fronteiras nem sobe/cai). A criação SHALL impor o INVARIANTE de conservação de tamanho: para cada divisão, `tamanho` após o fluxo = `tamanho - sobe - cai + recebidos_de_cima + recebidos_de_baixo`, com a divisão 1 nunca subindo e a última nunca caindo, e o resultado em `[2,20]` em TODAS as divisões; qualquer config que viole isso SHALL ser REJEITADA (não apenas avisada).

#### Scenario: Criar pirâmide com preset

- **WHEN** o dono escolhe o preset Brasileirão 4-4 e confirma o wizard
- **THEN** uma pirâmide é criada com as divisões e fronteiras do preset (4 sobem / 4 caem entre cada par), a temporada 1 nasce em rascunho e só o dono pode editá-la

#### Scenario: Personalizar divisões e fronteiras

- **WHEN** o dono escolhe Personalizado e define níveis, tamanhos e vagas de acesso/rebaixamento por fronteira
- **THEN** a pirâmide reflete exatamente a configuração, rejeitando níveis descontínuos, fronteiras entre divisões não-adjacentes, tamanhos fora de 2..20 e qualquer fronteira que viole as pontas (acesso saindo da divisão 1 ou rebaixamento saindo da última divisão)

#### Scenario: Configuração que deixaria divisão abaixo de 2 é rejeitada

- **WHEN** o dono define fronteiras cujo fluxo deixaria alguma divisão com menos de 2 (ou mais de 20) competidores
- **THEN** a CHECK de fechamento de tamanho rejeita a configuração antes de qualquer escrita, com erro explícito

#### Scenario: Pirâmide de uma única divisão

- **WHEN** o dono cria uma pirâmide com N=1 (uma divisão, sem fronteiras)
- **THEN** a criação é aceita como liga multi-temporada sem sobe/cai, e o fluxo apenas persiste o resultado e monta a próxima temporada com os mesmos competidores na mesma divisão

### Requirement: Montar a temporada (uma divisão = um torneio de liga)

Ao montar uma temporada, o sistema SHALL usar a RPC `SECURITY DEFINER` `montar_temporada(p_season_id uuid)` (nunca o fluxo de criação de torneio avulso nem `slot_invites`) para criar, em cada divisão, um `tournaments` de `formato='liga'` em rascunho (espelhando `por_nome`, `desempate_criterio` e herdando `is_public` da pirâmide), inserir as vagas (`tournament_slots`) JÁ preenchidas de cada competidor, criar as entradas de histórico (`league_division_entries`) e vincular o torneio à divisão (`league_division_seasons.tournament_id`). A RPC SHALL validar que o caller é o dono da pirâmide antes de qualquer escrita. A montagem SHALL ser idempotente usando `league_division_seasons.tournament_id` como sentinela (não duplica torneios/slots em retry). Iniciar cada divisão SHALL reusar `iniciarTorneio` sem modificar o motor.

#### Scenario: Montar e iniciar uma divisão

- **WHEN** o dono monta a temporada e inicia uma divisão
- **THEN** um torneio de liga é criado com as vagas dos competidores, `iniciarTorneio` gera a tabela round-robin (vaga_1/vaga_2/rodada) e a classificação roda pelo motor existente

#### Scenario: Montagem idempotente

- **WHEN** a montagem da temporada é re-executada após falha parcial (ou corrida entre abas)
- **THEN** os torneios e vagas já criados não são duplicados e a montagem completa o que faltava

### Requirement: Toggle nome/clube por divisão

Cada divisão SHALL escolher independentemente disputar por CLUBE (vagas com `team_id`) ou por NOME (vagas com `rotulo`), podendo MISTURAR modos na mesma pirâmide. A divisão por nome SHALL reusar o caminho existente de `por_nome`/`rotulo` (sem técnico convidável, organizador lança placares), e o competidor persistente SHALL ser ligado via `tournament_slots.competitor_id`.

#### Scenario: Pirâmide mista nome/clube

- **WHEN** o dono cria uma pirâmide com a 1ª divisão por clube e a 2ª por nome
- **THEN** cada divisão gera seu torneio com o modo escolhido (clube com convite, nome com rótulo) e ambas classificam normalmente pelo mesmo motor

### Requirement: Competidor persistente que migra entre temporadas

Um competidor (`league_competitors`) SHALL persistir através das temporadas da pirâmide, mantendo identidade (clube ou nome) e histórico (`league_division_entries`). Ao subir ou cair, o competidor SHALL ser realocado para a divisão de destino na temporada seguinte, e o seu técnico humano (`holder_user_id`, anulável) SHALL ACOMPANHAR (mantém o elenco) quando presente. A propagação do técnico para a vaga (`tournament_slots.user_id`) SHALL ocorrer pela RPC `montar_temporada` (SECURITY DEFINER), o único caminho autorizado a pré-preencher `user_id`. Quando dois competidores da mesma divisão por clube compartilham o mesmo técnico (colisão com o UNIQUE `slots_um_clube_por_tecnico`), a montagem SHALL degradar a vaga em conflito para `user_id = NULL` (vaga gerida pelo dono) em vez de falhar. Competidores sem técnico (`holder_user_id` nulo) SHALL gerar vagas geridas pelo dono. A identidade do competidor SHALL ser imutável após a primeira partida disputada.

#### Scenario: Competidor sobe com o técnico via RPC

- **WHEN** um competidor com técnico vinculado termina entre os promovidos da 2ª divisão e a próxima temporada é montada
- **THEN** a RPC `montar_temporada` cria a vaga do competidor na 1ª divisão da temporada seguinte com `user_id` igual ao seu técnico, e o seu histórico registra o acesso

#### Scenario: Dois competidores com o mesmo técnico degradam para vaga gerida pelo dono

- **WHEN** uma divisão por clube tem dois competidores apontando o mesmo técnico e a temporada é montada
- **THEN** o primeiro slot recebe `user_id` do técnico e o segundo é gravado com `user_id = NULL` (gerido pelo dono), respeitando o UNIQUE `slots_um_clube_por_tecnico` sem quebrar a montagem

### Requirement: Executar o fluxo de sobe/cai e gerar a próxima temporada

Quando TODAS as divisões da temporada encerrarem, o dono SHALL poder executar o fluxo em dois passos: CALCULAR (read-only) — lê a classificação de cada divisão pelo motor, deriva a base de ranking (posição ou pontos-por-jogo), aplica as fronteiras diretas (N últimos caem, N primeiros sobem) e produz um PLANO exibido antes de confirmar; CONFIRMAR (escrita) — persiste os resultados, monta a próxima temporada (via RPC `montar_temporada`) com os competidores realocados conservando o tamanho de cada divisão, e TRAVA a temporada atual. A montagem da próxima temporada SHALL EXIGIR o fechamento de tamanho (rejeita, sem escrita, se alguma divisão sair de `[2,20]`) e SHALL falhar de forma explícita nesse caso, nunca "perdendo" competidor. O cálculo SHALL ser idempotente e a temporada encerrada SHALL ficar congelada — a reabertura de qualquer divisão dessa temporada SHALL ser barrada (guard em `reabrirTorneio` + trigger `lock_division_tournament_reopen`).

#### Scenario: Fluxo direto simétrico conserva o tamanho

- **WHEN** o dono executa o fluxo de uma temporada com fronteira simétrica (4 sobem / 4 caem) e confirma
- **THEN** os 4 últimos da divisão superior trocam de lugar com os 4 primeiros da inferior, a próxima temporada é montada com cada divisão no mesmo tamanho e a temporada anterior fica congelada

#### Scenario: Temporada travada após gerar a próxima

- **WHEN** a próxima temporada já foi gerada e alguém tenta reabrir uma divisão da temporada encerrada
- **THEN** o lock barra a alteração e a temporada permanece congelada

### Requirement: Sorteio crypto no empate exato da zona de corte com override do dono

Quando dois ou mais competidores ficarem empatados (sem desempate objetivo do motor) EXATAMENTE na linha de corte (sobe/cai), o sistema SHALL resolver por SORTEIO criptográfico que ORDENA todos os empatados na fronteira e preenche as vagas em disputa na ordem sorteada, registrando a semente para auditoria e reprodutibilidade. O sorteio SHALL rodar SOMENTE quando o motor retornar posições empatadas na linha de corte; em todos os outros casos a classificação objetiva decide. A entrada de histórico SHALL registrar o destino (`sobe`/`cai`/`permanece`) e separadamente `resolvido_por = 'sorteio'` (motivo). Antes de confirmar a próxima temporada, o dono SHALL poder AJUSTAR manualmente o resultado (registrado como `resolvido_por = 'override'`).

#### Scenario: Sorteio registrado decide o corte

- **WHEN** dois competidores empatam exatamente na posição que separa quem cai de quem fica e o dono executa o fluxo
- **THEN** o sistema sorteia por crypto, registra a semente no resultado do fluxo, grava `destino`+`resolvido_por='sorteio'` e mostra o desfecho no plano antes da confirmação

#### Scenario: Empate cruzando duas ou mais posições de corte

- **WHEN** três ou mais competidores empatam abrangendo mais de uma vaga de acesso/rebaixamento na fronteira
- **THEN** o sorteio crypto ordena TODOS os empatados e preenche as vagas em disputa na ordem sorteada, mantendo a semente registrada

#### Scenario: Dono ajusta o sorteio antes de confirmar

- **WHEN** o dono discorda do sorteio e ajusta manualmente quem sobe/cai
- **THEN** a confirmação aplica o ajuste do dono sobre o plano (`resolvido_por='override'`) e a próxima temporada reflete a decisão manual
