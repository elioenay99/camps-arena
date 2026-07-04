## ADDED Requirements

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
