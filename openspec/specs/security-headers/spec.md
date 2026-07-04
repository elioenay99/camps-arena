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

### Requirement: Image Optimizer restrito ao host do projeto

O Image Optimizer do Next (`/_next/image`) SHALL aceitar otimizar imagens remotas
apenas de uma allow-list de hosts EXATOS, nunca por wildcard de domínio. Para o
Supabase Storage, o host, a porta e o protocolo autorizados SHALL ser derivados de
`NEXT_PUBLIC_SUPABASE_URL` (a mesma fonte usada pela CSP em `img-src`), restringindo
o `pathname` a `/storage/v1/object/public/**` — de modo que o otimizador só busque
avatares do PRÓPRIO projeto e não sirva de proxy para imagens de outros projetos
`*.supabase.co`. O host do CDN de escudos de clube (`media.api-sports.io`,
`pathname` `/football/teams/**`) SHALL permanecer autorizado. A derivação SHALL
funcionar tanto em produção (`<ref>.supabase.co` por HTTPS, sem porta) quanto em
desenvolvimento local (`127.0.0.1:54321` por HTTP), sem hardcodar o identificador do
projeto.

#### Scenario: Otimiza avatar do próprio projeto

- **WHEN** uma página renderiza um avatar do bucket público do projeto via `next/image`
- **THEN** o Image Optimizer aceita o host (derivado de `NEXT_PUBLIC_SUPABASE_URL`) e
  serve a imagem otimizada

#### Scenario: Rejeita proxy de outro projeto Supabase

- **WHEN** uma requisição a `/_next/image` aponta para um host `*.supabase.co` que não
  é o do projeto configurado
- **THEN** o Image Optimizer recusa a URL (não está na allow-list de hosts exatos)

#### Scenario: Escudos de clube continuam otimizando

- **WHEN** uma página renderiza um escudo de clube de `media.api-sports.io/football/teams/**`
- **THEN** o Image Optimizer aceita o host e serve a imagem otimizada

