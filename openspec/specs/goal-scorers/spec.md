# goal-scorers Specification

## Purpose
TBD - created by archiving change add-artilharia. Update Purpose after archive.
## Requirements
### Requirement: Captura opcional de autores de gols no lançamento de placar
Ao lançar o placar (fluxo direto ou proposta), o sistema SHALL permitir informar
OPCIONALMENTE quem fez cada gol, como uma lista de `{lado, jogador, gols, contra}`
onde `gols` é inteiro 1..99 e `contra` é booleano (default `false`). Para um gol
NORMAL (`contra = false`), `jogador` é NOME LIVRE OBRIGATÓRIO (`btrim`, 1..60
caracteres) e o gol ENTRA no ranking. Para um GOL CONTRA (`contra = true`),
`jogador` é OPCIONAL (nome do adversário; pode ser omitido) e o gol NUNCA entra no
ranking. A soma de `gols` por lado — CONTANDO gols normais e gols contra — SHALL
ser menor ou igual ao placar daquele lado (o gol contra também é um gol que o lado
fez). Um mesmo autor NÃO SHALL aparecer duplicado no mesmo lado com o MESMO
`contra` (comparação case-insensitive); dois gols contra ANÔNIMOS no mesmo lado
contam como duplicata (a UI SHALL somá-los num único item). Informar MENOS gols
atribuídos que o placar é permitido. Quando nenhum autor é informado, o lançamento
SHALL preservar o comportamento atual (só placar).

#### Scenario: Autores válidos aceitos
- **WHEN** a organização lança 2x1 informando `[{lado:1,jogador:"Endrick",gols:2},{lado:2,jogador:"João",gols:1}]`
- **THEN** o placar é salvo e os autores são registrados na partida

#### Scenario: Soma por lado acima do placar é rejeitada
- **WHEN** o placar do lado 1 é 1 mas os autores somam 2 gols no lado 1
- **THEN** o lançamento é rejeitado com erro de validação (nenhum placar/gol é gravado)

#### Scenario: Placar sem autores segue o fluxo atual
- **WHEN** o placar é lançado sem informar autores
- **THEN** o placar é salvo e a partida não tem autores de gols registrados

#### Scenario: Gol contra sem nome fecha a conta do lado
- **WHEN** o placar do lado 1 é 4 e os autores são `[{lado:1,jogador:"Vini",gols:3},{lado:1,gols:1,contra:true}]`
- **THEN** o lançamento é aceito (3 + 1 = 4 = placar) e o gol contra é registrado com `jogador` nulo

#### Scenario: Gol normal exige nome
- **WHEN** um autor com `contra = false` é informado sem `jogador`
- **THEN** o lançamento é rejeitado com erro de validação

#### Scenario: Gol contra conta para o teto do lado
- **WHEN** o placar do lado 1 é 1 e os autores são `[{lado:1,jogador:"Vini",gols:1},{lado:1,gols:1,contra:true}]`
- **THEN** o lançamento é rejeitado (1 + 1 = 2 > 1), pois o gol contra também conta para o teto

### Requirement: Autor de gol é nome livre com autocomplete por competidor
O sistema SHALL sugerir, ao digitar o autor de um gol, os nomes que AQUELE
competidor já usou anteriormente como autor de gol NORMAL (`contra = false`),
ordenados por frequência (mais usados primeiro). As sugestões SHALL ser escopadas
ao competidor do lado em questão — os nomes de um competidor NÃO SHALL vazar para
o autocomplete de outro. Nomes de GOL CONTRA (adversário) NÃO SHALL alimentar o
autocomplete (o autocomplete é dos PRÓPRIOS artilheiros do competidor).

#### Scenario: Sugestões vêm do histórico do competidor
- **WHEN** o competidor "Ataias" já registrou gols de "Endrick" e "Vini" em partidas anteriores
- **THEN** o autocomplete daquele competidor sugere "Endrick" e "Vini"

#### Scenario: Autocomplete não mistura competidores
- **WHEN** o competidor "João" nunca registrou "Endrick"
- **THEN** "Endrick" não aparece no autocomplete do competidor "João"

#### Scenario: Nome de gol contra não vira sugestão
- **WHEN** um gol contra de nome "Zagueiro X" foi registrado no lado do competidor "Ataias"
- **THEN** "Zagueiro X" NÃO aparece no autocomplete do competidor "Ataias"

