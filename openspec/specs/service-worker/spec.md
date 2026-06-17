# service-worker Specification

## Purpose
Camada de runtime da PWA (Fase 2): um service worker que provê fallback offline e
cache de assets públicos, sem nunca persistir HTML ou dados de usuário no dispositivo.
## Requirements
### Requirement: Registro do service worker

A aplicação SHALL registrar um service worker servido como arquivo estático em
`/sw.js`, com `scope: "/"` e `updateViaCache: "none"`, a partir de um componente
client. O registro SHALL ocorrer APENAS em produção (`NODE_ENV === "production"`) e
SOMENTE quando `navigator.serviceWorker` existir, para não interferir no
desenvolvimento (HMR) nem em navegadores sem suporte. O service worker SHALL ser
versionado e, ao ativar, SHALL remover os caches de versões anteriores.

#### Scenario: SW registra em produção

- **WHEN** a aplicação em produção é aberta num navegador com suporte a service worker
- **THEN** `/sw.js` é registrado com escopo `/`, controla as rotas da aplicação e
  remove caches de versões antigas ao ativar

#### Scenario: SW não registra em desenvolvimento

- **WHEN** a aplicação roda em desenvolvimento (`pnpm dev`)
- **THEN** o service worker NÃO é registrado, preservando o hot-reload

### Requirement: Fallback offline para navegação

O service worker SHALL tratar requisições de navegação (HTML) como **network-only com
fallback offline**: SHALL buscar sempre da rede e, em caso de falha (sem conexão),
SHALL responder com a página `/offline.html` previamente cacheada; se essa página NÃO
estiver no cache, SHALL responder com um HTML mínimo sintético (status 503) — em
NENHUMA hipótese SHALL retornar um erro de rede. O service worker NÃO SHALL gravar
respostas de navegação no cache — para não congelar o nonce de CSP nem persistir
conteúdo autenticado/PII no dispositivo. A página `/offline.html` SHALL ser estática,
same-origin e auto-contida (sem dependências externas), SHALL ser precacheada na
instalação, e SHALL recarregar automaticamente ao evento `online`.

#### Scenario: Navegação offline cai na página de fallback

- **WHEN** o usuário, sem conexão, navega para uma rota da aplicação
- **THEN** o service worker responde com a página `/offline.html` estilizada, em vez
  da tela de erro padrão do navegador

#### Scenario: Fallback nunca vira erro de rede

- **WHEN** o usuário navega offline e `/offline.html` não está no cache (precache
  falho, poda por quota, storage limpo)
- **THEN** o service worker responde com um HTML mínimo sintético (503), nunca um
  erro de rede

#### Scenario: Página offline reage à reconexão

- **WHEN** a conexão volta enquanto a página `/offline.html` está aberta
- **THEN** a página recarrega sozinha (evento `online`), sem exigir clique manual

#### Scenario: HTML nunca é servido do cache

- **WHEN** o usuário navega para uma rota estando online
- **THEN** o HTML é buscado da rede e NÃO é gravado em cache, preservando o nonce de
  CSP por request e evitando persistir dados privados

### Requirement: Cache restrito a uma allowlist de assets públicos

O service worker SHALL gravar em cache APENAS recursos que casem uma **allowlist
estrita**: requisições same-origin cujo caminho comece com `/_next/static/` ou seja um
ícone de marca conhecido (`/icon-192.png`, `/icon-512.png`, `/icon-maskable.png`).
Para esses, SHALL aplicar `stale-while-revalidate`. Todo o restante SHALL fazer bypass
(network-only, sem gravar), explicitamente incluindo: requisições cross-origin
(Supabase, Storage, realtime, Sentry, analytics), requisições não-`GET` (Server
Actions/mutações), payloads RSC (`_rsc` na query ou header `RSC`), `/_next/image`
(imagens otimizadas), rotas de dados/imagem same-origin (p.ex.
`/dashboard/.../rodada/.../imagem`), route handlers e rotas de autenticação (p.ex.
`/auth/confirm`). A gravação SHALL ocorrer somente para respostas com `status === 200`,
`type === 'basic'`, não redirecionadas e sem `Cache-Control: no-store`, sempre sobre
um clone da resposta. **Nenhum dado de usuário SHALL ser persistido no cache.**

