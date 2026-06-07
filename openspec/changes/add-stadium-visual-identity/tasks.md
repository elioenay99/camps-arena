# Tasks — add-stadium-visual-identity

## 1. Fundação (sequencial — base de tudo)

- [x] 1.1 `globals.css`: paleta "Estádio à noite" dark+light (oklch, hue
      ~160/85), token `gold`(+foreground) no @theme, utilitárias
      `.glow-primary`/`.spotlight`, charts em escala verde→ouro
- [x] 1.2 `layout.tsx`: Space Grotesk via next/font (`--font-display`) +
      mapeamento `font-display` no @theme
- [x] 1.3 `app/icon.svg`: marca geométrica (favicon automático do Next)

## 2. Superfícies (frentes paralelas — arquivos disjuntos)

- [x] 2.1 LANDING (`app/page.tsx`): hero display + holofote + badge + CTAs
      com glow + preview do produto (mini-classificação com 1º dourado) +
      destaques com ícones + footer
- [x] 2.2 SHELL + AUTH: `dashboard/layout.tsx` (header sticky blur, marca
      display), `NavLinks` (pill primário), login/cadastro/recuperar (marca
      + glow sutil)
- [x] 2.3 DASHBOARD: `MatchCard` scoreboard (placar display, badge status
      com dot pulsante motion-safe, hover ring) + `MatchCardSkeleton` +
      `EmptyActiveMatches`
- [x] 2.4 TORNEIO: `StandingsTable` (1º dourado com troféu, zebra, posição
      display) + `BracketView` (campeão gold, vencedor primary, hover,
      badge 3º) + empty states da página — ATUALIZAR asserts de classe dos
      testes destes componentes na MESMA frente

## 3. Validação e fechamento

- [x] 3.1 Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [x] 3.2 Screenshots dark+light (landing, login, dashboard, torneio com
      classificação e chave; 1280px e 375px) via dev server + puppeteer —
      revisão visual multimodal e ajustes
- [x] 3.3 Adversarial enxuto (a11y/contraste + consistência/regressão +
      juiz): approved_with_nits, 0 must_fix; aplicados — pill de nav AA no
      claro (text-foreground dark:text-primary; falha 4.05:1 confirmada por
      cálculo WCAG), favicon.ico genérico removido (servia o triângulo
      default em /favicon.ico ao lado do icon.svg), font-display nunca em
      peso 600 (só 500/700 carregados), fallback @supports do gradiente;
      riscos registrados (gold decorativo no claro; verde WhatsApp é
      afordância da marca WhatsApp)
- [x] 3.4 Commits + push + CI verde + archive + memória (zero DDL)
