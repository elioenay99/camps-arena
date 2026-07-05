## Why

A tabela de classificação do Goliseu já é razoavelmente acessível — `<table>`
semântica com `<th scope="col">`, `<abbr title>` + `<span sr-only>`, zonas de
acesso/rebaixamento com faixa lateral + legenda, e dois modos de leitura
("Rolar"/"Caber tudo") com default por viewport e persistência em
`localStorage`. Mas restam lacunas CIRÚRGICAS de WCAG e de responsividade que
comprometem o uso majoritário em celular (uso mobile-first) e por leitor de
tela:

- **A zona é comunicada só por COR** (faixa + legenda). Um leitor de tela lê a
  linha do rebaixado sem saber que ela está em zona de queda (WCAG 1.4.1 / 1.3.1).
- **Nenhuma célula da linha é `<th scope="row">`** — as células numéricas não se
  associam à linha (posição/clube) na navegação por leitor de tela (WCAG 1.3.1).
- **Vários controles ficam abaixo de 44px de toque no mobile:** as setas e o
  `<select>` do passador de rodadas (`RoundPager`, `icon-sm` = 28px / select ~34px),
  os botões de ação de partida (W.O./Editar/Encerrar/Aceitar/Recusar/Fechar
  rodada, hoje `min-h-10` = 40px), o swatch e o link "limpar" do `ColorField`
  (~36px / sem piso), e o link "Ver meus torneios" do estado vazio (`size="sm"`
  = 28px). O padrão do app já é `h-11 md:h-8` (44px no mobile); esses controles
  ficaram de fora.
