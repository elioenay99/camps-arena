# league-pyramid Specification

## Purpose
TBD - created by archiving change add-ligas-piramide. Update Purpose after archive.
## Requirements
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

### Requirement: Fronteira por playoff de acesso ou playout (Fase 2)

Uma fronteira SHALL poder ser configurada (`league_boundaries.modo`) como `playoff_acesso` (o lado do ACESSO é decidido por uma chave eliminatória entre os primeiros da divisão inferior; o rebaixamento da superior continua DIRETO por posição) ou `playout` (o lado da QUEDA é decidido por uma chave entre os últimos da divisão superior; o acesso da inferior continua DIRETO). Cada fronteira de playoff SHALL escolher independentemente um `playoff_estilo` e um leg format (`playoff_ida_e_volta`):

- **Estilo `vagas`** ("a chave decide as vagas"): uma chave COMPLETA de `playoff_vagas` participantes (∈ {4,8,16,32}, sem byes) joga até sobrar o nº de sobreviventes que recebem o desfecho favorável — no `playoff_acesso`, os `vagas_acesso` sobreviventes (vencedores) SOBEM e os demais permanecem; no `playout`, os `vagas_rebaixamento` ELIMINADOS caem e os sobreviventes (`playoff_vagas - vagas_rebaixamento`) permanecem. O nº favorável SHALL corresponder a uma rodada exata da chave (`playoff_vagas / 2^f`), portanto potência de 2.
- **Estilo `extra`** ("direto + 1 na chave"): as vagas diretas são decididas por posição (como `direto`) e a chave entre os PRÓXIMOS `playoff_vagas` (2..32, byes permitidos) decide UMA vaga extra — no `playoff_acesso`, o CAMPEÃO da chave sobe; no `playout`, o PERDEDOR da final da chave cai. Os demais participantes da chave permanecem.

A configuração SHALL preservar a CONSERVAÇÃO de tamanho usando o movimento EFETIVO de cada fronteira, onde o `+1` do estilo `extra` entra SOMENTE no lado da CHAVE: `playoff_acesso` `extra` ⇒ acesso efetivo = `vagas_acesso + 1`, queda efetiva = `vagas_rebaixamento` (toda direta); `playout` `extra` ⇒ queda efetiva = `vagas_rebaixamento + 1`, acesso efetivo = `vagas_acesso`; estilo `vagas`/`direto` ⇒ efetivos = brutos. A conservação exige `acesso_efetivo == queda_efetivo` por fronteira (logo `playoff_acesso extra` ⇒ `vagas_rebaixamento = vagas_acesso + 1`). A montagem REJEITA (não apenas avisa) qualquer config cujo movimento efetivo deixe uma divisão fora de `[2,20]` ou cuja zona da chave não caiba na divisão de origem. A chave de cada fronteira SHALL ter no máximo `MATA_MATA_MAX_PARTICIPANTES` (32) participantes. As pontas continuam válidas (a divisão 1 nunca recebe acesso por playoff de cima; a última nunca sofre playout para baixo).

#### Scenario: Playoff de acesso estilo vagas

- **WHEN** o dono configura uma fronteira `playoff_acesso` estilo `vagas` com `playoff_vagas=8` e `vagas_acesso=4` (jogo único), inicia a temporada e encerra as divisões
- **THEN** uma chave de 8 entre os 8 primeiros da divisão inferior é montada e jogada; os 4 vencedores da 1ª rodada SOBEM e os 4 perdedores permanecem; o rebaixamento da divisão superior segue direto por posição

#### Scenario: Playoff de acesso estilo extra (Championship)

- **WHEN** o dono configura `playoff_acesso` estilo `extra` com `vagas_acesso=2` e `playoff_vagas=4` (ida-e-volta nas semifinais, final em jogo único)
- **THEN** os 2 primeiros da divisão inferior sobem direto e uma chave de 4 entre os 3º–6º decide a 3ª vaga (campeão sobe), com a divisão superior rebaixando `vagas_acesso+1 = 3` direto, conservando o tamanho

#### Scenario: Playout estilo extra rebaixa o perdedor da final

- **WHEN** o dono configura `playout` estilo `extra` e a chave entre os times logo acima da zona de queda direta é decidida
- **THEN** o campeão da chave se salva (permanece) e o PERDEDOR DA FINAL cai, somando-se às quedas diretas, conservando o tamanho

#### Scenario: Config de playoff que viola potência de 2 ou conservação é rejeitada

- **WHEN** o dono define um estilo `vagas` cujo nº de vagas não corresponde a uma rodada exata da chave (ex.: `playoff_vagas=8`, `vagas_acesso=3`), ou um movimento efetivo que deixaria uma divisão fora de `[2,20]`
- **THEN** o schema REJEITA a configuração antes de qualquer escrita, com erro explícito, e o wizard impede o avanço

### Requirement: Montar e jogar as chaves de playoff/playout (Fase 2)

