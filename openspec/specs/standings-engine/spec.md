# standings-engine Specification

## Purpose
TBD - created by archiving change add-scoring-rules. Update Purpose after archive.
## Requirements
### Requirement: Cálculo de classificação por regras do torneio
O sistema SHALL prover uma função pura `computeStandings` que, dadas as regras de pontuação do torneio (vitória/empate/derrota) e suas partidas, devolve a tabela de classificação. Somente partidas `encerrada` com ambos os participantes definidos SHALL pontuar; as demais SHALL ser ignoradas. Os pontos SHALL ser `vitórias × pontos_vitoria + empates × pontos_empate + derrotas × pontos_derrota`.

#### Scenario: Resultados convertem em pontos pela regra do torneio
- **WHEN** um torneio 3/1/0 tem A vencendo B e empatando com C
- **THEN** A soma 4 pontos, C soma 1 e B soma 0, com gols pró/contra e saldo acumulados

#### Scenario: Regras customizadas mudam a tabela
- **WHEN** o mesmo conjunto de partidas é calculado com regras 2/1/0
- **THEN** os pontos refletem a regra customizada

#### Scenario: Partida não encerrada ou sem participantes não pontua
- **WHEN** existem partidas `agendada`/`em_andamento` ou com participante nulo
- **THEN** elas não afetam pontos, jogos nem gols

### Requirement: Cadeia de desempate
A ordenação SHALL seguir: pontos → vitórias → saldo de gols → gols pró → confronto direto → empate persistente. O confronto direto SHALL ser aplicado apenas quando exatamente 2 participantes permanecem empatados (com 3 ou mais, o critério é pulado), considerando os pontos nas partidas elegíveis entre eles com as mesmas regras do torneio. Participantes indistinguíveis SHALL dividir a mesma posição (estilo 1º, 1º, 3º) com ordem de apresentação determinística.

#### Scenario: Desempate por saldo e gols pró
- **WHEN** dois participantes têm os mesmos pontos e vitórias
- **THEN** o de maior saldo fica à frente; persistindo, o de mais gols pró

#### Scenario: Confronto direto decide entre dois
- **WHEN** dois participantes seguem empatados após pontos/vitórias/saldo/gols pró
- **THEN** quem somou mais pontos nos jogos entre eles fica à frente

#### Scenario: Três ou mais empatados pulam o confronto direto
- **WHEN** três participantes seguem empatados após os critérios anteriores
- **THEN** o confronto direto não é aplicado e o empate persiste

#### Scenario: Confronto direto inconclusivo persiste o empate
- **WHEN** dois empatados nunca se enfrentaram ou somaram os mesmos pontos entre si
- **THEN** o empate persiste e ambos dividem a posição

#### Scenario: Empate persistente divide a posição
- **WHEN** dois participantes são indistinguíveis por toda a cadeia
- **THEN** ambos recebem a mesma posição e o seguinte pula (1º, 1º, 3º)

### Requirement: Motor de classificação por pontos

O motor `computeStandings` SHALL calcular a classificação de pontos corridos de forma PURA (sem IO), acumulando pontos/gols/jogos a partir das partidas encerradas com os dois lados definidos, creditando W.O. como vitória/derrota só nos pontos (zero gols), e atribuindo posição estilo competição (empatados persistentes dividem a posição; o próximo pula). O motor SHALL aceitar um parâmetro de desempate por PRESET que monta a cadeia de comparadores objetivos e define se o confronto direto se aplica só entre exatamente 2 empatados. Nesta entrega os presets disponíveis SHALL ser `cbf` e `ingles` (ambos reordenam comparadores objetivos mantendo o confronto direto restrito a exatamente 2); o preset `custom` e o `espanhol` (que exige mini-tabela entre 3+ empatados) NÃO SHALL ser expostos aqui — ficam para a fase de desempate avançado, que alargará o conjunto de valores. O preset SHALL ter default `cbf`, que reproduz EXATAMENTE o comportamento anterior (pontos → vitórias → saldo → gols pró → confronto direto só entre 2 → divisão de posição), sem regressão para nenhum torneio legado. Cada torneio SHALL persistir o seu preset em `tournaments.desempate_criterio` (default `cbf`, CHECK restrito a `cbf`/`ingles`/`custom` nesta fase), lido por `getTournamentClassificacao` e propagado às chamadas do motor; o tiebreaker final SHALL permanecer determinístico por id (code-point, cross-locale).

