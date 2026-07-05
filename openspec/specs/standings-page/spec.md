# standings-page Specification

## Purpose
TBD - created by archiving change add-standings-page. Update Purpose after archive.
## Requirements
### Requirement: Página de classificação do torneio
O sistema SHALL oferecer a página protegida `/dashboard/torneios/[id]` exibindo título e status do torneio e a visualização de progresso adequada ao FORMATO: em torneio `avulso` ou `liga`, as regras de pontuação e a tabela de classificação calculada pelo motor `computeStandings` (com a classificação de clubes); em torneio `mata_mata`, a CHAVE eliminatória; em `grupos_mata_mata` e `fase_liga`, uma tabela de classificação POR GRUPO (única na fase de liga) e — quando gerada — a chave (capability `group-stage-format`). Sem partida encerrada (formatos com classificação), a página SHALL exibir um estado vazio orientativo.

#### Scenario: Tabela renderizada com nomes e posições
- **WHEN** um usuário autenticado abre a página de um torneio avulso ou liga visível com partidas encerradas
- **THEN** a tabela mostra posição, nome, pontos, jogos, V/E/D, gols e saldo na ordem do motor

#### Scenario: Mata-mata renderiza a chave
- **WHEN** um usuário autenticado abre a página de um torneio mata-mata iniciado
- **THEN** a página mostra a chave por fases no lugar da classificação por pontos

#### Scenario: Grupos renderizam tabelas por grupo e a chave
- **WHEN** um usuário autenticado abre a página de um torneio de grupos ou fase de liga iniciado
- **THEN** a página mostra a classificação por grupo (única na fase de liga) e, quando gerada, a chave

#### Scenario: Sem partidas encerradas
- **WHEN** o torneio avulso ou liga visível ainda não tem partida encerrada
- **THEN** a página informa que a classificação aparecerá após a primeira partida encerrada

#### Scenario: Torneio invisível ou inexistente
- **WHEN** o id não existe, é de torneio privado de terceiro, ou não é um uuid
- **THEN** a página responde com notFound (404), sem distinguir os casos

### Requirement: Fetcher de classificação
`getTournamentClassificacao` SHALL, em formatos competitivos, embedar as VAGAS dos lados (vaga → team nome/escudo + técnico id/nome/celular/avatar) numa única viagem, rodar os motores sobre slot ids e resolver o display como CLUBE (nome/escudo) com técnico como detalhe; partidas avulsas mantêm o caminho por participante. As projeções (linhas, partidasAbertas/Encerradas, chave, grupos, clubes) mantêm os contratos atuais com o lado competitivo resolvido por vaga; o celular continua restrito à projeção de partidas abertas.

#### Scenario: Linha da classificação é o clube
- **WHEN** o fetcher resolve um torneio competitivo
- **THEN** cada linha carrega nome/escudo do clube e o técnico atual (ou vaga aberta)

#### Scenario: Avulso inalterado
- **WHEN** o torneio é avulso
- **THEN** os lados continuam sendo pessoas como hoje

### Requirement: Exibição de rodada nas listas de partidas
As listas de partidas da página do torneio SHALL identificar a rodada quando a
partida a tiver (`rodada` não nula): as partidas em aberto SHALL ser ordenadas
por rodada (ordem natural de disputa) com a rodada visível; o histórico de
encerradas SHALL manter a ordenação por encerramento, exibindo a rodada como
informação adicional. Partidas sem rodada (torneio avulso) SHALL renderizar
exatamente como hoje, sem rótulo de rodada. O fetcher
`getTournamentClassificacao` SHALL incluir `rodada` na mesma consulta única de
partidas (sem viagem extra).

#### Scenario: Liga lista partidas em aberto por rodada
- **WHEN** um usuário abre a página de uma liga iniciada
- **THEN** as partidas em aberto aparecem ordenadas por rodada com o número da rodada visível

#### Scenario: Histórico identifica a rodada
- **WHEN** partidas de liga encerradas aparecem no histórico
- **THEN** cada item exibe a rodada, mantendo a ordenação por encerramento

