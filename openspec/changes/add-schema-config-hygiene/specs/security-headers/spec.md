## ADDED Requirements

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
