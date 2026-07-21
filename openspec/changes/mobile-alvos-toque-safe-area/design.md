## Contexto

Duas mudanças de FONTE (um primitivo e o shell) com blast radius largo e nenhuma regra de
negócio envolvida. O que exige cuidado não é a mudança em si — são três linhas de CSS e
uma chave de config — mas o efeito colateral em ~134 chamadas de botão que assumiam
alturas menores no mobile.

## Decisão 1 — o bump vai no PRIMITIVO, não nas chamadas

O requisito "Alvos de toque de ao menos 44px no mobile" (`design-system`) já mandava
aplicar a regra "na fonte dos primitivos … para que todos os formulários e CTAs herdem o
alvo adequado sem ajuste por chamada". Isso foi feito só no `size="default"`. As demais
variantes ficaram para trás — e a prova está no código: **a varredura encontrou pelo menos
12 chamadas que remendaram o alvo à mão**, exatamente onde a densidade importava:

| chamada | remendo |
|---|---|
| `dialog.tsx:79` (fechar) | `className="absolute … size-11 md:size-8"` + comentário "icon-sm=28px não atende" |
| `MatchScoreModal.tsx:287,314` (stepper) | `className="size-10"` |
| `ArtilheirosEncerrada.tsx:292,306,317` | `className="size-11 md:size-9"` |
| `DemoScoreModal.tsx:110,130,146,186,199` | `className="size-11 md:size-9"` |
| `EdicaoParticipantesPanel.tsx:264,275,286` | `className="min-h-11 min-w-11"` |
| `MatchHistoryList.tsx:147`, `OpenMatchesList.tsx:188` | `max-sm:[&_[data-slot=button]]:min-h-11` no container |
| `InviteControls.tsx:20,52`, `RoundPager.tsx:73`, `color-field.tsx:77` | `min-h-11` |

Doze remendos para o mesmo defeito é o sinal clássico de que o conserto pertence à fonte.
Consertar no primitivo torna todos eles redundantes — mas **não os torna conflitantes**:
`cn()` usa `tailwind-merge`, então o `className` da chamada continua vencendo a classe da
variante. Nenhum dos remendos precisa ser removido nesta change (removê-los seria um
refactor de 12 arquivos sem ganho funcional, e o `md:` de cada um preserva densidades
locais que a variante não conhece). Ficam como dívida cosmética registrada.

Valores escolhidos (mobile-first, `md:` restaura exatamente a altura de hoje):

| size | antes | depois | mobile | desktop |
|---|---|---|---|---|
| `sm` | `h-7` | `h-11 md:h-7` | 28 → **44** | 28 (igual) |
| `lg` | `h-9` | `h-12 md:h-9` | 36 → **48** | 36 (igual) |
| `icon` | `size-8` | `size-11 md:size-8` | 32 → **44** | 32 (igual) |
| `icon-sm` | `size-7` | `size-11 md:size-7` | 28 → **44** | 28 (igual) |
| `icon-lg` | `size-9` | `size-12 md:size-9` | 36 → **48** | 36 (igual) |

`lg` vai a **48px** (`h-12`), não 44: o "grande" precisa ser ≥ que o `default` nos DOIS
breakpoints, senão a variante mente. Isso vira invariante de teste
(`xs ≤ sm ≤ default ≤ lg` em ambos os breakpoints), não convenção oral — foi justamente a
falta dela que deixou `lg` (36px) menor que `default` (44px) passar despercebido.

## Decisão 2 — `xs`/`icon-xs` ficam de fora da regra dos 44px

`xs`/`icon-xs` são a válvula de densidade extrema (24px). A varredura achou **um único
consumidor**: `FluxoTemporadaPanel.tsx:587-604`, o par de chevrons "subir/descer" que
reordena empates — e ele já sobrescreve com `className="size-7"` (28px), então a variante
nem o alcança.

São AÇÃO de verdade, não adorno. Mas são um par EMPILHADO VERTICALMENTE dentro da linha de
cada competidor empatado: levar cada um a 44px faria a coluna saltar de 56px para **88px**
por linha, numa lista que pode ter várias. Trade-off assumido: sobe o override para
`size-9 md:size-7` (**36px** no mobile, +8px por botão, desktop intocado) — melhora
mensurável sem inflar a linha.

**Isto NÃO atinge os 44px e está registrado como tal.** É o único ponto do lote abaixo do
alvo. A alternativa (44px = 88px de coluna) e a escolhida (36px) são as duas defensáveis;
optei pela que não degrada a leitura da lista. Se o dono preferir o alvo cheio, é uma linha.

Por consequência, a spec passa a dizer explicitamente que `xs`/`icon-xs` são a exceção de
densidade e que **a chamada é responsável pelo próprio alvo** ao usá-las — o que evita que
a próxima pessoa leia a regra como universal e se surpreenda.

