## ADDED Requirements

### Requirement: Atribuição PESSOAL da campanha por janela de comando
O sistema SHALL creditar uma partida à campanha de um técnico SOMENTE quando ela
foi jogada DENTRO de uma janela de comando dele — diferente da herança de troféus
(que vai para o técnico vigente na final). Uma partida COMPETITIVA
(`vaga_1`/`vaga_2` preenchidas) e ENCERRADA (`status = 'encerrada'`) SHALL ser
creditada ao técnico quando um dos seus lados é uma vaga (`tournament_slots`) que
ele comandou (`coach_tenures.user_id = técnico`) E a `rodada` da partida satisfaz a
janela daquela tenure pelo predicado MEIO-ABERTO NO TOPO: `(rodada_inicio IS NULL
OR rodada >= rodada_inicio) AND (rodada_fim IS NULL OR rodada < rodada_fim)`. A
fronteira da troca (a rodada em que um técnico saiu e outro assumiu, `rodada_fim =
rodada_inicio = v_rodada`) SHALL ser creditada a QUEM ASSUMIU e NÃO a quem saiu (as
janelas SHALL ser disjuntas, sem duplicar nem perder a partida da fronteira). O
escopo creditável SHALL ser exatamente as vagas com `competitor_id` — as
competições DERIVADAS DE LIGA: temporada de divisão (pontos corridos) e o mata-mata
derivado (playoff, barragem, grande final). As COPAS continentais (participante sem
`league_competitor` nem técnico — `competitor_id`/`user_id` nulos), os torneios
AVULSOS/standalone de clube (sem `competitor_id`) e o avulso pessoa-vs-pessoa
(`participante_1/2`) NÃO SHALL entrar na campanha, por não modelarem um técnico
atribuível. Como toda partida creditável tem `rodada` não-nula, o predicado
meio-aberto SHALL se aplicar uniformemente; `partidaNaJanela` SHALL tratar `rodada`
nula de forma DEFENSIVA (não-creditável fora de tenure totalmente aberta), sem
prometer semântica de negócio para esse caso. Tenures LOCAIS (por-nome, `user_id`
nulo) NÃO SHALL compor a campanha de nenhum perfil global.

#### Scenario: Assumir no meio credita só da rodada da troca em diante
- **WHEN** um técnico assume um clube na rodada 6 de uma temporada de 10 rodadas (tenure `rodada_inicio = 6`), e o técnico anterior tinha a tenure fechada com `rodada_fim = 6`
- **THEN** o técnico que assumiu recebe as partidas das rodadas 6 a 10 (5 jogos) e o anterior recebe as rodadas 1 a 5 — a partida da rodada 6 conta para quem assumiu, uma única vez

#### Scenario: Partida fora da janela não é creditada
- **WHEN** uma partida da rodada 3 é de uma vaga que o técnico só passou a comandar na rodada 6
- **THEN** a partida NÃO é creditada à campanha desse técnico

#### Scenario: Mata-mata derivado de liga é creditado
- **WHEN** o técnico disputou uma grande final (mata-mata derivado, vaga com `competitor_id`) durante sua janela de comando
- **THEN** a partida é creditada à campanha do técnico

#### Scenario: Copa e avulso não entram na campanha
- **WHEN** uma partida é de copa continental (`competitor_id`/`user_id` nulos na vaga), de torneio avulso de clube (sem `competitor_id`) ou avulsa (`participante_1/2`)
- **THEN** ela não é creditada a nenhuma campanha de técnico

#### Scenario: Troca com temporada já encerrada é limitação aceita
- **WHEN** a vaga troca de técnico depois que todas as partidas já estão encerradas (fronteira no fallback `rodada = max`)
- **THEN** o sistema credita a partida da rodada final a quem assumiu (limitação conhecida e documentada, não corrigida em leitura)

### Requirement: Números de sempre (campanha agregada) no perfil do técnico
O perfil do técnico SHALL exibir a campanha de sempre agregada a partir das
partidas creditadas: Jogos, Vitórias, Empates, Derrotas, Gols pró, Gols contra,
Saldo e Aproveitamento. O crédito de resultado e gols de cada lado SHALL seguir as
regras já usadas no motor de insights (`resultadoDoLado`): num W.O. simples o lado
vencedor (`wo_vencedor`) recebe vitória e o outro derrota, ambos com 0 gols; num
duplo W.O. os dois recebem derrota com 0 gols; caso contrário V/E/D e gols saem do
placar oficial (`placar_1`/`placar_2`), que já embute eventuais gols contra. O
Aproveitamento SHALL usar a convenção padrão 3-1-0 como métrica de EXIBIÇÃO
(`(3*vitorias + empates) / (3*jogos)`), independente das regras de pontuação de
cada torneio, e SHALL ser 0 quando não há jogos. Quando o técnico não tem nenhuma
partida creditada, o bloco de campanha SHALL exibir um estado vazio sem quebrar a
página.

