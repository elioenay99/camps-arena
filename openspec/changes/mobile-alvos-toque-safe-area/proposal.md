## Why

O dono usa o Goliseu pela PWA instalada no celular (~390px). Uma auditoria de 118 agentes
levantou 64 achados que sobreviveram à verificação adversarial; este lote ataca as DUAS
causas-raiz de maior alcance — as duas são de FONTE (um primitivo e o shell), então cada
conserto se propaga por dezenas de telas sem tocar em nenhuma regra de negócio.

**Causa-raiz 1 — só o tamanho `default` do `Button` respeita o alvo de 44px.**
O projeto já tem o requisito "Alvos de toque de ao menos 44px no mobile"
(`design-system`), mas ele foi implementado apenas no `size="default"`
(`h-11 md:h-8`). As demais variantes nunca ganharam o bump mobile
(`src/components/ui/button.tsx:25-37`):

| size | classe hoje | mobile | desktop |
|---|---|---|---|
| `default` | `h-11 … md:h-8` | **44px** | 32px |
| `sm` | `h-7` | **28px** | 28px |
| `lg` | `h-9` | **36px** | 36px |
| `icon` | `size-8` | **32px** | 32px |
| `icon-sm` | `size-7` | **28px** | 28px |
| `icon-lg` | `size-9` | **36px** | 36px |

Duas consequências. A primeira é alcance: `size="sm"` aparece em **117** chamadas de
produção e `size="icon"` em **17** — a maioria esmagadora dos botões do app está abaixo do
alvo no celular, incluindo "Entrar" da landing (`src/app/page.tsx:77`) e "Criar conta" da
demo (`DemoNav.tsx:36`), as duas primeiras superfícies de quem chega. A segunda é
incoerência: `lg` (36px) é **menor** que `default` (44px) no mobile — o "grande" é o
pequeno, o que quebra a expectativa de qualquer chamada que pediu ênfase.

**Causa-raiz 2 — o shell pede para invadir a área do notch e depois não reserva espaço.**
`metadata.appleWebApp.statusBarStyle` é `"black-translucent"`
(`src/app/layout.tsx:62`), que joga o conteúdo POR BAIXO da status bar do iOS, mas o
`export const viewport` (`layout.tsx:68-73`) não declara `viewportFit: "cover"`. Sem
`cover`, **todo `env(safe-area-inset-*)` resolve para 0** — a declaração de invasão está
ativa e a compensação, morta. Somam-se dois defeitos vizinhos da mesma superfície:
o `body` não tem `overscroll-behavior-y` (`globals.css:164-169`), então na PWA instalada o
gesto de puxar para baixo no topo **recarrega o app inteiro** (perde estado, refaz fetch);
e o `<Toaster>` está em `position="top-center"` (`layout.tsx:99`), cobrindo o header
inteiro — marca, menu hambúrguer, tema e avatar — enquanto o toast dura.

**Decisões travadas (não reabrir):**

1. **Só apresentação/configuração.** Zero DDL, zero Server Action, zero fetcher, zero RLS.
   `proxy.ts`/middleware intocados.
2. **O desktop não muda.** Todo bump é mobile-first com `md:` restaurando exatamente a
   altura de hoje.
3. **`lg` passa a ser ≥ `default` nos DOIS breakpoints** — a monotonicidade
   `xs ≤ sm ≤ default ≤ lg` vira invariante coberta por teste, não convenção oral.
4. **`xs`/`icon-xs` ficam como estão** — ver `design.md`.

## What Changes

- **`src/components/ui/button.tsx`** — replica o padrão mobile-first do `default` nas
  variantes que não tinham bump: `sm: h-11 md:h-7`, `lg: h-12 md:h-9`,
  `icon: size-11 md:size-8`, `icon-sm: size-11 md:size-7`, `icon-lg: size-12 md:size-9`.
  `default` e `xs`/`icon-xs` inalterados.

- **`src/app/layout.tsx`** — `export const viewport` ganha `viewportFit: "cover"`, ativando
  os `env(safe-area-inset-*)` que hoje valem 0; o `<Toaster>` migra de `top-center` para
  `bottom-center`.

- **`src/app/globals.css`** — o `body` ganha `overscroll-behavior-y: contain` (mata o
  pull-to-refresh que recarregava a PWA) e `padding-bottom: env(safe-area-inset-bottom)`
  (barra de gestos do Android). `overflow-x: clip` permanece intocado.

- **`src/app/dashboard/layout.tsx` e `src/features/demo/components/DemoNav.tsx`** — os dois
  headers `sticky top-0` ganham `pt-[env(safe-area-inset-top)]`, para não encostarem no
  notch agora que o `cover` está ativo.

- **Testes** — novo `src/components/ui/button.test.tsx` (alvo ≥44px no mobile por variante,
  monotonicidade `lg ≥ default`, densidade `md:` preservada) e novo
  `src/app/viewport.test.ts` (`viewportFit: "cover"` presente e coerente com
  `statusBarStyle: "black-translucent"`).

## Impact

- **Specs:** `design-system` (MODIFIED — o alvo de 44px passa a valer para TODAS as
  variantes de tamanho do `Button`, com monotonicidade), `app-shell` (ADDED — área segura,
  contenção do gesto de rolagem e posição do toast na PWA instalada).
- **Código (alterado):** `src/components/ui/button.tsx`, `src/app/layout.tsx`,
  `src/app/globals.css`, `src/app/dashboard/layout.tsx`,
  `src/features/demo/components/DemoNav.tsx`, dois testes novos.
  **Intocados:** Server Actions, RPCs, RLS, fetchers, `proxy.ts`, banco, manifest,
  service worker.
- **Risco:** médio-baixo, mas de blast radius largo — `size="sm"` está em 117 chamadas.
  O risco concreto é um container de altura fixa cortar um botão que ficou 16px mais alto
  no mobile; a varredura feita está registrada em `design.md`. Nada disso é verificável
  por teste unitário: a validação visual a 390px é do orquestrador.
