# Design — add-glossario-ajuda-termos

## Contexto

Termos de nicho aparecem no produto sem explicação no ponto de uso. A meta é uma
ajuda contextual **acessível** (teclado + leitor de tela + toque), não um tooltip
de `hover` — o app é mobile-first e `hover` não existe no toque.

## Decisões travadas

### 1. Popover, não hover-tooltip

O gatilho abre por **clique/toque/Enter/Espaço** e fecha por `Esc`/clique-fora. O
Radix `Popover` entrega isso de fábrica (foco gerenciado, `aria-haspopup`,
`aria-expanded`, dismiss por Esc e outside-click), enquanto um Tooltip de hover é
inacessível ao toque. Não há Tooltip/Popover shadcn no projeto.

### 2. Base = `radix-ui` já instalado

`radix-ui` (`^1.4.3`) já é dependência e a base dos wrappers existentes. O import
segue o padrão do projeto:

```tsx
import { Popover as PopoverPrimitive } from "radix-ui"
```

Zero dependência nova.

### 3. Wrapper shadcn genérico + componente-folha de conveniência

- `ui/popover.tsx` é o primitivo reutilizável (genérico, sem conhecer "termos").
- `features/glossario/Termo.tsx` é a folha de conveniência que compõe o primitivo
  com o botão "?" e a copy. Assim o Popover fica disponível para outros usos
  futuros sem acoplar ao glossário.

### 4. RSC-first

As páginas ancoradas permanecem Server Components. Só `Termo` (e o `ui/popover`
que ele consome) é `"use client"`. Como `Termo` é folha, o `"use client"` não
propaga para cima na árvore.

### 5. Catálogo único de copy

`features/glossario/termos.ts` centraliza `id → { rotulo, explicacao }` em pt-BR
(uma frase por termo). Evita copy duplicada entre âncoras e facilita ajuste de
texto. Cada âncora referencia o termo por `id`.

### 6. Tap-target: `size-11 md:size-8` (não `h-11 md:h-8`)

O gatilho é um botão de ÍCONE. Fixar só a altura (`h-11`) deixa a LARGURA livre e
o alvo pode ficar <44px. O gatilho SHALL usar `size-11 md:size-8` (altura E
largura), seguindo o precedente do repo em `dialog.tsx:82`. 44px de toque no
mobile, compacto (`size-8`) no desktop.

## Correções da verificação (bloqueios resolvidos)

Todas as âncoras foram reposicionadas para não quebrar HTML/teste. **Regra geral:
o gatilho "?" NUNCA fica DENTRO de um heading/label cujo texto é nome acessível ou
é assertado, NEM dentro de um `Record<..., string>` (dado compartilhado, sem
JSX) — sempre IRMÃO adjacente, no site de render real.**

### B1 — Vaga: fora do `<h2>`

`VagasSection.tsx:54-58` tem `<h2 id="vagas-titulo">Vagas</h2>` dentro de um flex.
Colocar o "?" DENTRO do `<h2>` tornaria o nome acessível "Vagas O que é Vaga?" e
quebraria `page.test.tsx:248/266` (`getByRole("heading", {name:"Vagas"})` exato).
→ O "?" é IRMÃO do `<h2>`, no mesmo flex; o nome do heading permanece "Vagas".

### B2 — Fase de liga: no consumidor, não no Record

`formatoMeta.ts:32-36` é `Record<..., string>` (fonte única de todos os cards e do
seletor). Editar o `label` espalharia o "?" por toda a UI e não comporta JSX.
→ Ancorar no CONSUMIDOR `FormatoCard` (`TournamentForm.tsx:39-79`), renderizando o
`Termo` condicionalmente só quando `value === "fase_liga"`. `formatoMeta.ts` NÃO é
tocado.

### B3 — Fase de liga: `<button>` fora do `<label>`

`FormatoCard` é um `<label>` que envolve `<input type="radio">`
(`TournamentForm.tsx:49-77`); o `PopoverTrigger` é um `<button>`. Aninhar
`<button>` em `<label>` é HTML inválido e o clique no "?" acionaria o radio.
`type="button"` + `stopPropagation` NÃO resolve a validade do HTML.
→ O gatilho "?" fica FORA do `<label>`, adjacente ao card, no mesmo grid cell (o
card e o "?" convivem na célula do grid de formatos).

### B4 — Barragem: no site de render, não no Record

