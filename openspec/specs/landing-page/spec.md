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

### Requirement: O hook da landing lidera com a profundidade do produto

O hero da landing pública (`src/app/page.tsx`) SHALL liderar a copy com a
PROFUNDIDADE competitiva do Goliseu — liga entre amigos com divisões, acesso e
rebaixamento, temporadas e copas que duram para sempre — e NÃO com o benefício mais
raso. A headline (`<h1>`) SHALL comunicar essa profundidade; o benefício "sem planilha,
sem discussão de placar" SHALL ser REBAIXADO a papel secundário (subtítulo/linha de
apoio), não sendo mais o herói da mensagem. O `HeroStadium`, o badge de topo e os CTAs
existentes (`/cadastro` e `/login`) SHALL ser mantidos.

#### Scenario: Headline comunica profundidade, não "sem planilha"

- **WHEN** um visitante anônimo abre a landing `/`
- **THEN** o `<h1>` fala de liga/divisões/acesso/rebaixamento/temporadas/copas (a
  profundidade), e "sem planilha" aparece apenas como benefício secundário no
  subtítulo/apoio, não como a mensagem principal

### Requirement: A landing conta uma narrativa de conversão visível sem login

A landing pública SHALL apresentar, abaixo da primeira dobra (que mantém a vitrine
`LandingShowcase`), uma narrativa de conversão em seções, na ordem: profundidade
(termos de nicho) → telas anotadas → como funciona → prova social → FAQ → CTA de
fechamento. Toda a profundidade do produto — divisões, acesso/queda, temporadas,
promédio, copas, hall da fama — SHALL ficar VISÍVEL sem que o visitante precise criar
conta. A vitrine da primeira dobra (`LandingShowcase`) SHALL ser REUSADA como bloco de
prova, não refeita. As seções novas SHALL entrar na cadência de entrada `animate-rise`
com `--stagger` coerente e SHALL ser Server Components (RSC), reusando componentes e
tokens existentes sem introduzir dependência nova.

#### Scenario: Narrativa completa aparece para visitante anônimo

- **WHEN** um visitante anônimo rola a landing `/`
- **THEN** ele vê, em ordem, o hook, a prova (vitrine), a seção de profundidade, as
  telas anotadas, o "como funciona", a prova social, o FAQ e o CTA de fechamento — sem
  precisar de login

#### Scenario: Sessão presente não vê a narrativa

- **WHEN** um usuário com sessão ativa acessa `/`
- **THEN** ele é redirecionado para `/dashboard` e nenhuma seção da landing é renderizada

### Requirement: Seção de profundidade ensina os termos de nicho

A landing SHALL incluir uma seção de "profundidade" que ENSINA os termos de nicho do
produto — acesso, rebaixamento, promédio, temporada, copa "imortal" e hall da fama —
cada um com uma explicação curta em pt-BR e apoio visual, usando tokens de cor
semânticos coerentes com o app (ex.: primary para acesso, destructive para queda, gold
para troféu). A seção SHALL ser RSC com dados curados hardcoded (sem query ao vivo).

#### Scenario: Termos de nicho são explicados sem login

- **WHEN** um visitante anônimo lê a seção de profundidade
- **THEN** ele encontra explicações de acesso, rebaixamento, promédio, temporada, copa
  imortal e hall da fama, em português do Brasil

### Requirement: Telas-chave são mocks fiéis anotados, não screenshots

As telas-chave da landing SHALL ser MOCKS FIÉIS renderizados como componentes React
com dados curados hardcoded — NÃO imagens/PNGs de screenshot — para preservar LCP/CLS
e o comportamento de tema dark/light. As telas cobertas SHALL incluir a classificação
com forma/destaques, a página de competidor com hall/promédio e o bracket/mata-mata. Cada mock SHALL trazer
CALLOUTS de anotação que ensinam o termo correspondente. O bloco visual de cada mock
SHALL ser `aria-hidden` acompanhado de um `sr-only` descritivo, e os escudos SHALL ser
renderizados via `TeamCrest`/`next/image` com dimensão fixa (sem CLS, com fallback para
o monograma).

#### Scenario: Mock renderizado em React, não screenshot

- **WHEN** a landing exibe uma tela-chave anotada
- **THEN** ela é um componente React com dados hardcoded (não um PNG), acompanha o tema
  dark/light, e os escudos vêm de `TeamCrest`/`next/image` com dimensão fixa (sem layout
  shift)

#### Scenario: Callouts ensinam os termos

- **WHEN** o mock de classificação é exibido
- **THEN** callouts de anotação apontam a coluna "Forma" e os "destaques" (insights),
  ensinando esses conceitos ao visitante

### Requirement: Seção "Como funciona" com passos

