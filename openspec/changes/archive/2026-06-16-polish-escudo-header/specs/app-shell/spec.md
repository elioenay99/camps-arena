# app-shell — delta polish-escudo-header

## MODIFIED Requirements

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