#### Scenario: Avulso permanece sem rótulo
- **WHEN** um usuário abre a página de um torneio avulso
- **THEN** as listas não exibem rótulo de rodada

### Requirement: Apresentação da lista de partidas em aberto

A lista de partidas em aberto da página do torneio SHALL ser apresentada no idioma visual
da identidade (placar em tipografia display com `tabular-nums`, linhas com profundidade
sutil e realce no hover, status da partida em indicação discreta, cabeçalho de rodada em
tipografia display com marcador decorativo), SEM alterar o agrupamento por rodada, os
controles por papel (encerrar, marcar/solicitar W.O., fechar rodada, atalho de convocação),
os textos visíveis fixados (`RN`, `(vaga aberta)`), os papéis/nomes acessíveis (heading
`Rodada N`, rótulos de botão) nem o texto acessível. A superfície permanece Server Component
(a contenção de PII do celular depende disso).

Adicionalmente, para o **dono**, a página SHALL oferecer os controles de **liberação de
rodadas** (uma seção "Liberação de rodadas" com o estado por rodada — liberada/oculta — e
os botões *Liberar próxima rodada*, *Liberar próximas N*, *Liberar fase de grupos* nos
formatos com grupos e *Liberar tudo* com confirmação). Esses controles SHALL aparecer só
para o dono e só quando houver rodadas (formatos gerados, não avulso). O fetcher
`getTournamentClassificacao` SHALL derivar, a partir das partidas que o dono enxerga, o
estado de liberação por rodada e a próxima rodada oculta para alimentar essa seção.

#### Scenario: Lista em aberto vestida com a identidade

- **WHEN** o usuário abre um torneio competitivo com partidas em aberto
- **THEN** as linhas aparecem com placar em tipografia display e profundidade sutil,
  agrupadas por rodada com cabeçalho `Rodada N` e o botão "Fechar rodada" na rodada ativa
  (para o dono), como antes

#### Scenario: Apresentação preserva papéis e contenção de PII

- **WHEN** a lista renderiza para quem joga e para o dono
- **THEN** os controles por papel e o atalho de convocação aparecem conforme hoje, os nomes
  acessíveis permanecem, e o componente segue como Server Component (sem `"use client"`)

#### Scenario: Dono vê os controles de liberação

- **WHEN** o dono abre um torneio gerado com rodadas ocultas
- **THEN** a seção "Liberação de rodadas" lista o estado de cada rodada e oferece os botões
  de liberação; um não-dono não vê essa seção

### Requirement: Estado de carregamento da página do torneio

Enquanto a página do torneio carrega, o sistema SHALL exibir um esqueleto que
ESPELHA a geometria real (cabeçalho do torneio + cabeçalho de seção + tabela de
classificação) para reduzir layout shift, com região acessível de carregamento
(`role="status"`, `aria-live`, texto `sr-only`). Por ser um boundary anterior à
busca (sem conhecer o formato), o esqueleto SHALL representar o caso dominante
(classificação por tabela); o conteúdo já carregado substitui o esqueleto.

#### Scenario: Skeleton espelha a página

- **WHEN** os dados do torneio ainda estão sendo buscados
- **THEN** um esqueleto com cabeçalho-hero e tabela de classificação aparece no
  lugar do conteúdo, anunciado a leitores de tela

#### Scenario: Conteúdo substitui o esqueleto

- **WHEN** os dados terminam de carregar
- **THEN** a página real (classificação, chave ou grupos conforme o formato)
  substitui o esqueleto

### Requirement: Classificação parcial do não-dono

A classificação exibida ao **não-dono** SHALL refletir apenas as rodadas já liberadas,
porque ela é calculada sobre as partidas que a RLS devolve. Resultados de rodadas ainda
ocultas NÃO SHALL vazar pela tabela, nem pela lista de partidas, nem pela chave. Para o
**dono**, a classificação SHALL continuar refletindo todas as partidas (ele vê tudo).

