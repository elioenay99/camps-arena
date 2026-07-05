# Design — add-classificacao-a11y-responsiva

## Contexto

Change 100% frontend + tokens CSS. Sem DDL, sem fetcher novo, sem action nova.
Fixes cirúrgicos sobre componentes já acessíveis. Duas frentes: E (a11y WCAG) e F
(responsividade da classificação). Este documento DECIDE a mecânica (não adia para
a implementação).

## Decisão 1 — Disclosure: um componente client POR LINHA (`StandingsRow`)

O requisito trava (dono): no mobile, mostrar POS/CLUBE/P/J/SG e revelar
V/E/D/GP/GC ao TOCAR na linha. Isso exige estado por linha (client). Restrições:
`<tbody>` só aceita `<tr>` como filho; a `StandingsTable` é RSC; e
`ClassificacaoResponsiva` recebe `children` como `ReactNode` OPACO (já renderizado
no servidor) — não dá para "estendê-la" para envolver `<tr>`.

Mecânica escolhida (única viável):

- **`StandingsRow` (novo, `"use client"`)** renderizado por `StandingsTable` uma
  vez por linha. Detém `useState(expandido)` e retorna um **Fragment com DUAS
  `<tr>`**: a linha principal + a linha de detalhe (quando expandida). Os dados
  das colunas chegam por PROPS serializáveis do RSC (números/strings/urls) — a
  projeção continua feita no servidor (`getTournamentClassificacao`); só o estado
  de expansão é client.
- **Gatilho** = `<button aria-expanded aria-controls={detalheId}>` (chevron)
  DENTRO da célula de cabeçalho da linha (não `<tr onClick>`: a `<tr>` não é
  focável por teclado nem deve conter o handler). Alvo ≥44px no mobile.
- **Linha de detalhe** = `<tr id={detalheId}><td colSpan={N}>` com **N DINÂMICO**
  = `COLUNAS.length` (já inclui a coluna "Pro" quando `temPromedio`) `+ (temForma ? 1 : 0)`.
  O chevron mora dentro de uma célula existente (a de cabeçalho da linha), então
  NÃO adiciona coluna e não altera N. As stats reveladas aparecem como pares
  rótulo→valor EXPLÍCITOS ("Vitórias: 12", "Gols pró: 40", …), porque a `<tr>` de
  detalhe é IRMÃ e não herda o `<th scope="row">` da principal.

## Decisão 2 — Gate por prop `expansivel` (default FALSE): consumidores crus intactos

`StandingsTable` só emite `StandingsRow` (client) + chevron + linha de detalhe
quando receber `expansivel` (default `false`). Nesse caso a tabela renderiza a
`<tr>` RSC atual, sem `<button>` morto por linha.

- Passam `expansivel`: só a **standings-page** (via `ClassificacaoResponsiva`) —
  `app/dashboard/torneios/[id]/page.tsx`, `app/dashboard/ligas/[id]/page.tsx`,
  `app/dashboard/copas/edicao/[id]/page.tsx`.
- NÃO passam (permanecem 100% RSC): `LandingShowcase`, `GrandeFinalPanel`,
  `DestinoPill`, `TemporadaTimeline`, `MatchCard`, e as tabelas cruas de copas.

## Decisão 3 — `compacto` = função de VIEWPORT × modo (regra dura do desktop)

Regra dura: **no desktop TODAS as colunas ficam visíveis SEMPRE, sem gatilho.**
Ocultar-secundárias + disclosure é comportamento de MOBILE. Um usuário desktop em
"Caber tudo" NÃO pode perder colunas.

Semântica final do toggle (documentada):

- `modo` (manual, `rolar`|`caber`): controla a TIPOGRAFIA/densidade
  (`group-data-[modo=caber]/standings:*` — `text-xs`, `px-1`, `min-w-0`),
  inalterado. No desktop, "caber" só compacta a tipografia — NÃO oculta coluna.
- `compacto` (derivado): controla a OCULTAÇÃO das secundárias + o disclosure.
  `compacto = deriveCompacto(viewportMobile, modo) = viewportMobile && modo === 'caber'`.
  Só é `true` no MOBILE. Desktop nunca é `compacto`.
- No mobile: "caber" = resumido (prioritárias + expandir); "rolar" = todas as
  colunas com scroll horizontal. No desktop: nenhum modo oculta coluna.

Fonte única da verdade para CSS **e** JS: `ClassificacaoResponsiva` (client)
computa `compacto` e o publica de DUAS formas coordenadas no wrapper
`group/standings`:

1. **Atributo `data-compacto={compacto}`** → as colunas secundárias e a coluna
   Forma passam a ocultar por `group-data-[compacto=true]/standings:hidden` (hoje
   a Forma usa `group-data-[modo=caber]` — muda para `compacto` para respeitar a
   regra dura: desktop-caber não esconde Forma).
