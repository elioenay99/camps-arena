## ADDED Requirements

### Requirement: Captura da posse de vaga por trigger na coluna `user_id`
O sistema SHALL registrar cada PASSAGEM de técnico por uma vaga de liga
(`public.coach_tenures`) através de um ÚNICO trigger `AFTER INSERT OR UPDATE OF
user_id ON tournament_slots`, sem instrumentar as server actions individuais.
O trigger SHALL agir SOMENTE quando `competitor_id IS NOT NULL` (escopo
LIGA-only). Na MATERIALIZAÇÃO da temporada (INSERT), quando a vaga já nasce com
técnico (`user_id NOT NULL`), o trigger SHALL abrir uma tenure "desde o início da
temporada" (`rodada_inicio` nulo); quando a vaga é POR NOME (`team_id` nulo e
`rotulo` preenchido), SHALL abrir uma tenure de rótulo local (`nome` preenchido,
`user_id` nulo); quando a vaga nasce vazia (`user_id` nulo, com `team_id`), NÃO
SHALL abrir tenure. Na ATRIBUIÇÃO/LIMPEZA do técnico (UPDATE de `user_id` com
valor distinto), o trigger SHALL usar a rodada EFETIVA da troca — a rodada
corrente do torneio, ou, se todas as partidas já estiverem encerradas (janela
fim-de-temporada), a ÚLTIMA rodada — de modo que `rodada_fim`/`rodada_inicio`
nunca fiquem nulos num torneio com partidas; SHALL FECHAR a tenure aberta do
técnico que saiu (`rodada_fim` = rodada efetiva, `encerrada_em` = agora) e ABRIR
uma nova tenure para o técnico que entrou (`rodada_inicio` = rodada efetiva). A
rodada da troca SHALL ser a fronteira COMPARTILHADA: quem sai fecha e quem entra
abre na MESMA rodada. A função de trigger SHALL ser `SECURITY DEFINER` com
`search_path = ''` e NÃO SHALL lançar exceção — um erro reverteria a atribuição do
técnico.

#### Scenario: Materialização com técnico propagado abre tenure vigente
- **WHEN** uma temporada é montada e a vaga do competidor "Ataias" nasce com `user_id` preenchido
- **THEN** abre-se uma tenure vigente (`rodada_inicio` nulo, `encerrada_em` nulo) daquele técnico na vaga

#### Scenario: Vaga por nome abre tenure de rótulo local
- **WHEN** a materialização cria uma vaga por NOME (`team_id` nulo, `rotulo = "Coringão"`)
- **THEN** abre-se uma tenure com `nome = "Coringão"` e `user_id` nulo (técnico local, sem conta)

#### Scenario: Vaga de clube vazia não abre tenure
- **WHEN** a vaga nasce com `team_id` mas sem `user_id` (técnico entra depois via convite)
- **THEN** nenhuma tenure é aberta na materialização

#### Scenario: Aceitar convite abre tenure na rodada corrente
- **WHEN** um técnico aceita o convite de uma vaga órfã na rodada 5
- **THEN** abre-se uma tenure vigente com `rodada_inicio = 5`

#### Scenario: Expulsão fecha a tenure vigente
- **WHEN** a organização expulsa o técnico da vaga na rodada 9
- **THEN** a tenure vigente é fechada com `rodada_fim = 9` e `encerrada_em` preenchido

#### Scenario: Troca no meio gera passagens múltiplas
- **WHEN** numa mesma temporada A sai com a rodada corrente 7 e B assume, e depois B sai com a rodada corrente 12 e C assume
- **THEN** há duas tenures FECHADAS (A: até 7; B: 7..12) e uma VIGENTE (C, `encerrada_em` nulo) — a rodada da troca é a fronteira compartilhada (A fecha em 7 e B abre em 7; B fecha em 12 e C abre em 12)

#### Scenario: Slot avulso não gera tenure
- **WHEN** um slot de torneio avulso (`competitor_id` nulo) recebe ou perde técnico
- **THEN** o trigger não grava nenhuma tenure (gate de escopo LIGA-only)

### Requirement: Tenure vigente identifica o técnico atual e resolve o troféu
A tenure com `encerrada_em IS NULL` SHALL representar o técnico VIGENTE da vaga —
`encerrada_em` é o marcador AUTORITATIVO de vigência (sempre setado no
fechamento); `rodada_fim` é valor de EXIBIÇÃO e NÃO SHALL ser usado como predicado
de vigência. O sistema NÃO SHALL manter uma materialização separada de "técnico
atual" além da coluna `tournament_slots.user_id` — a tenure vigente É derivada
dela. Para atribuição de troféu de uma temporada com troca de técnico no meio, o
troféu estrutural SHALL ser atribuído ao técnico VIGENTE na rodada final (a tenure
`encerrada_em IS NULL` para aquele `(competitor_id, season_id)`); o técnico que
saiu no meio SHALL aparecer apenas como passagem no histórico, SEM troféu e SEM
posição final. O writer de conquistas (`registrar_conquistas_temporada`) e a ordem
de encerramento NÃO SHALL ser alterados — a herança de prêmios é derivada em
leitura.

