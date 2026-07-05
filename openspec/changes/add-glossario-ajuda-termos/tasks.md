# Tasks — add-glossario-ajuda-termos

## 0. Baseline

- [ ] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test`.
  Registrar a contagem verde (verde final = igual ao baseline, zero regressão).

## 1. Primitivo `ui/popover.tsx` (design-system)

- [ ] 1.1 Criar `src/components/ui/popover.tsx` (`"use client"`) exportando
  `Popover`, `PopoverTrigger`, `PopoverContent`, `PopoverAnchor` sobre
  `import { Popover as PopoverPrimitive } from "radix-ui"` (mesmo padrão de
  `dialog.tsx`).
- [ ] 1.2 `PopoverContent` dentro de `PopoverPrimitive.Portal`, com `sideOffset`
  padrão, tokens `bg-popover text-popover-foreground`, borda/sombra do sistema,
  `data-slot="popover-content"`, `z-50`, e as animações de entrada/saída padrão
  shadcn (`data-[state=open]`/`data-[side=*]`). Contraste AA nos dois temas.
- [ ] 1.3 **NÃO expor/usar `PopoverArrow`** (seta). O `@radix-ui/react-use-size`
  instancia `ResizeObserver` só para a seta → `ReferenceError` em jsdom (sem
  polyfill em `vitest.config.ts`), quebrando todos os testes de Popover. Nada de
  seta no `PopoverContent`.
- [ ] 1.4 Conferir que o `PopoverTrigger` expõe `aria-haspopup` (Radix emite
  `"dialog"`) e `aria-expanded`, e que o fechamento por `Esc`/clique-fora funciona.

## 2. Catálogo de copy `features/glossario/termos.ts`

- [ ] 2.1 Criar `src/features/glossario/termos.ts` com `id → { rotulo, explicacao }`
  em pt-BR (uma frase por termo):
  - `piramide`: "Divisões empilhadas (Série A, B, C…) com acesso e rebaixamento
    entre elas."
  - `vaga`: "Cada clube do campeonato é uma vaga; você convida alguém pra
    assumi-la."
  - `tecnico`: "Quem comanda um clube: assume a vaga por convite e pode ser
    substituído."
  - `promedio`: **"Média de pontos por jogo (estilo argentino) — compara quem
    jogou quantidades diferentes de jogos."** (POR JOGO — o schema
    `leaguePyramidSchema.ts` e o render `CompetidorAgregados.tsx:13` `toFixed(3)`
    são por jogo, não por temporada; corrige o briefing.)
  - `fase-de-liga`: "Todos jogam numa tabela única e os melhores avançam pro
    mata-mata (estilo Champions)."
  - `barragem`: "Confronto extra entre clubes de zonas intermediárias pra decidir
    quem sobe/cai."
  - `copa-imortal`: "Uma copa que continua edição após edição, guardando o
    histórico."

## 3. Componente-folha `features/glossario/Termo.tsx`

- [ ] 3.1 Criar `src/features/glossario/Termo.tsx` (`"use client"`, FOLHA):
  renderiza o `children` (texto do termo) + `PopoverTrigger asChild` com um
  `<button type="button">` "?" (ícone `HelpCircle` de lucide, `aria-hidden`),
  `aria-label` "O que é {rotulo}?", e `PopoverContent` com a `explicacao`.
- [ ] 3.2 Aceitar `id` (chave em `termos.ts`) e `children`; a copy (`rotulo`/
  `explicacao`) vem do catálogo (fonte única).
- [ ] 3.3 **Tap-target `size-11 md:size-8`** (altura E largura — precedente
  `dialog.tsx:82`), NÃO `h-11 md:h-8` (fixa só altura; botão de ícone pode ficar
  <44px de largura). Botão discreto, `:focus-visible` visível, na ordem de
  tabulação. `PopoverContent` **sem seta**.

## 4. Âncoras (primeira ocorrência — um "?" IRMÃO do rótulo, nunca dentro dele)

**Regra dura:** o gatilho NUNCA entra em heading/label cujo texto é nome
acessível/assertado, NEM em `Record<..., string>` (sem JSX). Sempre IRMÃO no site
de render real.

- [ ] 4.1 **Pirâmide** — `src/app/dashboard/ligas/page.tsx` (estado vazio "Sua
  primeira pirâmide"): o "?" IRMÃO do `<h2>` (o nome do heading permanece "Sua
  primeira pirâmide"). Estado vazio = onde o conceito é introduzido ao novato
  (decisão consciente). Inserir `Termo` (client, folha) sem tornar a página client.
- [ ] 4.2 **Vaga** — `src/features/tournament/components/VagasSection.tsx:54-58`:
  o "?" IRMÃO do `<h2 id="vagas-titulo">Vagas</h2>`, dentro do flex já existente.
  O nome acessível do heading continua "Vagas" — **não quebrar**
  `page.test.tsx:248/266` (`getByRole("heading", {name:"Vagas"})`).
- [ ] 4.3 **Técnico** — `src/features/tournament/components/TournamentForm.tsx:238-239`
  (parágrafo `<p>` "…quem aceita vira o técnico…"), texto de corpo, UMA ocorrência.
  **NÃO** ancorar no "téc." por-linha de `VagasSection.tsx:96` (repetiria o "?" e
  mexeria no texto assertado em `VagasSection.test.tsx:62-63`,
  `getByText("téc. Ana")`).
- [ ] 4.4 **Promédio** — `src/features/league/components/competidor/CompetidorAgregados.tsx:12`
  (rótulo "Promédio"): o "?" IRMÃO do rótulo, não dentro dele.
- [ ] 4.5 **Fase de liga** — no consumidor `FormatoCard`
  (`TournamentForm.tsx:39-79`), renderizar `Termo` condicionalmente só quando
  `value === "fase_liga"`, e **FORA do `<label>`** do card (botão dentro de
  `<label>` é HTML inválido e acionaria o radio) — adjacente ao card, no mesmo
  grid cell. **NÃO tocar `formatoMeta.ts`** (`Record<..., string>` compartilhado).
- [ ] 4.6 **Barragem** — `src/features/league/components/LeagueWizard.tsx`, bloco
  condicional `ehBarragem` (`<legend>Estilo da barragem</legend>`): o "?" IRMÃO da
  `<legend>` (fora dela) — primeira ocorrência real do conceito ao usuário no
  wizard. **NÃO tocar** o `Record` `MODO_ROTULO` (`:221-226`) nem os `<option>`
  (não comportam botão).
- [ ] 4.7 **Copa imortal** — `src/app/dashboard/copas/page.tsx:68-71` (`SemCopas`,
  estado vazio "A copa é imortal — edição após edição"): o "?" IRMÃO do `<p>`,
  junto ao termo literal já visível — sem duplicar a copy visível. Estado vazio =
  onde o conceito é introduzido (decisão consciente).

## 5. Testes

**Restrições jsdom (obrigatórias):** `fireEvent.click` (NÃO `userEvent` — padrão
`MatchScoreModal.test.tsx:48`); `PopoverContent` **sem seta**; asserções só de
presença/atributos, nunca coordenadas; `aria-haspopup` por PRESENÇA do atributo
(Radix emite `"dialog"`, não `"true"`).

- [ ] 5.1 `Termo`/Popover isolado (comportamento, UMA vez): trigger com
  `aria-haspopup` (presente) e `aria-expanded="false"`; após `fireEvent.click` →
  `aria-expanded="true"` e a `explicacao` do termo presente no DOM (portal);
  `fireEvent.keyDown(Escape)` (ou `fireEvent.click` no trigger) → `aria-expanded="false"`.
- [ ] 5.2 `aria-label` do botão contém o rótulo do termo ("O que é {rotulo}?").
- [ ] 5.3 **Presença do "?" nas âncoras testáveis em jsdom** (só presença do
  gatilho, não reabrir o Popper por âncora):
  - `VagasSection` → "?" presente E heading "Vagas" intacto (`getByRole("heading",
    {name:"Vagas"})` ainda passa).
  - `TournamentForm` → "?" de Técnico presente no form; "?" de Fase de liga
    presente APENAS com `fase_liga` selecionado e ausente nos demais formatos.
  - `CompetidorAgregados` → "?" de Promédio presente.
  - Âncoras de estado vazio (Pirâmide/Copa) e de wizard (Barragem): validação
    VISUAL deferida (não exigem teste unitário jsdom).

## 6. Gate de qualidade

- [ ] 6.1 `openspec validate add-glossario-ajuda-termos --strict` = valid.
- [ ] 6.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (igual ao
  baseline — zero regressão). Em especial, `page.test.tsx` e `VagasSection.test.tsx`
  continuam verdes (âncoras irmãs não alteram nomes acessíveis assertados).
- [ ] 6.3 Validação VISUAL 390px + desktop, dark E light (o "?" discreto ≥44px,
  abre por toque, popover legível com contraste AA, foco visível, fecha por
  Esc/fora). — DEFERIDO ao orquestrador (validação ao vivo).

## 7. Follow-ups (fora do escopo core, registrados)

- [ ] 7.1 Subtítulo/descrição curta nos itens de navegação — só se couber no
  design da barra mobile; caso contrário, follow-up.
- [ ] 7.2 Página de micro-glossário dedicada — follow-up.
