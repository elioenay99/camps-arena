# og-images Specification

## Purpose
TBD - created by archiving change add-og-images. Update Purpose after archive.
## Requirements
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

### Requirement: Imagem da rodada (rota dinâmica autenticada)

O sistema SHALL gerar a imagem de uma rodada como um PNG via `next/og` (Satori), exposto
por um Route Handler GET em `app/dashboard/torneios/[id]/rodada/[rodada]/imagem`. A rota
SHALL ser auth-gated (passa pelo proxy/sessão) e SHALL checar a posse do campeonato
(`tournaments.created_by = auth.uid()`); um não-dono ou torneio inexistente SHALL receber
404/negação, sem oráculo. Diferente do card OG estático da marca, esta rota é DINÂMICA e
lida no contexto do DONO autenticado (a RLS de `matches` lhe entrega a rodada).

A imagem SHALL conter a marca, "Nª RODADA" e os confrontos da rodada — cada lado com o
escudo do clube (`teams.escudo_url`, embutido como data URL) ou, quando por-nome/sem
escudo, um **monograma** (inicial sobre cor estável). A imagem SHALL ser tematizada pelas
**cores** do campeonato (`resolverCoresTorneio`, sempre hex `#rrggbb` ou ausentes — Satori
aceita), caindo no tema base quando o campeonato não tem cor. A geração SHALL respeitar as
restrições do Satori (flexbox, sem grid, cores em hex) e reusar as fontes/logo do OG da
marca (sem duplicar o carregamento de assets).

#### Scenario: Dono gera a imagem da rodada

- **WHEN** o dono requisita a imagem de uma rodada liberada do seu campeonato
- **THEN** recebe um PNG com os confrontos da rodada tematizado pelas cores do campeonato

#### Scenario: Lado por-nome usa monograma

- **WHEN** um lado do confronto é um competidor por nome (sem clube/escudo)
- **THEN** a imagem desenha um monograma (inicial) no lugar do escudo

#### Scenario: Não-dono não gera a imagem

- **WHEN** um usuário que não é dono do campeonato requisita a rota da imagem
- **THEN** a resposta é negada (404), sem revelar a existência do recurso

#### Scenario: Campeonato sem cor usa o tema base

- **WHEN** o campeonato não tem cores definidas
- **THEN** a imagem usa o tema base do app (sem quebrar a geração)

