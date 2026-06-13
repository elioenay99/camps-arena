# standings-engine — Delta Spec

## MODIFIED Requirements

### Requirement: Classificação por pontos corridos com desempate parametrizável

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

#### Scenario: Preset avançado não disponível nesta fase

- **WHEN** alguém tenta gravar `desempate_criterio = 'espanhol'` ou `'custom'` em um torneio
- **THEN** o CHECK `tournaments_desempate_valido` rejeita o valor, pois nesta fase só `cbf`/`ingles`/`custom` constam do conjunto e `espanhol` só será habilitado na fase de desempate avançado