Quando TODAS as divisões da temporada encerrarem, o sistema SHALL permitir montar as chaves de playoff/playout via uma ação que, para cada fronteira não-`direto`, resolve a ZONA pela classificação das divisões e chama a RPC `SECURITY DEFINER` `montar_playoff(p_boundary_id uuid)` — que cria um `tournaments` de `formato='mata_mata'` em rascunho (herdando `por_nome`, `desempate_criterio` e `is_public`), insere os `tournament_slots` JÁ preenchidos dos competidores da zona (com a MESMA degradação de `user_id` da montagem de temporada) e vincula o torneio à fronteira (`league_boundaries.playoff_tournament_id`, sentinela de idempotência). A chave SHALL ser SEMEADA por posição na liga (determinística — melhor classificado contra pior), gerada pelo motor de mata-mata existente (`gerarFaseInicial`) com o leg format da fronteira. O dono SHALL jogar a chave reusando o ciclo de torneio existente (lançar placar, avançar fase). A montagem SHALL ser idempotente (não duplica chaves em retry) e SHALL exigir que ambas as divisões da fronteira tenham o mesmo `por_nome`. As chaves SHALL ficar CONGELADAS após o fluxo confirmar a temporada (guard em `reabrirTorneio` + trigger `lock_division_tournament_reopen` estendido a `playoff_tournament_id`).

#### Scenario: Montar e jogar a chave de uma fronteira

- **WHEN** o dono monta os playoffs de uma temporada com as divisões encerradas
- **THEN** cada fronteira de playoff ganha um torneio `mata_mata` semeado por posição com as vagas dos competidores da zona, e o dono pode jogá-lo pelo ciclo de torneio existente

#### Scenario: Montagem de playoff idempotente

- **WHEN** a montagem dos playoffs é re-executada (retry/corrida entre abas)
- **THEN** as chaves já criadas não são duplicadas (sentinela `playoff_tournament_id`) e a montagem completa só o que faltava

#### Scenario: Chave de playoff congelada após o fluxo

- **WHEN** a temporada já consolidou o sobe/cai e alguém tenta reabrir a chave de uma fronteira
- **THEN** o lock barra a reabertura e a chave permanece congelada

### Requirement: Integrar o resultado das chaves ao fluxo (Fase 2)

O fluxo de fim de temporada (`calcularFluxoTemporada`) SHALL incorporar o resultado das chaves de playoff/playout: para fronteiras não-`direto`, o conjunto de quem sobe/cai vem do RESULTADO da chave (lido de forma pura das partidas persistidas via `decidirConfronto`), não da zona de corte por posição. O cálculo SHALL exigir que TODAS as chaves de playoff da temporada estejam DECIDIDAS (final resolvida) antes de produzir o plano; enquanto houver chave pendente, o fluxo NÃO avança. As entradas resolvidas por chave SHALL registrar `resolvido_por = 'playoff'`. A DISJUNÇÃO de cortes (um competidor nunca sobe E cai) e a CONSERVAÇÃO de tamanho SHALL continuar garantidas, agora misturando fronteiras `direto` e de playoff na mesma temporada.

#### Scenario: Plano reflete o vencedor do playoff

- **WHEN** todas as divisões e todas as chaves de playoff da temporada estão encerradas e o dono calcula o fluxo
- **THEN** o plano sobe/cai usa o resultado das chaves (vencedores/sobreviventes sobem ou se salvam; eliminados/perdedores caem) com `resolvido_por='playoff'`, e a próxima temporada reflete isso conservando o tamanho

#### Scenario: Fluxo bloqueado com playoff pendente

- **WHEN** as divisões encerraram mas uma chave de playoff ainda não foi decidida
- **THEN** o cálculo do fluxo é bloqueado com erro explícito até a chave ser concluída

### Requirement: Fronteira por barragem cruzada (Fase 3)

Uma fronteira SHALL poder ser configurada (`league_boundaries.modo`) como `barragem_cruzada` — uma chave que MISTURA competidores das DUAS divisões adjacentes (a superior `d` e a inferior `d+1`), diferente do playoff/playout que são INTRA-divisão. A fronteira SHALL poder combinar uma parte DIRETA (`vagas_rebaixamento` caem direto de `d`, `vagas_acesso` sobem direto de `d+1`) com a barragem por cima, em um de dois estilos (`playoff_estilo`) e leg format configurável (`playoff_ida_e_volta`):
- **Estilo `pares`** (par-a-par): `playoff_vagas` PAR participantes formam `B = playoff_vagas/2` confrontos INDEPENDENTES 1×1, cada um entre 1 competidor de `d` (zona de risco, logo acima dos diretos) e 1 de `d+1` (zona de disputa, logo abaixo dos diretos), semeados DIRETO (melhor-de-baixo × melhor-de-cima, índice a índice). Em cada par o vencedor fica/sobe a `d` e o perdedor cai/fica em `d+1`.
- **Estilo `chave`** (chave única mista): `playoff_vagas = k+1 ∈ {4,8,16,32}` participantes — 1 defensor de `d` + k desafiantes de `d+1` — numa chave de mata-mata; o campeão fica/sobe a `d` e todos os demais ficam/caem em `d+1`.

