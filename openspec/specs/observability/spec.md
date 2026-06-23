# observability Specification

## Purpose
TBD - created by archiving change add-sentry-observability. Update Purpose after archive.
## Requirements
### Requirement: Captura de erros e performance via Sentry

A aplicação SHALL capturar exceções não tratadas de Server Components, Server
Actions, route handlers, do proxy e do client, além de tracing de performance
amostrado, enviando ao Sentry. Quando uma Server Action TRATA uma falha
inesperada num `catch` (devolvendo mensagem genérica ao usuário em vez de
propagar), ela SHALL reportar a exceção explicitamente ao Sentry
(`captureException`) com uma tag identificando a action — caso contrário o erro
ficaria invisível, pois `onRequestError` só vê exceções que escapam. Erros de
domínio/validação esperada (motores puros) que viram mensagem ao usuário NÃO
SHALL ser reportados. Na ausência do DSN, a instrumentação SHALL ser no-op (nada
enviado; app, build e dev intactos). Os eventos SHALL trafegar por um túnel
same-origin, mantendo a CSP existente (`connect-src 'self'`).

#### Scenario: Erro de Server Action é capturado

- **WHEN** uma Server Action lança uma exceção em produção com DSN configurado
- **THEN** o erro é registrado no Sentry

#### Scenario: Falha inesperada engolida por catch é reportada

- **WHEN** uma Server Action de escrita captura uma falha inesperada (rede, RPC
  ou INSERT que lança) num `catch` e devolve mensagem genérica ao usuário
- **THEN** a exceção é enviada ao Sentry via `captureException`, com tag da
  action, em vez de desaparecer silenciosamente

#### Scenario: Erro de validação esperada não é reportado

- **WHEN** um motor puro (ex.: geração de tabela/chave) lança por geometria ou
  regra inválida e a action converte em `e.message` ao usuário
- **THEN** nada é enviado ao Sentry (fluxo de domínio normal, não falha)

#### Scenario: No-op sem DSN

- **WHEN** o DSN não está configurado
- **THEN** nada é enviado e a aplicação funciona normalmente

### Requirement: Scrubbing obrigatório de PII

Nenhum evento enviado ao Sentry SHALL conter PII do usuário — em especial o
celular (em qualquer formato BR) e dados de formulário de Server Actions. A
proteção SHALL ter três camadas: `sendDefaultPii: false`, exclusão de
body/cookies/headers/ip/query na captura de request do server, e ganchos
`beforeSend` (erros) E `beforeSendTransaction` (performance) que redigem telefone
e `wa.me` de mensagens, transação, exceções, request, tags, extra, contexts,
breadcrumbs e spans. A identidade SHALL ser apenas o identificador opaco do
usuário (UUID), nunca e-mail/nome/celular.

#### Scenario: Celular não vaza em erro

- **WHEN** um erro ocorre processando um formulário que contém o celular
- **THEN** o evento enviado ao Sentry não contém o número em nenhum campo

#### Scenario: Link de WhatsApp redigido

- **WHEN** um evento contém uma URL `wa.me/<numero>`
- **THEN** o número é redigido antes do envio

### Requirement: Redação de e-mail na telemetria

O sistema SHALL redigir endereços de e-mail antes de enviar eventos de telemetria (Sentry),
cobrindo `message`, `extra` e `breadcrumbs`, além da redação já existente de telefone e wa.me.

#### Scenario: E-mail em mensagem de erro é redigido

- **WHEN** um evento de telemetria contém um endereço de e-mail no texto da mensagem ou em campos auxiliares
- **THEN** o e-mail é substituído por um marcador de redação antes do envio

