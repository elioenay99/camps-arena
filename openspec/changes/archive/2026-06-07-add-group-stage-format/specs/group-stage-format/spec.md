# group-stage-format — Delta Spec

## ADDED Requirements

### Requirement: Motor puro de fase de grupos
O sistema SHALL prover um motor PURO (zero IO) em `src/features/groups/` que:
(a) monta os grupos a partir dos participantes confirmados segundo o modo —
`sorteio` (distribuição embaralhada com `randInt` injetado), `potes`
(exatamente G cabeças de chave, uma por grupo, demais sorteados) e `manual`
(atribuição grupo-a-grupo fornecida pelo chamador) — com tamanhos equilibrados
(diferença máxima de 1); (b) gera as partidas de TODOS os grupos compondo o
motor round-robin existente (`gerarTabelaLiga` por grupo, com `ida_e_volta`),
marcando cada partida com `grupo` e `rodada`; (c) classifica cada grupo via
`computeStandings` sobre o subconjunto e corta os K primeiros, resolvendo
empate de posição que cruza a linha de corte por SORTEIO (`randInt` injetado)
e sinalizando que houve sorteio; (d) cruza os classificados num chaveamento
determinístico — G=1 usa bracket seeding padrão (seed 1 × seed K, 2 × K−1,
com seeds 1 e 2 em metades opostas); G≥2 usa o padrão Copa (pares de grupos
adjacentes, i-ésimo de um × (K+1−i)-ésimo do outro, lados alternados em
metades opostas — separação máxima possível: com K=2 mesmos grupos só se
reencontram na final; com K≥4 dois classificados do mesmo grupo podem se
cruzar a partir da 2ª fase); (e) calcula a
prévia (jogos de grupos + jogos da chave, rodadas) pela MESMA fonte do motor.

#### Scenario: Grupos equilibrados em qualquer N
- **WHEN** o motor monta G grupos para N participantes (N não múltiplo de G)
- **THEN** os tamanhos dos grupos diferem em no máximo 1 e todos os participantes aparecem exatamente uma vez

#### Scenario: Potes garantem uma cabeça por grupo
- **WHEN** o motor monta os grupos em modo potes com exatamente G cabeças
- **THEN** cada grupo recebe exatamente uma cabeça de chave

#### Scenario: Round-robin completo dentro de cada grupo
- **WHEN** as partidas dos grupos são geradas
- **THEN** dentro de cada grupo todos os pares se enfrentam (uma ou duas vezes conforme ida-e-volta) e nenhuma partida cruza grupos

#### Scenario: Classificação por grupo corta os K primeiros
- **WHEN** todas as partidas de um grupo estão encerradas
- **THEN** o corte usa a ordem do computeStandings daquele grupo e devolve K classificados

#### Scenario: Empate na linha de corte é sorteado e sinalizado
- **WHEN** a posição K e a K+1 de um grupo terminam empatadas em todos os critérios (posição dividida cruzando o corte)
- **THEN** o desempate é por sorteio (determinístico dado o randInt) e o resultado sinaliza que houve sorteio

#### Scenario: Cruzamento padrão Copa
- **WHEN** G=4 e K=2 (oito classificados)
- **THEN** a chave nasce com A1×B2, C1×D2 numa metade e B1×A2, D1×C2 na outra — grupos iguais só se reencontram na final

#### Scenario: Cruzamento padrão Champions
- **WHEN** G=1 e K=8 (fase de liga)
- **THEN** a chave nasce com 1×8, 4×5 numa metade e 2×7, 3×6 na outra (bracket seeding)

#### Scenario: Restrições de geometria
- **WHEN** o chamador pede G·K fora de {2,4,8,16,32}, K maior ou igual ao menor grupo, ou G fora de {1,2,4,8}
- **THEN** o motor lança erro descritivo sem produzir nada

### Requirement: Iniciar torneio de grupos com configuração no painel
O sistema SHALL expor uma Server Action de início para os formatos
`grupos_mata_mata` e `fase_liga` que recebe quantidade de grupos (G — fixa em
1 na fase de liga; fase de liga SHALL aceitar apenas o modo sorteio),
classificados por grupo (K) e o MODO de distribuição (`sorteio` | `potes` |
`manual`) com o payload do modo. A action SHALL conferir por FILTRO dono +
formato + estado; validar G·K ∈ {2,4,8,16,32} e K menor que o tamanho do
menor grupo. A geração SHALL ser PROMOTE-FIRST: o torneio é promovido a
`'ativo'` (gravando `classificados_por_grupo` na MESMA escrita) por UPDATE
atômico filtrado por `status = 'rascunho'` ANTES do INSERT — o índice de par
único NÃO barra dupla geração de grupos (sorteios concorrentes produzem
partições diferentes cujos pares não colidem), então a promoção é a
serialização: 0 linhas afetadas = perdedor da corrida, que aborta SEM
inserir. Só o vencedor insere TODAS as partidas de grupos em LOTE ÚNICO (com
`grupo` e `rodada`). Crash entre a promoção e o INSERT (torneio `ativo` sem
partidas) SHALL ser recuperável: o re-run rebaixa atomicamente para
`rascunho` (UPDATE filtrado por `ativo` — recuperadores concorrentes também
serializam) e refaz o fluxo; a página SHALL reexibir o painel de início nesse
estado. O modo NÃO SHALL ser persistido.