`LeagueWizard.tsx:221-226` (`MODO_ROTULO`) é `Record<..., string>` e é renderizado
como `<option>` num `<select>` (`:1709-1713`) — `<option>` não comporta botão.
→ Ancorar no bloco condicional `ehBarragem` (`<legend>Estilo da barragem</legend>`),
que aparece ao usuário quando ele escolhe barragem. O "?" fica no rótulo da
`<legend>` como conteúdo inline (mesma técnica já usada no repo pela legend
"Clubes" do `TournamentForm.tsx`, que embute um `<span>` inline) — mantendo a
`<legend>` como filha direta do `<fieldset>` (preserva o nome do grupo) e o HTML
válido (`<button>` é conteúdo permitido em `<legend>`). É a primeira ocorrência
real do conceito ao usuário no wizard. NÃO tocar `MODO_ROTULO`/`<option>`.

### B5 — Copy de "Promédio": POR JOGO (não por temporada)

O schema (`leaguePyramidSchema.ts`) e o render (`CompetidorAgregados.tsx:13`,
`toFixed(3)`, hint "pontos por jogo") são POR JOGO. A copy do briefing ("por
temporada") ENGANA.
→ Copy correta: **"Média de pontos por jogo (estilo argentino) — compara quem
jogou quantidades diferentes de jogos."**

### B6 — Tap-target `size-11 md:size-8`

Ver decisão 6 acima.

## Estrutura do `Termo`

```
<span> {children: texto do termo}
  <Popover>
    <PopoverTrigger asChild>
      <button type="button" aria-label="O que é {rotulo}?"
              class="… size-11 md:size-8 …">
        <HelpCircle aria-hidden />
      </button>
    </PopoverTrigger>
    <PopoverContent>{explicacao}</PopoverContent>   {/* SEM PopoverArrow */}
  </Popover>
</span>
```

- O ícone é decorativo (`aria-hidden`); o rótulo acessível vem do `aria-label`.
- Alvo de toque ≥44px no mobile (`size-11`), compacto no desktop (`size-8`).
- `PopoverContent` usa `--popover`/`--popover-foreground`, contraste AA nos dois
  temas, **sem seta/`PopoverArrow`** (ver testabilidade).

## Testabilidade (jsdom) — obrigatório

Sem estas restrições os testes quebram em jsdom (não há `setupFiles`/polyfill em
`vitest.config.ts`):

- **`fireEvent.click`, NÃO `userEvent`.** Padrão do repo
  (`MatchScoreModal.test.tsx:48`). `userEvent` valida pointer-events/posição que o
  Popper não resolve em jsdom.
- **PROIBIR `PopoverArrow`/seta.** `@radix-ui/react-use-size` faz
  `new ResizeObserver` só para a seta → `ReferenceError` em jsdom, quebrando TODOS
  os testes de Popover. O `PopoverContent` não renderiza seta.
- **Asserções só de presença/atributos** (`aria-expanded`, texto no portal),
  nunca coordenadas.
- **`aria-haspopup` por PRESENÇA do atributo** — o Radix emite `"dialog"`, não
  `"true"`. Assertar `toHaveAttribute("aria-haspopup")` (sem valor exato) ou o
  valor `"dialog"`.

## Âncoras — quais têm teste

| Termo | Âncora | Teste em jsdom |
|-------|--------|----------------|
| Vaga | `VagasSection.tsx` (irmão do `<h2>`) | Sim — presença do "?" + heading "Vagas" intacto |
| Técnico | `TournamentForm.tsx:238-239` (`<p>` intro) | Sim — presença do "?" no form |
| Fase de liga | `FormatoCard` só em `fase_liga` | Sim — "?" presente com `fase_liga` selecionado; ausente nos outros |
| Promédio | `CompetidorAgregados.tsx:12` | Sim — presença do "?" |
| Pirâmide | `ligas/page.tsx` (estado vazio) | Opcional (RSC/estado vazio) |
| Barragem | `LeagueWizard.tsx` bloco `ehBarragem` | Opcional (fluxo de wizard) |
| Copa imortal | `copas/page.tsx` (estado vazio) | Opcional (RSC/estado vazio) |

O comportamento do `Termo`/Popover (clique → `aria-expanded`, `Esc` fecha, copy no
DOM) é testado UMA vez no componente isolado; as âncoras testam só a PRESENÇA do
gatilho, para não reexecutar o Popper por âncora.

## Alternativas descartadas

- **Tooltip por hover** — inacessível ao toque (mobile-first). Descartado.
- **Editar o `label` em `formatoMeta.ts`/`MODO_ROTULO`** — Records de string,
  compartilhados, sem JSX; espalhariam o "?" por toda a UI. Descartado.
- **Página de glossário central** — não resolve a explicação *no ponto de uso*;
  follow-up.
- **`title` nativo do HTML** — não abre por teclado de forma confiável, sem
  controle de estilo/contraste, some no toque. Descartado.