#### Scenario: Asset estático da allowlist é servido do cache e revalidado

- **WHEN** o usuário revisita a aplicação online e um asset `/_next/static/*` já está
  em cache
- **THEN** o service worker serve a cópia em cache imediatamente e revalida em
  background

#### Scenario: Imagem da rodada e dados nunca são cacheados

- **WHEN** a aplicação busca a imagem da rodada (`/dashboard/.../imagem`), uma imagem
  otimizada (`/_next/image`), uma Server Action, um fetch RSC ou uma chamada ao
  Supabase
- **THEN** o service worker não grava nenhuma dessas respostas (não casam a allowlist),
  garantindo que placares, avatares e demais dados privados não fiquem no dispositivo

#### Scenario: Rotas de autenticação não passam pelo cache

- **WHEN** o navegador acessa `/auth/confirm` (GET same-origin com token de uso único)
- **THEN** o service worker faz bypass (fora da allowlist) e nada com token/cookie é
  gravado

### Requirement: Headers e isolamento do service worker

A configuração SHALL servir `/sw.js` com `Content-Type` de JavaScript,
`Cache-Control: no-cache, no-store, must-revalidate` (para que novas versões cheguem
sem ficar presas em cache do navegador) e uma CSP própria restrita
(`default-src 'self'; script-src 'self'`). A configuração SHALL servir `/offline.html`
com uma CSP estática que permita seu estilo inline (`style-src 'unsafe-inline'`) e seu
script de reconexão por hash (`script-src 'sha256-…'`), sem depender de nonce. As rotas
`/sw.js` e `/offline.html` SHALL ser excluídas do matcher do proxy, de modo a NÃO
receberem a CSP por nonce nem o ciclo de sessão (`updateSession`); rotas que apenas
compartilhem prefixo (p.ex. `/swag`, `/offline-foo`, `/swxjs`, `/offline_html`) SHALL
continuar passando pelo gate.

#### Scenario: `/sw.js` não é cacheado pelo navegador

- **WHEN** o navegador requisita `/sw.js`
- **THEN** a resposta traz `Cache-Control: no-store` e a CSP própria do worker, e a
  rota não passa pelo proxy de sessão/nonce

#### Scenario: Página offline renderiza com seu estilo e script

- **WHEN** a página `/offline.html` é exibida (servida do cache do worker)
- **THEN** seu `<style>` inline e seu `<script>` de reconexão (autorizado por hash)
  funcionam, sem depender de um nonce que não existe offline

#### Scenario: Rota vizinha não é isentada por engano

- **WHEN** uma requisição chega a uma rota que só compartilha prefixo (p.ex. `/swag`
  ou `/offline_html`)
- **THEN** ela continua passando pelo matcher do proxy (CSP + sessão), pois a exclusão
  casa apenas `/sw.js` e `/offline.html` exatos

### Requirement: Recebimento e clique de notificações push

O service worker SHALL escutar o evento `push` e, ao recebê-lo, SHALL exibir uma
notificação (`showNotification`) com título, corpo, ícone da marca e os dados da
mensagem (incluindo a URL de destino), envolvendo a exibição em `event.waitUntil`. O
service worker SHALL escutar o evento `notificationclick` e, ao clique, SHALL fechar a
notificação e focar uma aba já aberta na URL de destino ou abrir uma nova. Esses
listeners SHALL ser ortogonais ao tratamento de `fetch`/cache: NÃO SHALL ler nem gravar
o Cache Storage nem alterar a estratégia de navegação/allowlist.

#### Scenario: Push exibe notificação

- **WHEN** o navegador entrega um evento `push` ao service worker
- **THEN** uma notificação da marca é exibida com o título/corpo da mensagem, sem tocar
  no cache

#### Scenario: Clique abre a página de destino

- **WHEN** o usuário clica na notificação
- **THEN** uma aba já aberta na URL de destino é focada, ou uma nova é aberta nessa URL
