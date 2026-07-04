# app-shell Specification

## Purpose
TBD - created by archiving change add-app-nav-e-landing. Update Purpose after archive.
## Requirements
### Requirement: Navegação autenticada persistente
Toda página autenticada SHALL compartilhar um shell com header persistente contendo: a marca (wordmark em tipografia display, linkando para `/dashboard`), a navegação principal com indicação visual da rota ativa (pill do primário; `/dashboard` ativa por igualdade exata, demais por prefixo, com `aria-current`), o alternador de tema e a saída da conta. O header SHALL ser fixo no scroll (sticky) com fundo translúcido (backdrop-blur).

#### Scenario: Navegação visível em todas as páginas autenticadas
- **WHEN** o usuário navega entre dashboard, torneios e demais páginas autenticadas
- **THEN** o header persiste com a marca, os links (ativo destacado com aria-current), o tema e o sair

#### Scenario: Item ativo correto
- **WHEN** o usuário está em uma sub-rota (ex.: /dashboard/torneios/abc)
- **THEN** o item "Torneios" aparece como ativo (prefixo), e "/dashboard" só quando a rota é exatamente ela

### Requirement: Landing pública na raiz
A rota `/` SHALL apresentar o sistema a visitantes (proposta de valor e destaques) com chamadas para "Criar conta" (`/cadastro`) e "Entrar" (`/login`), vestindo a identidade "Estádio à noite": hero em tipografia display com destaque de marca, um PREVIEW do produto renderizado em HTML com os estilos reais (mini-classificação com 1º lugar dourado), e destaques com ícones. Usuário autenticado que acessa `/` SHALL ser redirecionado ao `/dashboard`.

#### Scenario: Visitante vê a apresentação
- **WHEN** alguém sem sessão acessa `/`
- **THEN** vê a landing com a proposta do produto, o preview visual e os botões de cadastro e login

#### Scenario: Logado pula a landing
- **WHEN** um usuário autenticado acessa `/`
- **THEN** é redirecionado ao `/dashboard`

### Requirement: Estados de erro e ausência vestidos com a identidade

As telas de erro de rota e de conteúdo inexistente SHALL ser apresentadas no
idioma visual da identidade dentro do shell autenticado — cartão com elevação
(`.elevate`), entrada suave (`animate-rise`),
chip de ícone (tom destrutivo no erro, tom do primário na ausência) e título em
tipografia display — reaproveitando um componente presentacional compartilhado,
SEM alterar o comportamento (retry/`unstable_retry`, log de `console.error` no
servidor, código de erro `digest`, navegação "Voltar ao painel") nem vazar
detalhes internos ao usuário. O contraste SHALL atender WCAG AA nos dois temas.
O boundary de ÚLTIMO recurso (`global-error`) SHALL permanecer com estilos inline
independentes do CSS do app (sem reaproveitar o design system), por robustez.

#### Scenario: Erro de rota vestido com a identidade

- **WHEN** uma página autenticada falha e cai no error boundary
- **THEN** aparece o cartão de erro com ícone, título em display, mensagem
  amigável e o botão "Tentar novamente" (com o código do erro quando houver),
  sem expor detalhes internos

#### Scenario: Conteúdo inexistente vestido com a identidade

- **WHEN** o usuário acessa um torneio inexistente ou sem acesso
- **THEN** aparece o cartão de ausência (tom neutro) com "Voltar ao painel",
  no mesmo idioma visual

#### Scenario: Último recurso permanece robusto

- **WHEN** o erro escapa até o `global-error` (falha do próprio layout/CSS)
- **THEN** ele renderiza com estilos inline, sem depender do design system do app

### Requirement: Landing animada na identidade

A landing pública SHALL apresentar uma ilustração SVG animada de estádio/campo no
hero (a arena Goliseu — campo em perspectiva sob refletores, bola até o gol com a
rede estufando) e movimento orquestrado pela página (revelação encadeada na carga
e realces vivos no preview do produto), reforçando a atmosfera "estádio à noite"
sem alterar o comportamento (redireciona logado, falha-segura para visitante,
CTAs de cadastro/entrar). O header SHALL exibir o escudo "G" da marca
(`GoliseuMark`) antecedendo o wordmark, com uma entrada de traço (stroke-draw)
na carga e um realce no hover do conjunto da marca. A ilustração e o escudo SHALL
ser decorativos (`aria-hidden`), mantendo o hero textual e o wordmark como
conteúdo acessível, e SHALL ser construídos na identidade existente (tokens de cor
+ tipografia display atuais, sem fonte/cor nova). Todo o movimento SHALL respeitar
`prefers-reduced-motion` (estado parado e legível — o escudo desenhado por
completo) e atender contraste WCAG AA do texto nos dois temas, em mobile (390px) e
desktop.

#### Scenario: Hero com ilustração animada

- **WHEN** um visitante sem sessão acessa `/`
- **THEN** vê a landing com a ilustração de estádio animada no hero, a entrada
  encadeada da página e o preview do produto com vida, no idioma visual da marca

