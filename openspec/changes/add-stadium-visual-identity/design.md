# Design — add-stadium-visual-identity

## Context

Visual atual = shadcn default acromático (inventário completo em 2026-06-07):
nenhum chroma na paleta, Geist como única família, sem marca/favicon,
animações mínimas. Direção escolhida: "Estádio à noite" — dark premium com
verde-gramado elétrico e dourado-troféu. Tailwind v4 (`@theme` em CSS),
next-themes com dark padrão, dois temas obrigatórios (CLAUDE.md).

## Goals / Non-Goals

**Goals:**

- Identidade visual própria e memorável nas duas primeiras telas (landing,
  dashboard) e nas superfícies de competição (classificação, chave).
- Zero mudança de comportamento: mesmo HTML semântico, mesmas interações.
- Contraste AA nos dois temas; motion respeitando `prefers-reduced-motion`.

**Non-Goals:**

- Ilustrações/imagens raster, biblioteca de animação (framer-motion) ou
  componentes novos de UI kit — tudo com Tailwind + lucide + SVG próprio.
- Redesenhar fluxos/formulários funcionalmente.
- OG images dinâmicas (fica para um polish futuro).

## Decisions

### D1 — Paleta oklch com hue de campo (~160) e ouro (~85)

Dark (padrão, "estádio à noite"): `background oklch(0.15 0.012 165)`;
`card oklch(0.19 0.014 165)`; `primary oklch(0.83 0.21 158)` (verde-gramado
elétrico, foreground escuro `oklch(0.17 0.03 160)`); `border/input` brancas
translúcidas com leve tom; `ring` = primary. Light ("dia de jogo"):
`background oklch(0.985 0.005 150)` (branco quente), `primary
oklch(0.52 0.15 158)` (verde escuro, AA sobre branco), demais tokens
derivados. `secondary`/`muted`/`accent` ganham o MESMO hue com chroma baixo
(superfícies vivas sem virar verde-limão). Charts em escala verde→ouro.

### D2 — Token `gold` reservado a conquista

`--gold` `oklch(0.85 0.15 85)` no dark / `oklch(0.55 0.12 80)` no light
(+`--gold-foreground`), exposto no `@theme` como `--color-gold` →
`text-gold`, `bg-gold`, `border-gold`. Política de uso: SÓ campeão, 1º
lugar e disputa de 3º (conquista) — escassez é o que mantém o dourado
especial.

### D3 — Space Grotesk como display; Geist permanece no corpo

`next/font/google` → `--font-display`; `@theme` mapeia
`--font-display` para a classe `font-display`. Aplicada em: marca, h1/h2 de
páginas, números de placar (MatchCard/BracketView) e posição na
classificação. Corpo, forms e tabelas continuam Geist (legibilidade).

### D4 — Glow e holofote como utilitárias CSS, com parcimônia

Em `globals.css`: `.glow-primary` (box-shadow em camadas com
`--primary` translúcido) para CTA principal e hover de cards-chave;
gradiente radial de "holofote" no hero via classe utilitária
(`.spotlight`: radial-gradient do primário a 6–8% sobre transparente).
Animações novas (dot pulsante, hover lift) usam utilities Tailwind
(`animate-pulse`, `transition`, `hover:-translate-y-0.5`) e ficam atrás de
`motion-safe:`.

### D5 — Marca: wordmark + ícone geométrico

Wordmark "ARENA" em Space Grotesk bold tracking largo com o "A" final
pontuado pelo primário (detalhe simples e reproduzível em texto). Ícone
`app/icon.svg`: hexágono-escudo verde sobre fundo escuro com "A" recortado —
Next.js gera o favicon a partir de `app/icon.svg` automaticamente.

### D6 — Preview do produto na landing em HTML puro

Em vez de screenshot raster, uma mini-classificação fake (3 linhas, 1º
dourado) + mini-placar renderizados com os MESMOS estilos do app, dentro de
um frame com glow. Sempre fiel ao produto (evolui junto), zero bytes de
imagem, e mostra na primeira dobra exatamente o que o usuário vai criar.

### D7 — Testes visuais: classes assertadas mudam JUNTO, semântica não

Os testes existentes que assertam classes (vencedor `font-semibold`, banner
do campeão, etc.) são atualizados na mesma frente que muda o componente —
critério: manter asserts de SEMÂNTICA (texto, roles, aria) intactos e
re-apontar asserts de classe para as classes novas. Nenhum teste de
comportamento muda.

### D8 — Validação visual com screenshots revisados

Dev server + puppeteer-core (`/usr/bin/google-chrome`, precedente do
projeto): screenshots da landing, login e dashboard/torneio (logado com o
usuário de teste) em dark E light, revisados multimodalmente antes do
commit. Critérios: hierarquia clara, dourado só em conquista, AA visual,
nada quebrado em 375px (mobile).

## Riscos / Trade-offs

- **[Verde elétrico como texto]** → `text-primary` sobre dark passa AA para
  texto ≥18px/negrito; em texto corrido usamos `foreground`. No light o
  primário é escurecido para AA em qualquer tamanho.
- **[Gold no light]** → dourado claro falha contraste sobre branco; o token
  light é um âmbar escuro (texto legível), mantendo o brilho só no dark.
- **[Glow custa GPU]** → box-shadows estáticas (sem animação de sombra);
  holofote é um gradiente estático.
- **[Fonte extra]** → +1 família (2 pesos) via next/font com subset latin —
  custo aceito pela identidade; sem CLS (font-display swap do next/font).

## Migration Plan

Nada a migrar (zero DDL, zero API). Deploy normal.

## Open Questions

Nenhuma.