2. **React Context (`StandingsModoContext`, valor `{ compacto }`)** consumido por
   `StandingsRow` para RENDERIZAR CONDICIONALMENTE (via JS, não CSS
   `display:none`) o chevron e a linha de detalhe — jsdom ignora `display:none`,
   então o render condicional é o que torna o disclosure testável.

Padrão RSC preservado: um Provider client (`ClassificacaoResponsiva`) pode
envolver `children` que são Server Components; as folhas client dentro deles
(`StandingsRow`) consomem o contexto. Sem transformar a árvore toda em client.

## Decisão 4 — Funções PURAS testáveis (sem matchMedia no teste)

jsdom não implementa `matchMedia` (já documentado em
`ClassificacaoResponsiva.test.tsx`). A derivação vai para funções puras, testadas
sem tocar em `matchMedia`:

- `deriveModoInicial(viewportMobile: boolean): Modo` → `viewportMobile ? 'caber' : 'rolar'`
  (F3 — default por viewport).
- `deriveCompacto(viewportMobile: boolean, modo: Modo): boolean` →
  `viewportMobile && modo === 'caber'`.

`ClassificacaoResponsiva` passa a ter estado `{ modo, viewportMobile }` (inicial
determinístico: `modo='rolar'`, `viewportMobile=false` → `compacto=false`,
casando o SSR e o esqueleto). Pós-hidratação, um efeito lê `matchMedia('(max-width: 640px)')`
(guard p/ jsdom) para `viewportMobile`, lê `localStorage` para `modo` (ou
`deriveModoInicial(viewportMobile)` quando não há preferência), e assina o
`change` do MQL para reconciliar em resize/rotação. `compacto` é derivado a cada
render por `deriveCompacto`.

`StandingsRow` é testado por ESTADO (não por viewport real): renderizado sob um
Provider com `compacto=true` → o `<button aria-expanded="false">` existe; ao
acionar → `aria-expanded="true"` e as células de detalhe aparecem. Com
`compacto=false` → nenhum chevron e nenhuma linha de detalhe (render condicional
por JS).

## Decisão 5 — Contraste AA com estratégia corrigida (dark E light)

Princípio (WCAG 1.4.3 texto / 1.4.11 não-texto): para texto sobre tint da MESMA
matiz, **clarear o TEXTO** (não engrossar o tint do fundo, que aproxima e piora).

