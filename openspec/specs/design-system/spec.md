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
de AÇÃO IRREVERSÍVEL (W.O., expulsar, encerrar, sair) SHALL ter alvo de toque de pelo menos 40px de altura no
mobile, com espaçamento adequado entre alvos adjacentes, sem regredir os botões pequenos legítimos do resto
da interface. O contraste de texto SHALL atender WCAG AA nos dois temas.

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
- **THEN** o controle tem alvo de toque de pelo menos 40px de altura, com espaçamento que evita toque acidental
  em alvos adjacentes