A barragem SHALL ser AUTO-BALANCEADA: cada par/chave troca exatamente 0 ou 1 vaga entre as divisões (vencedor de baixo sobe SSE perdedor de cima cai), portanto `|sobem pela barragem| == |caem pela barragem|` sempre, independentemente do resultado. A CONSERVAÇÃO de tamanho SHALL exigir apenas a simetria da parte direta (`vagas_acesso == vagas_rebaixamento`), pois a barragem não contribui ao saldo líquido. A configuração SHALL REJEITAR (não apenas avisar): estilo fora de `{pares,chave}`; `playoff_vagas` que não caiba nas DUAS divisões (zona de `d` e de `d+1`); e barragem entre divisões com `por_nome` divergente. As pontas continuam válidas (a fronteira exige as duas divisões adjacentes).

#### Scenario: Barragem em pares decide acesso/queda cruzando divisões

- **WHEN** a fronteira é `barragem_cruzada` estilo `pares` com B pares, e cada par é jogado
- **THEN** em cada par o vencedor (seja de `d` ou de `d+1`) ocupa a vaga superior e o perdedor a inferior, trocando exatamente as vagas dos pares "virados" e conservando o tamanho das duas divisões

#### Scenario: Barragem em chave única promove o campeão

- **WHEN** a fronteira é `barragem_cruzada` estilo `chave` (1 defensor de `d` + k de `d+1`) e a chave é decidida
- **THEN** se o campeão é de `d+1` ele sobe e o defensor de `d` cai; se o campeão é o defensor, ninguém se move — conservando o tamanho

#### Scenario: Barragem entre divisões heterogêneas é rejeitada

- **WHEN** o dono tenta configurar barragem entre uma divisão por clube e outra por nome
- **THEN** a configuração é REJEITADA (homogeneidade `por_nome` cruzada exigida pelo Zod/wizard e pela RPC `montar_barragem`)

### Requirement: Montar e jogar a barragem cruzada (Fase 3)

Para cada fronteira `barragem_cruzada`, o sistema SHALL resolver a ZONA nas DUAS divisões pela classificação e chamar a RPC `SECURITY DEFINER` `montar_barragem(p_boundary_id uuid, p_competitor_ids uuid[])` — que valida o modo, exige as duas divisões-fonte e o mesmo `por_nome` entre elas, cria um `tournaments` de `formato='mata_mata'` em rascunho (herdando `por_nome`/`desempate`/`is_public`), insere os `tournament_slots` dos competidores da zona na ordem de seeding e vincula o torneio à fronteira (`league_boundaries.playoff_tournament_id`, a MESMA sentinela do playoff). No estilo `chave` a geração SHALL reusar o motor de mata-mata existente; no estilo `pares` SHALL gerar `B` confrontos independentes na primeira rodada (sem reduzir a um campeão, e respeitando o leg format mesmo com `B=1`). A montagem SHALL ser idempotente e as chaves SHALL ficar CONGELADAS após o fluxo confirmar (reúso do guard + trigger sobre `playoff_tournament_id`). O fluxo de fim de temporada SHALL incorporar o resultado da barragem (quem sobe/cai vem do RESULTADO, com `resolvido_por='playoff'`), exigindo a barragem DECIDIDA antes de produzir o plano, mantendo a disjunção de cortes e a conservação, e podendo misturar fronteiras `direto`, de playoff e de barragem na mesma temporada.

#### Scenario: Montagem da barragem cria a chave cruzada

- **WHEN** todas as divisões encerram e o dono monta as barragens
- **THEN** cada fronteira `barragem_cruzada` ganha um torneio `mata_mata` com as vagas dos competidores das duas divisões da zona, jogável pelo ciclo de torneio existente

#### Scenario: Fluxo reflete o resultado da barragem

- **WHEN** todas as divisões e todas as barragens da temporada estão decididas e o dono calcula o fluxo
- **THEN** o plano sobe/cai usa o resultado das barragens (vencedores de baixo sobem, perdedores de cima caem), com `resolvido_por='playoff'`, conservando o tamanho das divisões na próxima temporada

### Requirement: Sobe/cai por promedio (média plurianual — Fase 4)

Para divisões com `ranking_base = 'promedios'`, o cálculo do fluxo SHALL decidir o corte de sobe/cai pelo **promedio** de cada competidor — `Σpontos ÷ Σjogos` de TODA a sua história na pirâmide (todas as temporadas anteriores, todas as divisões) MAIS a contribuição AO VIVO da temporada corrente — em vez da posição da tabela. O sistema SHALL produzir um rank de corte único e contíguo (`promedio desc`, desempatado pela posição real da tabela do ano e então pelo id do competidor), de modo que o corte por promedio seja DETERMINÍSTICO (sem sorteio). O motor de fluxo SHALL permanecer inalterado: o rank de promedio é injetado como a posição de corte, e a `posicao_final` PERSISTIDA SHALL ser sempre a posição REAL da tabela (resultado esportivo), nunca o rank. A conservação de tamanho SHALL ser preservada (o promedio só reordena QUEM cai/sobe, não QUANTOS). A mesma ordem de corte SHALL alimentar a resolução de zona de playoff/barragem quando a divisão usa `promedios` (montagem e cálculo na mesma base). Um competidor em sua primeira temporada (sem histórico) SHALL ter promedio igual ao PPG da temporada atual; `Σjogos = 0` SHALL render promedio 0 (ordem garantida pelo desempate por posição).

#### Scenario: Promedio decide o rebaixamento contra a tabela do ano