O gating da RLS SHALL valer uniformemente, mas o ALCANCE prático da "tabela parcial" no v1
é o torneio standalone: a página da divisão de liga (`ligas/[id]`) e os fetchers
`getDivisionStandings`/`getDivisionClassificacaoCombinada` são lidos SÓ pelo dono
(`getSeason` filtra por `created_by`), e divisões de pirâmide nascem liberadas — logo não há
"tabela combinada parcial do não-dono". A única superfície de não-dono numa liga é a
**página do torneio da divisão** (`torneios/[id]`, que pode ser pública), coberta pela
mesma regra do torneio standalone. O comentário do fetcher que afirmava receber "todas" as
partidas do torneio SHALL ser corrigido para refletir que o conjunto retornado depende da
liberação para o não-dono.

#### Scenario: Tabela do não-dono só conta rodadas liberadas

- **WHEN** um visitante abre um torneio com rodadas liberadas e ocultas
- **THEN** a classificação soma só os jogos das rodadas liberadas; o resultado das ocultas
  não aparece em lugar nenhum da página

#### Scenario: Tabela do dono é completa

- **WHEN** o dono abre o mesmo torneio
- **THEN** a classificação reflete todas as partidas, liberadas ou não

#### Scenario: Ao liberar, a tabela do não-dono se atualiza

- **WHEN** o dono libera uma rodada cujos jogos já foram disputados
- **THEN** a classificação do não-dono passa a incluir esses resultados (após recarregar a
  página — o realtime não injeta partidas recém-liberadas, só atualiza as já em tela)

### Requirement: Estado de rodadas não liberadas para o não-dono

