# app-shell — Delta Spec

## ADDED Requirements

### Requirement: Landing animada na identidade

A landing pública SHALL apresentar uma ilustração SVG animada de estádio/campo no
hero (a arena Goliseu — campo em perspectiva sob refletores, bola até o gol com a
rede estufando) e movimento orquestrado pela página (revelação encadeada na carga
e realces vivos no preview do produto), reforçando a atmosfera "estádio à noite"
sem alterar o comportamento (redireciona logado, falha-segura para visitante,
CTAs de cadastro/entrar). A ilustração SHALL ser decorativa (`aria-hidden`),
mantendo o hero textual como conteúdo acessível, e SHALL ser construída na
identidade existente (tokens de cor + tipografia display atuais, sem fonte/cor
nova). Todo o movimento SHALL respeitar `prefers-reduced-motion` (estado parado e
legível) e atender contraste WCAG AA do texto nos dois temas, em mobile (390px) e
desktop.

#### Scenario: Hero com ilustração animada

- **WHEN** um visitante sem sessão acessa `/`
- **THEN** vê a landing com a ilustração de estádio animada no hero, a entrada
  encadeada da página e o preview do produto com vida, no idioma visual da marca

#### Scenario: Movimento reduzido respeitado

- **WHEN** o sistema do visitante declara `prefers-reduced-motion`
- **THEN** a ilustração e as animações da landing ficam paradas, com a página
  legível e a composição preservada

#### Scenario: Comportamento da landing inalterado

- **WHEN** um usuário autenticado acessa `/`, ou a verificação de sessão falha
- **THEN** o autenticado é redirecionado ao `/dashboard` e a falha cai para
  visitante anônimo, como antes — a animação não altera esse fluxo
