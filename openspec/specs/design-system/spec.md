# design-system Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Fundação Next.js com TypeScript strict
A aplicação SHALL ser um projeto Next.js 16 com App Router, diretório `src/` e TypeScript em modo `strict`.

#### Scenario: Build de produção íntegro
- **WHEN** `pnpm build` é executado
- **THEN** o build compila sem erros de tipo e gera as rotas estáticas

### Requirement: Design system com temas claro e escuro

A aplicação SHALL usar shadcn/ui (base Radix) com CSS variables e SHALL oferecer alternância entre tema claro e escuro, com escuro como padrão. A paleta SHALL carregar duas identidades por tema: no tema ESCURO (padrão), a paleta **Dracula** — fundo slate (`#282a36`), `primary` roxo (`#bd93f9`) de marca e acentos neon nos charts; no CLARO, a paleta **Seleção Brasileira/Canarinho** — `primary` verde da bandeira sobre branco quente, com AMARELO canarinho nos acentos (secondary/accent) e no glow de atmosfera, e azul de apoio. As cores de TEXTO/superfícies SHALL atender contraste WCAG AA (4.5:1 texto normal) em AMBOS os temas. A conquista (campeão, 1º lugar, disputa de 3º) SHALL usar dois tokens: `gold` para preenchimento/borda/glow (canarinho vivo no claro) e `gold-ink` para o TEXTO/ícone dourado (âmbar escuro legível no claro, amarelo no escuro), de modo que o dourado-texto atenda AA — usados EXCLUSIVAMENTE para conquistas. A tipografia SHALL combinar uma família display (Space Grotesk, via `next/font`, exposta como `font-display`) para marca/títulos/placares com a família de corpo existente. A aplicação SHALL ter favicon/ícone próprios (`app/icon.svg`), cuja marca fixa (favicon + card de OG) SHALL refletir a identidade do tema padrão (roxo Dracula). Animações decorativas novas SHALL respeitar `prefers-reduced-motion`.

#### Scenario: Tema escuro Dracula por padrão

- **WHEN** um visitante acessa a aplicação pela primeira vez
- **THEN** o tema escuro Dracula (slate + roxo de marca) é aplicado por padrão

#### Scenario: Alternância para o claro Seleção

- **WHEN** o usuário aciona o controle de tema
- **THEN** a interface alterna para o claro "seleção brasileira" (verde de marca sobre branco) sem recarregar, mantendo contraste AA

#### Scenario: Dourado é exclusivo de conquista

- **WHEN** qualquer superfície usa o token gold
- **THEN** o uso corresponde a campeão, 1º lugar ou disputa de 3º — nunca a elementos neutros

#### Scenario: Movimento reduzido respeitado

- **WHEN** o sistema do usuário declara prefers-reduced-motion
- **THEN** animações decorativas (backdrop, entrada, placar cinético, brilho de troféu) não são aplicadas

### Requirement: Ambiente de desenvolvimento em Docker
O projeto SHALL fornecer um ambiente Docker local que sobe o servidor de desenvolvimento com hot reload.

#### Scenario: Subir app em dev via Docker
- **WHEN** `docker compose up` é executado
- **THEN** a aplicação fica disponível em `http://localhost:3000` com hot reload ativo

### Requirement: Componente UserAvatar

O design system SHALL ter um `UserAvatar` reutilizável para a identidade visual
de PESSOAS (distinto do `TeamCrest`, que é de clubes). Com URL de foto, SHALL
renderizar a imagem via `next/image` (recortada em círculo); sem URL ou em erro
de carregamento, SHALL cair para um placeholder com as iniciais do nome e uma
cor estável derivada do nome. É decorativo (`aria-hidden`): o nome acompanha em
texto onde for usado.

#### Scenario: Com foto

- **WHEN** o usuário tem `avatar` definido
- **THEN** o `UserAvatar` mostra a foto recortada em círculo

#### Scenario: Sem foto

- **WHEN** o usuário não tem `avatar` (ou a imagem falha)
- **THEN** o `UserAvatar` mostra as iniciais sobre a cor estável do nome

### Requirement: Atmosfera, profundidade e movimento da marca