#### Scenario: Escudo da marca animado no header

- **WHEN** um visitante sem sessão acessa `/`
- **THEN** o header exibe o escudo "G" antes do wordmark, com os traços se
  desenhando na carga e um realce (glow/scale) ao passar o cursor sobre a marca

#### Scenario: Movimento reduzido respeitado

- **WHEN** o sistema do visitante declara `prefers-reduced-motion`
- **THEN** a ilustração e as animações da landing ficam paradas, com a página
  legível e a composição preservada — o escudo da marca aparece desenhado por
  completo e estático

#### Scenario: Comportamento da landing inalterado

- **WHEN** um usuário autenticado acessa `/`, ou a verificação de sessão falha
- **THEN** o autenticado é redirecionado ao `/dashboard` e a falha cai para
  visitante anônimo, como antes — a animação não altera esse fluxo

### Requirement: Navegação do dashboard colapsa em menu no mobile

A navegação do dashboard SHALL colapsar num menu acionado por um botão
(hambúrguer) no mobile e SHALL permanecer inline (links lado a lado) a partir de
`sm`/`md`. A barra cobre Painel/Torneios/Ligas/Copas/Explorar/Nova partida. O
menu mobile SHALL: destacar a seção ativa, fechar ao navegar e ao tocar fora,
expor `aria-expanded`/`aria-controls` no botão de acionamento, e oferecer alvos de
toque de ao menos 44px. O toggle de tema, o avatar da conta e "Sair" SHALL
permanecer acessíveis no cabeçalho. Nenhuma dependência nova SHALL ser
introduzida.

#### Scenario: Cabeçalho enxuto no celular

- **WHEN** o dashboard é aberto em 390px
- **THEN** as seções ficam atrás de um botão de menu (hambúrguer) e o cabeçalho não
  quebra em múltiplas linhas de pills

#### Scenario: Navegar pelo menu mobile

- **WHEN** o usuário abre o menu e toca numa seção
- **THEN** navega para a seção e o menu fecha; a seção atual aparece destacada

### Requirement: Guarda global de overflow horizontal

O `body` SHALL impedir a rolagem horizontal acidental da viewport inteira
(`overflow-x: clip`), como rede de segurança. Essa guarda SHALL NOT substituir os
consertos por-elemento (containers largos como tabelas e bracket continuam
isolando o próprio scroll interno).

#### Scenario: Elemento largo isolado não rola a página toda

- **WHEN** algum conteúdo excede a largura da tela num ponto não previsto
- **THEN** a página como um todo não rola horizontalmente (a guarda contém o
  vazamento), enquanto os containers com scroll próprio seguem funcionando

### Requirement: Links do dashboard para rotas RSC caras não disparam prefetch em massa

