# landing-page Specification

## Purpose
TBD - created by archiving change add-landing-depth-showcase. Update Purpose after archive.
## Requirements
### Requirement: Primeira dobra da landing comunica a profundidade do produto

A primeira dobra da landing pública (`src/app/page.tsx`) SHALL exibir, abaixo da
ilustração-assinatura `HeroStadium`, uma vitrine ("showcase") com DOIS frames que
comunicam os diferenciais de alto valor do Goliseu — em vez do card de placar ao vivo,
que representa a feature mais rasa (placar de um único jogo). A vitrine SHALL ser um mock
fiel renderizado em React (não uma imagem/screenshot), com dados curados hardcoded (SEM
query ao vivo, SEM DDL), para preservar LCP/CLS e o comportamento de tema dark/light.

O `HeroStadium` e a grade de `DESTAQUES` SHALL ser mantidos. O card de placar
("Copa dos Amigos") e seu helper `ValorQueTroca` SHALL ser removidos; o CSS que passe a
ficar órfão (as classes `.hs-rank-out`/`.hs-rank-in` e seus keyframes, usadas somente
pelo `ValorQueTroca`) SHALL ser limpo. As classes `.hs-score-a`/`.hs-score-b` SHALL
permanecer, pois o `HeroStadium` SVG ainda as usa.

Ambos os frames SHALL ser tratados como ILUSTRAÇÃO decorativa: o bloco visual SHALL ser
`aria-hidden`, acompanhado de um `<span class="sr-only">` curto que descreve o conteúdo
para tecnologia assistiva (espelhando o card removido). O layout SHALL ser mobile-first:
empilhado a 390px (sem estouro horizontal) e lado a lado (`sm:grid-cols-2`) no desktop. A
vitrine SHALL entrar na cadência de entrada `animate-rise` com `--stagger` coerente com
as demais seções.

#### Scenario: Vitrine substitui o card de placar mantendo o hero

- **WHEN** um visitante anônimo abre a landing `/`
- **THEN** a primeira dobra exibe o `HeroStadium` seguido da vitrine com os dois frames
  (mini-pirâmide e hall da fama), e NÃO exibe mais o card de placar ao vivo "Copa dos
  Amigos"

#### Scenario: Sem regressão de LCP/CLS

- **WHEN** a landing é carregada
- **THEN** o H1/hero permanece sendo o LCP; os escudos são renderizados via `next/image`
  com `width`/`height` fixos, de modo que a vitrine NÃO introduz layout shift (CLS); e
  nenhum asset/fonte novo pesado é adicionado

### Requirement: Frame de mini-pirâmide com escudos reais e zona de rebaixamento

O primeiro frame da vitrine SHALL apresentar uma mini-pirâmide de divisões com dois
blocos rotulados — "Série A" (elite) e "Série B" (acesso) — comunicando o motor de
ligas com acesso e queda. Cada linha SHALL ser compacta, com as colunas Posição ·
(escudo + nome do clube) · Pontos. Os escudos SHALL ser os REAIS servidos do bucket
público `escudos` do Supabase Storage do projeto, renderizados pelo componente
`TeamCrest` (que faz `next/image` com dimensão fixa e cai para o monograma no `onError`),
cujo host já está autorizado em `next.config.ts` (remotePatterns) e na CSP.

Os destaques de zona SHALL espelhar os tokens da `StandingsTable`:

- Líder (1º da Série A): fundo `bg-gold/12` e troféu (`lucide` `Trophy`) em
  `text-gold-ink`.
- Zona de ACESSO (Série B, sobe): faixa lateral `before:bg-primary/70` e tom
  `bg-primary/8`.
- Zona de REBAIXAMENTO (Série A, cai): faixa lateral `before:bg-destructive/70` e tom
  `bg-destructive/10`.
- Uma legenda curta com bolinhas primary/destructive rotulando "Acesso" / "Rebaixamento".

A Série A SHALL exibir o campeão, uma linha "⋯" indicando o meio da tabela e a zona de
rebaixamento (Z4), transmitindo a sensação de uma tabela cheia (~20 times). A Série B
SHALL exibir a zona de acesso (G4). A leitura visual (vermelho desce → roxo sobe) SHALL
contar a narrativa sobe/desce; um conector sutil ("cai ↓ · sobe ↑") entre os blocos é
permitido.

#### Scenario: Escudos reais com dimensão fixa

- **WHEN** o frame de mini-pirâmide renderiza uma linha de clube
- **THEN** o escudo é carregado via `TeamCrest`/`next/image` a partir da URL pública do
  Storage com `width`/`height` fixos (sem CLS); e, se a imagem falhar, o `TeamCrest` cai
  graciosamente para o monograma do nome

#### Scenario: Zonas de acesso e rebaixamento visíveis

- **WHEN** o frame de mini-pirâmide é exibido
- **THEN** o líder da Série A aparece com destaque dourado + troféu, as posições de queda
  da Série A aparecem com a faixa/tom de rebaixamento (destructive), as posições de
  acesso da Série B aparecem com a faixa/tom de acesso (primary), e uma legenda rotula as
  duas zonas

### Requirement: Frame de hall da fama de competidor

O segundo frame da vitrine SHALL apresentar o "hall da fama" de um competidor,
espelhando o `CompetidorHero`: um escudo GRANDE (via `TeamCrest`, ~56-64px) + o nome em
`font-display` + uma faixa de chips de destaque. Os chips SHALL usar os mesmos estilos do
`HeroChip`: o promédio em dourado (`border-gold/30 bg-gold/12 text-gold-ink`), e chips de
temporadas (neutro), títulos (dourado + `Trophy`), acessos (primary + `ArrowUp`) e quedas
(destructive + `ArrowDown`). Os valores SHALL ser mock curado e realista.

#### Scenario: Chips de trajetória renderizam com os tokens corretos

- **WHEN** o frame de hall da fama é exibido
- **THEN** ele mostra o escudo grande + nome do competidor e os chips de promédio
  (dourado, `text-gold-ink`), temporadas, títulos (dourado + troféu), acessos (primary +
  seta para cima) e quedas (destructive + seta para baixo), sem usar `gold` como cor de
  texto (o texto dourado usa `text-gold-ink`)

