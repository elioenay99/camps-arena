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

