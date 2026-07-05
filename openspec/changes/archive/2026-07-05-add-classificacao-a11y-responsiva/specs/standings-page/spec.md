## ADDED Requirements

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

## MODIFIED Requirements

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
