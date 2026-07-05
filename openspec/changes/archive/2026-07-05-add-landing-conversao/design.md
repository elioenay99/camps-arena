# Design — add-landing-conversao

## Contexto

A home (`src/app/page.tsx`) é material de aquisição, renderizada APENAS para
visitante anônimo (sessão → `redirect("/dashboard")`; falha de auth vira visitante,
nunca derruba a página). Hoje: header → hero (badge + H1 + subtítulo + 2 CTAs) →
`HeroStadium` → `LandingShowcase` (vitrine da 1ª dobra) → grade `DESTAQUES` (3 cards)
→ footer, tudo entrando na cadência `animate-rise` com `--stagger` crescente.

Esta change NÃO refaz o que já é bom (hero, `HeroStadium`, `LandingShowcase`): ela
troca a COPY do hook e ADICIONA as seções de narrativa depois da prova. Frontend puro,
dados curados hardcoded, zero banco.

## Narrativa e ordem das seções

A página passa a contar uma história de conversão, de cima para baixo:

1. **Header** (mantido) — marca + `ModeToggle` + "Entrar".
2. **Hook** (hero, copy nova) — headline de PROFUNDIDADE + subtítulo com "sem planilha"
   rebaixado + CTAs existentes.
3. **`HeroStadium`** (mantido) — ilustração-assinatura.
4. **Prova** — `LandingShowcase` (mantida): mini-pirâmide + hall da fama.
5. **Profundidade** (`ProfundidadeCards`, novo) — cards que ensinam os termos de nicho.
6. **Telas anotadas** (mocks novos) — classificação (Forma/destaques), competidor
   (hall/promédio), bracket, cada uma com callouts que ensinam o termo.
7. **Como funciona** (`ComoFunciona`, novo) — 3-4 passos.
8. **Prova social** (`ProvaSocial`, novo) — 2-3 depoimentos ilustrativos (placeholder).
9. **FAQ** (`Faq`, novo) — perguntas-chave + 2-3 úteis.
10. **CTA de fechamento** (`ConversaoCta`, novo) — copy de valor premium + CTA.
11. **Footer** (mantido/ajustado).

Cada seção nova entra em `animate-rise`; os `--stagger` são recalibrados em cadência
crescente e coerente com as atuais (0/90/180/270/360ms hoje → estender além de 360ms
para as seções novas, ou reorganizar em passos de ~90ms). Manter `text-balance` nos
títulos e o container `max-w-3xl` do `<main>` (as seções que precisam respirar podem
usar largura própria interna, mas sem estouro horizontal a 390px).

## Componentes novos (todos em `src/features/landing/components/`)

Todos RSC (`Server Components`), sem `"use client"` — exceto onde marcado. Dados
curados hardcoded no próprio arquivo (padrão `LandingShowcase`), sem query, sem props
vindas do servidor de dados.

- **`ProfundidadeCards`** — grade de cards (mobile: 1 col; `sm:grid-cols-2`/`3`). Cada
  card = ícone `lucide` + termo + explicação curta pt-BR: **Acesso** (subir de divisão),
  **Rebaixamento** (cair), **Promédio** (média de pontos que dá o ranking histórico),
  **Temporada** (o ciclo que vira e acumula), **Copa imortal** (mata-mata cujo título
  fica pra sempre), **Hall da fama** (a estante de troféus do competidor). Reusa tokens
  de cor semânticos (primary p/ acesso, destructive p/ queda, gold p/ troféu) espelhando
  `StandingsTable`/`HeroChip`.
- **Mocks anotados** (decisão de produto — ver "Mocks, não screenshots"):
  - `MockClassificacao` — reproduz uma classificação com a coluna **Forma** (últimos 5:
    bolinhas V/E/D) e um badge de destaque (ex.: "Melhor ataque"), no estilo visual da
    `StandingsTable`. Callouts apontam "Forma" e "destaques" (Frente 1 — insights).
  - `MockCompetidor` — cabeçalho de competidor com escudo (`TeamCrest`) + chips de
    **promédio / temporadas / títulos** (espelha o `HallDaFama` da `LandingShowcase`),
    com callout ensinando "promédio" e "hall".
  - `MockBracket` — um mini chaveamento (semifinal → final) comunicando copa/mata-mata,
    com callout "copa imortal".
  - `Callout` — primitivo reutilizável de anotação (uma seta/linha + rótulo curto),
    `aria-hidden` no visual, com `sr-only` que descreve o que o mock mostra. Posicionado
    de forma que NÃO cause overflow a 390px (empilha/reflui no mobile).
- **`ComoFunciona`** — lista ordenada (`<ol>`) de 3-4 passos, cada um com número, título
  e frase. Semântica real (`<ol>`) para leitores de tela; visual com o número em círculo.
- **`ProvaSocial`** — 2-3 cards de depoimento: aspas + texto + "— Primeiro nome, papel
  genérico". Enquanto placeholder, a seção exibe um RÓTULO VISÍVEL ao usuário (eyebrow/
  subtítulo "Exemplos ilustrativos" e/ou cada card discretamente marcado como exemplo),
  para que a natureza fabricada fique HONESTA e clara — um comentário só no código não
  basta (na página de aquisição, aspas+nome+papel sem disclosure lê-se como endosso real,
  o que seria enganoso). Além do rótulo visível, comentário no topo do arquivo:
  `PLACEHOLDER — trocar por depoimentos reais`. Copy redigida como EXEMPLO plausível, sem
  nome completo nem afirmação verificável.