- **`--destructive` como TEXTO (fix SISTÊMICO no token, dark).** `text-destructive`
  é usado como TEXTO em ~30 loci (`form.tsx` FormMessage, forms de auth,
  `color-field.tsx`, `MatchCreateForm`, `TeamSearchInput`, `button.tsx` etc.) e
  falha AA no dark (#ff5555 = 4.08 sobre card). Verificado: **não existe nenhum
  `bg-destructive` SÓLIDO** no código — os usos de fundo são TINTS
  (`bg-destructive/10`, `/12`, `/14`, `/20`) e FAIXAS decorativas
  (`before:bg-destructive/70`, `bg-destructive/70`, `aria-hidden`); o ÚNICO fundo
  destrutivo com texto claro por cima é o badge "D" da coluna Forma
  (`FormaBadges.tsx:12`, `bg-destructive/85`). Não há `--destructive-foreground`.
  Logo, **clarear `--destructive` no DARK** para `#ff8888` (≈5.6:1 como texto
  sobre card) corrige todos os loci de TEXTO de uma vez. Riscos endereçados:
  (a) validar o par `text-destructive` sobre `bg-destructive/10-20` — com `#ff8888`
  dá ≈4.7:1 sobre o tint (passa); (b) o badge "D" NÃO pode regredir — ao clarear o
  fundo, o `text-white` perderia contraste, então o "D" passa a
  `text-primary-foreground` (foreground ADAPTATIVO: letra escura no dark sobre
  vermelho claro ≈5.5:1, letra clara no light sobre vermelho escuro ≈4.8:1);
  (c) faixas decorativas são `aria-hidden` (sem exigência de texto). LIGHT
  (#c81a2a sobre branco ≈ 6.5) já passa — não muda.
- **Badge admin (fix LOCALIZADO, dark E light).** Só o badge `admin`
  (`text-primary` sobre `bg-primary/10`) falha: 4.46 dark / 4.41 light (os badges
  árbitro/moderador usam `bg-muted/40 text-muted-foreground` e já passam). Não dá
  para clarear `--primary` (token de marca). Fix: trocar o TEXTO do badge admin
  para `text-foreground` (alto contraste nos dois temas), MANTENDO
  `border-primary/30` + ícone em `text-primary` — a identidade fica na borda/ícone.
  `ChampionshipBadge` (fallback `bg-primary/10 text-primary`) é `aria-hidden`
  (ícone decorativo) — sem exigência de 4.5; deixado como está (registrado).
- **Anel de foco ≥3:1 (não-texto).** `ring-ring/50` (button.tsx:8) e
  `ring-destructive/20` (button.tsx:20) e o `<select>` do `RoundPager`
  (`focus-visible:ring-ring/50`, RoundPager.tsx:71) e o `outline-ring/50` GLOBAL
  (globals.css:156, ≈2.5) ficam abaixo de 3:1. Fix: usar a cor CHEIA
  (`ring-ring` / `ring-destructive` / `outline-ring`), validando ≥3:1 nos dois
  temas (dark #bd93f9 e light #008035 sobre card/branco ≈ 4.5 não-texto → passa),
  sem inflar a espessura (mantém `ring-3`). `/60` foi rejeitado (2.45).
- **`muted-foreground` sobre superfícies elevadas.** Onde aparecer nas superfícies
  TOCADAS por esta change, validar ≥4.5; se algum locus tocado falhar, corrigir
  localmente. O par genérico `muted-foreground` sobre `secondary` (4.26) fora das
  superfícies desta change é dívida PRÉ-EXISTENTE e fica DE-ESCOPADO (registrado),
  para não inchar o escopo cirúrgico.

Toda mudança de cor é conferida nos DOIS temas — nada regride no claro.

## Decisão 6 — Row-header = NOME; zona `sr-only` uma vez por linha

Nit E1: o cabeçalho de linha mais informativo é o NOME do clube (não a posição).
A célula do NOME vira `<th scope="row">` (a de posição continua `<td>`). O
`<span class="sr-only">` da zona é injetado UMA vez por linha, dentro dessa célula
de cabeçalho. O rótulo da zona reusa os MESMOS textos da legenda existente
(StandingsTable.tsx:303-314): "Acesso"→"Zona de acesso", "Rebaixamento"→"Zona de
rebaixamento", e no playoff "Playoff de acesso"/"Playout"/"Playoff" conforme os
booleanos já calculados. `<th>` herda `font-bold`/`text-align` do UA — resetar
com `font-normal text-left` para não alterar o visual da célula.

## Decisão 7 — Esqueleto e FOUC: alinhamento por render determinístico

`StandingsTableSkeleton` (usado em `torneios/[id]/loading.tsx`) espelha a
geometria "rolar"/10 colunas. O render inicial determinístico da tabela real é
TAMBÉM "rolar"/`compacto=false` (todas as colunas), então o boundary
esqueleto→conteúdo NÃO tem flash de layout. A ocultação de colunas + o chevron só
acontecem PÓS-HIDRATAÇÃO no mobile — um único reflow inerente ao design de dois
modos (já existente hoje para a tipografia). Portanto o esqueleto NÃO é alterado
(exclusão explícita e registrada); o reflow pós-hidratação no mobile é aceito. A
barra de toggle (`ml-auto`) num container mais largo é alinhada ao conteúdo para
não "fugir" à direita.

## Follow-up (documentado — NÃO nesta change)

O fix de foco desta change cobriu os primitivos e controles compartilhados
(`Button`, `Input`, `<select>` do RoundPager, contorno global). Restam ~7 campos
CUSTOM que ainda usam o anel fraco `ring-ring/50` fora do primitivo `Input`
(`MatchCreateForm`, `PhoneField`, `LeagueWizard`, `AddMemberSearch`,
`RuleListEditor`, `CupWizard`) e um `TeamRoleBadge.test` que assertava o texto
antigo do badge. Ficam para uma varredura de foco dedicada — fora do escopo
cirúrgico desta a11y da classificação.

## Não-objetivos

- Reescrever a tabela ou o wrapper de modos (fixes cirúrgicos).
- Alterar fetchers, RLS, actions ou schema (zero DDL).
- Alterar perceptivelmente o token de marca (`--primary`).
- Corrigir `muted-foreground` sobre `secondary` fora das superfícies tocadas
  (dívida pré-existente, de-escopada).
- Validação visual ao vivo (390px + desktop, dark+light) — fica com o
  orquestrador.

## Riscos

- **`<th scope="row">` no NOME:** herança de bold/align do UA — resetar por classe.
- **AA sem regressão no light:** cada par tocado conferido nos dois temas antes de
  fechar (um clareamento que ajuda o dark não pode escurecer demais o claro — no
  caso do `--destructive` o light não muda; no admin badge o `text-foreground`
  passa nos dois).
- **Disclosure sem quebrar a `<table>`:** Fragment de duas `<tr>` dentro de
  `<tbody>` é válido; `colSpan` DINÂMICO precisa acompanhar `temPromedio`/`temForma`.
- **Coordenação CSS × JS do `compacto`:** o `data-compacto` (CSS) e o Context (JS)
  vêm da MESMA derivação em `ClassificacaoResponsiva` — não podem divergir.