### Requirement: Ranking de artilharia por competição
O sistema SHALL expor um ranking de artilharia de uma competição (torneio, ou o
conjunto de torneios de uma temporada/pirâmide), agregando os gols NORMAIS
(`contra = false`) por `(competidor, nome_normalizado)` — a mesma grafia sob
competidores diferentes conta SEPARADAMENTE ("Endrick (do Ataias)" ≠ "Endrick (do
João)"). Gols contra (`contra = true`) NÃO SHALL entrar no ranking. Cada linha
SHALL trazer o competidor (id + nome do clube/rótulo), o ESCUDO do clube do
competidor quando houver (`escudoUrl`, `null` para competidor por-nome/avulso), o
nome do artilheiro e o total de gols, ordenado por gols decrescente. A UI do
ranking SHALL exibir o escudo real do clube em cada linha, caindo para o monograma
(iniciais + cor estável) apenas quando `escudoUrl` é `null`. O ranking SHALL
respeitar a visibilidade das partidas (gols de rodada oculta não entram para quem
não pode vê-la). Partidas sem competidor persistente (avulso) NÃO SHALL entrar no
ranking.

#### Scenario: Artilheiros agregados e ordenados
- **WHEN** "Endrick (do Ataias)" fez 3 gols e "Vini (do Ataias)" fez 5 no torneio
- **THEN** o ranking lista "Vini" (5) acima de "Endrick" (3), ambos atribuídos ao competidor Ataias

#### Scenario: Mesmo nome sob competidores diferentes é separado
- **WHEN** "Endrick (do Ataias)" fez 2 gols e "Endrick (do João)" fez 4
- **THEN** o ranking mostra DUAS linhas de "Endrick" (uma por competidor), não uma soma de 6

#### Scenario: Escudo real identifica o competidor
- **WHEN** o competidor "Ataias" tem clube com `escudo_url` definido
- **THEN** cada linha de artilheiro daquele competidor traz `escudoUrl` = a URL do escudo, e a UI mostra o escudo real no lugar do monograma

#### Scenario: Competidor por-nome cai no monograma
- **WHEN** o competidor é por-nome/avulso (sem clube)
- **THEN** a linha traz `escudoUrl` = `null` e a UI exibe o monograma (iniciais + cor estável), sem quebrar

#### Scenario: Gol contra não entra no ranking
- **WHEN** um gol contra é registrado no lado de um competidor
- **THEN** ele não aparece no ranking de artilharia (nem soma para nenhum autor)

### Requirement: Artilheiros na carreira do competidor
A página de um competidor persistente SHALL exibir seus artilheiros —
`{jogador, gols}` agregados por nome normalizado ao longo de todas as partidas do
competidor, considerando APENAS gols normais (`contra = false`), ordenados por gols
decrescente. Gols contra (`contra = true`) NÃO SHALL entrar na carreira. O conjunto
SHALL casar com a identidade do competidor usada por `getCompetitorProfile` (mesmo
`competitor_id`).

#### Scenario: Carreira soma através de temporadas
- **WHEN** o competidor marcou com "Endrick" em duas temporadas diferentes (2 + 1 gols)
- **THEN** a seção de artilheiros do competidor mostra "Endrick" com 3 gols

#### Scenario: Gol contra não conta na carreira
- **WHEN** um gol contra foi registrado no lado do competidor
- **THEN** ele não aparece na seção de artilheiros do competidor

### Requirement: Assistências e MVP fora de escopo
Esta capacidade SHALL registrar apenas AUTORES DE GOLS. Assistências, cartões e
MVP da partida NÃO fazem parte do escopo e podem ser adicionados depois sem
migração destrutiva (a tabela é aditiva).

#### Scenario: Só gols são capturados
- **WHEN** um gol é registrado
- **THEN** apenas autor e contagem de gols são persistidos, sem assistência/MVP

### Requirement: Gol contra fecha a conta do lado, fora do ranking
Um GOL CONTRA (`contra = true`) SHALL contar para o placar do lado (é um gol que o
lado fez), permitindo fechar a conta de um lado sem atribuir um artilheiro (ex.: 4
gols = 3 artilheiros + 1 contra). O nome do jogador adversário que marcou SHALL ser
OPCIONAL. Um gol contra NUNCA SHALL entrar no ranking de artilheiros nem na carreira
do competidor nem no autocomplete. O detalhe da partida PODE exibir os gols contra
à parte ("N gols + M contra"). Vários gols contra ANÔNIMOS no mesmo lado SHALL ser
agregados numa única contagem por lado; um gol contra com nome SHALL ser
distinguível por nome.

