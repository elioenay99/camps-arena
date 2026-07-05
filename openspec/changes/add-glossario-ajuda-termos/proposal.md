## Why

O Goliseu usa vocabulário de nicho que o leigo encontra pela primeira vez sem
nenhuma explicação no ponto de uso: **pirâmide**, **vaga**, **técnico**,
**promédio**, **fase de liga**, **barragem** e **copa imortal**. Hoje, quem cria
o primeiro campeonato precisa deduzir o significado pelo contexto (ou desistir).
Não há um mecanismo de ajuda contextual acessível: nem tooltip, nem popover, nem
glossário.

O padrão comum — tooltip por `hover` — **não serve** a este app: o uso é
majoritariamente mobile (validar tudo em 390px primeiro) e `hover` não existe no
toque. A ajuda precisa abrir por **clique/toque** e ser operável por **teclado**
e **leitor de tela**.

Não existe primitivo de Popover/Tooltip no projeto (só `Dialog`, `Tabs`,
`Label`). O pacote `radix-ui` (`^1.4.3`) já está nas dependências e é a base dos
wrappers shadcn existentes (`dialog.tsx`, `tabs.tsx`, `label.tsx` usam
`import { X as XPrimitive } from "radix-ui"`). O caminho natural é adicionar um
wrapper shadcn de **Popover** sobre `radix-ui` e um componente-folha de
conveniência que ancora a explicação de um termo.

Esta change é **frontend puro: ZERO DDL, zero migration, zero query, zero action,
zero dependência nova** (reusa `radix-ui` já instalado). As páginas ancoradas
continuam Server Components — apenas o `Termo`/Popover é client (folha da árvore).

## What Changes

### Primitivo de Popover acessível (design-system)

- **NOVO `src/components/ui/popover.tsx`** — wrapper shadcn sobre o `Popover` do
  `radix-ui` (mesmo estilo de import dos wrappers existentes), com
  `Popover`/`PopoverTrigger`/`PopoverContent`/`PopoverAnchor`. O `PopoverContent`
  usa os tokens `--popover`/`--popover-foreground` (Dracula no escuro, Canarinho
  no claro), borda/sombra do sistema, `data-slot` e animações de
  entrada/saída no padrão shadcn. Acessibilidade herdada do Radix: foco
  gerenciado, `aria-haspopup`/`aria-expanded` no trigger, fecha por `Esc` e por
  clique-fora, seta de posicionamento opcional.

### Ajuda contextual por termo (nova capability `contextual-glossary`)

- **NOVO `src/features/glossario/Termo.tsx`** (`"use client"`, FOLHA) — renderiza
  o texto do termo seguido de um `<button>` "?" discreto (ícone `HelpCircle`,
  decorativo `aria-hidden`) com `aria-label` descritivo ("O que é <termo>?"). O
  botão é o `PopoverTrigger`; ao acionar (clique/toque/Enter/Espaço) abre um
  `PopoverContent` com a explicação em **uma frase**. Alvo de toque ≥44px no
  mobile recuando à densidade compacta no desktop (padrão `size-11 md:size-8`), foco
  visível, na ordem de tabulação. Um catálogo de copy (`termos.ts`) mantém as 7
  definições em pt-BR como fonte única.