#### Scenario: Totais somam todos os clubes comandados
- **WHEN** o técnico dirigiu dois clubes em temporadas diferentes
- **THEN** os números de sempre somam os jogos, gols pró/contra e resultados dos dois períodos de comando

#### Scenario: W.O. simples conta vitória/derrota sem gols
- **WHEN** uma partida creditada é W.O. simples a favor do lado do técnico
- **THEN** a campanha registra uma vitória com 0 gols pró e 0 gols contra naquele jogo

#### Scenario: Duplo W.O. conta derrota para o técnico
- **WHEN** uma partida creditada é duplo W.O.
- **THEN** a campanha registra uma derrota com 0 gols naquele jogo

#### Scenario: Técnico sem jogos mostra estado vazio
- **WHEN** o técnico tem tenures mas nenhuma partida encerrada na janela
- **THEN** o bloco de campanha mostra um estado vazio, sem erro

### Requirement: Campanha por clube comandado
Cada clube na seção "Clubes comandados" SHALL exibir a fatia de campanha daquele
competidor (janela de comando do técnico): jogos, vitórias-empates-derrotas, gols
pró:contra e saldo. A agregação SHALL ser chaveada por `competitor_id`, de modo que
temporadas distintas do MESMO clube somem na mesma fatia. A soma das fatias por
clube SHALL ser igual aos números de sempre do total.

#### Scenario: Duas temporadas do mesmo clube somam na fatia
- **WHEN** o técnico comandou o mesmo competidor em duas temporadas
- **THEN** a linha daquele clube mostra a soma das duas campanhas, e não duas linhas

#### Scenario: Split soma os turnos na mesma fatia
- **WHEN** o técnico comandou um clube na Apertura e na Clausura da mesma temporada
- **THEN** as partidas dos dois turnos entram na fatia daquele `competitor_id` sem dupla contagem

### Requirement: Confronto direto entre técnicos (head-to-head global)
O perfil do técnico SHALL oferecer um confronto direto entre DOIS técnicos com
conta, distinto do confronto entre competidores. O seletor SHALL listar apenas os
técnicos (com `user_id`) que o dono do perfil JÁ ENFRENTOU em partidas creditadas.
Ao escolher um adversário, o sistema SHALL carregar o retrospecto SOB DEMANDA (via
Server Action POST, para não disparar prefetch RSC caro), agregando: jogos,
vitórias do técnico, empates, vitórias do adversário, gols pró/contra e a lista dos
jogos. Uma partida SHALL entrar no confronto SOMENTE quando um lado é vaga do
técnico A e o outro é vaga do técnico B, com a `rodada` DENTRO das janelas de
comando dos DOIS técnicos ao mesmo tempo (ambos no comando naquele jogo). O
retrospecto SHALL reusar a agregação pura de confronto direto já existente
(`confrontoDireto`). Adversários sem conta (vaga por-nome) NÃO SHALL ser
selecionáveis, ainda que os jogos contra eles contem na campanha do técnico. O
`userId` do adversário SHALL ser validado como uuid antes de qualquer query, e o
auto-confronto (A == B) SHALL retornar vazio.

#### Scenario: Confronto agrega só jogos nas duas janelas de comando
- **WHEN** os técnicos A e B se enfrentaram numa partida em que os dois estavam no comando das suas vagas
- **THEN** essa partida entra no retrospecto A×B

#### Scenario: Jogo fora da janela de um dos técnicos não conta
- **WHEN** A enfrentou a vaga de B numa rodada em que B ainda não comandava aquela vaga
- **THEN** a partida NÃO entra no confronto A×B

#### Scenario: Seletor lista só adversários enfrentados com conta
- **WHEN** o técnico enfrentou um adversário por-nome (sem conta) e outro com conta
- **THEN** apenas o adversário com conta aparece no seletor de confronto

#### Scenario: Carregamento sob demanda
- **WHEN** o usuário abre o perfil do técnico
- **THEN** o retrospecto de confronto só é buscado quando um adversário é escolhido, não no carregamento inicial da página

### Requirement: Foto real do técnico no herói do perfil
O herói do perfil do técnico SHALL exibir a foto real do técnico quando houver
(`users.avatar`), caindo para as iniciais quando ausente. O fetcher do perfil SHALL
selecionar `avatar` além de `id` e `nome`.

#### Scenario: Técnico com avatar mostra a foto
- **WHEN** o técnico tem `avatar` preenchido
- **THEN** o herói do perfil mostra a foto, não as iniciais

#### Scenario: Técnico sem avatar mostra iniciais
- **WHEN** o técnico não tem `avatar`
- **THEN** o herói mostra as iniciais derivadas do nome
