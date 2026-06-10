# Tasks — glow-up-visual

## 1. Paleta

- [x] 1.1 `globals.css`: `:root` (Seleção/Canarinho) e `.dark` (Dracula); comentário
      de identidade atualizado. LIGHT: verde da bandeira ESCURECIDO (#008035) p/ AA
      em texto/botão; AMARELO canarinho em secondary/accent/glow; `--glow-accent`
      (amarelo no claro, roxo no escuro) no `.stadium-spotlight`.
- [x] 1.2 Token de conquista em DOIS papéis: `--gold` = canarinho vivo
      (preenchimento/borda/glow) e `--gold-ink` = âmbar escuro legível (texto/ícone)
      no claro, amarelo no escuro — resolve o contraste AA do dourado-texto.
- [x] 1.3 Marca fixa em roxo Dracula: `icon.svg` + `brand.tsx` (OG); `global-error`
      alinhado. WhatsApp segue verde.

## 2. Fundação (atmosfera / profundidade / movimento)

- [x] 2.1 `globals.css`: `.stadium-spotlight`/`.pitch-grid`/`.grain`, `.elevate`/
      `.elevate-hover`, `.animate-rise`/`.animate-score`/`.animate-breathe`,
      `.trophy-sheen`, keyframes + `@media (prefers-reduced-motion: reduce)`.
- [x] 2.2 `StadiumBackdrop` e `ArenaMark` (componentes).

## 3. Superfícies

- [x] 3.1 `AuthShell` + login/cadastro/recuperar/atualizar; remove `AuthBrand`.
- [x] 3.2 Empty states (painel + torneios): corrige wrap, glow, CTAs.
- [x] 3.3 Torneios em cards (`FORMATO_META`, status pill, stagger); `getMeusTorneios`
      traz `formato`.
- [x] 3.4 `MatchCard` (elevate + entrada/index); `LiveScore` cinético.
- [x] 3.5 Troféu: `StandingsTable` (1º) + `BracketView` (campeão).
- [x] 3.6 Backdrop no shell do dashboard.

## 4. Validação

- [x] 4.1 Gates: typecheck/lint/test (848 ✅) + build.
- [x] 4.2 Ao vivo (Playwright): login/dashboard/torneios/landing nos 2 temas; OG
      roxo regenerado e inspecionado.
- [x] 4.3 Workflow adversarial (5 lentes, 19 confirmados, 0 critical): dark
      Dracula sólido; o ponto cego era o LIGHT. Fixes aplicados — `--gold-ink`
      (dourado-texto AA), verde do light → #008035 (botão/pílula/vencedor AA),
      foco no card de torneio, footer cheio, `trophy-sheen` removido da tabela
      (paint perpétuo) ficando só no campeão, `--color-gold`→`--gold`,
      `.elevate-hover` sob reduced-motion, fallback do `pop` no LiveScore,
      comentários atualizados. Contrastes finais reconferidos (todos AA; pílula
      4.4 c/ ponto redundante).
- [x] 4.4 Commit + push + CI verde + archive. Run `27248099838` verde.
