## ADDED Requirements

### Requirement: Alvos de toque de ao menos 44px no mobile

Os controles interativos base (`Input` e `Button` no tamanho padrão) SHALL ter
altura mínima de 44px em telas de mobile e MAY manter a densidade compacta
(32px) a partir de `md`. A regra SHALL ser aplicada na fonte dos primitivos
(`h-11 md:h-8`) para que todos os formulários e CTAs herdem o alvo adequado sem
ajuste por chamada.

#### Scenario: Formulário de auth em 390px

- **WHEN** um usuário abre login/cadastro/recuperar-senha num celular (390px)
- **THEN** cada campo de texto e o botão primário têm ao menos 44px de altura de
  toque

#### Scenario: Densidade do desktop preservada

- **WHEN** as mesmas telas são vistas em `md+` (desktop)
- **THEN** inputs e botões padrão voltam à altura compacta atual (32px), sem
  adensar/alargar o layout de desktop

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
