# service-worker — Delta Spec

## ADDED Requirements

### Requirement: Recebimento e clique de notificações push

O service worker SHALL escutar o evento `push` e, ao recebê-lo, SHALL exibir uma
notificação (`showNotification`) com título, corpo, ícone da marca e os dados da
mensagem (incluindo a URL de destino), envolvendo a exibição em `event.waitUntil`. O
service worker SHALL escutar o evento `notificationclick` e, ao clique, SHALL fechar a
notificação e focar uma aba já aberta na URL de destino ou abrir uma nova. Esses
listeners SHALL ser ortogonais ao tratamento de `fetch`/cache (Fase 2): NÃO SHALL ler
nem gravar o Cache Storage nem alterar a estratégia de navegação/allowlist.

#### Scenario: Push exibe notificação

- **WHEN** o navegador entrega um evento `push` ao service worker
- **THEN** uma notificação da marca é exibida com o título/corpo da mensagem, sem tocar
  no cache

#### Scenario: Clique abre a página de destino

- **WHEN** o usuário clica na notificação
- **THEN** uma aba já aberta na URL de destino é focada, ou uma nova é aberta nessa URL