- **`Faq`** — perguntas em `<details>/<summary>` NATIVOS (ver "FAQ sem dependência").
- **`ConversaoCta`** — bloco final: título de valor ("Temporadas e copas que duram para
  sempre"), 1-2 frases de premium (ilimitado, hall da fama), e o CTA "Criar conta grátis"
  (+ "Já tenho conta"), reusando `Button asChild` + `Link` para `/cadastro` e `/login`.

## Mocks, não screenshots (decisão registrada)

Os "screenshots reais anotados" do briefing são implementados como **mocks fiéis
renderizados em React**, NÃO como PNGs de screenshot. Motivos:

- **Tema:** um PNG não acompanha dark/light; um mock React usa os tokens semânticos e
  troca junto com o `next-themes`.
- **CLS/LCP:** dimensões fixas e markup nativo não reflowam; um PNG grande competiria
  pelo LCP e arriscaria layout shift no carregamento.
- **Fidelidade e manutenção:** o mock reusa os MESMOS componentes/tokens das telas reais
  (`TeamCrest`, faixas de zona, chips), então "envelhece" junto com o produto; um
  screenshot congela num estado e fica desatualizado.

Todos os mocks seguem o padrão da `LandingShowcase`: dados curados hardcoded, escudos
reais via `TeamCrest`/`escudoPublicUrl` (host já autorizado em `next.config.ts` +
CSP), bloco visual `aria-hidden` + `sr-only` descritivo.

## FAQ sem dependência nova

O shadcn instalado (`src/components/ui/`) NÃO tem `accordion`. Em vez de adicionar a
dependência, o FAQ usa `<details>/<summary>` NATIVOS estilizados com Tailwind: acessível
por teclado por padrão, abre/fecha sem JavaScript, RSC puro (sem `"use client"`), zero
CLS. Marca o chevron com `[&_svg]:group-open:rotate-180` (ou `details[open]`), estados de
foco visíveis. Se, na implementação, um comportamento single-open for desejado, aí sim um
leaf client mínimo (`FaqAccordion`) é permitido — mas o default é o `<details>` nativo,
mais barato e mais acessível.

**Teste sob jsdom (constraint).** O ambiente de teste é jsdom, que NÃO implementa o
toggle interativo de `<details>/<summary>` (clicar no summary não altera o atributo
`open`). Portanto o teste do FAQ NÃO deve verificar "abre/fecha por clique" (falharia
previsivelmente com o `<details>` nativo). O teste verifica a SEMÂNTICA (cada pergunta é
um `<summary>` dentro de um `<details>`) e a PRESENÇA das perguntas-e-respostas no DOM —
jsdom renderiza os filhos do `<details>` independentemente do `open`, então as respostas
estão consultáveis. Assim mantemos o `<details>` nativo como default sem reprovar o gate.

## Perf / tema / a11y

- **RSC-first:** a página inteira permanece Server Component; a única interatividade
  possível é o acordeão do FAQ, resolvido por `<details>` nativo (sem ilha client). Não
  há novo `"use client"` obrigatório.
- **CLS:** escudos por `next/image` com `width`/`height` fixos (via `TeamCrest`);
  nenhum asset novo pesado; o H1 continua sendo o LCP (as seções novas vêm abaixo da
  dobra e não competem).
- **Tema:** só tokens semânticos (`bg-card`, `text-muted-foreground`, `primary`,
  `destructive`, `gold/gold-ink`) — nada de cor hex hardcoded; validar em dark E light.
- **A11y:** blocos puramente ilustrativos `aria-hidden` + `sr-only` (padrão
  `LandingShowcase`); `ComoFunciona` usa `<ol>` real; FAQ navegável por teclado; CTAs
  são `<Link>` com texto claro; contraste dentro dos tokens da paleta (Dracula/Canarinho).
- **Mobile-first 390px:** tudo empilha sem overflow horizontal; grades caem para 1
  coluna; callouts dos mocks refluem (não vazam a viewport); toques ≥44px onde há
  interação. O dono valida em celular primeiro.
- **i18n pt-BR:** toda a copy em português do Brasil.

## Edge cases

- **Sessão presente:** inalterado — `redirect("/dashboard")` antes de renderizar
  qualquer seção nova (as seções são material de aquisição, nunca vistas por logado).
- **Auth indisponível:** mantém o `try/catch` atual — vira visitante anônimo e renderiza
  a landing completa; nenhuma seção nova depende de auth/dados.
- **Escudo do mock falha ao carregar:** `TeamCrest` cai para o monograma (comportamento
  existente) — sem buraco visual, sem CLS.
- **`prefers-reduced-motion`:** respeitar; as animações já usam `animate-rise`/
  `motion-safe:` — não adicionar movimento que ignore a preferência.
- **Overflow de callout a 390px:** posicionamento dos callouts deve refluir/empilhar no
  mobile (não absoluto fixo que estoure) — é o principal risco visual; validar a 390px.
- **Depoimentos placeholder:** nunca redigir como pessoa real verificável; comentário
  `PLACEHOLDER` obrigatório para o orquestrador sinalizar ao dono.

## Fora de escopo

Billing/checkout/gate de plano, página `/precos`, depoimentos reais, testes A/B e
analytics de conversão. Esta change entrega só a narrativa, os mocks e o CTA.
