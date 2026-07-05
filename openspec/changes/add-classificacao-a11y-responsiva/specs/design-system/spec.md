## ADDED Requirements

### Requirement: Contraste AA de texto acentuado, badges e indicador de foco

O texto acentuado, os badges e o indicador de foco SHALL atender contraste WCAG
em AMBOS os temas, com a estratégia de CLAREAR O TEXTO sobre tints da mesma matiz
(nunca engrossar o tint do fundo, que aproxima as cores e piora). Especificamente:

- O texto destrutivo (`text-destructive`), usado como TEXTO em múltiplos loci
  (mensagens de erro de formulário, campo de cor, criar partida, busca de time,
  variante `destructive` de botão), SHALL atingir contraste AA (≥4.5:1). Como não
  há uso de `bg-destructive` sólido no código, o ajuste SHALL ser SISTÊMICO no
  token `--destructive` do tema ESCURO (clareado até passar como texto sobre a
  superfície de card), preservando o par `text-destructive` sobre `bg-destructive/10`
  ≥4.5; o tema CLARO já passa e não muda.
- O badge de papel `admin` (`text-primary` sobre `bg-primary/10`), que falha AA
  nos dois temas (≈4.46 escuro / ≈4.41 claro), SHALL usar texto de alto contraste
  (`text-foreground`) mantendo a identidade na borda e no ícone (cor de marca) —
  sem alterar o token de marca. Os badges cuja combinação já passa (árbitro,
  moderador) SHALL permanecer inalterados.
- O indicador de foco visível dos controles (anel do `Button`, anel do `<select>`
  de rodada e o contorno global) SHALL ter contraste NÃO-texto de pelo menos 3:1
  contra o fundo adjacente (WCAG 1.4.11), usando a cor cheia do anel/contorno em
  vez das opacidades fracas atuais (≈2.5:1), sem inflar a espessura.

Os ajustes SHALL ser conferidos nos dois temas, sem regressão no claro.

#### Scenario: Texto destrutivo atende AA no escuro

- **WHEN** uma mensagem de erro de formulário (ou o rótulo de um botão destrutivo)
  aparece no tema escuro
- **THEN** o texto vermelho atende contraste AA (≥4.5:1) sobre a superfície

#### Scenario: Badge admin legível nos dois temas

- **WHEN** o badge de papel `admin` é exibido no tema escuro e no claro
- **THEN** o texto atende AA (via `text-foreground`), mantendo a cor de marca na
  borda e no ícone

#### Scenario: Anel de foco perceptível

- **WHEN** um usuário de teclado foca um botão, o `<select>` de rodada ou qualquer
  controle com o contorno global
- **THEN** o indicador de foco tem contraste de pelo menos 3:1 contra o fundo,
  visível nos dois temas

## MODIFIED Requirements

### Requirement: Acessibilidade de formulários e controles de ação

Os formulários da aplicação e os controles de ação SHALL atender critérios WCAG de uso por leitor de tela,
teclado e toque. Cada campo com erro de validação SHALL associar programaticamente sua mensagem ao input
(via `aria-describedby` apontando o `id` da mensagem) e anunciá-la (`role="alert"`/`aria-live`), além do
resumo geral do formulário — não bastando o realce visual (WCAG 3.3.1, 1.3.1). Estados comunicados por cor
SHALL ter um reforço NÃO-cromático (texto/ícone com rótulo acessível) — em particular o lado vencedor de um
confronto de mata-mata, cujo placar pode não desambiguar o desfecho em agregado/W.O. (WCAG 1.4.1). Os botões
de AÇÃO IRREVERSÍVEL (W.O., expulsar, encerrar, sair) SHALL ter alvo de toque de pelo menos 44px de altura no
mobile, com espaçamento adequado entre alvos adjacentes, sem regredir os botões pequenos legítimos do resto
da interface. Essa mesma exigência de 44px no mobile SHALL cobrir também os controles do PASSADOR DE RODADAS
(as setas de rodada anterior/próxima e o `<select>` de rodada), o `ColorField` (o atalho visual de cor e o
gatilho "limpar"), o link de estado vazio "Ver meus torneios", os botões de MODO da classificação
("Rolar"/"Caber tudo") e o gatilho de EXPANSÃO de linha da classificação — controles que hoje herdam tamanhos
menores que 44px. Todos SHALL ter `:focus-visible` perceptível e participar de uma ordem de tabulação lógica. O
contraste de texto SHALL atender WCAG AA nos dois temas.

#### Scenario: Erro de campo anunciado e associado

- **WHEN** um usuário submete um formulário com um campo inválido (login, cadastro, perfil, criar partida,
  criar torneio, recuperação/atualização de senha, ou o campo de cor)
- **THEN** a mensagem de erro daquele campo é associada ao input (`aria-describedby`) e anunciada por leitor
  de tela (`role="alert"`/`aria-live`), além do resumo do formulário

#### Scenario: Vencedor do confronto legível sem cor

- **WHEN** um leitor de tela (ou um usuário que não percebe a cor) inspeciona um confronto de mata-mata já
  decidido na chave
- **THEN** o lado que avançou é identificado por um reforço não-cromático (ícone/`sr-only` "vencedor"), mesmo
  quando o placar exibido não desambigua (agregado, W.O.)

#### Scenario: Alvo de toque das ações irreversíveis

- **WHEN** um usuário no mobile (390px) interage com uma ação irreversível (W.O., expulsar técnico, encerrar)
- **THEN** o controle tem alvo de toque de pelo menos 44px de altura, com espaçamento que evita toque acidental
  em alvos adjacentes

#### Scenario: Alvo de toque dos controles de rodada, cor e classificação

- **WHEN** um usuário no mobile (390px) usa as setas/`<select>` do passador de rodadas, o atalho de cor ou o
  gatilho "limpar" do `ColorField`, o link "Ver meus torneios", os botões de modo da classificação ou o
  gatilho de expansão de linha
- **THEN** cada um desses controles tem alvo de toque de pelo menos 44px de altura no mobile, com foco visível

#### Scenario: Densidade do desktop preservada nos controles

- **WHEN** os mesmos controles são vistos em `md+` (desktop)
- **THEN** eles voltam à densidade compacta atual, sem adensar/alargar o layout de desktop