O app SHALL oferecer uma atmosfera de "estádio" reutilizável (`StadiumBackdrop`: holofote + gramado em perspectiva + grão), decorativa (`aria-hidden`, `pointer-events: none`), presente no shell autenticado e nas telas de autenticação, recolorida pelo `--primary` de cada tema. Os cards do interior do app SHALL ter profundidade consistente (sombra em camadas + anel da marca) via utilitário compartilhado. O sistema SHALL prover primitivos de movimento — entrada escalonada de listas, placar cinético que anima apenas quando o número muda, e brilho de conquista no 1º lugar/campeão — todos zerados sob `prefers-reduced-motion`.

#### Scenario: Interior do app com atmosfera (não preto chapado)

- **WHEN** uma página autenticada (painel, torneios) ou de auth é renderizada
- **THEN** o fundo exibe a atmosfera de estádio sutil e os cards têm elevação visível

#### Scenario: Placar cinético só na mudança

- **WHEN** o placar ao vivo muda via Realtime (gol)
- **THEN** o número anima (pulo + destaque) uma vez; no carregamento inicial NÃO anima

#### Scenario: Brilho de conquista no campeão

- **WHEN** a classificação tem um 1º lugar ou a chave decide o campeão
- **THEN** a linha/badge do campeão recebe o brilho dourado de troféu (estático sob prefers-reduced-motion)

### Requirement: Índice de torneios com hierarquia visual

O índice de torneios SHALL apresentar cada torneio como um card com ícone do formato (liga, mata-mata, grupos, fase de liga, avulso), título, rótulo do formato e uma pílula de status (com indicador vivo quando "ativo"). O estado vazio SHALL ser convidativo, com chamada para criar o primeiro torneio.

#### Scenario: Torneio listado como card com formato

- **WHEN** o usuário tem torneios no índice
- **THEN** cada um aparece como card com o ícone do seu formato e a pílula de status

#### Scenario: Estado vazio convida à criação

- **WHEN** o usuário não tem torneios
- **THEN** o índice mostra um estado vazio com CTA para criar o primeiro torneio

### Requirement: Identidade nominal da marca

A aplicação SHALL usar o nome **Goliseu** como marca em toda superfície visível ao
usuário: o wordmark (`GOLISEU·` com o ponto no `--primary`), os títulos de página
e metadados de SEO/OG (`siteName`, `og:title`, `twitter:title`), e a cópia que
nomeia o produto. O símbolo da marca SHALL ser um escudo hexagonal contendo o
glifo "G", reutilizado no favicon (`app/icon.svg`) e no componente de marca
inline (que herda `currentColor`), mantendo a cor fixa roxa Dracula (`#bd93f9`) no
favicon e no card de OG estático. Nenhuma superfície visível SHALL exibir o nome
anterior ("Arena").

#### Scenario: Wordmark e símbolo coerentes

- **WHEN** o usuário vê o hero de autenticação, a landing ou o header do dashboard
- **THEN** o wordmark exibe `GOLISEU·` e o escudo contém o glifo "G"

#### Scenario: Metadados refletem a marca

- **WHEN** um link do app é compartilhado ou indexado
- **THEN** o `siteName`/título e o card de OG nomeiam "Goliseu", sem citar "Arena"

### Requirement: Instalabilidade como PWA

A aplicação SHALL fornecer um Web App Manifest (`app/manifest.ts`) com nome
"Goliseu", `display: "standalone"`, `start_url` raiz, idioma pt-BR e cores de
marca (fundo Dracula slate, tema roxo), além de ícones de aplicativo nos tamanhos
192 e 512 e um ícone `maskable` com safe-zone para recorte adaptativo. A aplicação
SHALL fornecer um `apple-icon` com fundo opaco para a tela inicial do iOS, e SHALL
declarar `theme_color`/`themeColor` coerente com o tema (escuro por padrão). Esses
recursos SHALL ser same-origin e permitidos pela política de segurança de conteúdo.
A aplicação instalada SHALL degradar graciosamente sem conexão por meio de um service
worker (ver capability `service-worker`), que provê uma página de fallback offline e
cache de assets estáticos; a instalação em si NÃO SHALL depender de conexão offline.

#### Scenario: Convite a instalar no celular

- **WHEN** a aplicação é aberta em um navegador móvel compatível
- **THEN** o manifest e os ícones são servidos (same-origin, dentro da CSP) e o
  navegador oferece "Adicionar à tela inicial" com o nome e o ícone do Goliseu