O preset SÓ tem efeito se a propagação for COMPLETA: `getTournamentClassificacao` SHALL incluir `desempate_criterio` no SELECT de `tournaments`, expor o campo no tipo `TorneioClassificacao` e repassá-lo como argumento de desempate em TODAS as chamadas do motor (classificação geral, clubes do avulso e por grupo). Omitir qualquer um dos três faz o preset ser silenciosamente ignorado (motor roda sempre CBF), o que NÃO é aceitável.

#### Scenario: Default CBF preserva o comportamento atual

- **WHEN** `computeStandings` é chamado sem o parâmetro de desempate (ou com `cbf`)
- **THEN** a ordenação, o agrupamento de empatados e o confronto direto entre exatamente 2 produzem o mesmo resultado de antes, e todos os testes existentes passam intactos

#### Scenario: Preset inglês reordena a cadeia objetiva

- **WHEN** um torneio com `desempate_criterio = 'ingles'` é classificado e dois competidores têm os mesmos pontos
- **THEN** o desempate aplica saldo de gols e gols pró antes de vitórias (cadeia inglesa), divergindo do CBF apenas quando esses critérios discordam

#### Scenario: Preset propagado do banco até o motor

- **WHEN** um torneio persiste `desempate_criterio = 'ingles'` e a sua classificação é carregada por `getTournamentClassificacao`
- **THEN** o preset é lido do SELECT, exposto no tipo e repassado às chamadas do motor, de modo que a ordenação reflete a cadeia inglesa (não o CBF), provando que a propagação não foi perdida

#### Scenario: Preset avançado habilitado na fase de desempate avançado

- **WHEN** a fase de desempate avançado é entregue e alguém grava `desempate_criterio = 'espanhol'` ou `'fifa'`
- **THEN** os CHECKs de desempate (`tournaments`, `league_competitions`, `league_division_seasons`) aceitam o valor (conjunto alargado para `cbf`/`ingles`/`custom`/`espanhol`/`fifa`), e o motor aplica a mini-tabela; `'custom'` permanece aceito mas degrada para `cbf` (reservado)

### Requirement: Desempate por mini-tabela entre empatados (`espanhol`/`fifa`)

O motor `computeStandings` SHALL suportar uma RESOLUÇÃO de empate por MINI-TABELA: para um grupo de 2+ competidores empatados na cadeia objetiva primária do preset, o motor SHALL computar uma sub-classificação usando SOMENTE as partidas disputadas ENTRE os empatados (mini-pontos com as mesmas regras do torneio → mini-saldo → mini-gols pró) e, para os ainda iguais na mini-tabela, aplicar um FALLBACK objetivo global e então a divisão de posição. A mini-tabela SHALL ser CICLO-SEGURA (soma pontos numa mini-liga, não compara aos pares — A>B>C>A não trava). O preset `espanhol` SHALL ordenar por pontos e então mini-tabela e então saldo/gols pró globais (estilo La Liga); o preset `fifa` SHALL ordenar por pontos/saldo/gols pró globais e então mini-tabela (estilo fase de grupos de Copa). Os presets `cbf` e `ingles` SHALL permanecer BYTE-IDÊNTICOS (confronto direto só entre exatamente 2, 3+ dividem a posição). O conjunto dos CHECKs de desempate SHALL ser alargado para incluir `'espanhol'` e `'fifa'` nas três tabelas (`tournaments`, `league_competitions`, `league_division_seasons`), espelhado em `supabase/schema.sql`, sem coluna nova. O preset SHALL ser ortogonal à base de ranking `promedios`: o desempate ordena a tabela do ano; o promedio reordena o corte de sobe/cai.

#### Scenario: Mini-tabela decide três empatados pelo confronto entre eles

- **WHEN** três competidores terminam com os mesmos pontos numa divisão com `desempate = 'espanhol'` e os jogos entre eles dão uma ordem clara
- **THEN** a mini-tabela (só os jogos entre os três) os ordena por mini-pontos/mini-saldo/mini-gols, em vez de dividirem a posição, e o resíduo cai no saldo/gols globais

#### Scenario: Ciclo no confronto entre empatados não trava

- **WHEN** três empatados formam um ciclo (A vence B, B vence C, C vence A) com mini-pontos iguais
- **THEN** a mini-tabela não entra em laço: empatados em mini-pontos caem no mini-saldo, depois no fallback global, depois dividem a posição — sempre determinístico

