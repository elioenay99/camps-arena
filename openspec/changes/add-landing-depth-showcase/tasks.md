## 0. Baseline

- [x] 0.1 Baseline HEAD `feaffea`: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test`
  1395/1395 ✓ (102 arquivos). Zero falhas pré-existentes — verde final = igual ao
  baseline.

## 1. Confirmar tokens e caminhos a espelhar

- [x] 1.1 `TeamCrest` (`src/features/team/components/TeamCrest.tsx`) recebe `escudoUrl` +
  `nome` + `size`, faz `next/image` com fallback pro monograma no `onError` — é o caminho
  DRY/resiliente para escudos.
- [x] 1.2 Tokens de zona da `StandingsTable`: líder `bg-gold/12` + `Trophy text-gold-ink`;
  acesso `before:bg-primary/70` + `bg-primary/8`; rebaixamento `before:bg-destructive/70`
  + `bg-destructive/10`; legenda com bolinhas.
- [x] 1.3 Chips do `CompetidorHero`/`HeroChip`: dourado `border-gold/30 bg-gold/12
  text-gold-ink`; primary `border-primary/30 bg-primary/10 text-primary`; destructive
  idem; base `border-border bg-muted/40 text-foreground`.
- [x] 1.4 CSS órfão: `.hs-rank-out`/`.hs-rank-in` usadas SÓ pelo `ValorQueTroca`;
  `.hs-score-a`/`.hs-score-b` também usadas pelo `HeroStadium` SVG (NÃO remover).

## 2. Componente de vitrine (os 2 frames)

- [x] 2.1 Criar `src/features/landing/components/LandingShowcase.tsx` (RSC puro) com o
  mock curado: array de linhas Série A / Série B `{ pos, nome, id, pontos, zona }` e os
  dados do hall da fama. Escudos via `TeamCrest` (`escudoUrl` do Storage público).
- [x] 2.2 Frame 1 (mini-pirâmide): dois blocos rotulados "Série A"/"Série B", colunas
  Pos · escudo+nome · P; líder dourado + troféu; faixas de acesso/rebaixamento; linha
  "⋯" no meio da Série A; legenda com bolinhas primary/destructive; conector sutil
  "cai ↓ · sobe ↑" entre os blocos.
- [x] 2.3 Frame 2 (hall da fama): escudo grande (Cruzeiro) + nome `font-display` + chips
  Promédio 2.318 (dourado) · 6 Temporadas · 3 Títulos 🏆 · 4 Acessos ↑ · 1 Queda ↓.
- [x] 2.4 Layout: empilhado no mobile (390px primeiro), `sm:grid-cols-2` no desktop;
  cartões `rounded-2xl border bg-card/60 ... glow-primary`/`elevate`; visual
  `aria-hidden` + `sr-only` descritivo; sem estouro horizontal.

## 3. Integrar na landing e limpar órfãos

- [x] 3.1 Em `page.tsx`, substituir a `<section>` do card de placar ("Copa dos Amigos")
  pelo `<LandingShowcase />`, mantendo o `animate-rise` + `--stagger` na cadência (270ms).
- [x] 3.2 Remover o helper `ValorQueTroca` (agora órfão) e o import não usado (`Trophy`
  segue usado pelos `DESTAQUES`).
- [x] 3.3 Remover do `globals.css` o CSS órfão: `.hs-rank-out`/`.hs-rank-in` (definição +
  keyframes + refs em `prefers-reduced-motion`). Manter `.hs-score-a`/`.hs-score-b`.

## 4. Gate

- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test` — verde (igual ao baseline 0.1). O
  `pnpm build` roda na tab de gate do orquestrador.
- [x] 4.2 `openspec validate add-landing-depth-showcase --strict` = valid.
- [ ] 4.3 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 4.4 Validação visual ao vivo (390px + desktop, dark e light): abrir a landing e
  confirmar os 2 frames com escudos reais, sem CLS, sem estouro horizontal. (ORQUESTRADOR)