#### Scenario: Ícone adaptativo não é recortado

- **WHEN** o sistema aplica máscara adaptativa ao ícone (Android)
- **THEN** o escudo permanece dentro da safe-zone do ícone `maskable`, sem corte

#### Scenario: App instalado abre sem conexão

- **WHEN** o usuário abre o Goliseu instalado estando sem rede
- **THEN** em vez da tela de erro do navegador, o service worker exibe a página de
  fallback offline da marca

### Requirement: Apresentação da tela de conta

A tela de Conta SHALL aplicar o idioma visual do design system: cada seção
(perfil, alterar senha) SHALL ter um cabeçalho com ícone em destaque e título em
tipografia de display, o avatar SHALL ter um realce sutil, e os cards SHALL ocupar
a largura do conteúdo de forma coerente. A apresentação SHALL ser operável no
viewport de celular (390px) e NÃO SHALL alterar o `UserAvatar`, os formulários
(nomes dos campos, validação) nem as ações de perfil/avatar/senha.

#### Scenario: Seções com cabeçalho iconado

- **WHEN** a tela de conta é aberta
- **THEN** as seções de perfil e de alterar senha mostram um ícone em destaque e o
  título em tipografia de display

#### Scenario: Apresentação não altera comportamento

- **WHEN** o usuário edita o perfil, troca o avatar ou altera a senha
- **THEN** o comportamento (ações, nomes de campo, validação, UserAvatar) permanece
  como antes, apenas com a nova moldura visual

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

### Requirement: Alvos de toque de ao menos 44px no mobile

Os controles interativos base (`Input`, `SelectNative` e `Button`) SHALL ter altura mínima
de 44px em telas de mobile e MAY manter a densidade compacta a partir de `md`. A regra
SHALL ser aplicada na fonte dos primitivos (padrão `h-11 md:h-8`) para que todos os
formulários e CTAs herdem o alvo adequado sem ajuste por chamada.

Os `<select>` do app SHALL usar o primitivo `SelectNative` em vez de repetir as classes do
campo por chamada. O elemento SHALL permanecer o `<select>` nativo do sistema operacional —
acessível por teclado sem código, leve, e no mobile abrindo a roleta do SO, o que importa
em listas longas. Uma chamada MAY sobrescrever a densidade de `md+` via `className` quando
a superfície tiver geometria própria, mas SHALL NOT baixar o alvo de toque do mobile.

A regra SHALL valer para TODAS as variantes de tamanho do `Button` que representam ação
comum — `default`, `sm`, `lg`, `icon`, `icon-sm` e `icon-lg` —, não apenas para `default`.
Cada uma SHALL declarar o alvo mobile sem prefixo e restaurar a densidade de desktop com
`md:`, preservando exatamente a altura atual em `md+`.

Os tamanhos SHALL ser monotônicos em ambos os breakpoints: `xs ≤ sm ≤ default ≤ lg` (e
analogamente para as variantes de ícone). Em particular `lg` SHALL NOT ser menor que
`default` no mobile — uma variante de ênfase menor que a padrão contradiz o próprio nome.

As variantes `xs` e `icon-xs` SHALL permanecer FORA dessa regra: são a válvula de densidade
extrema (24px) para contextos não-críticos, e a CHAMADA que as utiliza SHALL ser
responsável por garantir um alvo adequado quando o controle for ação de toque no mobile.

#### Scenario: Formulário de auth em 390px

- **WHEN** um usuário abre login/cadastro/recuperar-senha num celular (390px)
- **THEN** cada campo de texto e o botão primário têm ao menos 44px de altura de
  toque

#### Scenario: Dropdown atinge o alvo no mobile

- **WHEN** um `<select>` é renderizado no celular em qualquer wizard ou formulário
- **THEN** o alvo de toque tem ao menos 44px, e volta à altura compacta da superfície em
  `md+`

#### Scenario: Densidade do desktop preservada

- **WHEN** as mesmas telas são vistas em `md+` (desktop)
- **THEN** inputs e botões padrão voltam à altura compacta atual (32px), sem
  adensar/alargar o layout de desktop

#### Scenario: Botão secundário e botão de ícone atingem o alvo no mobile