A página do torneio SHALL exibir, para o não-dono de um torneio ATIVO cujas rodadas estão
todas ocultas (cadência manual, zero rodadas liberadas), um aviso explícito de que **as
próximas rodadas ainda não foram liberadas pelo organizador** — em vez dos empty-states que
afirmam que o torneio ainda não começou ("a chave/grupos aparecem quando o torneio for
iniciado", "a classificação aparece depois da primeira partida encerrada"), que seriam
enganosos e criariam um beco-sem-saída.

A condição SHALL ser derivada do estado do TORNEIO (não da ausência de partidas, que o
não-dono não distingue de "não iniciado"): torneio com `status = 'ativo'`, sem partidas
visíveis ao solicitante, e solicitante não-dono ⇒ aviso de "rodadas não liberadas". Para o
torneio em rascunho (não iniciado) os empty-states atuais SHALL permanecer. Para o dono
(que vê tudo), nada muda.

#### Scenario: Não-dono vê aviso de rodadas não liberadas

- **WHEN** um não-dono abre um torneio ativo cujas rodadas estão todas ocultas
- **THEN** a página exibe "As próximas rodadas ainda não foram liberadas pelo organizador",
  e não os empty-states de torneio não iniciado

#### Scenario: Rascunho mantém o empty-state de não iniciado

- **WHEN** um usuário abre um torneio ainda em rascunho
- **THEN** os empty-states atuais ("aparece quando o torneio for iniciado") permanecem

#### Scenario: Liberação parcial mostra o que há e sinaliza o resto

- **WHEN** o dono já liberou algumas rodadas mas mantém outras ocultas
- **THEN** o não-dono vê a classificação/partidas das rodadas liberadas normalmente (sem o
  aviso de bloqueio total)

### Requirement: Dois modos de visualização da classificação

A classificação SHALL oferecer dois modos alternáveis por um controle visível:
"Rolar pro lado" e "Caber tudo". O modo SHALL controlar a densidade
TIPOGRÁFICA/de espaçamento (compacta em "Caber tudo"), mas a OCULTAÇÃO de colunas
e a divulgação progressiva SHALL ser função do VIEWPORT, não do modo isolado:
existe um estado COMPACTO derivado por uma função pura
`compacto = viewportMobile && modo === 'caber'`. A regra dura SHALL valer: no
DESKTOP todas as colunas ficam visíveis SEMPRE (desktop nunca é compacto, mesmo em
"Caber tudo") — nenhuma coluna some. No MOBILE, "Caber tudo" (compacto) SHALL
priorizar POSIÇÃO, CLUBE (com escudo), PONTOS, JOGOS e SALDO e ocultar as demais
estatísticas (Vitórias, Empates, Derrotas, Gols pró, Gols contra e a coluna
Forma), reveladas sob demanda por linha; "Rolar pro lado" no mobile SHALL manter
todas as colunas com rolagem horizontal. Um único controle SHALL reconfigurar
todas as tabelas da aba de classificação (grupos, geral e clubes)
simultaneamente. A renderização das linhas SHALL vir do servidor (dados
projetados no RSC); apenas o estado de densidade/expansão SHALL ser client,
propagado às tabelas por atributo do ancestral (`data-modo` + `data-compacto`) e
por contexto — sem receber o estado por prop de dados.

No mobile, o modo inicial SHALL ser "Caber tudo"; no desktop, "Rolar pro lado"
(via `deriveModoInicial(viewportMobile)`). A preferência escolhida pelo usuário
SHALL ser lembrada entre sessões (`localStorage`) e SHALL ser lida apenas após a
hidratação, com estado inicial determinístico (`modo='rolar'`,
`viewportMobile=false`) para não gerar divergência de hidratação. Na ausência do
controle (outros consumidores da tabela, como divisões de liga cruas), o
comportamento SHALL ser o base ("rolar", não compacto), sem regressão.

#### Scenario: Celular abre compacto com colunas prioritárias

- **WHEN** um usuário abre a classificação de um torneio pela primeira vez num
  celular (390px)
- **THEN** a tabela aparece compacta mostrando POSIÇÃO, CLUBE, PONTOS, JOGOS e
  SALDO na largura da tela, sem rolagem horizontal, com as demais estatísticas
  ocultas até expandir a linha

#### Scenario: Desktop em "Caber tudo" não perde colunas

- **WHEN** um usuário de desktop alterna para "Caber tudo"
- **THEN** a tipografia compacta é aplicada, mas TODAS as colunas continuam
  visíveis e nenhum gatilho de expansão aparece (desktop nunca é compacto)

#### Scenario: Alternar e lembrar a preferência

- **WHEN** o usuário troca para "Rolar pro lado" e recarrega a página
- **THEN** a classificação reabre em "Rolar pro lado" (preferência persistida), com
  todas as tabelas da aba no mesmo modo

#### Scenario: Mobile em "Rolar pro lado" mantém todas as colunas

- **WHEN** um usuário no celular escolhe "Rolar pro lado"
- **THEN** todas as estatísticas aparecem com rolagem horizontal, sem ocultar
  colunas nem gatilho de expansão

#### Scenario: Consumidor sem o controle não regride

- **WHEN** a mesma tabela é usada fora da aba (ex.: divisões de uma liga, sem o
  wrapper de modo)
- **THEN** ela renderiza no modo base ("rolar", não compacto), idêntica ao
  comportamento atual

### Requirement: Zona e associação de linha perceptíveis a leitor de tela

A tabela de classificação SHALL comunicar a zona de cada linha (acesso,
rebaixamento, playoff) por um meio NÃO-cromático além da cor: cada linha que
estiver numa zona SHALL conter, UMA vez, um texto acessível (`sr-only`) com o
nome da zona, derivado da MESMA lógica posicional que já pinta a faixa lateral e
a legenda, reusando os rótulos da legenda ("Zona de acesso", "Zona de
rebaixamento", "Playoff de acesso", "Playout", "Playoff") — sem alterar o visual.
A célula do NOME (o rótulo mais informativo da linha) SHALL ser um cabeçalho de
linha (`<th scope="row">`) em vez de `<td>`, associando as células de estatística
à linha na navegação por leitor de tela; a herança de negrito/alinhamento do
agente de usuário SHALL ser neutralizada por classe para não alterar o visual. A
célula de posição SHALL permanecer `<td>`. A tabela SHALL permanecer semântica e
válida. As tabelas sem zonas (torneio/liga standalone) SHALL permanecer
inalteradas exceto pelo `<th scope="row">` no nome, que se aplica a todas.

#### Scenario: Linha em zona é anunciada sem depender da cor

- **WHEN** um leitor de tela percorre uma linha que está na zona de rebaixamento
- **THEN** a linha expõe um texto acessível "Zona de rebaixamento" (o significado
  não depende apenas da faixa colorida)

#### Scenario: Nome do clube é o cabeçalho da linha

- **WHEN** um leitor de tela navega pelas células numéricas de uma linha
- **THEN** cada célula é associada ao cabeçalho de linha (o nome do clube) via
  `<th scope="row">`, sem alteração visual da célula

#### Scenario: Tabela sem zonas não regride

- **WHEN** a classificação de um torneio standalone (sem zonas de pirâmide) é
  exibida
- **THEN** nenhuma faixa/anúncio de zona aparece, mas a célula do nome continua
  como `<th scope="row">`

### Requirement: Largura da classificação aproveita o desktop

A visualização de classificação SHALL, no desktop, usar um container mais largo
que aproveite a largura ociosa da tela — exibindo as colunas completas e, quando
couber, divisões lado a lado — sem introduzir rolagem horizontal indevida. No
mobile a largura SHALL permanecer contida à tela, sem estouro horizontal do corpo
da página.

#### Scenario: Desktop usa a largura ociosa

- **WHEN** um usuário abre a classificação num desktop largo
- **THEN** a view ocupa mais largura, mostrando as colunas completas sem
  espremer, aproveitando o espaço antes ocioso

#### Scenario: Mobile não estoura a largura

- **WHEN** a mesma classificação é vista em 390px
- **THEN** a tabela cabe na largura da tela (sem rolagem horizontal do corpo da
  página), com as colunas prioritárias visíveis

### Requirement: Divulgação progressiva acessível das estatísticas por linha

A tabela SHALL revelar por PROP explícita a capacidade de expandir linha: só
quando recebe `expansivel` (default DESLIGADO) ela emite o gatilho e a linha de
detalhe; os consumidores que renderizam a tabela crua (sem esse recurso) SHALL
permanecer como componentes de servidor, sem gatilho por linha. Quando a
capacidade está ligada E a densidade é COMPACTA (mobile), cada linha SHALL expor
um gatilho `<button>` com `aria-expanded` (refletindo colapsado/expandido) e
`aria-controls` apontando a linha de detalhe, colocado DENTRO de uma célula da
linha (não na `<tr>`), operável por teclado (foco visível, ativação por
Enter/Espaço) e na ordem de tabulação, com alvo de toque de pelo menos 44px no
mobile. A linha de detalhe SHALL ser uma `<tr>` irmã com uma única `<td>` que
abrange todas as colunas (colspan dinâmico conforme as colunas presentes) e SHALL
listar as estatísticas ocultas como pares rótulo→valor explícitos (por serem uma
linha irmã, não herdam o cabeçalho de linha). O gatilho e a linha de detalhe
SHALL ser renderizados condicionalmente por JAVASCRIPT (não apenas ocultados por
CSS), para que o estado seja perceptível a leitor de tela e verificável em teste.
No DESKTOP, onde todas as colunas cabem, NENHUM gatilho de expansão SHALL ser
exigido nem renderizado.

#### Scenario: Gatilho de expansão é um botão acessível no mobile

- **WHEN** um leitor de tela alcança uma linha da classificação no modo compacto
  (mobile) de uma tabela com a expansão ligada
- **THEN** ela expõe um `<button>` anunciado com estado `aria-expanded`
  (colapsado/expandido) e `aria-controls` para o detalhe

#### Scenario: Operável por teclado revela as estatísticas

- **WHEN** um usuário de teclado foca o gatilho de uma linha e o aciona
  (Enter/Espaço)
- **THEN** a linha de detalhe com V/E/D/GP/GC (pares rótulo→valor) é revelada e um
  novo acionamento a recolhe, mantendo a `<table>` válida

#### Scenario: Consumidor cru permanece RSC sem gatilho

- **WHEN** a tabela é renderizada por um consumidor que não liga a expansão
  (landing, grande final, timeline, card de partida, copas)
- **THEN** nenhum `<button>` de expansão é emitido por linha e a tabela permanece
  um componente de servidor