- **Âncoras (primeira ocorrência de cada termo, um "?" discreto por termo).**
  **Regra dura:** o gatilho "?" NUNCA entra DENTRO de um heading/label cujo texto
  é nome acessível ou é assertado por teste, NEM dentro de um `Record<..., string>`
  (fonte de dados compartilhada, sem JSX) — sempre como IRMÃO adjacente, no SITE
  DE RENDER real do rótulo:
  1. **Pirâmide** — estado vazio de ligas (`dashboard/ligas/page.tsx`, "Sua
     primeira pirâmide"): o "?" é IRMÃO do `<h2>` (o nome do heading permanece
     "Sua primeira pirâmide").
  2. **Vaga** — cabeçalho da seção de vagas (`VagasSection.tsx:54-58`): o "?" é
     IRMÃO do `<h2 id="vagas-titulo">Vagas</h2>`, dentro do flex já existente. O
     nome acessível do heading continua "Vagas" (não quebra `page.test.tsx:248/266`).
  3. **Técnico** — parágrafo introdutório do `TournamentForm.tsx:238-239` ("…quem
     aceita vira o técnico…"), texto de corpo (`<p>`), UMA ocorrência — NÃO o
     "téc." por-linha de `VagasSection.tsx:96` (repetiria o "?" e mexeria no texto
     assertado em `VagasSection.test.tsx:62-63`).
  4. **Promédio** — rótulo do agregado em `CompetidorAgregados.tsx:12` (IRMÃO do
     rótulo "Promédio", não dentro dele).
  5. **Fase de liga** — no CONSUMIDOR `FormatoCard` (`TournamentForm.tsx:39-79`),
     renderizado condicionalmente só quando `value === "fase_liga"`, e FORA do
     `<label>` do card (botão dentro de `<label>` é HTML inválido e acionaria o
     radio). NÃO tocar `formatoMeta.ts` (é `Record<..., string>` compartilhado).
  6. **Barragem** — no SITE DE RENDER do wizard onde a opção aparece ao usuário:
     o bloco condicional `ehBarragem` do `LeagueWizard.tsx` (`<legend>Estilo da
     barragem</legend>`), com o "?" IRMÃO da `<legend>`. NÃO tocar o `Record`
     `MODO_ROTULO` (`:221-226`) nem os `<option>` (não comportam botão).
  7. **Copa imortal** — estado vazio de Copas (`dashboard/copas/page.tsx:68-71`,
     `SemCopas`: "A copa é imortal — edição após edição"): o "?" IRMÃO do `<p>`/
     junto ao termo literal já visível.
- Âncoras em estado-vazio (pirâmide/copa) são o ponto onde o CONCEITO é
  introduzido ao novato — decisão consciente (não é a "primeira ocorrência" para
  o usuário recorrente, e sim onde o termo é apresentado).

### Fora de escopo (follow-up documentado)

- Subtítulo/descrição curta nos itens de navegação (a barra mobile é horizontal e
  não comporta subtítulo sem redesenho) — follow-up.
- Página de micro-glossário dedicada — follow-up.

## Capabilities

### Added Capabilities

- `contextual-glossary`: ajuda contextual acessível na primeira ocorrência dos
  termos de nicho, via um "?" que abre um Popover com uma explicação de uma frase,
  operável por teclado e leitor de tela.

### Modified Capabilities

- `design-system`: ganha um primitivo de Popover acessível (wrapper shadcn sobre
  `radix-ui`), respeitando os temas Dracula/Canarinho e os tokens
  `--popover`/`--popover-foreground`.

## Impact

- **UI (frontend):**
  - `src/components/ui/popover.tsx` (NOVO): wrapper Radix Popover, estilo shadcn.
  - `src/features/glossario/termos.ts` (NOVO): catálogo pt-BR dos 7 termos (id →
    rótulo + explicação de uma frase).
  - `src/features/glossario/Termo.tsx` (NOVO, `"use client"`): termo + botão "?"
    + Popover; alvo de toque ≥44px no mobile.
  - Âncoras (edições cirúrgicas, um "?" por termo, sempre IRMÃO do rótulo):
    `src/app/dashboard/ligas/page.tsx` (pirâmide),
    `src/features/tournament/components/VagasSection.tsx` (vaga),
    `src/features/tournament/components/TournamentForm.tsx` (técnico + fase de
    liga via `FormatoCard`),
    `src/features/league/components/competidor/CompetidorAgregados.tsx` (promédio),
    `src/features/league/components/LeagueWizard.tsx` (barragem, bloco
    `ehBarragem`),
    `src/app/dashboard/copas/page.tsx` (copa imortal).
    **NÃO tocados:** `formatoMeta.ts` e `MODO_ROTULO`/`PlayoffsPanel.tsx`
    (Records de string / `<option>`, sem JSX).
- **Banco de dados:** NENHUMA mudança. Sem DDL, sem migration, sem query, sem RPC.
- **Server Actions / autorização / RLS:** inalteradas — nenhum fetcher ou action é
  tocado. As páginas ancoradas seguem RSC; só o `Termo` é client.
- **Dependências:** NENHUMA nova — reusa `radix-ui` (`^1.4.3`) já instalado.
- **Tokens/tema:** reusa `--popover`/`--popover-foreground`; sem novos tokens.
  Conteúdo do popover valida contraste AA nos dois temas (Dracula + Canarinho).
- **Testes:** o `Termo`/Popover (abre por clique, `aria-haspopup`/`aria-expanded`,
  conteúdo presente no DOM ao abrir, fecha por `Esc`) e a presença do "?" nas
  âncoras. **Restrições jsdom (obrigatórias — senão os testes quebram):** usar
  `fireEvent.click` (NÃO `userEvent` — padrão do repo em `MatchScoreModal.test.tsx:48`;
  `userEvent` valida pointer-events/posição que o Popper não resolve em jsdom);
  PROIBIDO `PopoverArrow`/seta no `PopoverContent` (o `@radix-ui/react-use-size`
  instancia `ResizeObserver`, ausente em jsdom → `ReferenceError`); asserções só
  sobre presença/atributos (`aria-expanded`, texto no portal) e `aria-haspopup`
  por PRESENÇA do atributo (o Radix emite `"dialog"`, não `"true"`), nunca sobre
  coordenadas.
- **Validação visual** (390px + desktop, dark+light): deferida ao orquestrador.
