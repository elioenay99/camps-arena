## MODIFIED Requirements

### Requirement: Alvos de toque de ao menos 44px no mobile

Os controles interativos base (`Input` e `Button`) SHALL ter altura mínima de 44px em telas
de mobile e MAY manter a densidade compacta a partir de `md`. A regra SHALL ser aplicada na
fonte dos primitivos (padrão `h-11 md:h-8`) para que todos os formulários e CTAs herdem o
alvo adequado sem ajuste por chamada.

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
