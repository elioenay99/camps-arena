## Why

Terceiro lote da frente mobile, depois de `mobile-cards-partida` (`89e2ef9`/`a859a26`) e
`mobile-alvos-toque-safe-area` (`9652571`). Fecha dois defeitos independentes, os dois
confirmados por medição — não por suposição.

**Defeito 1 — o iOS amplia a página sozinha quando o usuário toca num campo.**
O Safari/iOS amplia a viewport automaticamente ao focar um campo editável cuja
`font-size` computada é menor que 16px, e **não desfaz o zoom** ao sair do campo. Na PWA
instalada isso é pior que num navegador: não há barra de endereço para reancorar, o app
simplesmente fica ampliado e o usuário precisa dar pinch para continuar usando.

O primitivo `Input` (`src/components/ui/input.tsx:11`) **já está correto** — `text-base
md:text-sm`, herdado do lote anterior. O buraco está nos campos que NÃO passam pelo
primitivo: o app usa `<select>` nativo em 12 arquivos, cada um com sua própria string de
classes copiada, e **todas** em `text-sm` (14px). A varredura por `<select`/`<textarea`
achou:

| Arquivo | Alcance | Hoje |
|---|---|---|
| `LeagueWizard.tsx:146` (`SELECT_CLASSE`) + 2 cópias inline (`:1469`, `:1491`) | 8 dropdowns — o wizard de pirâmide inteiro (formato, grupos, classificados, desempate, sobe/cai, tamanho da chave) | `h-8 … text-sm` |
| `CupWizard.tsx:39` (`SELECT_CLASSE`) | 4 selects do wizard de copa | `h-9 … text-sm` |
| `RuleListEditor.tsx:38` (`SELECT_CLASSE`) | 4 selects de regra de copa | `h-9 … text-sm` |
| `MatchCreateForm.tsx:15` (`selectClassName`) | os 2 selects **são** o formulário de "Nova partida" | `h-9 … text-sm` |
| `AddMemberSearch.tsx:18` (`selectClassName`) | papel do membro na equipe | `h-10 … text-sm` |
| `IniciarGruposPanel.tsx:194,302` | 2 selects | `h-9 … text-sm` |
| `IniciarMataMataPanel.tsx:192,201` | 2 selects | `h-9 … text-sm` |
| `competidor/ConfrontoDiretoPanel.tsx:66`, `tecnico/ConfrontoTecnicosPanel.tsx:67` | escolha do adversário | `h-11 md:h-10 … text-sm` |
| `demo/DemoExplorar.tsx:86,96,107`, `DemoTorneiosLista.tsx:93,240,259`, `DemoConfrontoDiretoPanel.tsx:72` | 7 selects da demonstração pública | `h-9 … text-sm` |
| `RoundPager.tsx:73` | pular direto para a rodada | `text-sm` |
| `ArtilheirosEncerrada.tsx:283`, `MatchScoreModal.tsx:453` | nome do autor do gol — campo de digitação, no modal mais usado do app | `text-sm` |
| `DemoPerfilSelector.tsx:26` | trocar perfil simulado | `h-7 … text-xs` |

Mais dois campos de digitação fora do primitivo: o campo HEX do `ColorField`
(`color-field.tsx:69` — altura já corrigida no lote anterior, mas a fonte ficou `text-sm`;
aparece em Identidade do torneio, cores da pirâmide e cores por divisão) e o `<textarea>` de
justificativa em `PropostasPendentes.tsx:129`.

**Defeito 2 — escudo quebrado vira ícone de "imagem quebrada", não iniciais.**
No print do dono (rodada 9, dados reais, celular dele) um clube aparece com o glifo nativo de
imagem quebrada em vez do placeholder de iniciais + cor estável que o `TeamCrest`
(`src/features/team/components/TeamCrest.tsx:38-74`) deveria mostrar. O caminho está
confirmado: a superfície do print é `MatchCard.tsx:329` / `PartidaIdentidade.tsx:73,78`, as
duas via `TeamCrest`.

**A hipótese da hidratação foi investigada e REFUTADA.** A suspeita era que o `onError` —
handler React, só ativo depois da hidratação — perdesse o evento `error` disparado pelo
browser antes do React hidratar. Não procede: o `next/image` instalado **já implementa
exatamente essa mitigação**, no ref callback do `ImageElement`
(`node_modules/next/dist/client/image-component.js:140-145`):

```js
if (onError) {
  // If the image has an error before react hydrates, then the error is lost.
  // The workaround is to wait until the image is mounted which is after hydration,
  // then we set the src again to trigger the error handler (if there was an error).
  img.src = img.src
}
```

O `onError` do `TeamCrest` chega intacto até lá (`get-img-props.js:148` o mantém em `...rest`,
repassado em `image-component.js:203-205`), então o gatilho está armado. Detalhe em
`design.md`.

Sobra um defeito **provado** e um risco **residual**:

