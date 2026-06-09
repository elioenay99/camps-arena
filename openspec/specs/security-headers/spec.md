# security-headers Specification

## Purpose
TBD - created by archiving change add-security-headers. Update Purpose after archive.
## Requirements
### Requirement: Content Security Policy por nonce

Toda resposta HTML SHALL incluir um header `Content-Security-Policy` com
`script-src` restrito a `'self'`, um nonce único por request e `'strict-dynamic'`
(sem `'unsafe-inline'` em script-src), de modo que scripts inline ou injetados
não executem. O nonce SHALL ser aplicado aos scripts do framework e ao script
inline do tema. `frame-ancestors` SHALL ser `'none'`. `connect-src` SHALL
permitir o Supabase por HTTPS e WebSocket (`wss:`) para não quebrar o Realtime.
Em desenvolvimento, `'unsafe-eval'` SHALL ser permitido (exigência do React em
dev) e ausente em produção.

#### Scenario: Script injetado é bloqueado

- **WHEN** um `<script>` sem o nonce do request é inserido na página
- **THEN** o navegador bloqueia sua execução pela CSP

#### Scenario: Realtime continua funcionando

- **WHEN** o painel abre a conexão de Realtime do Supabase (`wss:`)
- **THEN** a CSP permite a conexão e o placar atualiza ao vivo

#### Scenario: Tema sem flash

- **WHEN** a página carrega com a CSP ativa
- **THEN** o script inline do next-themes roda (carrega o nonce) e não há flash
  nem violação no console

### Requirement: Headers de segurança em todas as respostas

As respostas SHALL incluir `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin` e uma `Permissions-Policy`
que desabilita câmera, microfone e geolocalização. Em produção, SHALL incluir
`Strict-Transport-Security` (HSTS).

#### Scenario: Anti-clickjacking

- **WHEN** um terceiro tenta embutir a aplicação em um `<iframe>`
- **THEN** `X-Frame-Options: DENY` e `frame-ancestors 'none'` impedem o embed

#### Scenario: HSTS só em produção

- **WHEN** a aplicação roda em produção
- **THEN** a resposta inclui `Strict-Transport-Security`; em desenvolvimento, não