Os links do dashboard que apontam para rotas RSC caras (páginas `[id]` de torneio, liga, copa ou competidor) e aparecem em QUANTIDADE — seja porque a navegação do header está presente em toda página, seja porque um índice/lista renderiza N `<Link>` no viewport — NÃO SHALL disparar prefetch automático ao abrir a página. O `<Link>` do App Router (Next 16) prefetcha ao entrar no viewport por padrão (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:298`); com dezenas de links simultâneos, a rajada de requisições RSC concorrentes é DESCARTADA pela borda da Vercel antes de invocar a função (HTTP 503), mesmo com o backend saudável. Esses links SHALL usar `prefetch={false}` (App Router: "never happen both on entering the viewport and on hover" — `link.md:304`), eliminando a rajada; a navegação por CLIQUE SHALL permanecer intacta (o Next busca a rota-alvo na hora do clique). Nos componentes `<Button asChild><Link>`, a prop SHALL ir no `<Link>` interno.

O ajuste SHALL cobrir: a navegação do header (`NavLinks`, as rotas de seção presentes em toda página — maior alavanca), os links "Abrir …" para rota de torneio (na página da liga e nos painéis de playoff e de grande final), os cards dos índices/vitrine (torneios, ligas, copas, "Explorar"), a lista de edições na página da copa (cada edição aponta para `copas/edicao/[id]`, que renderiza bracket + classificação — RSC cara), e o link do título do torneio no card de partida. Os links que aparecem UM por página e apontam para rotas leves (botões "Nova/Criar/Novo" de formulário, a marca e o avatar do shell, links já dentro de páginas de detalhe `[id]`) SHALL permanecer com o prefetch padrão — não formam rajada e o prefetch é boa UX.

#### Scenario: Abrir uma página do dashboard não prefetcha as rotas de seção do header

- **WHEN** um usuário logado abre qualquer página do dashboard (o header com a
  navegação principal aparece em todas)
- **THEN** nenhuma das ~6 rotas de seção do header é prefetchada ao entrar no viewport
  (cada `<Link>` da nav usa `prefetch={false}`), evitando a rajada em toda navegação

#### Scenario: Abrir um índice de lista não dispara N prefetches das rotas [id]

- **WHEN** o usuário abre um índice/vitrine (torneios, ligas, copas ou "Explorar") com
  vários itens no viewport
- **THEN** nenhum dos cards prefetcha sua rota-alvo `[id]` (RSC cara) ao entrar no
  viewport, evitando a rajada de prefetches que a borda da Vercel descartava (503)

#### Scenario: Abrir a página de uma copa não prefetcha as edições em massa

- **WHEN** o usuário abre a página de uma copa com várias edições listadas no viewport
- **THEN** nenhuma edição prefetcha sua rota `copas/edicao/[id]` (bracket +
  classificação, RSC cara) ao entrar no viewport, evitando a rajada de prefetches que a
  borda da Vercel descartava (503)

#### Scenario: Clicar num link ainda navega normalmente

- **WHEN** o usuário clica num link de seção do header ou num card de lista/"Abrir …"
- **THEN** a navegação leva à rota-alvo normalmente (o clique busca a rota na hora),
  mesmo sem prefetch prévio

#### Scenario: Links leves de uma-ocorrência mantêm o prefetch padrão

- **WHEN** a página renderiza um link que aparece uma vez e aponta para rota leve
  (botão "Novo/Criar", a marca ou o avatar do shell)
- **THEN** esse link mantém o prefetch padrão do App Router (não forma rajada; o
  prefetch melhora a navegação)

### Requirement: Links de header, de gestão e back-links para rotas RSC caras não disparam prefetch

Os links de TOPO do shell autenticado — a marca e o avatar do header (presentes em TODA página do dashboard), os botões de gestão "Equipe" e "Identidade"/"Cores" (nas telas de liga e de torneio) e os back-links isolados que apontam para uma rota RSC cara ("Voltar à pirâmide"/"Ver liga" e o back da página do competidor) — NÃO SHALL disparar prefetch automático ao abrir a página. O `<Link>` do App Router (Next 16) prefetcha ao entrar no viewport por padrão (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:298`); mesmo poucos desses links, somados em páginas de alto tráfego, produzem uma rajada residual de requisições RSC concorrentes que a borda da Vercel DESCARTA antes de invocar a função (HTTP 503 ocasional), com o backend saudável. Esses links SHALL usar `prefetch={false}` (App Router: "never happen both on entering the viewport and on hover" — `link.md:304`), eliminando a rajada residual; a navegação por CLIQUE SHALL permanecer intacta (o Next busca a rota-alvo na hora do clique). Nos componentes `<Button asChild><Link>`, a prop SHALL ir no `<Link>` interno.

Os links que apontam para rotas LEVES de formulário (botões "Nova/Criar/Novo") SHALL permanecer com o prefetch padrão — são destino provável e não formam rajada. Este ajuste complementa as changes anteriores (`add-liga-prefetch-fix`, `add-dashboard-prefetch-hardening`), que já cobriram a nav do header, os índices/vitrine, os links "Abrir …" e a `StandingsTable`; nenhum desses SHALL ser re-alterado.

#### Scenario: Abrir qualquer página do dashboard não prefetcha a marca nem o avatar do header

- **WHEN** um usuário logado abre qualquer página do dashboard (o header com a marca
  "GOLISEU" e o avatar aparece em todas)
- **THEN** nem a marca (→ `/dashboard`) nem o avatar (→ `/dashboard/conta`) prefetcham
  sua rota ao entrar no viewport (ambos usam `prefetch={false}`), evitando somar à
  rajada em toda navegação

#### Scenario: Abrir a página de uma liga ou torneio não prefetcha os botões de gestão

- **WHEN** um gestor abre a página de uma liga ou de um torneio (com os botões "Equipe"
  e "Identidade"/"Cores" visíveis)
- **THEN** nenhum desses botões prefetcha sua rota de gestão (`.../equipe`, `.../cores`)
  ao entrar no viewport (cada `<Link>` interno usa `prefetch={false}`), evitando a
  rajada residual que a borda da Vercel descartava (503)

#### Scenario: Abrir uma página com back-link para a pirâmide não o prefetcha

- **WHEN** o usuário abre a página de um competidor ou de um torneio de liga, que
  exibe um back-link para a pirâmide-mãe ("Voltar à pirâmide" / "Ver liga", rota RSC
  cara)
- **THEN** o back-link não prefetcha `ligas/[id]` ao entrar no viewport
  (`prefetch={false}`), evitando somar à rajada residual

#### Scenario: Clicar num link de header, gestão ou back ainda navega normalmente

- **WHEN** o usuário clica na marca, no avatar, num botão de gestão ou num back-link
- **THEN** a navegação leva à rota-alvo normalmente (o clique busca a rota na hora),
  mesmo sem prefetch prévio

#### Scenario: Botões "Novo/Criar" leves mantêm o prefetch padrão

- **WHEN** a página renderiza um botão que aponta para uma rota de formulário leve
  (ex.: "Nova partida")
- **THEN** esse link mantém o prefetch padrão do App Router (destino provável, sem
  rajada; o prefetch melhora a navegação)