- **WHEN** um botão `size="sm"` (como "Entrar" da landing ou "Criar conta" da demo) ou um
  botão `size="icon"`/`size="icon-sm"` (como o alternador de tema do header) é renderizado
  no mobile
- **THEN** o alvo de toque tem ao menos 44px, e volta à altura compacta de hoje em `md+`

#### Scenario: Variante de ênfase não é menor que a padrão

- **WHEN** um botão `size="lg"` e um `size="default"` são comparados no mesmo breakpoint
- **THEN** o `lg` é maior ou igual ao `default`, tanto no mobile quanto no desktop

#### Scenario: Densidade extrema continua disponível

- **WHEN** uma superfície precisa de um controle de densidade extrema e usa `xs`/`icon-xs`
- **THEN** a variante mantém os 24px e a chamada assume a responsabilidade pelo alvo de
  toque, sobrescrevendo o tamanho quando o controle for ação de toque no mobile

### Requirement: Modal rolável com header e rodapé fixos

O `Dialog` base SHALL limitar sua altura à viewport (`max-h-[calc(100dvh-2rem)]`,
usando `dvh`) e SHALL rolar apenas o conteúdo central, mantendo o cabeçalho, o
rodapé (`DialogFooter`) e o botão de fechar sempre visíveis e alcançáveis. Nenhum
botão de ação SHALL ficar fora da tela quando o conteúdo do modal excede a altura
disponível (inclusive com o teclado virtual aberto).

#### Scenario: Modal alto no celular

- **WHEN** um modal cujo conteúdo excede a altura da tela é aberto em 390px (ex.:
  lançar placar no modo proposta)
- **THEN** o miolo rola verticalmente e os botões de ação do rodapé permanecem
  visíveis e clicáveis

### Requirement: Cluster de botões que empilha no mobile

Um cluster com vários botões SHALL empilhar em largura total no mobile e voltar
inline no desktop, sem estourar a largura da viewport, aplicando o padrão no
container (seletor sobre `data-slot="button"`) sem alterar os botões-folha. O
padrão SHALL NOT afetar botões renderizados dentro de um `Dialog` (portalado).

#### Scenario: Cluster de ações num card estreito

- **WHEN** um card com 3+ botões de ação é exibido em 390px
- **THEN** os botões empilham full-width (alvos grandes) e nenhum é cortado na
  borda; em `sm+` eles voltam à largura natural inline

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

### Requirement: Primitivo de Popover acessível

O design system SHALL fornecer um primitivo de `Popover` reutilizável, construído
como wrapper shadcn sobre o `Popover` do pacote `radix-ui` (já instalado), sem
adicionar dependência nova. O primitivo SHALL expor `Popover`, `PopoverTrigger`,
`PopoverContent` e `PopoverAnchor`. O conteúdo SHALL abrir por **clique/toque** e
por **teclado** (`Enter`/`Espaço` no gatilho) — NÃO por `hover`, já que o uso é
mobile-first e `hover` não existe no toque. O gatilho SHALL expor
`aria-haspopup` e `aria-expanded` (herdados do Radix), o foco SHALL ser gerenciado
pelo Radix, e o conteúdo SHALL fechar por `Esc` e por clique-fora. O
`PopoverContent` SHALL usar os tokens `--popover`/`--popover-foreground`, com
contraste WCAG AA nos DOIS temas (Dracula no escuro, Canarinho no claro), e SHALL
ser renderizado em portal com as animações de entrada/saída padrão do shadcn.

#### Scenario: Popover abre por clique/toque

- **WHEN** um usuário aciona o gatilho de um Popover por clique ou toque
- **THEN** o conteúdo do Popover é exibido e o gatilho passa a expor
  `aria-expanded="true"`

#### Scenario: Popover operável por teclado e leitor de tela

- **WHEN** um usuário navega até o gatilho por teclado e o aciona (`Enter`/`Espaço`)
- **THEN** o conteúdo abre com foco gerenciado, o gatilho expõe
  `aria-haspopup`/`aria-expanded`, e `Esc` fecha o Popover

#### Scenario: Popover respeita os temas

- **WHEN** o Popover é exibido no tema escuro (Dracula) e no claro (Canarinho)
- **THEN** o conteúdo usa `--popover`/`--popover-foreground` com contraste AA em
  ambos os temas

