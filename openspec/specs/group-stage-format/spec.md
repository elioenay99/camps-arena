# group-stage-format Specification

## Purpose
TBD - created by archiving change add-group-stage-format. Update Purpose after archive.
## Requirements
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
O início dos formatos de grupos SHALL operar sobre VAGAS (slot ids nos motores de montagem/sorteio; partidas de grupo e chave com vaga_1/vaga_2), mantendo G/K, modos de distribuição, promote-first e recuperação como especificado. Potes/manual referenciam vagas (clubes) — cabeças de chave são CLUBES. NÃO SHALL exigir técnicos presentes.

#### Scenario: Grupos sorteados entre clubes
- **WHEN** o dono inicia grupos com sorteio
- **THEN** os grupos particionam as VAGAS e o round-robin nasce entre vagas

### Requirement: Geração do mata-mata a partir dos grupos
A classificação por grupo e o cruzamento SHALL operar sobre vagas (computeStandings por slot id); a chave nasce entre vagas. Pré-checagem de semeados em participants morre.

#### Scenario: Classificados são clubes
- **WHEN** o mata-mata dos grupos é gerado
- **THEN** os K melhores CLUBES de cada grupo entram na chave

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