- **WHEN** uma divisão `promedios` encerra com um clube de baixo promedio em posição de tabela segura e um clube de alto promedio em posição de queda
- **THEN** o corte rebaixa pelo promedio (o de baixo promedio cai mesmo melhor colocado no ano), e a `posicao_final` registrada de cada um é a posição real da tabela

#### Scenario: Promedio de vida toda soma todas as divisões

- **WHEN** um competidor jogou temporadas em divisões diferentes
- **THEN** o promedio soma pontos e jogos de todas elas (sem reset por promoção/queda) e divide um pelo outro, somando ainda a campanha ao vivo da temporada corrente

#### Scenario: Corte por promedio é determinístico

- **WHEN** o fluxo de uma divisão `promedios` é calculado
- **THEN** o rank de promedio é total (sem empates) e nenhum sorteio é disparado; empates exatos de promedio são quebrados pela posição da tabela do ano

#### Scenario: Standings de divisão promedios mostram o promedio

- **WHEN** a página da temporada exibe uma divisão `promedios`
- **THEN** a tabela mostra a coluna de promedio por competidor e destaca a zona de corte pelo rank de promedio (não pela posição), com legenda explicando o critério

### Requirement: Página do competidor com histórico plurianual (Fase 4)

O sistema SHALL oferecer uma página `dashboard/ligas/competidor/[id]` (RSC) que apresenta o histórico completo de um competidor persistente, legível pelo dono da pirâmide e por qualquer USUÁRIO LOGADO enquanto a pirâmide está ATIVA (`status = 'ativa' OR created_by = auth.uid()`, ESPELHANDO exatamente a RLS das tabelas `league_*`; `is_public` NÃO entra — ele controla só `tournaments.is_public`/placares de partida, nunca a estrutura). Como a rota vive sob `/dashboard` (protegida pelo middleware), o acesso exige autenticação — "qualquer um" = qualquer usuário logado, não anônimo (acesso anônimo real exigiria mover a rota para fora de `/dashboard`; fica como follow-up). Esta é a primeira página `league_*` legível por NÃO-DONO, um gate novo e consciente alinhado à decisão de produto "estrutura da pirâmide é pública enquanto ativa; só placares de partida são privados". A página SHALL expor SÓ agregados das entries (pontos/jogos/posição/destino), NUNCA placares de jogo. A página SHALL mostrar: identidade (escudo do clube no modo clube, ou rótulo no modo nome); linha do tempo de temporadas (número da temporada, divisão, posição final, destino sobe/cai/permanece, PPG da temporada) derivada de `league_division_entries`; o promedio de vida toda e sua evolução por temporada; conquistas derivadas das entries (títulos = posição final 1, destaque de campeão da elite no nível 1, contagem de acessos e quedas); e agregados (temporadas disputadas, jogos e pontos totais, promedio). A `StandingsTable` da página da temporada SHALL linkar o nome de cada competidor para a sua página, usando o `competitor_id` já presente em `linha.participanteId` no contexto de pirâmide. A página SHALL ser mobile-first (390px) nos dois temas. A página NÃO mostra V/E/D/saldo histórico por temporada (as entries só guardam pontos/jogos).

#### Scenario: Histórico do competidor visível em pirâmide ativa

- **WHEN** um usuário logado (não o dono) abre a página de um competidor de uma pirâmide ativa
- **THEN** vê a linha do tempo de temporadas, o promedio e as conquistas (agregados), sem precisar ser o dono e sem ver placares de partida

#### Scenario: Página de competidor de pirâmide arquivada exige o dono

- **WHEN** um não-dono tenta abrir a página de um competidor de uma pirâmide ARQUIVADA (`status = 'arquivada'`)
- **THEN** o acesso é negado (not-found/sem dados), coerente com a RLS das tabelas (`status='ativa' OR created_by`)

#### Scenario: Conquistas derivadas do histórico

- **WHEN** um competidor terminou em 1º em alguma divisão e subiu/caiu ao longo das temporadas
- **THEN** a página conta os títulos (posição final 1), marca o campeão da elite (nível 1) e exibe a contagem de acessos e quedas, tudo derivado das entries existentes (sem nova persistência)

### Requirement: Temporada em ciclos Apertura/Clausura (Fase 5.1)

