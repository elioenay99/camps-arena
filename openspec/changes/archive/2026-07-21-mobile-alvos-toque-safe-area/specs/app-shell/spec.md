## ADDED Requirements

### Requirement: Área segura, gesto de rolagem e posição do toast na PWA instalada

O `export const viewport` SHALL declarar `viewportFit: "cover"`, para tornar compensável a
declaração `appleWebApp.statusBarStyle: "black-translucent"` (que faz o conteúdo ocupar a
área da status bar): sem `cover`, todo `env(safe-area-inset-*)` resolve para 0 e o app
invade a área do notch sem reservar espaço nenhum.

Todo elemento fixo ou `sticky` na borda superior SHALL consumir o inset correspondente
(`padding-top: env(safe-area-inset-top)`), de modo a não encostar no notch/status bar. O
`body` SHALL reservar o inset inferior (`padding-bottom: env(safe-area-inset-bottom)`) por
causa da barra de gestos do Android. Fundos puramente decorativos e sem interação MAY
sangrar até a borda física.

O `body` SHALL conter o gesto de rolagem vertical (`overscroll-behavior-y: contain`), para
que o "puxar para baixo" no topo da PWA instalada NÃO recarregue a aplicação inteira
(perdendo estado e refazendo fetch). Essa guarda SHALL NOT alterar a guarda de overflow
horizontal existente (`overflow-x: clip`).

Os toasts SHALL ser ancorados na borda INFERIOR da viewport (`position="bottom-center"`),
não na superior: no mobile o topo é ocupado pelo header persistente (marca, menu, tema,
conta) e um toast ali o cobre por inteiro enquanto dura. A âncora inferior SHALL ser
reavaliada caso alguma tela passe a ter barra de ação fixa no rodapé.

#### Scenario: Header não encosta no notch na PWA instalada

- **WHEN** o app é aberto instalado num aparelho com notch/ilha e o usuário está no
  dashboard ou na demonstração
- **THEN** o header sticky começa abaixo da status bar, reservando o inset superior, em vez
  de ficar por baixo do relógio e da bateria

#### Scenario: Puxar para baixo não recarrega o app

- **WHEN** o usuário puxa a tela para baixo estando no topo de uma página, na PWA instalada
- **THEN** a aplicação não recarrega e o estado da tela é preservado

#### Scenario: Toast não cobre a navegação

- **WHEN** uma ação dispara um toast no mobile
- **THEN** o toast aparece na parte de baixo da tela e a marca, o menu de seções, o
  alternador de tema e o avatar da conta permanecem visíveis e acionáveis

#### Scenario: Navegador comum sem área segura não muda

- **WHEN** o app é aberto num navegador de desktop ou num aparelho sem notch
- **THEN** todos os `env(safe-area-inset-*)` resolvem 0 e o layout permanece idêntico ao
  atual