#### Scenario: `espanhol` e `fifa` divergem na posição do confronto direto

- **WHEN** um mesmo cenário de empate é classificado com `espanhol` e com `fifa`
- **THEN** `espanhol` aplica a mini-tabela ANTES do saldo global e `fifa` aplica o saldo global ANTES da mini-tabela, podendo produzir ordens diferentes

### Requirement: Tabela anual combinada de uma divisão split (Fase 5.1)

Numa temporada split, o sistema SHALL produzir a TABELA ANUAL COMBINADA de cada divisão SEM tocar o motor puro `flowEngine.ts`: um fetcher dedicado SHALL unir as PARTIDAS dos dois turnos (Apertura + Clausura) re-chaveando cada lado da Clausura por `slot Clausura → competitor_id → slot Apertura` (inclusive o vencedor de W.O.) e rodar `computeStandings` UMA vez com o preset de desempate da divisão, devolvendo linhas no mesmo contrato `LinhaComNome[]` chaveadas pelo SLOT da Apertura (para o remap `slot→competidor` dos consumidores funcionar sem alteração, já que `entries.slot_id` aponta para a Apertura). Como a combinada une as partidas reais do ano inteiro, o confronto direto (`cbf`) e a mini-tabela (`espanhol`/`fifa`) SHALL operar sobre TODOS os jogos entre os empatados nos dois turnos (não sobre agregados somados, que perderiam o h2h). A combinada SHALL ser a FONTE ÚNICA de `posição`/`pontos`/`jogos` para o sobe/cai, o promédio (Fase 4) e a página, exatamente como `linhasFaseGrupos` na Fase 5.2 — encadeada `linhasAnualCombinada ?? linhasFaseGrupos ?? linhas`. Em temporada não-split a combinada SHALL estar ausente e o comportamento SHALL ser byte-idêntico ao legado.

#### Scenario: Combinada soma os dois turnos com o desempate da divisão

- **WHEN** uma divisão split tem Apertura e Clausura encerrados
- **THEN** a tabela combinada apresenta, por competidor, pontos/jogos/saldo/gols somados dos dois turnos, ordenados pelo preset de desempate da divisão, com a mini-tabela (se `espanhol`/`fifa`) considerando os confrontos diretos dos dois turnos

#### Scenario: Não-regressão sem split

- **WHEN** a temporada é `anual` (sem split)
- **THEN** nenhuma combinada é produzida e a classificação da divisão é exatamente a do torneio único (byte-idêntica à Fase 1/5.2)

### Requirement: Efeito do duplo W.O. na classificação
Numa partida de DUPLO W.O. (`wo = true`, `wo_duplo = true`, `wo_vencedor` nulo) o motor `computeStandings` SHALL creditar aos DOIS lados uma DERROTA — `derrotas += 1` e os pontos de DERROTA do torneio para cada um — e NÃO SHALL contar gols pró, gols contra nem saldo (zero gols, espelho simétrico do W.O. simples). O duplo SHALL contar como JOGO disputado para ambos, preservando a identidade `jogos = vitórias + empates + derrotas` sem criar um quarto contador. No critério de desempate por CONFRONTO DIRETO o duplo W.O. SHALL creditar DERROTA a ambos os envolvidos, NUNCA empate pelo placar 0x0. O mesmo efeito SHALL valer DENTRO da mini-tabela de desempate (`resolverMiniTabela`, presets espanhol/fifa): dois competidores empatados que se enfrentaram num duplo levam DERROTA na mini-tabela, nunca empate — reuso do mesmo `aplicarPartida`.

#### Scenario: Duplo W.O. é dupla derrota 0x0
- **WHEN** uma partida de liga 3/1/0 é resolvida por duplo W.O.
- **THEN** os dois clubes somam 0 ponto e 1 derrota cada, sem alterar saldo/gols, e cada um contabiliza mais um jogo disputado

#### Scenario: Confronto direto num duplo W.O. não vira empate
- **WHEN** dois clubes empatados nos critérios objetivos se enfrentaram e o jogo foi duplo W.O.
- **THEN** o desempate por confronto direto credita DERROTA aos dois (não trata o 0x0 como empate)