### Requirement: Primitiva de celebração/confete cor-aware e opt-out

O design system SHALL prover uma primitiva de celebração reusável (keyframes de burst
em `globals.css` + componente client) que aceita a COR do campeão (via CSS custom
property) para colorir o confete, em vez de uma cor fixa. O keyframe SHALL ter um nome
NOVO e distinto (ex.: `hs-burst`) para não colidir com o `hs-confetti`/`@keyframes
hs-confetti` já existente (loop infinito do hero da landing). Seguindo a convenção
opt-out da folha, o novo keyframe SHALL ser adicionado ao bloco
`@media (prefers-reduced-motion: reduce)`, e o componente SHALL checar
`matchMedia('(prefers-reduced-motion: reduce)')` para nem montar o confete quando o
usuário pede menos movimento (defesa em profundidade). A primitiva NÃO SHALL depender
de biblioteca externa nova.

#### Scenario: Confete usa a cor do campeão
- **WHEN** a celebração é disparada com a cor de um campeão
- **THEN** o confete é renderizado nessa cor (não numa cor fixa genérica)

#### Scenario: Reduced-motion não anima
- **WHEN** `prefers-reduced-motion: reduce` está ativo
- **THEN** os keyframes ficam neutralizados e o componente não monta o confete

### Requirement: Piso de 16px de fonte em campo editável no mobile

Todo elemento que recebe digitação ou foco de edição SHALL ter `font-size` computada de ao
menos 16px em telas de mobile — `input`, `select` e `textarea` —, e MAY voltar à densidade
compacta a partir de `md`. O Safari/iOS amplia a viewport automaticamente ao
focar um campo com fonte menor que 16px e NÃO desfaz o zoom ao sair do campo; na PWA
instalada não há barra de endereço para reancorar a escala, então o app simplesmente
permanece ampliado.

A regra SHALL ser aplicada na fonte dos primitivos, não por chamada: `Input`, `Textarea` e
`SelectNative` SHALL declarar `text-base md:text-sm` (ou densidade `md:` equivalente), e
toda superfície SHALL usar o primitivo em vez de recriar as classes do campo. Uma chamada
com geometria deliberadamente própria MAY manter suas classes, mas SHALL declarar o piso de
16px do mesmo jeito.

O app SHALL NOT tentar suprimir o zoom por `viewport` (`user-scalable=no`,
`maximum-scale=1`): isso remove o pinch-zoom do usuário, que é recurso de acessibilidade, e
é ignorado pelo iOS moderno. O piso de fonte é a única correção legítima.

A regra SHALL NOT se aplicar a elementos que não recebem digitação — botões, rótulos,
badges, `<option>` e `<input type="color">` —, porque o zoom do iOS só dispara em campo
editável focado.

#### Scenario: Tocar num dropdown do wizard não amplia a página

- **WHEN** o usuário abre o wizard de pirâmide, o wizard de copa ou o formulário de nova
  partida no celular (390px) e toca em qualquer dropdown
- **THEN** a página não é ampliada e permanece na escala original depois que o campo perde
  o foco

#### Scenario: Campo de cor hexadecimal não amplia a página

- **WHEN** o usuário toca no campo `#rrggbb` da identidade do torneio, das cores da
  pirâmide ou das cores por divisão, no celular
- **THEN** a página não é ampliada, e o seletor de cor ao lado continua abrindo o picker do
  sistema operacional normalmente

#### Scenario: Densidade do desktop preservada

- **WHEN** as mesmas telas são vistas em `md+`
- **THEN** campos e dropdowns voltam à fonte e à altura compactas de hoje, sem adensar nem
  alargar o layout de desktop

### Requirement: Escudo de clube degrada para iniciais, nunca para imagem quebrada

O componente de escudo SHALL exibir o placeholder de iniciais + cor estável derivada do
nome sempre que a imagem do escudo não estiver disponível, e SHALL NOT deixar o navegador
exibir o glifo nativo de "imagem quebrada".