O sistema SHALL oferecer um modo de temporada em CICLOS (Apertura/Clausura): ao criar a pirâmide, o dono SHALL poder marcar a temporada como split (`ciclo = 'apertura_clausura'`), válido SOMENTE quando todas as divisões são `formato = 'liga'` (o schema REJEITA split com `grupos_mata_mata` — follow-up). Numa temporada split, cada divisão SHALL rodar DOIS torneios de liga (Apertura e Clausura) com o mesmo elenco; `iniciarDivisao` SHALL iniciar ambos e a season só vira `ativa` quando todas as meias de todas as divisões saírem de rascunho. O sobe/cai (e o `ranking_base`) SHALL operar sobre a TABELA ANUAL COMBINADA (soma dos dois turnos), nunca sobre um turno isolado; o gate de fluxo SHALL exigir AMBAS as meias encerradas por divisão. As colunas `league_division_entries.pontos/jogos/posicao_final` SHALL persistir os valores da COMBINADA (a grande final NUNCA entra), sob pena de corromper o promédio plurianual de forma irreversível. O CAMPEÃO da divisão SHALL ser o vencedor de uma GRANDE FINAL ida-e-volta entre o campeão da Apertura e o da Clausura (decisão de produto 5.1a/5.1c); a grande final é DECORATIVA para o sobe/cai (não gateia nem altera o fluxo, é jogável mesmo após o fluxo) e, quando o MESMO competidor vence os dois turnos, há campeão DIRETO (sem montar a final). A tabela combinada NÃO SHALL marcar o líder (posição 1) como campeão (a `StandingsTable` recebe `ocultarCampeao` no split); o título na página do competidor SHALL ser derivado do vencedor da grande final (ou campeão direto), não de `posicao_final = 1`. A UI da temporada SHALL, por divisão split, oferecer links para os dois turnos, exibir a tabela combinada com as zonas de sobe/cai e um painel da grande final, tudo mobile-first (390px) nos dois temas. Temporadas `anual` (default) SHALL permanecer byte-idênticas ao comportamento atual.

#### Scenario: Sobe/cai pela tabela anual combinada

- **WHEN** uma divisão split tem Apertura e Clausura encerrados e o fluxo é calculado
- **THEN** o corte de acesso/rebaixamento usa a soma dos dois turnos (posição/pontos/jogos combinados), e `league_division_entries` persiste pontos/jogos da combinada — a grande final, mesmo jogada, não altera esses valores

#### Scenario: Gate exige as duas meias encerradas

- **WHEN** a Apertura de uma divisão está encerrada mas a Clausura ainda em andamento
- **THEN** o fluxo de fim de temporada é bloqueado com mensagem específica (decidir o corte com um turno faltando é irreversível)

#### Scenario: Campeão pela grande final

- **WHEN** Apertura e Clausura têm campeões DISTINTOS numa divisão split
- **THEN** o sistema oferece montar a grande final ida-e-volta entre eles; o vencedor é o campeão da divisão (título), enquanto o líder da tabela combinada NÃO recebe troféu automático

#### Scenario: Campeão direto quando o mesmo vence os dois turnos

- **WHEN** o mesmo competidor vence Apertura e Clausura
- **THEN** não há grande final e ele é campeão direto da divisão

#### Scenario: Ciclo preservado entre temporadas

- **WHEN** o fluxo de uma temporada split gera a N+1
- **THEN** a N+1 nasce split e cada divisão volta a rodar dois turnos (o ciclo não some após uma temporada)

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

### Requirement: Competidor único por temporada entre divisões

O sistema SHALL impedir, na validação da pirâmide, que um mesmo competidor (clube ou nome
livre normalizado) ocupe duas divisões diferentes da mesma temporada, alinhando a validação de
borda ao índice único por competição do banco. A repetição entre divisões SHALL produzir um
erro de campo preciso, não um erro genérico de falha na criação.

#### Scenario: Mesmo clube em duas divisões é barrado na validação

- **WHEN** o organizador monta uma pirâmide com o mesmo clube (ou o mesmo nome livre) em duas divisões da temporada
- **THEN** a validação aponta a repetição com mensagem de campo antes de tentar gravar

### Requirement: Integridade do promédio plurianual

O sistema SHALL ler o histórico completo de pontos e jogos ao calcular o promédio plurianual
que define o corte de subida/descida, de forma determinística e independente de qualquer limite
de linhas do servidor de dados, preservando a soma integral de toda a vida do competidor.

#### Scenario: Histórico extenso não trunca a soma

- **WHEN** o cálculo do corte lê um histórico de promédio que excede o limite de linhas por resposta do servidor
- **THEN** a leitura percorre todas as páginas e a soma reflete o histórico completo

### Requirement: Visão de leitura da página da temporada para qualquer logado

A página da temporada `/dashboard/ligas/[id]` SHALL renderizar uma **visão de
leitura para qualquer usuário autenticado**, não apenas para o dono/admin da
liga. Sem sessão, a página SHALL redirecionar para o login (`redirectTo`). Com
sessão, a visibilidade SHALL ser determinada pela **RLS** (liga `ativa` é pública
para logados; `arquivada` só a equipe/dono a vê): quando a RLS não entrega a
temporada (inexistente ou invisível ao usuário), a página SHALL responder
`notFound` (404), sem oráculo de existência.

O conteúdo de competição SHALL ser visível ao leitor: classificação de todas as
divisões (com as zonas de sobe/cai), a chave de cada playoff/playout e da grande
final **conforme entregue pela RLS de partidas** (apenas rodadas liberadas de
torneios visíveis — a chave/classificação pode ser parcial ou vazia para o
leitor; o dono vê todas), e o estado das divisões. Esse comportamento SHALL ser
idêntico ao da página de torneio da divisão (sem oráculo de rodada oculta).

Os **controles de gestão** SHALL ser renderizados condicionalmente à capacidade
GERIR (`podeGerir` = dono ou admin de liga, herança incluída) e SHALL ficar
ocultos para o leitor não-gestor: montar temporada, iniciar divisão, alternar o
turno da divisão, o console de fim de temporada (fluxo de sobe/cai), os botões de
montar/avançar playoff e montar a grande final, e os atalhos de gestão do header
("Equipe", "Identidade"). Nenhum dado exclusivo de gestão (convites, códigos,
telefones) SHALL ser exposto ao leitor.