- **Alguns pares de contraste falham AA no tema DARK:** `text-primary`
  (#bd93f9) sobre `secondary/accent/muted` nos badges (3.79–4.44), `destructive`
  como TEXTO (4.08), `muted-foreground` sobre superfícies elevadas (4.26–4.99);
  e o anel de foco do `Button` é fraco (`ring-ring/50`, `ring-destructive/20`),
  abaixo do contraste ≥3:1 de indicador (WCAG 1.4.11).
- **Responsividade da classificação:** no mobile, o modo "Caber tudo" espreme as
  8 estatísticas, sacrificando legibilidade; no desktop a view não aproveita a
  largura ociosa. O dono decidiu (travado) que o mobile deve priorizar
  **POS, CLUBE, P, J, SG** e revelar as demais (**V/E/D/GP/GC**) ao TOCAR na
  linha (disclosure), mantendo `<table>` semântica válida.

Esta change é **frontend + tokens CSS puro: ZERO DDL, zero migration, zero input
novo, zero query nova**. Os fixes são localizados e preservam a identidade
visual (roxo de marca `#bd93f9`) e o comportamento determinístico já existente
(default por viewport + `localStorage` sem mismatch de hidratação).

## What Changes

### Tarefa E — A11y WCAG (cirúrgico)

- **Zona anunciada por linha ao leitor de tela.** Reusando a MESMA lógica que já
  pinta a faixa lateral (`StandingsTable.tsx`), cada linha em zona ganha um
  `<span class="sr-only">` com o nome da zona ("Zona de rebaixamento", "Zona de
  acesso", "Zona de playoff/barragem"). Sem poluir o visual.
- **`scope="row"` por linha.** A célula de POSIÇÃO passa a ser `<th scope="row">`
  (em vez de `<td>`), associando as células numéricas à linha no leitor de tela.
- **Alvos de toque ≥44px no mobile** nos controles hoje menores:
  - Setas de rodada e `<select>` do `RoundPager` → 44px no mobile (compacto no
    desktop, `md:` mantém a densidade atual).
  - Botões de ação de partida (`WoButtons` `ALVO_TOQUE`, `MatchStatusButton`,
    `OpenMatchesList` "Editar placar") → de `min-h-10` (40px) para `min-h-11`
    (44px).
  - Botões de MODO da classificação ("Rolar"/"Caber tudo", ~28-30px — os
    controles principais da feature) e o gatilho de EXPANSÃO de linha → 44px.
  - `ColorField`: swatch (`h-9` ~36px) e link "limpar" → 44px de toque no mobile.
  - Estado vazio: link "Ver meus torneios" (`size="sm"` = 28px) → 44px no mobile.
- **Contraste AA (4.5:1) clareando o TEXTO, nos dois temas.** `text-destructive`
  falha AA como texto no dark (4.08) em ~30 loci; como NÃO há `bg-destructive`
  sólido no código, o fix é SISTÊMICO no token `--destructive` do dark (clarear
  até passar como texto), sem regressão de fundo. O badge `admin` (`text-primary`
  sobre `primary/10`, falha nos dois temas) passa a usar `text-foreground`
  mantendo a marca na borda/ícone. O anel de foco do `Button`, do `<select>` de
  rodada e o contorno GLOBAL (`outline-ring/50`) usam a cor CHEIA para indicador
  ≥3:1 (WCAG 1.4.11). Validado nos DOIS temas — nada regride no claro.
- **`:focus-visible` e ordem de tabulação lógica** em todos os controles tocados.

### Tarefa F — Responsividade

- **Desktop mais largo.** A view de classificação usa um container mais largo
  para aproveitar a largura ociosa (colunas completas / divisões lado a lado
  quando couber), sem afetar o mobile.
- **Mobile — colunas prioritárias + EXPANDIR-LINHA (decisão do dono, travada).**
  No estado COMPACTO (só mobile), por padrão só **POS, CLUBE (escudo), P, J, SG**
  aparecem; as demais (**V/E/D/GP/GC**) são reveladas ao TOCAR na linha. Mecânica
  decidida (ver design): um componente client por linha (`StandingsRow`) detém o
  estado e retorna um Fragment com DUAS `<tr>` (principal + detalhe), com um
  gatilho `<button aria-expanded aria-controls>` dentro de uma célula e a linha de
  detalhe (`<tr><td colSpan={N dinâmico}>`) listando as stats como pares
  rótulo→valor. Só a standings-page liga a expansão (prop `expansivel`); os
  consumidores crus continuam RSC. **Regra dura:** no DESKTOP todas as colunas
  ficam visíveis sempre (desktop nunca é compacto).
- **Densidade por viewport via funções puras.** `compacto = viewportMobile && modo === 'caber'`
  e `deriveModoInicial(viewportMobile)` viram funções PURAS testáveis (jsdom não
  tem `matchMedia`). `ClassificacaoResponsiva` publica `compacto` para o CSS
  (`data-compacto`, oculta secundárias) e para o JS (Context lido por
  `StandingsRow`), preservando o override manual via toggle, a persistência em
  `localStorage` e o estado inicial determinístico (sem mismatch de hidratação).

## Capabilities

### Modified Capabilities

- `standings-page`: a tabela de classificação passa a anunciar a zona por linha
  ao leitor de tela e a usar `<th scope="row">`; o modo compacto/mobile passa a
  priorizar POS/CLUBE/P/J/SG com divulgação progressiva das demais estatísticas
  por toque na linha (disclosure acessível), e a view aproveita a largura ociosa
  do desktop — preservando persistência, default por viewport e hidratação
  determinística.
- `design-system`: os alvos de toque de ações e controles de rodada/cor/estado
  vazio sobem para ≥44px no mobile; o contraste de badges e de texto acentuado
  atinge AA nos dois temas; o indicador de foco é reforçado para ≥3:1.

## Impact

- **UI (frontend):**
  - `src/features/standings/densidade.ts` (NOVO: `Modo`, `deriveModoInicial`,
    `deriveCompacto` — puras, testáveis).
  - `src/features/standings/components/StandingsTable.tsx` (prop `expansivel`;
    NOME vira `<th scope="row">` + zona `sr-only`; oculta secundárias por
    `data-compacto`; delega linha ao `StandingsRow` quando `expansivel`).
  - `src/features/standings/components/StandingsRow.tsx` (NOVO, `"use client"`:
    estado de expansão + Fragment de duas `<tr>` + chevron + linha de detalhe).
  - `src/features/standings/components/ClassificacaoResponsiva.tsx` (estado
    `{modo, viewportMobile}`; `StandingsModoContext`; `data-compacto`; botões de
    modo → 44px; container mais largo no desktop; preserva
    `localStorage`/matchMedia/hidratação determinística).
  - `src/features/match/components/RoundPager.tsx` (setas + `<select>` → 44px
    mobile; anel de foco do `<select>` cheio).
  - `src/features/match/components/WoButtons.tsx`,
    `MatchStatusButton.tsx`, `OpenMatchesList.tsx` (`min-h-10` → `min-h-11`).
  - `src/features/match/components/EmptyActiveMatches.tsx` (link "Ver meus
    torneios" → 44px mobile).
  - `src/components/ui/color-field.tsx` (swatch + "limpar" → 44px mobile).
  - `src/components/ui/button.tsx` (anel de foco cheio; texto destrutivo herda o
    token corrigido).
  - `src/features/team-roles/components/TeamRoleBadge.tsx` (badge `admin` →
    `text-foreground`, marca na borda/ícone).
  - `src/features/standings/components/FormaBadges.tsx` (badge "D" →
    `text-primary-foreground` adaptativo, não regride ao clarear o token).
  - **Sweep de tap target:** os overrides `min-h-10`/`min-w-10` (ação irreversível
    em `size="sm"`) sobem para `min-h-11`/`min-w-11` em todos os loci
    (convites/lifecycle/expulsar/copa/sair/compartilhar), alinhando ao piso 44px
    do primitivo — o requisito modificado eleva o piso de 40 para 44px.
- **Tokens CSS (`src/app/globals.css`):** clarear `--destructive` no DARK até AA
  como texto (~:131); `outline-ring/50` GLOBAL (~:156) → cheio. Mudança conferida
  nos dois temas; preservar o roxo de marca `#bd93f9`.
- **Fora de escopo (registrado):** `ChampionshipBadge` (ícone decorativo
  `aria-hidden`); `muted-foreground` sobre `secondary` fora das superfícies
  tocadas; `StandingsTableSkeleton` (o render inicial "rolar" já casa o esqueleto).
- **Banco de dados:** NENHUMA mudança. Sem DDL, sem migration.
- **Segurança/autorização:** inalterada — nenhum fetcher, RLS ou action é tocado.
- **Dependências:** nenhuma nova.
- **Testes:** cobertura de a11y (zona `sr-only` por linha; `scope="row"`;
  `aria-expanded` do disclosure; badges com contraste/rótulo) e do default por
  viewport / colunas prioritárias se extraível para função pura. A validação
  VISUAL (390px + desktop, dark+light) fica para o orquestrador.