A detecção de falha SHALL NOT depender exclusivamente do evento `error`: além do handler,
o componente SHALL checar no mount o estado terminal do próprio elemento
(`complete` verdadeiro e `naturalWidth` igual a zero significam "terminou de carregar e
falhou") e cair no mesmo estado de erro. Ler o estado do elemento é robusto a qualquer
evento perdido, servido de cache ou interceptado pelo service worker — enquanto depender do
evento exige que ele tenha sido disparado, ouvido e não perdido.

O estado de erro SHALL ser reavaliado quando a URL do escudo mudar: uma falha registrada
para uma URL SHALL NOT impedir a tentativa de carregar uma URL diferente na mesma instância
do componente. Superfícies que trocam de conteúdo no lugar (como a navegação entre rodadas)
reaproveitam as instâncias, e sem essa reavaliação um escudo que falhou uma vez ficaria
preso nas iniciais indefinidamente.

O escudo SHALL permanecer decorativo (`aria-hidden`, `alt` vazio) nos dois modos: o nome do
clube acompanha o escudo em texto em toda superfície onde ele aparece.

#### Scenario: Escudo com URL quebrada mostra as iniciais

- **WHEN** uma partida é exibida e a URL do escudo de um dos clubes não carrega, por
  qualquer motivo
- **THEN** aquele lado mostra as iniciais do clube sobre a cor estável dele, e nenhum ícone
  de imagem quebrada aparece

#### Scenario: Falha anterior à montagem também cai no fallback

- **WHEN** a imagem do escudo já terminou de carregar e falhou antes de o componente
  montar, sem que nenhum evento de erro chegue ao componente
- **THEN** o componente detecta o estado terminal do elemento e exibe as iniciais

#### Scenario: Troca de rodada não deixa o escudo preso nas iniciais

- **WHEN** o usuário navega para outra rodada e uma linha que antes exibia um escudo com
  falha passa a exibir um clube com escudo válido
- **THEN** o escudo válido é carregado e exibido, em vez de continuar mostrando iniciais

### Requirement: Identidade legível em linha horizontal densa no mobile

O nome de uma entidade SHALL permanecer legível em 390px de viewport quando exibido numa
linha que também carrega um cluster de badges, pílulas de status ou botões — seja o nome de
competidor, clube, técnico, membro de equipe ou competição.

Um cluster de badges/pílulas/botões SHALL NOT ser declarado `shrink-0` na mesma linha
flex de uma identidade que trunca: isso transfere todo o déficit de espaço para o nome. O
cluster SHALL ou sair da linha da identidade no mobile (segunda faixa, com
`flex-col` revertido em `sm:`/`md:`), ou ser recolhido num disclosure NATIVO
(`<details>`/`<summary>`), ou passar a poder quebrar (`flex-wrap`).

Todo filho de flex que trunca SHALL declarar `min-w-0`; toda coluna de grid que precisa
encolher SHALL usar `minmax(0,1fr)` em vez de `1fr` (que tem `min-width:auto` e não
encolhe).

Quando a identidade tem uma linha SECUNDÁRIA que a desambigua — o autor de uma competição
(`por Fulano`), a origem de uma vaga derivada, o total de jogos que dá sentido a um
agregado — essa linha secundária SHALL sobreviver legível em 390px, não sendo aceitável
que ela seja o elemento sacrificado.

O layout de desktop SHALL permanecer o atual: toda a acomodação é mobile-first e revertida
em `sm:`/`md:`.

#### Scenario: Cluster largo ao lado de um nome em 390px

- **WHEN** uma linha exibe um nome truncável e um cluster de pílulas/botões com mais de
  ~80px de largura fixa, em 390px de viewport
- **THEN** o cluster ocupa uma faixa própria (ou é recolhido) e o nome dispõe da largura
  útil da linha, em vez de ser reduzido a poucos caracteres

#### Scenario: Desktop preservado

- **WHEN** a mesma superfície é exibida em `sm:` ou acima
- **THEN** identidade e cluster voltam à mesma linha, com o layout anterior à mudança

#### Scenario: Linha secundária desambiguadora sobrevive

- **WHEN** a superfície tem competições ou competidores homônimos, distinguíveis apenas
  pela linha secundária (autor, origem da vaga, total de jogos)
- **THEN** essa linha secundária é legível em 390px

### Requirement: Separação entre controles de ação oposta empilhados

Controles de ação OPOSTA e imediata SHALL ter separação visual e de toque no mobile (`gap`
maior que zero entre os alvos) quando empilhados ou adjacentes — subir/descer,
aprovar/rejeitar, somar/subtrair — de modo que a fronteira entre eles não seja uma linha de
tolerância nula sob um polegar (~34-45px de área de contato).

Essa separação SHALL ser mobile-first e PODE ser removida em `md:` para preservar a
compactação do desktop, onde o ponteiro é preciso.

Este requirement é independente do piso de 44px de alvo de toque: um par pode legitimamente
ficar abaixo de 44px por restrição de altura de lista e ainda assim SHALL ter separação.

#### Scenario: Setas de reordenação de desempate

- **WHEN** o par subir/descer de reordenação de empate é exibido no mobile
- **THEN** há espaço real entre os dois alvos, e um toque na borda inferior de "subir" não
  dispara "descer"

### Requirement: Informação essencial não vive apenas em tooltip nativo

Um elemento cuja informação só é obtida por `title="..."` SHALL oferecer, no mobile, um
caminho tocável equivalente — texto visível, `<details>` nativo, ou o padrão de dica já
adotado pelo projeto. Tooltip nativo não abre em toque: em dispositivo tátil a informação
simplesmente não existe.

O atributo `title` PODE ser preservado para o desktop; o que este requirement proíbe é ele
ser o ÚNICO portador da informação.

#### Scenario: Chip de motivo num dispositivo tátil

- **WHEN** um chip indica o motivo de uma decisão (Playoff, Sorteio, Ajuste) e o
  significado está em `title`
- **THEN** no mobile o significado também aparece por um caminho tocável ou em texto
  visível, sem depender de hover

### Requirement: Rótulo de ação nunca é clipado

O rótulo de um controle acionável SHALL permanecer legível por inteiro em 390px de viewport.
Um rótulo SHALL NOT ser cortado sem indicação — nem pela borda do container, nem por
`overflow` sem reticências.

A base de `buttonVariants` declara `whitespace-nowrap shrink-0`. Essa combinação impede
simultaneamente a quebra de linha e o truncamento gracioso: um rótulo mais largo que o
container simplesmente vaza e é cortado nos dois lados. Todo controle cujo rótulo pode
exceder a largura disponível no mobile SHALL desfazer essa combinação localmente, com
`h-auto whitespace-normal max-w-full`, permitindo a quebra em múltiplas linhas.

`h-auto` SHALL acompanhar `whitespace-normal`: as variantes de tamanho fixam altura
(`h-11`, `h-12`), e sem `h-auto` a segunda linha é cortada pela altura em vez de pela
largura.

O piso de alvo de toque de 44px SHALL ser preservado via `min-h-11`.

Este requirement vale com força máxima para o CTA primário de um estado vazio de
onboarding, onde o controle é o único caminho para o valor do produto.

#### Scenario: CTA longo na primeira tela pós-cadastro

- **WHEN** o estado vazio de quem ainda não tem torneios é exibido em 390px
- **THEN** o rótulo completo do CTA é legível, quebrando em mais de uma linha se necessário,
  sem vazar para fora do card

#### Scenario: Altura acompanha a quebra

- **WHEN** um rótulo de botão quebra em duas linhas
- **THEN** o botão cresce em altura para contê-las, em vez de cortar a segunda

### Requirement: Ação de avanço alcançável em formulário longo

Num formulário de múltiplos passos, a ação que avança para o passo seguinte SHALL estar
alcançável sem rolagem prolongada no mobile: ela SHALL ser persistente (`sticky`) na borda
inferior da área de conteúdo, em vez de ser o último elemento do documento.

A barra persistente SHALL ter fundo opaco — `sticky` sobre conteúdo rolante sem fundo deixa
o conteúdo passar por baixo dos controles.

Quando houver outra camada fixa na borda inferior, a barra de ação SHALL ancorar acima dela,
lendo a altura declarada dessa camada em vez de repetir a constante.

A persistência SHALL ser mobile-first e revertida em `sm:` (`sm:static`), preservando o
layout de desktop.

#### Scenario: Passo longo de wizard no mobile

- **WHEN** um passo do wizard empilha campos suficientes para exceder várias telas em 390px
- **THEN** a ação de avanço permanece visível na borda inferior durante toda a rolagem

#### Scenario: Desktop sem barra flutuante

- **WHEN** o mesmo wizard é exibido em `sm:` ou acima
- **THEN** a barra de ação volta ao fluxo do documento, como antes da mudança

### Requirement: Passo ativo identificado no mobile

Um indicador de progresso de múltiplos passos SHALL comunicar, no mobile, EM QUE PASSO o
usuário está — no mínimo o rótulo do passo ATIVO e sua posição na sequência
(ex.: "Passo 2 de 3 · Qualificação").

Barras de progresso puramente gráficas SHALL NOT ser a única informação disponível no
mobile: sem rótulo, o usuário vê apenas segmentos coloridos e não sabe o que está
preenchendo nem quanto falta.

Os rótulos dos passos INATIVOS PODEM permanecer ocultos no mobile por restrição de largura,
desde que o ativo esteja identificado.

#### Scenario: Wizard em 390px

- **WHEN** um wizard de múltiplos passos é exibido em 390px
- **THEN** o rótulo do passo ativo e sua posição na sequência estão visíveis em texto

### Requirement: Aviso obrigatório compacta sem desaparecer

Um aviso obrigatório SHALL permanecer visível em todas as larguras — é o caso da
transparência de que os dados de uma demonstração são fictícios. Ele PODE ser encurtado no
mobile, mas SHALL NOT ser removido, recolhido atrás de um disclosure, nem exibido apenas em
`title`.

A versão curta SHALL preservar o núcleo da informação (que os dados não são reais); a versão
completa SHALL reaparecer a partir de `sm:`.

Faixas persistentes que acompanham todas as páginas de uma subárvore SHALL ser dimensionadas
para não consumir parcela desproporcional da primeira dobra no mobile.

#### Scenario: Faixa da demonstração em 390px

- **WHEN** qualquer página de `/demo` é aberta em 390px
- **THEN** o aviso de dados fictícios está visível em forma curta, e a faixa deixa a maior
  parte da primeira dobra para o conteúdo

#### Scenario: Aviso completo no desktop

- **WHEN** a mesma página é aberta em `sm:` ou acima
- **THEN** a frase completa do aviso é exibida

### Requirement: Detalhe redundante recolhe atrás de disclosure nativo

Informação secundária redundante numa lista longa SHALL poder ser recolhida atrás de um
`<details>`/`<summary>` nativo, em vez de ocupar altura fixa em cada item — redundante aqui
significa que um controle ao lado já atende à função dela.

O recolhimento SHALL NOT remover capacidade: o controle que torna o detalhe redundante
SHALL permanecer disponível sem abrir o disclosure.

O `<summary>` SHALL nomear o que está recolhido, e o disclosure SHALL ser nativo, para que
componentes RSC não precisem virar client components.

#### Scenario: Lista de vagas de um torneio com muitos clubes

- **WHEN** quem modera abre a lista de vagas de um torneio com dezenas de clubes em 390px
- **THEN** cada vaga ocupa a altura da identidade do clube, com o detalhe do convite e as
  ações de moderação recolhidos, e a lista inteira cabe em poucas telas de rolagem

#### Scenario: Capacidade preservada

- **WHEN** o detalhe do link de convite está recolhido
- **THEN** copiar o link continua possível, e o link permanece consultável ao abrir o
  disclosure

### Requirement: Estado de sucesso oferece o próximo passo

O estado terminal de sucesso de um formulário SHALL apresentar a ação seguinte, e SHALL
preservar a moldura visual do formulário que substituiu.

Substituir um formulário inteiro por um parágrafo solto deixa o usuário sem caminho: a
mensagem confirma o que aconteceu, mas não diz o que fazer agora.

A mensagem de sucesso SHALL continuar anunciada por tecnologia assistiva (`role="status"`),
e o conteúdo dela SHALL permanecer inalterado quando a mensagem carrega semântica de
segurança (ex.: resposta idêntica exista ou não a conta, contra enumeração de usuários).

#### Scenario: Cadastro concluído

- **WHEN** o cadastro é concluído com sucesso
- **THEN** a confirmação aparece dentro da moldura do card, acompanhada de uma ação explícita
  para seguir (ir para o login)

#### Scenario: Recuperação de senha solicitada

- **WHEN** o pedido de recuperação de senha é enviado
- **THEN** a mensagem anti-enumeração permanece exatamente a mesma, agora acompanhada da
  ação de voltar ao login

