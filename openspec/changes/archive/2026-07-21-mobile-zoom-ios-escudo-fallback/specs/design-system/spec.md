## ADDED Requirements

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

## MODIFIED Requirements

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
