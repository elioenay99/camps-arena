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
"Rolar pro lado" (todas as estatísticas com rolagem horizontal — comportamento
base) e "Caber tudo" (compacto, cabendo na largura da tela, mantendo as oito
estatísticas numéricas com fonte e padding menores e o nome encurtado). Um único
controle SHALL reconfigurar todas as tabelas da aba de classificação (grupos,
geral e clubes) simultaneamente. A tabela SHALL permanecer um componente de
servidor (RSC), reagindo ao modo por atributo do ancestral, sem receber o estado
por prop.

No mobile, o modo padrão SHALL ser "Caber tudo"; no desktop, "Rolar pro lado". A
preferência escolhida pelo usuário SHALL ser lembrada entre sessões
(`localStorage`) e SHALL ser lida apenas após a hidratação, com estado inicial
determinístico para não gerar divergência de hidratação. Na ausência do controle
(outros consumidores da tabela, como ligas), o comportamento SHALL ser o base
("rolar"), sem regressão.

#### Scenario: Celular abre em "Caber tudo"

- **WHEN** um usuário abre a classificação de um torneio pela primeira vez num
  celular (390px)
- **THEN** a tabela aparece compacta, com todas as estatísticas visíveis na largura
  da tela, sem rolagem horizontal

#### Scenario: Alternar e lembrar a preferência

- **WHEN** o usuário troca para "Rolar pro lado" e recarrega a página
- **THEN** a classificação reabre em "Rolar pro lado" (preferência persistida), com
  todas as tabelas da aba no mesmo modo

#### Scenario: Consumidor sem o controle não regride

- **WHEN** a mesma tabela é usada fora da aba (ex.: divisões de uma liga, sem o
  wrapper de modo)
- **THEN** ela renderiza no modo base ("rolar"), idêntica ao comportamento atual