#### Scenario: Iniciar gera os grupos e ativa
- **WHEN** o dono inicia um torneio de grupos em rascunho com G, K e modo válidos
- **THEN** as partidas de todos os grupos nascem com grupo e rodada, o torneio fica ativo e `classificados_por_grupo` é gravado

#### Scenario: Fase de liga é o caso de grupo único
- **WHEN** o dono inicia um torneio de formato fase_liga
- **THEN** a geração usa G=1 (round-robin geral) e o restante do fluxo é idêntico

#### Scenario: Geometria inválida é rejeitada
- **WHEN** G·K não é potência de 2 suportada, ou K não cabe no menor grupo
- **THEN** a action rejeita com mensagem clara e nada é inserido

#### Scenario: Perdedor da corrida não insere
- **WHEN** duas submissões de início concorrem (duas abas)
- **THEN** apenas a que promoveu o status (1 linha afetada) insere as partidas; a outra recebe orientação de recarregar sem inserir nada

#### Scenario: Crash entre promoção e INSERT é recuperável
- **WHEN** o torneio ficou `ativo` sem nenhuma partida gerada e o dono reabre a página
- **THEN** o painel de início reaparece e o re-run rebaixa para rascunho, repromove e insere normalmente

### Requirement: Geração do mata-mata a partir dos grupos
O sistema SHALL expor a Server Action `gerarMataMataDosGrupos` que, conferindo
dono + formato com grupos + `status = 'ativo'`, exige TODAS as partidas de
grupo encerradas, classifica cada grupo (cortando K com sorteio de linha de
corte quando necessário), cruza os classificados (motor) e insere a chave em
LOTE ÚNICO com rodadas CONTÍNUAS (a primeira fase da chave usa a rodada
seguinte à última rodada de grupos). A action SHALL pré-verificar que todos os
semeados constam em `participants` (mensagem acionável) e SHALL tratar corrida
pelo índice de slot (23505 → "chave já gerada"). Quando houve sorteio de
desempate, a resposta SHALL sinalizar para a UI avisar o dono.

#### Scenario: Grupos completos geram a chave
- **WHEN** o dono aciona Gerar mata-mata com todos os jogos de grupos encerrados
- **THEN** a chave nasce com os classificados cruzados pelo padrão do formato, em rodadas contínuas

#### Scenario: Grupos incompletos não geram
- **WHEN** há partida de grupo não-encerrada
- **THEN** a action rejeita com mensagem clara e nada é inserido

#### Scenario: Sorteio de corte é avisado
- **WHEN** a classificação de algum grupo precisou de sorteio na linha de corte
- **THEN** a chave é gerada e o dono recebe o aviso de que houve sorteio

#### Scenario: Dupla geração é barrada
- **WHEN** duas requisições de geração concorrem
- **THEN** apenas um lote é inserido e a outra recebe orientação de recarregar

#### Scenario: Depois da chave, o fluxo é o do mata-mata
- **WHEN** a chave existe
- **THEN** Avançar fase, resultado decisivo, reabertura e campeão seguem as regras da capability knockout-format (com rodada-base)

### Requirement: Visualização de grupos e chave
A página do torneio nos formatos de grupos SHALL exibir uma tabela de
classificação POR GRUPO (rótulos "Grupo A", "Grupo B", … pela ordem do grupo;
na fase de liga, uma única "Classificação"), calculada pelo motor sobre o
subconjunto do grupo, e — quando gerada — a CHAVE (BracketView) com os rótulos
de fase corretos via rodada-base. O painel de início SHALL oferecer G, K e o
modo com prévia (jogos e rodadas da MESMA fonte do motor); o botão "Gerar
mata-mata" SHALL aparecer para o dono com orientação do que falta enquanto os
grupos não terminam. As listas de partidas SHALL identificar o grupo
("G1 R2") no padrão leve de rodada/perna.

#### Scenario: Tabelas por grupo
- **WHEN** um usuário abre um torneio de grupos iniciado
- **THEN** vê uma tabela de classificação por grupo, na ordem dos grupos

#### Scenario: Fase de liga tem classificação única
- **WHEN** um usuário abre um torneio de fase de liga iniciado
- **THEN** vê uma única tabela de classificação (sem rótulo de grupo)

#### Scenario: Chave aparece após a geração
- **WHEN** o mata-mata dos grupos foi gerado
- **THEN** a página exibe a chave com fases rotuladas corretamente, além das tabelas de grupos

#### Scenario: Botão de gerar orienta o que falta
- **WHEN** o dono abre o torneio com jogos de grupos pendentes
- **THEN** o controle de gerar mata-mata aparece desabilitado/orientativo com a contagem do que falta

### Requirement: Formatos de grupos não aceitam partida manual nem adesão tardia
Torneios `grupos_mata_mata` e `fase_liga` SHALL rejeitar criação manual de
partida e aceite de convite fora de `rascunho` pelos MESMOS mecanismos
genéricos de liga/mata-mata (action `formato <> 'avulso'`, RLS via exigência
de `rodada`, função `aceitar_convite` genérica, rotas 404, seletor filtrado).

#### Scenario: Partida manual rejeitada
- **WHEN** `createMatch` referencia torneio de formato grupos ou fase de liga
- **THEN** a action rejeita com a mensagem de formato gerado

#### Scenario: Adesão tardia rejeitada
- **WHEN** `aceitar_convite` é chamada para grupos/fase de liga fora de rascunho
- **THEN** a função rejeita com a mensagem genérica de torneio iniciado