- **Provado:** o estado `erro` do `TeamCrest` nunca reseta quando `escudoUrl` muda. Hoje isso
  está documentado como comportamento aceito por um teste (`TeamCrest.test.tsx:74-84`,
  "estado preso"). Não é teórico: o `RoundPager` troca de rodada **no lugar**, e o React
  reaproveita as instâncias de `TeamCrest` — um escudo que falhou na rodada 8 continua preso
  nas iniciais na rodada 9, mesmo com URL boa.
- **Residual:** a causa raiz do print pode ser a URL daquele clube estar quebrada no Storage.
  Verificar isso exige consultar banco/Storage, o que esta change **não pode** fazer (fica
  roteado ao orquestrador). O conserto do fallback vale de qualquer forma: escudo quebrado
  SHALL degradar para iniciais, nunca para ícone de erro.

**Decisões travadas (não reabrir):**

1. **Só apresentação/componente.** Zero DDL, zero Server Action, zero fetcher, zero RLS.
   `proxy.ts`/middleware intocados.
2. **O desktop não muda.** Todo bump é mobile-first com `md:` restaurando a altura e a fonte
   de hoje, inclusive nos selects cuja altura de desktop diverge do primitivo (`md:h-9`,
   `md:h-10`, `md:h-7` preservados por override).
3. **16px é piso, não sugestão.** A regra vale para todo elemento que recebe digitação ou
   foco de edição (`input`, `select`, `textarea`); NÃO vale para botões, rótulos e badges —
   o zoom do iOS só dispara em campo editável focado.
4. **`select` nativo continua nativo.** Nada de dropdown custom (Radix Select): o `<select>`
   do SO é acessível por teclado, leve, e no mobile abre a roleta nativa. O que muda é a
   classe, não o elemento.

## What Changes

- **Novo `src/components/ui/select-native.tsx`** — `<select>` compartilhado espelhando o
  `Input` do design system (`h-11 … text-base md:h-8 md:text-sm`, `rounded-lg`, mesmos anéis
  de foco e estados `disabled`/`aria-invalid`). Aceita `className` para preservar a densidade
  de desktop de cada chamada.

- **12 arquivos migrados para o `SelectNative`** — `LeagueWizard` (a `SELECT_CLASSE` e as duas
  cópias inline somem), `CupWizard`, `RuleListEditor`, `MatchCreateForm`, `AddMemberSearch`,
  `IniciarGruposPanel`, `IniciarMataMataPanel`, `ConfrontoDiretoPanel`,
  `ConfrontoTecnicosPanel`, `DemoExplorar`, `DemoTorneiosLista`, `DemoConfrontoDiretoPanel`.

- **3 campos com geometria deliberada ganham só o bump de fonte** — `RoundPager.tsx:73`
  (select com chevron sobreposto, `appearance-none`), `DemoPerfilSelector.tsx:26` (seletor
  compacto dentro da faixa da demonstração) e o `<textarea>` de `PropostasPendentes.tsx:129`:
  `text-base md:text-sm` (ou `md:text-xs`), mantendo o resto das classes.

- **`src/components/ui/color-field.tsx:69`** — o campo HEX passa a `text-base md:text-sm`. O
  `<input type="color">` ao lado NÃO muda: não recebe digitação, então não dispara zoom.

- **`src/features/team/components/TeamCrest.tsx`** — dupla guarda no fallback: (a) um `ref`
  que no mount checa `img.complete && img.naturalWidth === 0` (imagem já terminou de carregar
  e falhou) e cai no mesmo estado de erro, como defesa em profundidade caso a mitigação do
  `next/image` não dispare; (b) o estado `erro` passa a resetar quando `escudoUrl` muda,
  matando o "estado preso" da troca de rodada.

- **Testes** — novo `src/components/ui/select-native.test.tsx` (piso de 16px no mobile,
  densidade `md:` preservada, `className` sobrescreve); novos casos em `color-field.test.tsx`
  e `TeamCrest.test.tsx` (falha detectada no mount via `complete`/`naturalWidth`; recuperação
  do escudo na troca de `escudoUrl` — o teste "estado preso" é **invertido**, porque o
  comportamento que ele documentava era o defeito).

## Impact

- **Specs:** `design-system` (MODIFIED — a regra de alvo de toque de 44px ganha o par que
  faltava, o piso de 16px de fonte em campo editável, e passa a nomear o `SelectNative` como
  fonte única dos `<select>`; ADDED — degradação do escudo para iniciais).
- **Código (alterado):** 1 componente novo, 12 migrações de select, 4 bumps de fonte
  pontuais, `TeamCrest`, 3 arquivos de teste.
  **Intocados:** Server Actions, RPCs, RLS, fetchers, `proxy.ts`, banco, Storage, manifest,
  service worker.
- **Isolamento da demonstração preservado:** `@/components/ui/*` já é importado livremente por
  `src/features/demo` (o guard do `eslint.config.mjs:22-54` barra actions, supabase, fetchers,
  `*Connected` e `Live*` — não primitivos de UI).
- **Risco:** baixo, blast radius largo. O risco concreto é um select 12px mais alto no mobile
  apertar uma linha densa (`IniciarMataMataPanel` põe dois selects e um "×" na mesma linha).
  Isso não é verificável por teste unitário: a validação visual a 390px é do orquestrador.