## Decisão 3 — varredura de containers que poderiam cortar o botão mais alto

Risco real do lote: um container de altura fixa cortando um botão que ganhou 16px. A
varredura (`grep` por `h-6…h-12` em `className`, mais leitura das linhas horizontais mais
apertadas) não achou nenhum:

- **Todos os `h-N` fixos encontrados** são `Skeleton` de `loading.tsx`, `<input>` de texto
  (`h-11 md:h-9`) ou o swatch de cor (`color-field.tsx:54`) — nenhum é wrapper de botão.
- **Os dois clusters de ação mais apertados** (`MatchHistoryList.tsx:147` e
  `OpenMatchesList.tsx:188`) usam `flex-wrap`/grid com `min-h-11` já aplicado aos filhos —
  ou seja, já contavam com 44px no mobile. Nada muda para eles.
- **Stepper do placar 2-up a 360px** (`MatchScoreModal.tsx:281`, o ponto mais sensível do
  app, com comentário de orçamento de largura) — os botões estão travados em `size-10` por
  `className`; `tailwind-merge` mantém o override. **Inerte.**
- **Header do dashboard** (`layout.tsx:58-67`): o hambúrguer (`size-11`,
  `NavLinks.tsx:81`) e o gatilho da conta (`size-11`, `AccountMenu.tsx:42`) **já são 44px**.
  O `ModeToggle` (`size="icon"`, 32px) era o ímpar da fila. Subi-lo a 44px **não aumenta a
  altura do header** — só alinha o alvo ao dos vizinhos. O mesmo vale para o `DemoNav`.
- **Botões "Entrar" (`page.tsx:77`) e "Criar conta" (`DemoNav.tsx:36`)**, ambos `sm`:
  28 → 44px. Estão em `flex items-center gap-2` sem altura fixa; o header da landing não é
  sticky (vive dentro de `main` com `py-16`), então cresce sem colidir com nada.

Conclusão: nenhum corte previsto. Mas altura de layout não é verificável por teste
unitário — **a validação visual a 390px é do orquestrador** e é ela que fecha o lote.

## Decisão 4 — `viewportFit: "cover"` é o que DESTRAVA as outras correções

`statusBarStyle: "black-translucent"` sem `viewportFit: "cover"` é uma combinação
inconsistente: o app pede para ocupar a área da status bar e depois recebe `0` de todo
`env(safe-area-inset-*)`, ficando sem como compensar. Por isso o `cover` entra **junto**
com os consumidores dos insets, nunca antes: sozinho ele empurraria o conteúdo para baixo
do notch sem nada reservando espaço — pioraria a situação em vez de melhorar.

Consumidores nesta change:
- `pt-[env(safe-area-inset-top)]` nos DOIS headers `sticky top-0`
  (`dashboard/layout.tsx:42` e `DemoNav.tsx:22`) — são os únicos elementos fixos/sticky do
  app (varredura por `fixed|sticky top-0|bottom-0` confirma; o único outro `fixed` é o
  `StadiumBackdrop`, `inset-0` decorativo e `pointer-events-none`, que deve mesmo sangrar
  até a borda).
- `padding-bottom: env(safe-area-inset-bottom)` no `body`, pela barra de gestos do Android.
  Vai no `body` (e não em cada página) porque o `body` é `min-h-full` com `border-box`: o
  padding cabe DENTRO dos 100%, sem criar overflow nem barra de rolagem nova.

Em navegador comum (sem PWA instalada / sem notch) todos os `env()` resolvem 0 e nada muda
visualmente — a mudança só "liga" onde havia o defeito.

## Decisão 5 — o toast desce para `bottom-center`

`top-center` cobre o header inteiro no mobile — marca, hambúrguer, tema e avatar — durante
os segundos do toast, bem quando o usuário acabou de agir e pode querer navegar. A
varredura por `fixed bottom-0`/`sticky bottom-0` **não achou nenhuma barra de ação fixa no
rodapé** (a navegação do app é hambúrguer no topo), então `bottom-center` não disputa espaço
com nada e ainda cai mais perto do polegar. Não precisou de offset.

## Riscos residuais

1. **Altura de layout não coberta por teste** — o gate mecânico prova classe, não pixel.
   Mitigado pela varredura acima; fechado só pela validação visual a 390px do orquestrador.
2. **`FluxoTemporadaPanel` fica a 36px**, abaixo do alvo — decisão consciente, acima.
3. **Header do dashboard/demo com padding extra em iOS com notch** — em retrato o inset é
   ~47px; o header sticky fica proporcionalmente mais alto. É o comportamento correto (hoje
   ele encostaria no relógio/bateria), mas é a mudança mais visível do lote no celular do
   dono.
