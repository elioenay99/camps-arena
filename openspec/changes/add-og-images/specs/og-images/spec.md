# og-images — Delta Spec

## ADDED Requirements

### Requirement: Card OG/Twitter estático da marca em todas as rotas

O app SHALL expor um `opengraph-image` e um `twitter-image` na raiz, gerados por
código (`next/og`), produzindo um card 1200×630 PNG com a identidade da marca
Arena (escudo, wordmark, tagline, cores da marca). Por serem definidos na raiz,
SHALL ser herdados por todas as rotas, de modo que qualquer link compartilhado
(landing, login, cadastro, convite) renderize o mesmo preview da marca. O metadata
do layout SHALL declarar `openGraph` (type/siteName/title/description/locale) e
`twitter` (`summary_large_image`); as tags de imagem (`og:image`,
`twitter:image`, com width/height/type/alt) SHALL vir dos arquivos de imagem,
resolvidas em URL absoluta via `metadataBase`.

#### Scenario: Link da landing tem preview da marca

- **WHEN** um crawler busca a landing (`/`)
- **THEN** o HTML inclui `og:image` e `twitter:image` apontando para o card
  1200×630 da marca, com `og:image:alt` descritivo

#### Scenario: Rota pública herda o card

- **WHEN** um crawler busca uma rota pública sem imagem própria (ex.: `/login`,
  `/convite/[codigo]`)
- **THEN** ela herda o `og:image`/`twitter:image` da raiz (card da marca)

### Requirement: O preview não vaza dados de torneio ou convite

O card OG SHALL ser estático e da marca — NÃO SHALL conter nome de torneio,
clube, participante ou qualquer dado específico de convite/torneio. A página de
convite SHALL manter seu `<title>` genérico ("Convite · Arena"), preservando a
decisão de privacidade existente (o título do torneio só aparece no corpo, para
quem tem o código e está autenticado).

#### Scenario: Preview do convite não revela o torneio

- **WHEN** um crawler (anônimo) busca `/convite/[codigo]`
- **THEN** o `<title>` permanece "Convite · Arena" e o `og:image` é o card
  genérico da marca — sem o nome do torneio em nenhum metadado

### Requirement: As rotas de imagem não passam pela CSP por nonce

As rotas `opengraph-image`/`twitter-image` (resposta `image/png`) SHALL ser
excluídas do matcher do middleware, de modo que não recebam header de CSP/nonce
nem disparem verificação de sessão a cada requisição de crawler.

#### Scenario: PNG do card sem CSP

- **WHEN** o card OG é requisitado
- **THEN** a resposta é `image/png` sem header `Content-Security-Policy` nem `x-nonce`
