# Design — polish-listas-estados

Mudança presentacional. As decisões abaixo existem para deixar o ESCOPO honesto
(o que muda, o que NÃO muda e por quê) e dar ao gate de verificação os trade-offs.

## Princípio: preservar contrato, texto e a11y

Os testes `MatchListsRodada.test.tsx` e `WoButtons.test.tsx` fixam:

- Textos visíveis exatos: `R2`, `R1 ida`/`R1 volta`, `W.O.`, `2 x 1`, `0 x 0`,
  `(vaga aberta)`.
- Papéis e nomes acessíveis: `heading "Rodada 1"`, botões `"W.O."`, `"Encerrar"`,
  `"Solicitar W.O."`, `/fechar rodada/i`, `"Aceitar"`/`"Recusar"`.
- Blocos `sr-only`: `Rodada N: Placar atual/final`, `W.O. — <nome> venceu`.
- **Guard de RSC**: `OpenMatchesList.tsx` e `MatchCard.tsx` NÃO podem conter
  `"use client"` (contenção de PII — o celular só entra no HTML de quem joga).

Regra de ouro do diff: só mudam `className` e wrappers `aria-hidden` decorativos.
Nenhum nó de texto, role, `name` acessível ou `sr-only` é alterado. O placar
continua um ÚNICO nó `{placar_1} x {placar_2}` (senão `getByText("2 x 1")` quebra).
O cabeçalho de rodada continua um `<h3>` cujo nome acessível é só "Rodada N"
(qualquer marcador de acento é `aria-hidden`, sem texto extra).

## Linguagem visual aplicada (fundação existente — [[arena-paleta-visual]])

- **Linhas das listas**: `bg-card/40` + borda + `motion-safe:transition-colors
  hover:border-primary/30` — profundidade sutil no idioma do `ConfrontoCard`
  (`hover:border-primary/30`), SEM `.elevate` cheio (linhas densas ficariam
  ruidosas com sombra de card).
- **Placares**: `font-display tabular-nums` — fonte única de placar do app.
- **Status da partida** (`agendada`/`em andamento`): pílula discreta
  `rounded-full bg-muted px-2 py-0.5 text-xs` (definição sem competir com os
  botões de ação). O `aria-hidden` atual e o `sr-only` de status permanecem.
- **Cabeçalho de rodada**: `font-display` + marcador de acento `aria-hidden`
  (barra/ponto do primário), mantendo o botão "Fechar rodada N" à direita.
- **Estados de fronteira**: chip de ícone + título `font-display` + `.elevate
  animate-rise`, no idioma de `EmptyActiveMatches`/`EstadoVazioSecao`. Tom
  destrutivo (`bg-destructive/10 text-destructive`) no erro; tom do primário no
  not-found. Contraste do destrutivo verificado nos 2 temas.

## Decisão: skeleton só de classificação (boundary format-blind)

`torneios/[id]/loading.tsx` é o fallback de `<Suspense>` da rota — renderiza ANTES
de qualquer busca, então NÃO conhece o formato do torneio (liga/grupos/mata-mata).
A página inteira suspende num único `getTournamentClassificacao` + `Promise.all`,
sem streaming por seção. Logo:

- Construímos `StandingsTableSkeleton` (caso dominante: liga/grupos têm tabela) e
  um header-hero de esqueleto que espelha o `<header>` real (reduz CLS).
- NÃO construímos um esqueleto de chave: sem boundary por formato ele não teria
  consumidor — seria código morto (a lente de simplificação reprovaria). Para
  mata-mata o esqueleto de tabela é uma aproximação breve; o estado vazio da
  chave ("A chave aparece quando o torneio for iniciado") cobre o não-gerado.
- Streaming por seção (Suspense por formato) exigiria fatiar o fetcher — fora do
  escopo de um polish de prioridade baixa.

## Decisão: `BoundaryCard` compartilhado

Os quatro `error.tsx` são cópias byte-a-byte (título, descrição, retry, digest).
Extrair um `BoundaryCard` presentacional (props: ícone, tom, título, descrição,
ações) remove a duplicação E garante o tema consistente. Cada `error.tsx`
permanece client (`"use client"` + `useEffect(console.error)` + `tentarNovamente`),
passando sua própria cópia e o `AlertTriangle`. O `not-found.tsx` (RSC) usa o
mesmo cartão com tom neutro. Cada rota mantém seu `<main>` wrapper (o
`nova/error.tsx` é centralizado `max-w-sm`); o cartão recebe `className`.

`global-error.tsx` fica FORA: é o boundary de último recurso que renderiza o
próprio `<html>/<body>` com estilos INLINE justamente porque o CSS do app pode ter
falhado. Vesti-lo com classes do design system reintroduz a dependência que ele
existe para evitar.

## Não-objetivos

- Sem mudança em motores, fetchers, actions, RLS, schema ou `page.tsx`.
- Sem novas animações de entrada nas linhas (histórico pode ser longo — evitar
  jank); `animate-rise` fica nos cartões de estado, não em cada linha.
- Sem reescrever `WoButtons` (refino leve, comportamento idêntico).
- Os outros três `loading.tsx` (`dashboard`, `torneios`, `partidas/nova`)
  permanecem **intocados**: já espelham a geometria de suas páginas
  (`MatchCardSkeleton`, header+linhas, Card do form) e não têm o defeito do
  bloco cinza `h-64` exclusivo de `torneios/[id]/loading.tsx`. Skeletons não têm
  texto — não há gap de `font-display`/`.elevate` neles. (Auditoria de
  completude do gate.)