A landing SHALL incluir uma seção "Como funciona" com 3 a 4 passos ordenados (ex.: 1.
Monte a liga e as divisões · 2. Lance os placares · 3. Suba/caia e vire a temporada · 4.
Eternize no hall da fama / nas copas), marcada semanticamente como lista ordenada
(`<ol>`) para tecnologia assistiva.

#### Scenario: Passos aparecem em ordem

- **WHEN** um visitante anônimo lê a seção "Como funciona"
- **THEN** ele vê de 3 a 4 passos numerados em ordem, cada um com título e descrição

### Requirement: Prova social com depoimentos ilustrativos rotulados visivelmente

A landing SHALL incluir uma seção de prova social com 2 a 3 depoimentos ILUSTRATIVOS —
primeiro nome + papel genérico (ex.: "organizador de liga da firma") — redigidos como
exemplos plausíveis e NÃO como afirmação de pessoa real verificável. Enquanto os
depoimentos forem fabricados/placeholder, a seção SHALL trazer um rótulo VISÍVEL ao
usuário (ex.: eyebrow/subtítulo "Exemplos ilustrativos" e/ou cada card discretamente
marcado como exemplo) deixando claro que NÃO são depoimentos de clientes reais — um
comentário apenas no código NÃO basta (seria endosso enganoso numa página de aquisição).
Além do rótulo visível, o código SHALL conter um comentário marcando-os como
`PLACEHOLDER — trocar por depoimentos reais`.

#### Scenario: Natureza ilustrativa é visível ao visitante

- **WHEN** um visitante anônimo lê a seção de prova social com depoimentos placeholder
- **THEN** há um rótulo VISÍVEL na página (ex.: "Exemplos ilustrativos" e/ou marcação por
  card) esclarecendo que os depoimentos são exemplos, NÃO clientes reais — sem depender de
  comentário no código

#### Scenario: Depoimentos são exemplos, não pessoas reais verificáveis

- **WHEN** a seção de prova social é renderizada
- **THEN** ela mostra 2-3 depoimentos com primeiro nome + papel genérico, escritos como
  exemplos, e o código os marca com o comentário `PLACEHOLDER — trocar por depoimentos
  reais`

### Requirement: FAQ responde às perguntas-chave de conversão

A landing SHALL incluir um FAQ acessível por teclado, respondendo NO MÍNIMO: "É
grátis?", "Preciso instalar?" (é PWA, roda no navegador, instalação opcional) e "Serve
para FIFA e eFootball?" (sim — o placar é manual, serve qualquer jogo/campeonato entre
amigos), além de 2 a 3 perguntas úteis (ex.: "Funciona no celular?", "Posso ter várias
divisões?"). O FAQ SHALL ser acessível sem depender de JavaScript para expandir/recolher
(ex.: `<details>/<summary>` nativos), preservando o padrão RSC-first.

#### Scenario: Perguntas-chave estão presentes e acessíveis

- **WHEN** um visitante anônimo abre o FAQ
- **THEN** encontra as respostas para "É grátis?", "Preciso instalar?" e "Serve para
  FIFA e eFootball?", e consegue expandir/recolher cada pergunta pelo teclado

### Requirement: CTA de fechamento comunica valor premium sem implementar cobrança

A landing SHALL terminar com um CTA de conversão claro que leva a criar conta/entrar
(fluxo existente, `/cadastro` e `/login`), acompanhado de copy que comunica o valor
premium do produto (temporadas e copas que duram para sempre, hall da fama). Esta change
NÃO SHALL implementar cobrança, checkout, gate de plano nem página de preços — apenas a
narrativa e o CTA que preparam a conversão.

#### Scenario: CTA leva ao cadastro sem cobrança

- **WHEN** um visitante anônimo chega ao fim da narrativa
- **THEN** vê um CTA "Criar conta grátis" (e "Já tenho conta") apontando para o fluxo
  existente, com copy de valor premium, e NÃO há nenhuma tela de pagamento/checkout

### Requirement: Narrativa mantém performance, tema e acessibilidade

As seções novas da landing SHALL ser RSC-first (interatividade restrita ao expandir do
FAQ, resolvido por `<details>` nativo — sem nova ilha client obrigatória), SHALL
preservar o tema dark/light usando apenas tokens semânticos (sem cor hardcoded), SHALL
manter o H1/hero como LCP sem introduzir CLS (escudos por `next/image` com dimensão
fixa, nenhum asset pesado novo), e SHALL renderizar corretamente a 390px (mobile-first,
sem estouro horizontal), com toda a copy em pt-BR e blocos ilustrativos `aria-hidden`
com `sr-only` descritivo.

#### Scenario: Sem regressão de LCP/CLS e com tema preservado

- **WHEN** a landing com a narrativa completa é carregada
- **THEN** o H1/hero permanece o LCP, as seções novas não introduzem layout shift, o
  tema dark/light é respeitado por tokens semânticos, e a 390px nada estoura
  horizontalmente

