# Proposal — glow-up-visual

## Why

A landing era polida, mas ao logar o brilho sumia: interior preto-chapado, cards
sem profundidade, telas de auth = "card sozinho no vazio", empty states inertes
(e um wart real — a descrição do empty do painel quebrava uma palavra por linha).
O usuário pediu um "tapa no visual" em TUDO + uma virada de paleta: **Dracula no
dark** e **seleção brasileira no light**.

## What Changes

### Paleta (globals.css)

- **DARK (padrão) → Dracula**: slate `#282a36`, marca roxa `#bd93f9`, acentos neon
  (rosa/ciano/verde/amarelo) nos charts e na conquista (`gold` = amarelo Dracula).
- **LIGHT → Seleção/Canarinho**: verde da bandeira (escurecido p/ `#008035` —
  AA em texto/botão) sobre branco quente, AMARELO canarinho em secondary/accent
  e no glow do backdrop (`--glow-accent`), azul no apoio (charts).
- Conquista em DOIS tokens: `gold` (canarinho vivo p/ preenchimento/glow) e
  `gold-ink` (âmbar escuro legível p/ texto/ícone) — resolve o contraste AA.
- favicon/OG passam ao roxo Dracula (marca fixa = tema padrão); botões de
  WhatsApp seguem verdes (afford­ância).

### Fundação de atmosfera/profundidade/movimento (globals.css)

- `StadiumBackdrop`: holofote + gramado em perspectiva + grão (fixo, `aria-hidden`,
  recolore por `--primary`). No shell autenticado e nas telas de auth.
- `.elevate`/`.elevate-hover`: sombra em camadas + anel da marca (cards "flutuam").
- Movimento: `.animate-rise` (entrada com `--stagger`), `.animate-score` (placar
  pula/pisca no gol), `.animate-breathe` (holofote), `.trophy-sheen` (brilho
  dourado na conquista). Tudo zerado sob `prefers-reduced-motion`.
- `ArenaMark` (escudo SVG `currentColor` — tematizado) reutilizável.

### Superfícies

- **Auth**: `AuthShell` (backdrop + lockup de marca com glow + tagline) substitui
  o `AuthBrand` em login/cadastro/recuperar/atualizar.
- **Empty states** (painel, torneios): layout flex (corrige o wrap), ícone com
  glow e CTAs reais.
- **Torneios**: lista vira CARDS com ícone de formato (`FORMATO_META`), status
  pill (ativo com ponto vivo), profundidade/hover e entrada com stagger.
  (`getMeusTorneios` passa a trazer `formato`.)
- **MatchCard**: `.elevate`/hover + entrada escalonada (prop `index`).
- **LiveScore**: placar cinético (anima só quando o número muda).
- **StandingsTable** (1º lugar) e **BracketView** (campeão): brilho de troféu.
- **global-error**: fallback alinhado ao Dracula.

## Capabilities

Nenhuma capability nova. Modifica `design-system` (paleta + atmosfera/movimento).

## Impact

- **globals.css**: paleta reescrita (`:root`/`.dark`) + utilities/keyframes novos.
- **Novos**: `StadiumBackdrop`, `ArenaMark`, `AuthShell`, `FORMATO_META`.
- **Editados**: 4 páginas de auth, layout do dashboard, painel, índice de torneios,
  `MatchCard`, `LiveScore`, `StandingsTable`, `BracketView`, `EmptyActiveMatches`,
  `getMeusTorneios`, `icon.svg`, `brand.tsx` (OG), `global-error`.
- **Removido**: `AuthBrand` (substituído pelo `AuthShell`).
- **Não muda**: lógica de auth/RLS, Server Actions, banco (sem DDL), CSP (inline
  `style` para `--stagger` já coberto por `style-src 'unsafe-inline'`).
- **Validação ao vivo (feita)**: login/dashboard/torneios/landing nos DOIS temas;
  OG roxo regenerado; gates typecheck/lint/test(848)/build verdes.
- **Risco**: visual amplo, mas tokens centralizados; sem mudança de dados/segurança.
  Contraste AA verificado por workflow adversarial (19 achados, 0 critical) e
  corrigido — o ponto cego era o light (gold-texto e verde claro), resolvido com
  `gold-ink` e verde mais fundo. Todos os pares reconferidos em AA.
