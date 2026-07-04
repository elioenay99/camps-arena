## Why

A landing pública (`src/app/page.tsx`) precisa comunicar a PROFUNDIDADE real do produto
na primeira dobra. Hoje o único visual "de produto" abaixo do `HeroStadium` é um card de
placar ao vivo que cicla sozinho (a `<section>` "Copa dos Amigos" + o helper
`ValorQueTroca`) — e placar de jogo é a feature mais RASA do Goliseu. Os ativos que
realmente diferenciam o app não aparecem:

- A **pirâmide de divisões** estilo Brasileirão (Série A / Série B, com escudos reais,
  campeão dourado e zona de rebaixamento) — o motor de ligas com acesso/queda é o
  diferencial, mas o visitante nunca o vê.
- O **hall da fama de um competidor** (perfil histórico: promédio, temporadas, títulos,
  acessos, quedas) — prova de que o app guarda uma trajetória, não só um jogo.

## What Changes

Substituir, na primeira dobra da landing, o card de placar animado por DOIS frames
ilustrativos que mostram os ativos de alto valor. Mock fiel em React (não screenshot),
para preservar LCP/CLS e o tema dark/light.

- **Remover** a `<section>` do card de placar ("Copa dos Amigos", `page.tsx:112-200`) e
  o helper `ValorQueTroca` (`page.tsx:246-264`), que fica órfão. Limpar o CSS
  exclusivo desse helper (`.hs-rank-out`/`.hs-rank-in` e seus keyframes em
  `globals.css`, usados SÓ pelo `ValorQueTroca`). As classes `.hs-score-a`/`.hs-score-b`
  PERMANECEM (o `HeroStadium` SVG ainda as usa — `hero-stadium.tsx:98-99`).
- **Manter** o `HeroStadium` (ilustração-assinatura, `page.tsx:104-110`) e a grade de
  `DESTAQUES`.
- **Frame 1 — Mini-pirâmide.** Duas mini-divisões (Série A elite / Série B acesso)
  conectadas pela fronteira sobe/desce. Colunas compactas (Pos · escudo+nome · P).
  Espelha os tokens da `StandingsTable`: líder dourado (`bg-gold/12` + `Trophy`
  `text-gold-ink`), zona de acesso (faixa `before:bg-primary/70` + `bg-primary/8`), zona
  de rebaixamento (faixa `before:bg-destructive/70` + `bg-destructive/10`), legenda com
  bolinhas primary/destructive. Escudos REAIS via `TeamCrest` (`escudoUrl` do nosso
  Supabase Storage), `next/image` com width/height fixos → zero CLS.
- **Frame 2 — Hall da fama.** Espelha o `CompetidorHero`: escudo grande + nome
  `font-display` + chips (Promédio dourado, Temporadas, Títulos, Acessos, Quedas) com os
  mesmos estilos do `HeroChip`.
- Layout mobile-first: empilhado no 390px, lado a lado (`sm:grid-cols-2`) no desktop.
  Ambos os frames são ILUSTRAÇÃO decorativa (`aria-hidden` no visual + `sr-only`
  descritivo, espelhando o card atual). Entram na cadência do `animate-rise` com
  `--stagger` coerente.

## Impact

- **SEM DDL, SEM query ao vivo, SEM migration.** Dados são mock curado (números
  realistas hardcoded). Os escudos são servidos do bucket público `escudos` já existente
  (host já autorizado no `next.config.ts` remotePatterns e na CSP).
- Arquivos: `src/app/page.tsx` (troca de seção + limpeza do helper órfão),
  `src/app/globals.css` (remoção do CSS órfão `hs-rank-*`), e o novo componente de
  vitrine (`src/features/landing/components/*` ou co-locado na página). Nenhum outro
  consumidor toca esse card.
- Nova capability de spec `landing-page` (não existia): documenta o que a primeira dobra
  da landing SHALL comunicar.
- Sem regressão de LCP/CLS: o H1/hero segue sendo o LCP; escudos com dimensão fixa não
  causam shift; nenhum asset/fonte novo pesado.