A autorização de ESCRITA NÃO SHALL ser enfraquecida: as Server Actions SHALL
continuar checando `podeGerir` pela `competition_id` real e a RLS de escrita
SHALL permanecer inalterada. As páginas irmãs de gestão (`/cores`, `/equipe`)
SHALL negar acesso ao não-gestor com `notFound` (gate próprio, já que os loaders
de leitura deixam de zerar os dados por capacidade).

#### Scenario: Jogador não-gestor vê a liga em leitura

- **WHEN** um usuário autenticado que NÃO é dono nem admin de uma liga ativa abre
  `/dashboard/ligas/[id]`
- **THEN** a página renderiza a classificação de todas as divisões, playoffs e
  grande final, sem 404, e SEM nenhum botão ou atalho de gestão

#### Scenario: Gestor vê os controles de gestão

- **WHEN** o dono ou um admin de liga abre a mesma página
- **THEN** além do conteúdo de leitura, os controles de gestão (montar, iniciar,
  turno, fluxo, playoffs, grande final, Equipe, Identidade) ficam disponíveis

#### Scenario: Usuário não autenticado é redirecionado

- **WHEN** uma requisição sem sessão chega a `/dashboard/ligas/[id]`
- **THEN** a página redireciona para `/login?redirectTo=/dashboard/ligas/[id]`

#### Scenario: Liga arquivada exige a equipe

- **WHEN** um usuário autenticado que não pertence à equipe abre uma liga
  `arquivada`
- **THEN** a RLS não entrega a temporada e a página responde `notFound` (404)

#### Scenario: Estado "não montada" é caminho de gestão, não de leitor

- **WHEN** uma temporada ainda não montada é aberta (tende a estar em `rascunho`,
  que a RLS esconde do não-equipe → 404 antes do estado read-only)
- **THEN** o estado read-only "temporada ainda não montada" (sem botão) só é
  alcançado por membro de equipe sem capacidade GERIR; o gestor, no mesmo caso, vê
  o botão de montar

#### Scenario: Página de identidade/equipe nega o não-gestor

- **WHEN** um leitor não-gestor navega para `/dashboard/ligas/[id]/cores` ou
  `/dashboard/ligas/[id]/equipe`
- **THEN** a página responde `notFound` (404)

### Requirement: Navegação da divisão para a liga-mãe

A página de um torneio de divisão de pirâmide SHALL oferecer um link para a
página da temporada da liga-mãe (`/dashboard/ligas/[season_id]`), permitindo ao
jogador da divisão alcançar a pirâmide (o torneio é divisão quando
`liga_do_torneio` resolve a competição-mãe). O texto do link SHALL ser
**"Ver pirâmide"**. O `season_id` SHALL ser resolvido a partir do torneio da
divisão (`league_division_seasons` por `tournament_id`/`tournament_id_clausura`);
quando não resolver, o link SHALL ser omitido.

#### Scenario: Link da divisão abre a pirâmide

- **WHEN** um usuário autenticado abre um torneio que é divisão de uma pirâmide
  visível
- **THEN** a página exibe um link "Ver pirâmide" que navega para a página da
  temporada da liga-mãe

### Requirement: Listar a liga na vitrine pública (opt-in)

A página da temporada SHALL oferecer, na área de gestão, um toggle "Listar na
vitrine pública" que alterna a coluna `league_competitions.listada` da
COMPETIÇÃO-mãe (`temporada.competicao.id`, não a season). O toggle SHALL ser
renderizado SOMENTE quando o usuário tem capacidade GERIR (`podeGerir`) sobre a
liga. A persistência SHALL ocorrer via Server Action que valida a entrada, checa
`podeGerir` pela `competitionId`, e atualiza a própria linha (`update
league_competitions set listada = ... where id = competitionId`), confiando na
RLS de update do dono existente (sem policy nova). A coluna SHALL ter default
`false` (opt-in real). Listar a liga publica a pirâmide inteira; a vitrine linka a
temporada CORRENTE.

#### Scenario: Gestor publica a liga na vitrine

- **WHEN** o dono (ou admin) de uma liga ativa aciona o toggle "Listar na vitrine
  pública"
- **THEN** `league_competitions.listada` passa a `true` e a liga passa a aparecer
  na vitrine (enquanto `status = 'ativa'`), com o card linkando a temporada
  corrente

#### Scenario: Toggle ausente para não-gestor

- **WHEN** um usuário sem capacidade GERIR abre a página da temporada
- **THEN** o toggle "Listar na vitrine pública" NÃO é renderizado e a Server
  Action rejeita a alteração de `listada`

### Requirement: Compartilhar a liga

A página da temporada SHALL oferecer um botão "Compartilhar" visível SOMENTE ao
gestor (`podeGerir`), que compartilha o link canônico da página da temporada
(`/dashboard/ligas/[season_id]`) pelo padrão existente (Web Share API no celular,
copiar para a área de transferência no desktop). O botão SHALL reutilizar a
orquestração de compartilhamento já usada por `CompartilharRodadaButton` (sem
imagem — apenas o link).

