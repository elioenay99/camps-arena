## Why

O texto de anúncio da rodada agora diz "Nª rodada **Liberada**" (change
`polish-texto-rodada-espacado`), mas a IMAGEM (PNG) que acompanha o mesmo compartilhamento
mostra só "Nª RODADA". O dono pediu para a imagem também indicar que a rodada foi liberada,
mantendo a coerência entre legenda e imagem.

## What Changes

- A imagem da rodada (`renderRodadaOg`, `src/features/og/rodada.tsx`) passa a exibir um selo
  **"LIBERADA"** ao lado de "Nª RODADA", na **cor de destaque** do campeonato (mesmo accent do
  "×" e da barra). O selo fica **na mesma linha** do número da rodada (alinhado à base), de modo
  que a altura do cabeçalho **não muda** — sem risco de corte (a altura dinâmica segue válida).

## Capabilities

### Modified Capabilities

- **og-images**: a imagem da rodada passa a exibir o selo "LIBERADA" (na cor de destaque) junto
  ao "Nª RODADA".

## Impact

- **Sem DDL.** Mudança visual contida em `src/features/og/rodada.tsx` (cabeçalho).
- **Sem mudança de altura**: o selo entra na linha do número (altura dominada pelo número 96px),
  então `alturaDaRodada`/constantes seguem inalteradas — validado re-renderizando o PNG.