#### Scenario: Gol contra fecha a conta sem artilheiro
- **WHEN** o placar do lado é 1 e o único autor informado é um gol contra
- **THEN** a conta do lado fecha (1 = 1), sem nenhum artilheiro atribuído àquele lado

#### Scenario: Vários gols contra anônimos agregam
- **WHEN** dois gols contra sem nome são registrados no mesmo lado
- **THEN** eles são agregados numa única contagem de gols contra daquele lado

### Requirement: Atribuição colaborativa de autores continua após a validação
Em partidas COMPETITIVAS (com vaga), a atribuição de autores de gols SHALL poder
CONTINUAR depois do placar validado (partida encerrada), de forma COLABORATIVA e
POR-LADO, através de um MODO EXPLÍCITO de escrita (não inferido pelo papel do
usuário). O modo APPEND SHALL só ADICIONAR ao lado (soma com o já registrado),
limitado ao placar do lado, sem editar nem remover o já salvo; SHALL ser autorizado
ao TÉCNICO daquele lado OU a quem ARBITRA. O modo REPLACE SHALL substituir a lista
do lado (adiciona, corrige e remove); SHALL ser autorizado SOMENTE a quem ARBITRA.
O modo NÃO SHALL ser inferido do papel — quem é árbitro E técnico do mesmo lado,
completando pelo editor "Meus artilheiros" (append), SHALL apenas ADICIONAR, sem
apagar seus próprios gols (o footgun dual-role). Nenhuma operação de um lado SHALL
alterar o lado oposto. NÃO SHALL haver aprovação/foto para completar autores após a
validação — o teto (soma do lado ≤ placar do lado) já impede inflar. Para CORRIGIR
algo já salvo, o técnico (sem arbitrar) SHALL recorrer ao organizador/árbitro.

#### Scenario: Técnico completa o próprio lado após o encerramento
- **WHEN** o técnico do lado 1 de uma partida encerrada 2x0 adiciona (append) `[{jogador:"Vini",gols:2}]`
- **THEN** os dois gols são atribuídos ao lado 1 sem tocar o lado 2, mesmo com a partida encerrada

#### Scenario: Append não reduz nem remove o já salvo
- **WHEN** o técnico envia mais autores (append) num lado que já tem gols registrados
- **THEN** a operação apenas SOMA ao existente; o já salvo permanece

#### Scenario: Dual-role no editor append não apaga os próprios gols
- **WHEN** um usuário que é árbitro E técnico do lado 1 usa o editor "Meus artilheiros" (append) enviando só o delta que falta
- **THEN** o delta é somado ao já registrado (modo append explícito), sem substituir/apagar os gols do lado 1

#### Scenario: Append não excede o placar do lado
- **WHEN** a soma (existente + adicionado) do lado ultrapassa o placar do lado
- **THEN** a operação é rejeitada (teto do lado)

#### Scenario: Árbitro corrige os dois lados
- **WHEN** quem arbitra substitui (replace) a lista de autores de um lado (adicionando, corrigindo ou removendo)
- **THEN** o lado passa a refletir exatamente a lista enviada, sem tocar o lado oposto

#### Scenario: Técnico não faz replace
- **WHEN** o técnico de um lado (sem capacidade de arbitrar) tenta o modo replace
- **THEN** a operação é negada (replace é exclusivo de quem arbitra)

#### Scenario: Técnico do lado oposto não edita o meu lado
- **WHEN** o técnico do lado 2 tenta registrar autores no lado 1
- **THEN** a operação é negada (cada técnico só completa o próprio lado)

### Requirement: A captura de autores reflete o estado atual sem dobrar (preload × modo)
A captura de autores SHALL refletir o estado atual da partida sem NUNCA DOBRAR os
gols já registrados — o comportamento do preload SHALL depender do MODO de escrita
da superfície. Nas superfícies REPLACE (o `MatchScoreModal` do lançamento DIRETO do
organizador e o console do organizador pós-validação) a captura SHALL PRÉ-CARREGAR
os autores existentes como linhas EDITÁVEIS (agrupados por lado E por `contra`,
incluindo gols contra) e submeter a LISTA COMPLETA do lado, pois o writer substitui
o lado (delete-then-insert por-lado / `modo='replace'`) — sem dobra. Na superfície
APPEND (o editor "Meus artilheiros" do técnico) os autores já registrados SHALL
aparecer SOMENTE-LEITURA, e o save SHALL submeter APENAS as entradas NOVAS (o
delta) com `modo='append'`; a captura NUNCA SHALL reenviar as linhas pré-carregadas
no payload append (a RPC já soma o existente lido da tabela — reenviar dobraria). A
captura NUNCA SHALL apresentar lista VAZIA sobre gols já gravados. Uma reabertura
seguida de re-lançamento/re-aprovação SEM mexer nos autores SHALL PRESERVAR os
`match_goals` existentes. Editar os autores de UM lado NUNCA SHALL apagar o oposto.