#### Scenario: Gestor compartilha o link da liga

- **WHEN** o gestor aciona "Compartilhar" na página da temporada
- **THEN** o app dispara o Web Share (celular) ou copia o link canônico da
  temporada (desktop)

#### Scenario: Botão ausente para não-gestor

- **WHEN** um leitor sem capacidade GERIR abre a página da temporada
- **THEN** o botão "Compartilhar" não é renderizado

### Requirement: Links de competidor da classificação sem prefetch em massa

Os links de competidor da `StandingsTable` (o ramo `hrefCompetidorBase`, que aponta cada nome para `dashboard/ligas/competidor/[id]`) NÃO SHALL disparar prefetch automático ao abrir a pirâmide: como uma temporada renderiza uma tabela por divisão com uma linha (link) por competidor — dezenas de links no viewport de uma vez — o prefetch-no-viewport padrão do `<Link>` do App Router (Next 16) dispararia um render RSC da página do competidor por link simultaneamente, cada um chamando o fetch pesado `getCompetitorProfile` (N+1), estourando o backend (HTTP 503). Esses links SHALL usar `prefetch={false}` (no App Router, "never happen both on entering the viewport and on hover" — `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:304`), eliminando a rajada. A navegação por CLIQUE SHALL permanecer intacta (o Next busca a rota-alvo na hora do clique). O ajuste SHALL valer SOMENTE para o link de competidor da tabela; os demais links da página (Equipe, Identidade, Abrir torneio, Voltar à pirâmide) SHALL permanecer inalterados. A `StandingsTable` usada em torneios avulsos (sem `hrefCompetidorBase`, nome em texto puro) SHALL permanecer byte-idêntica.

#### Scenario: Abrir a pirâmide não dispara a rajada de prefetch

- **WHEN** um usuário logado abre a página de uma pirâmide com divisões de ~20
  competidores (dezenas de links de competidor no viewport)
- **THEN** nenhum prefetch de `dashboard/ligas/competidor/*` é disparado ao entrar no
  viewport (o link usa `prefetch={false}`), evitando a rajada de renders de
  `getCompetitorProfile` que causava o 503

#### Scenario: Clicar num competidor ainda navega

- **WHEN** o usuário clica no nome de um competidor na classificação
- **THEN** a navegação leva à página `dashboard/ligas/competidor/[id]` normalmente (o
  clique busca a rota-alvo na hora), mesmo sem prefetch prévio

#### Scenario: Torneio avulso sem link permanece inalterado

- **WHEN** a `StandingsTable` renderiza num torneio avulso (sem `hrefCompetidorBase`)
- **THEN** o nome do participante aparece como texto puro (sem `<Link>`), idêntico ao
  comportamento atual

### Requirement: Encerrar a temporada materializa os troféus antes do flip final
`confirmarFluxoTemporada` — o único caminho de encerrar uma temporada — SHALL,
após congelar o resultado por competidor (entries) e ANTES do write final que
marca a season `encerrada`, com a season ainda em `em_fluxo`, chamar
`registrar_conquistas_temporada` para materializar os troféus daquela temporada
(campeão/vice/promovido/rebaixado e artilheiro derivados das entries/`match_goals`;
campeão/vice de mata-mata via `resultadoDaChave` e melhor ataque/defesa/sequência
via `calcularDestaques`, passados no payload). O flip para `encerrada` SHALL ser o
ÚLTIMO write. Ao montar o payload, a action SHALL traduzir os ids chaveados por
SLOT (dos motores) para `competitor_id` (via `league_division_entries` /
`rechavearInsights`) — payload com slot ids faria a RPC descartar os prêmios em
silêncio. Uma falha na materialização SHALL ser tratada como falha recuperável do
fluxo (que, ainda em `em_fluxo`, reexecuta idempotente no re-run), NÃO deixando a
estante vazia de forma permanente.

#### Scenario: Premiação ocorre antes de virar encerrada
- **WHEN** o dono confirma o fim de uma temporada
- **THEN** os troféus são materializados com a season ainda em `em_fluxo`, e só então a season vira `encerrada`

#### Scenario: Falha na premiação não trava a estante para sempre
- **WHEN** a materialização falha após o flip nunca ter ocorrido (season em `em_fluxo`)
- **THEN** re-executar o fluxo reexecuta a premiação idempotente, sem cair em early-return de `encerrada`

#### Scenario: Re-execução do fluxo não duplica troféus
- **WHEN** o encerramento é re-executado (resume em `em_fluxo`)
- **THEN** os troféus da temporada são regravados sem duplicar (delete-then-insert)

### Requirement: Pôster e push best-effort no encerramento da temporada
Ao encerrar uma temporada, o sistema SHALL disponibilizar um pôster
compartilhável "Temporada encerrada" (campeão da elite + quem subiu/caiu) e SHALL
disparar um push best-effort aos participantes (gated por co-participação),
sempre aguardado (`await`) antes de qualquer redirecionamento/revalidação. Uma
falha ao gerar o pôster ou ao enviar o push NÃO SHALL derrubar o encerramento.

