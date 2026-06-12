# Proposal — polish-paineis-inicio

## Why

Os três painéis "Iniciar torneio" (liga, grupos/fase-de-liga, mata-mata) são o
ponto MAIS denso e intimidador depois da criação: é onde o dono escolhe sorteio /
potes / montagem manual, cabeças de chave e confrontos. Eles são funcionais e bem
testados, mas ficaram visualmente ANTES do overhaul (`glow-up-visual`): container
`rounded-lg border px-4 py-4`, heading `text-lg font-semibold` sem ícone nem
`font-display`, modos como radios nativos soltos e prévia em texto corrido —
destoando da criação (`TournamentForm`) e do header da página, que já usam cards
selecionáveis, ícone do formato, `.elevate`, `font-display` e `animate-rise`.
Item #3 do backlog de UI ([[arena-ui-backlog]]); uso majoritário em celular
([[feedback-mobile-pwa]]).

## What Changes

Apresentação apenas — toda a lógica (motores de prévia, contrato de `name=` com as
actions, gates de quantidade, progressive disclosure, papéis acessíveis) permanece
byte-idêntica e coberta pelos testes existentes dos três painéis.

- **Moldura compartilhada `PainelInicioShell`** (card `.elevate rounded-2xl
  bg-card/60`): ícone do formato em chip `bg-primary/10 ring`, título em
  `font-display`, badge **Rascunho** (`StatusPill`) e metadados como chips
  (ida e volta / 3º lugar) em vez de uma linha de texto corrida.
- **Prévia em caixa destacada `PreviaBox`** (`border-primary/20 bg-primary/5`):
  o que a action vai gerar ganha peso visual (fonte única do motor preservada).
- **Modos viram cards selecionáveis `ModoCard`** (ícone + título + descrição,
  estado selecionado `border-primary bg-primary/8`), no idioma do `FormatoCard` da
  criação; radio nativo `sr-only` por baixo (acessibilidade e contrato de
  `name="modo"` intactos). Mobile-first: empilham no 390px, lado a lado no `sm`.
- **Revelações de potes/manual** (cabeças de chave, grupo por clube, confrontos)
  ganham container `animate-rise rounded-xl bg-muted/20` e linhas com alvo de
  toque maior.

## Capabilities

Nenhuma capability nova. Adiciona um requisito de APRESENTAÇÃO dos painéis de
início em `tournament-management` (comportamento/dados/contrato inalterados),
espelhando o requisito de apresentação da página do torneio.

## Impact

- **Novo**: `src/features/tournament/components/iniciar-panel-ui.tsx` — primitivos
  presentacionais SEM `"use client"` (markup puro), usáveis tanto pela RSC da liga
  quanto pelas folhas client de grupos/mata-mata: `PainelInicioShell`, `PreviaBox`,
  `ModoCard`.
- **Editados**: `IniciarTorneioPanel.tsx` (liga, RSC), `IniciarGruposPanel.tsx`
  (client), `IniciarMataMataPanel.tsx` (client) — só o JSX de apresentação.
- **Sem mudança**: actions (`iniciarTorneio`/`iniciarTorneioGrupos`/
  `iniciarMataMata`), motores de prévia, names dos campos, gates, RLS, e os três
  arquivos `*.test.tsx` (devem passar inalterados).
- **Risco**: baixo (presentational). Validar contraste AA nos 2 temas
  (Dracula/Canarinho), os cards de modo selecionado/desabilitado, e o layout no
  390px (cards de modo, selects de grupos/classificados, confrontos manuais).
