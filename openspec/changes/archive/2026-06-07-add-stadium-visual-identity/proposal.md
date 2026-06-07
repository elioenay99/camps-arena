# Proposal — add-stadium-visual-identity

## Why

O Arena tem produto de sobra — cinco formatos de torneio, chaves, convites,
re-engajamento — mas veste o shadcn/ui DEFAULT: paleta 100% acromática, Geist
puro, sem logo, sem favicon, sem nenhum traço de identidade. A primeira
impressão não conta a história do produto. Decisões do usuário via
AskUserQuestion (2026-06-07): direção **"Estádio à noite"** (dark premium,
verde-gramado elétrico de marca, dourado-troféu nas conquistas) com escopo
**redesign completo** — "a pessoa bater o olho e falar 'que foda'".

## What Changes

- **Design system "Estádio à noite"** (`globals.css`, Tailwind v4 `@theme` +
  tokens shadcn): dark padrão com fundo verde-preto profundo, superfícies
  elevadas com tom de campo, `primary` verde-gramado elétrico, bordas
  esverdeadas translúcidas; light "dia de jogo" com a MESMA identidade
  (verde escuro de contraste AA). Novo token semântico `gold` (+foreground),
  RESERVADO a campeão/1º lugar/conquistas. Utilitárias de glow (holofote) e
  gradiente de marca, respeitando `prefers-reduced-motion`.
- **Tipografia display**: Space Grotesk via `next/font` (`--font-display`)
  para marca, títulos e PLACARES (scoreboard); Geist permanece no corpo.
- **Marca**: logotipo "ARENA" redesenhado no shell/landing/auth + `app/icon.svg`
  (favicon gerado pelo Next).
- **Landing** redesenhada: hero display com gradiente de texto e holofote,
  badge de contexto, CTAs com glow, PREVIEW do produto (mini-classificação
  estilizada em HTML — "o que você cria"), destaques com ícones e hover.
- **Shell**: header sticky com backdrop-blur, marca display, nav com pill
  ativo do primário.
- **MatchCard** estilo scoreboard: placar gigante em display, badge de
  status com dot pulsante ("em andamento"), hover com ring primário
  (skeleton espelhado).
- **StandingsTable**: 1º lugar com destaque DOURADO (troféu), zebra sutil,
  posição em display, hover de linha.
- **BracketView**: banner de campeão DOURADO, vencedor em primário, hover
  nos confrontos, badge própria do 3º lugar.
- **Auth/empty states/botões**: cards de auth com marca e glow sutil; empty
  states com ícone+título+mensagem; refinos de transição.
- **Sem mudança de comportamento**: só estética (tokens, classes, fontes,
  ícones, SVG). Testes que assertam classes visuais são atualizados JUNTO.
- Zero DDL.

## Capabilities

### New Capabilities

(nenhuma)

### Modified Capabilities

- `design-system`: o requirement de temas ganha a identidade "Estádio à
  noite" (paleta com marca, token gold, tipografia display, favicon) — os
  dois temas permanecem obrigatórios com contraste AA.
- `app-shell`: landing e header refletem a identidade (hero display com
  preview do produto; nav com pill ativo; marca própria).

## Impact

- **Arquivos**: `globals.css`, `layout.tsx` (fonte), `app/icon.svg` (novo),
  `app/page.tsx` (landing), `dashboard/layout.tsx`, `MatchCard(+Skeleton)`,
  `EmptyActiveMatches`, `StandingsTable`, `BracketView`, páginas de auth,
  `NavLinks`, empty states da página do torneio.
- **Testes**: asserts de classes visuais atualizados (BracketView vencedor,
  banner do campeão, etc.).
- **Banco/actions/RLS**: intocados.
- **Validação**: gates + screenshots dark/light (dev server + puppeteer,
  precedente do projeto) revisados visualmente + adversarial enxuto
  (a11y/contraste e consistência/regressão).