#### Scenario: Duplo dentro da mini-tabela de desempate credita derrota aos dois
- **WHEN** dois competidores empatados no preset espanhol/fifa se enfrentaram num duplo W.O. e a mini-tabela de desempate é montada
- **THEN** `resolverMiniTabela` credita DERROTA a ambos dentro da mini-tabela (via o mesmo `aplicarPartida`), nunca empate pelo 0x0

### Requirement: Propagação do sinal do duplo W.O. do banco ao motor
O sinal do duplo W.O. (`wo_duplo`) SHALL ser propagado do banco até o motor em TODO call-site que mapeia partidas de `matches` para `computeStandings`/`classificarGrupos` FORA de chave (`posicao` nula); sem a propagação completa o motor trata o 0x0 como EMPATE, o que NÃO é aceitável. A lista de sites é FECHADA (verificada por grep sobre `computeStandings(`/`classificarGrupos(`/`woVencedor:`/`wo_vencedor`): (A) `getTournamentClassificacao` — `linhasMotor` E o mapa `grupos`; (B) `montarMataMataDosGrupos` (`tournaments.ts`, via `classificarGrupos`); (C) `computarEliminadosGrupos` (`cups.ts`); (D) `getDivisionClassificacaoCombinada` (base do sobe/desce da divisão); (E) `classificarGrupos` (`gerarFaseDeGrupos.ts`) como tipo pass-through. Cada um SHALL incluir `wo_duplo` no SELECT e expor `woDuplo = wo === true && wo_duplo === true` no shape do motor. Por ser BOOLEAN, `woDuplo` NÃO SHALL exigir re-chaveamento por slot (ao contrário de `wo_vencedor`). Os consumidores que NÃO mapeiam partidas (`getDivisionStandings`, `promedios` — que delegam a A/D e leem `pontos`/`jogos` já computados) herdam a correção sem alteração. Fetchers PURAMENTE de chave (`getTournamentClassificacao` projeção `chave`, `avancarFase`, `cups.partidasChave`, `leaguePyramid`, `getGrandeFinal`, `getPlayoffs`) NÃO SHALL propagar `woDuplo` (o duplo é proibido em chave).

#### Scenario: Duplo numa divisão por promédios baixa o promédio e altera o corte
- **WHEN** uma divisão de liga com `ranking_base = 'promedios'` recebe um duplo W.O. e a classificação é recomputada (via `getDivisionClassificacaoCombinada`/`getTournamentClassificacao`)
- **THEN** os dois competidores ganham +1 jogo com 0 ponto, o promédio (`pontos/jogos`) de cada um CAI, e a posição de corte (sobe/desce) muda de acordo — nunca tratado como empate

#### Scenario: Duplo numa fase de grupos credita derrota aos dois sem inverter a ordem
- **WHEN** uma fase de grupos (via `getDivisionClassificacaoCombinada`, `computarEliminadosGrupos` ou o mapa `grupos` de `getTournamentClassificacao`) recebe um duplo W.O.
- **THEN** os dois lados somam derrota (0 ponto, +1 jogo) e a ordem do grupo NÃO se inverte como um empate (que creditaria ponto de empate) inverteria

#### Scenario: Duplo não pontuado sem propagação é rejeitado pelo contrato
- **WHEN** qualquer site A–E deixa de expor `wo_duplo` e o motor recebe o duplo como placar 0x0 comum
- **THEN** o comportamento é INCORRETO (viraria empate) — a propagação de `wo_duplo` é obrigatória em todos, coberta por teste de ponta a ponta como o preset de desempate

### Requirement: Histórico não afirma vencedor num duplo W.O.
A projeção do HISTÓRICO de partidas encerradas (`PartidaEncerrada` em `getTournamentClassificacao`) SHALL expor `woDuplo`, e a UI do histórico (`MatchHistoryList`) SHALL, quando `woDuplo` é verdadeiro, rotular e ANUNCIAR (texto sr-only) "W.O. duplo — ambos ausentes", NUNCA afirmar que um dos lados venceu. Sem isso, como `wo_vencedor` é nulo no duplo, o rótulo cairia por padrão em "lado 2 venceu" — acessibilidade FALSA.

#### Scenario: Histórico de um duplo W.O. não credita vitória a ninguém
- **WHEN** uma partida encerrada por duplo W.O. aparece no histórico
- **THEN** o rótulo/anúncio é "W.O. duplo — ambos ausentes" (nenhum lado marcado como vencedor)