#### Scenario: Troféu vai para o técnico vigente na final
- **WHEN** o clube "Ataias" é campeão da temporada, tendo sido comandado por A no começo e por B a partir da rodada 7 até o título
- **THEN** o troféu Campeão é atribuído a B (tenure vigente na final, `encerrada_em` nulo), e A consta apenas como passagem sem troféu

#### Scenario: Técnico atual deriva da coluna, sem materialização paralela
- **WHEN** o técnico da vaga muda
- **THEN** a nova tenure vigente reflete a mudança sem nenhum snapshot separado de "técnico atual"

### Requirement: Perfil do clube exibe a linha do tempo de técnicos
A página do competidor SHALL exibir uma linha do tempo de técnicos derivada de
`coach_tenures`, agrupada por temporada, mostrando quem comandou o clube, as
rodadas de início e fim de cada passagem, e marcando o técnico vigente na final.
Os técnicos com conta global (`user_id`) SHALL linkar para o perfil do técnico;
os técnicos LOCAIS (por-nome, `user_id` nulo) SHALL aparecer como rótulo, sem
link. Quando o competidor não tiver nenhuma passagem registrada, a seção SHALL
exibir um estado vazio explícito.

#### Scenario: Timeline agrupa passagens por temporada
- **WHEN** o clube teve técnicos distintos em duas temporadas
- **THEN** a linha do tempo os agrupa por temporada, com as rodadas i–f de cada passagem

#### Scenario: Técnico local aparece sem link
- **WHEN** uma passagem é de competidor por NOME (sem conta)
- **THEN** o rótulo é exibido na timeline sem link para perfil global

#### Scenario: Clube sem passagens mostra estado vazio
- **WHEN** o competidor ainda não tem nenhuma tenure registrada
- **THEN** a seção mostra um estado vazio, sem quebrar a página

### Requirement: Perfil do técnico global com prêmios herdados
O sistema SHALL expor uma rota de perfil do técnico
(`/dashboard/ligas/tecnico/[userId]`, `userId` validado como uuid) que agrega, a
partir das tenures com `user_id NOT NULL` daquele técnico: os clubes comandados
(distintos por `competitor_id`), as temporadas, e o resultado por passagem quando
a tenure foi vigente-na-final. O perfil SHALL exibir os troféus HERDADOS — o
conjunto de troféus de `public.conquistas` (escopo `temporada`) dos pares
`(competitor_id, season_id)` em que o técnico foi VIGENTE na rodada final. As
tenures LOCAIS (por-nome, sem conta) NÃO SHALL compor o perfil global. O perfil
SHALL ser público, respeitando a RLS da competição (o observador vê apenas o
histórico em competições que já pode ver). Em temporada SPLIT (Apertura/Clausura),
onde há duas tenures vigentes por `(competitor_id, season_id)` (uma por turno), a
agregação SHALL DEDUPLICAR por `(competitor_id, season_id)` e SHALL resolver o
campeão pela tenure do torneio DECISIVO (grande final, se houver; senão a
Clausura), de modo a NÃO contar dois técnicos-campeões nem repetir o mesmo troféu.

#### Scenario: Perfil herda os troféus dos clubes comandados na final
- **WHEN** o técnico foi vigente-na-final do clube campeão "Ataias" na Temporada 3
- **THEN** o perfil do técnico exibe o troféu Campeão daquela temporada, herdado do competidor

#### Scenario: Temporada split não conta dois técnicos-campeões
- **WHEN** um clube campeão numa temporada split teve técnicos distintos na Apertura e na Clausura/grande final
- **THEN** o troféu de temporada é atribuído ao técnico vigente no torneio decisivo, e o par `(competitor_id, season_id)` não gera troféu duplicado

#### Scenario: Quem saiu no meio não herda o troféu
- **WHEN** o técnico comandou o clube até a rodada 6 e outro o levou ao título
- **THEN** o troféu não aparece no perfil desse técnico (ele não foi vigente-na-final)

#### Scenario: Técnico local não tem perfil global
- **WHEN** a passagem é por NOME (sem `user_id`)
- **THEN** ela não é agregada em nenhum perfil global de técnico

#### Scenario: uuid inválido retorna 404
- **WHEN** a rota do técnico é acessada com um `userId` não-uuid
- **THEN** a página responde 404

### Requirement: Backfill do técnico atual com limitação documentada
A migração SHALL popular `coach_tenures` uma vez a partir do técnico ATUAL de cada
vaga de liga (`tournament_slots` com `competitor_id`), criando uma tenure vigente
por vaga (conta global OU rótulo local). O backfill SHALL ser idempotente (não
duplica tenure vigente para uma vaga já registrada). Como o trigger é
forward-only, as temporadas já encerradas antes desta change SHALL receber apenas
o técnico FINAL de cada vaga, SEM as trocas históricas intermediárias (que nunca
foram registradas) — essa limitação SHALL ser documentada.

#### Scenario: Backfill cria uma tenure vigente por vaga
- **WHEN** o backfill roda sobre uma vaga de liga com técnico atual definido
- **THEN** cria-se uma tenure vigente (`encerrada_em` nulo) para aquele técnico, sem duplicar se já existir

#### Scenario: Temporada encerrada só recebe o técnico final
- **WHEN** uma temporada encerrada teve trocas de técnico antes desta change
- **THEN** apenas o técnico final é registrado (sem as passagens intermediárias), conforme a limitação documentada
