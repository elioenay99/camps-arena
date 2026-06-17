# design-system — Delta Spec

## MODIFIED Requirements

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
