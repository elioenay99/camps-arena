# Tasks — add-landing-conversao

## 0. Baseline

- [ ] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test` —
  registrar contagem verde (verde final = zero falhas novas vs. baseline).

## 1. Hook — copy nova do hero (`src/app/page.tsx`)

- [ ] 1.1 Trocar o `<h1>` pela headline de profundidade ("Monte a sua liga nacional
  entre amigos — divisões, acesso e rebaixamento, temporadas e copas que duram para
  sempre"), mantendo `font-display`, `text-balance` e o `text-gradient-brand` num termo
  âncora (ex.: "liga nacional" ou "para sempre").
- [ ] 1.2 Reescrever o subtítulo REBAIXANDO "sem planilha, sem discussão de placar" a
  benefício secundário (uma linha curta), sem ser mais o herói.
- [ ] 1.3 Manter badge de topo, `HeroStadium`, `LandingShowcase` e os 2 CTAs
  (`/cadastro`, `/login`) intactos.

## 2. Profundidade — `ProfundidadeCards` (RSC, novo)

- [ ] 2.1 Criar `src/features/landing/components/ProfundidadeCards.tsx`: grade responsiva
  (1 col mobile → `sm:grid-cols-2`/`3`) de cards que ENSINAM: Acesso, Rebaixamento,
  Promédio, Temporada, Copa imortal, Hall da fama. Ícone `lucide` + termo + explicação
  pt-BR. Tokens semânticos (primary/destructive/gold), sem cor hardcoded.
- [ ] 2.2 Compor em `page.tsx` após a `LandingShowcase`, com `animate-rise` + `--stagger`
  coerente.

## 3. Telas anotadas — mocks fiéis (RSC, novos)

- [ ] 3.1 `Callout.tsx` — primitivo de anotação reutilizável (rótulo curto + seta/linha),
  `aria-hidden` no visual, `sr-only` descritivo; refluir a 390px (sem overflow).
- [ ] 3.2 `MockClassificacao.tsx` — classificação no estilo `StandingsTable` com a coluna
  **Forma** (últimos 5: V/E/D) e um badge de destaque; callouts em "Forma" e "destaques"
  (Frente 1 — insights). Dados curados hardcoded.
- [ ] 3.3 `MockCompetidor.tsx` — cabeçalho de competidor (`TeamCrest`) + chips
  promédio/temporadas/títulos (espelha o `HallDaFama` da `LandingShowcase`); callout em
  "promédio"/"hall".
- [ ] 3.4 `MockBracket.tsx` — mini chaveamento (semi → final) comunicando copa/mata-mata;
  callout "copa imortal".
- [ ] 3.5 Compor os mocks anotados em `page.tsx` (podem morar numa seção "Veja por
  dentro"), `aria-hidden` + `sr-only`, escudos via `TeamCrest`/`escudoPublicUrl`.

## 4. Como funciona — `ComoFunciona` (RSC, novo)

- [ ] 4.1 Criar `ComoFunciona.tsx`: `<ol>` de 3-4 passos (1. Monte a liga e as divisões ·
  2. Lance os placares · 3. Suba/caia e vire a temporada · 4. Eternize no hall da fama /
  nas copas), número em círculo + título + frase. Compor em `page.tsx`.

## 5. Prova social — `ProvaSocial` (RSC, novo, PLACEHOLDER)

- [ ] 5.1 Criar `ProvaSocial.tsx`: 2-3 cards de depoimento ILUSTRATIVO (primeiro nome +
  papel genérico), redigidos como exemplo plausível — NÃO pessoa real verificável. RÓTULO
  VISÍVEL ao usuário enquanto placeholder (eyebrow "Exemplos ilustrativos" e/ou marcação
  por card) — comentário no código NÃO basta. Além dele, comentário no topo do arquivo:
  `PLACEHOLDER — trocar por depoimentos reais`. Compor em `page.tsx`.

## 6. FAQ — `Faq` (RSC, `<details>` nativo)

- [ ] 6.1 Criar `Faq.tsx` usando `<details>/<summary>` nativos estilizados (Tailwind),
  acessível por teclado, sem `"use client"`, com chevron que gira no `open`. Perguntas:
  "É grátis?", "Preciso instalar?" (PWA, roda no navegador, instalação opcional), "Serve
  para FIFA e eFootball?" (sim — placar manual, qualquer jogo/campeonato entre amigos),
  "Funciona no celular?", "Posso ter várias divisões?". Compor em `page.tsx`.

## 7. CTA de fechamento — `ConversaoCta` (RSC, novo)

- [ ] 7.1 Criar `ConversaoCta.tsx`: título de valor premium (temporadas/copas que duram
  para sempre, hall da fama) + CTA "Criar conta grátis" (`/cadastro`) e "Já tenho conta"
  (`/login`), reusando `Button asChild` + `Link`. SEM billing/checkout. Compor antes do
  footer; ajustar o footer se necessário.

## 8. Testes

- [ ] 8.1 PRIMEIRA cobertura da home — criar `src/app/page.test.tsx` (não existe hoje;
  reusar o padrão de `src/app/dashboard/explorar/page.test.tsx`: `vi.mock` de
  `next/navigation` + do `createClient`/auth para simular visitante anônimo). Assert:
  render sem sessão exibe hook (nova headline), prova (`LandingShowcase`), profundidade,
  como funciona, prova social (com o rótulo "Exemplos ilustrativos" visível), FAQ
  (perguntas-chave) e CTA; NÃO redireciona.
- [ ] 8.2 Teste do FAQ compatível com jsdom: jsdom NÃO implementa o toggle de
  `<details>/<summary>` (clique não muda `open`) — NÃO testar abre/fecha por clique.
  Testar a SEMÂNTICA (cada pergunta é um `<summary>` dentro de um `<details>`) e a
  PRESENÇA das perguntas-e-respostas no DOM (jsdom renderiza os filhos do `<details>`
  independente do `open`).
- [ ] 8.3 A suíte GLOBAL permanece verde (a regressão a preservar é a suíte inteira, não
  um baseline de `page` — que hoje não tem teste).

## 9. Gate mecânico + validação visual

- [ ] 9.1 Gate: `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — casar string
  POSITIVA (ex.: `built in`); comparar com o baseline (0.1).
- [ ] 9.2 Validação visual a **390px** (mobile-first) em dark E light: hook, seções novas,
  mocks/callouts sem overflow horizontal, FAQ abre/fecha, CTA visível. Sem CLS perceptível
  (H1 = LCP).
- [ ] 9.3 Revisão adversarial por workflow (correção/simplificação/perf/a11y) antes de
  commitar.