#### Scenario: Superfície replace pré-carrega os autores existentes (editáveis)
- **WHEN** uma partida com autores registrados é reaberta e o modal de lançamento direto do organizador é aberto
- **THEN** a captura mostra os autores já gravados (por lado, com gols contra) como linhas editáveis, e o save substitui o lado com a lista completa (sem dobrar)

#### Scenario: Editor append não dobra — existente read-only, submete só o delta
- **WHEN** o técnico do lado 1 (placar 4) tem "Vini" com 2 gols já registrados, vê "Vini:2" SOMENTE-LEITURA e adiciona "João" com 1 gol
- **THEN** o save submete apenas `[{João:1}]` em `modo='append'` e o lado 1 fica "Vini:2, João:1" (3 de 4), NÃO "Vini:4"

#### Scenario: Reabrir e re-lançar sem tocar nos autores preserva os gols
- **WHEN** o placar de uma partida com autores é corrigido (reabrir + re-lançar) sem mexer na captura de autores
- **THEN** os `match_goals` existentes permanecem (a captura não tocada envia "preservar")

#### Scenario: Editar um lado não apaga o oposto
- **WHEN** os autores de um lado são editados e salvos
- **THEN** apenas aquele lado é reescrito; os autores do lado oposto permanecem intactos

### Requirement: Superfície e descoberta do editor "Meus artilheiros"
O editor colaborativo "Meus artilheiros" (append) SHALL ser ACESSÍVEL ao técnico no
card de uma partida ENCERRADA competitiva quando `auth.uid()` é o `slot.user_id` de
UM dos lados; o editor SHALL travar a edição ao lado do técnico logado (resolvido
por `vaga_1.user_id`/`vaga_2.user_id`) e exibir "X de Y gols atribuídos"
(Y = placar do lado, X = soma já atribuída). Partidas encerradas competitivas em que
o lado do técnico tem gols POR ATRIBUIR (`placar[lado] > soma atribuída`) SHALL
exibir um indicador de descoberta ("faltam N artilheiros"), puxando a completação.

#### Scenario: Técnico vê o editor na partida encerrada do seu lado
- **WHEN** o técnico do lado 1 abre uma partida ENCERRADA competitiva em que comanda a vaga 1
- **THEN** o card oferece o editor "Meus artilheiros" travado no lado 1, com "X de Y gols atribuídos"

#### Scenario: Indicador de gols por atribuir
- **WHEN** uma partida encerrada tem placar do lado do técnico maior que a soma já atribuída daquele lado
- **THEN** um indicador "faltam N artilheiros" é exibido, levando ao editor

#### Scenario: Quem não é técnico do lado não vê o editor do técnico
- **WHEN** um usuário que não é o técnico de nenhum lado abre a partida encerrada
- **THEN** o editor "Meus artilheiros" não é oferecido a ele (o console de organizador é separado, para quem arbitra)

### Requirement: Ranking de artilharia limitado a top 10 com expansão

O ranking de artilharia (Artilheiros) SHALL exibir por padrão apenas os 10 primeiros
colocados, com um controle "Ver mais" (mostrando quantos restam) que revela a lista
completa e alterna para "Ver menos". O controle SHALL ter alvo de toque ≥44px e estado
acessível (`aria-expanded`/`aria-controls`). Quando o ranking tiver 10 ou menos
colocados, o controle NÃO SHALL aparecer.

#### Scenario: Lista longa mostra top 10 + ver mais
- **WHEN** a artilharia tem mais de 10 artilheiros
- **THEN** só os 10 primeiros aparecem, com um botão "Ver mais (N)" que expande o restante

#### Scenario: Lista curta não mostra o controle
- **WHEN** a artilharia tem 10 ou menos artilheiros
- **THEN** todos aparecem e não há botão "Ver mais"