#### Scenario: Push não bloqueia o encerramento
- **WHEN** o envio de push falha ou não há VAPID configurada
- **THEN** o encerramento conclui normalmente e o resultado da temporada é persistido

#### Scenario: Pôster de temporada encerrada disponível
- **WHEN** a temporada é encerrada
- **THEN** existe uma imagem compartilhável com o campeão e os promovidos/rebaixados

### Requirement: Escudo personalizado do competidor por liga

Cada competidor da pirâmide (`league_competitors`) SHALL poder ter um escudo próprio,
válido SOMENTE dentro daquela liga. O catálogo global de clubes (`public.teams`) SHALL
permanecer inalterado: trocar o escudo em uma liga NÃO SHALL afetar nenhuma outra liga nem
nenhum outro usuário.

O escudo efetivo de um competidor SHALL ser `coalesce(<escudo do competidor>, <escudo do
clube no catálogo>)`. Quando não há override, o comportamento SHALL ser idêntico ao atual.
Competidor por NOME (sem clube do catálogo) SHALL poder ter escudo próprio; sem override,
SHALL continuar caindo no monograma de iniciais.

Apenas quem tem a capacidade GERIR da liga (dono OU membro com papel `admin`) SHALL poder
definir ou remover o escudo. A verificação SHALL existir em duas camadas: pré-check na
Server Action e RLS no banco como backstop.

Remover o override SHALL restaurar o escudo do catálogo.

#### Scenario: Dono troca o escudo de um clube na liga dele

- **WHEN** o dono da liga envia uma imagem para um competidor
- **THEN** todas as superfícies daquela liga passam a mostrar o escudo enviado, e o mesmo
  clube em qualquer outra liga continua com o escudo do catálogo

#### Scenario: Admin da liga também pode

- **WHEN** um membro com papel `admin` define o escudo de um competidor
- **THEN** a operação é aceita

#### Scenario: Quem não gere não pode

- **WHEN** um usuário sem capacidade GERIR tenta definir ou remover o escudo de um
  competidor
- **THEN** a operação é recusada com a mesma mensagem de "não encontrado ou sem acesso"
  usada no resto do projeto, sem revelar se o competidor existe

#### Scenario: Remover volta ao catálogo

- **WHEN** o gestor remove o escudo personalizado
- **THEN** o competidor volta a exibir o escudo do clube no catálogo (ou o monograma de
  iniciais, se o clube não tiver escudo)

### Requirement: Resolução do escudo efetivo em todas as superfícies da liga

Toda superfície que desenha escudo de um competidor de liga SHALL resolver o escudo
efetivo, incluindo classificação, partidas (abertas e encerradas), rodada, vagas do
torneio, artilharia, muralha, rivais, perfil do competidor, perfil do técnico, painel de
partidas ativas, copa vinculada, cards OG e a tela de convite de vaga.

A resolução SHALL usar o ponteiro `competitor_id` que a vaga (`tournament_slots`) e a
entrada de copa (`cup_entries`) já carregam — sem query adicional por render.

Quando `competitor_id` é `null` (torneio avulso ou legado, entrada de copa manual ou
por-nome), a superfície SHALL exibir exatamente o escudo do catálogo, como hoje.

#### Scenario: Override aparece na classificação e nas partidas

- **WHEN** um competidor com escudo personalizado joga na liga
- **THEN** classificação, lista de partidas, página da rodada e cards OG mostram o escudo
  personalizado

#### Scenario: Copa vinculada herda o override

- **WHEN** uma edição de copa recebe um participante herdado de uma divisão da liga
- **THEN** o participante aparece com o escudo personalizado daquela liga

#### Scenario: Torneio avulso não regride

- **WHEN** um torneio avulso (sem pirâmide) é renderizado
- **THEN** os escudos continuam vindo do catálogo, sem erro e sem query extra

### Requirement: Envio do escudo personalizado

O envio SHALL acontecer na página de **Identidade** da liga
(`/dashboard/ligas/[id]/cores`), sem rota nova, com o fluxo escolher arquivo → pré-visualizar
→ salvar → feedback via `sonner`, e uma ação de remover disponível quando há override.

A imagem SHALL ser reduzida no cliente antes do envio, de modo que caiba no limite do
bucket e que metadados EXIF (inclusive GPS) não sejam preservados.

O servidor SHALL aceitar apenas `image/png` e `image/webp`, SHALL validar os bytes reais do
arquivo (magic bytes) e SHALL recusar quando o conteúdo não corresponder ao tipo declarado.
O `contentType` gravado no Storage SHALL derivar do tipo DETECTADO, nunca do informado pelo
cliente.

A interface SHALL ser utilizável a 390px, com alvos de toque de ao menos 44px.

#### Scenario: Foto do celular é aceita

- **WHEN** o gestor escolhe uma foto de vários megabytes pelo celular
- **THEN** a imagem é reduzida antes do envio e o upload é aceito

#### Scenario: Arquivo que mente sobre o tipo é recusado

- **WHEN** um arquivo declara `image/png` mas seus bytes não são de uma imagem PNG/WEBP
  válida
- **THEN** o envio é recusado com mensagem em pt-BR e nada é gravado

#### Scenario: SVG não entra

- **WHEN** o arquivo é um SVG
- **THEN** o envio é recusado

