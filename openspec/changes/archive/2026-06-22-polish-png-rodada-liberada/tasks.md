## 1. Implementação

- [x] 1.1 `src/features/og/rodada.tsx`: pôr "Nª RODADA" + selo "LIBERADA" (cor accent) numa flex-row alinhada à base, sem aumentar a altura do cabeçalho.

## 2. Gates de qualidade

- [x] 2.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes.
- [x] 2.2 Validação visual: re-renderizar o PNG (tema base e tema custom) e conferir que "LIBERADA" aparece na cor de destaque, alinhado, sem corte; altura inalterada (1917/3385).

## 3. Arquivar

- [x] 3.1 `openspec archive polish-png-rodada-liberada`; commit (pt-BR, sem coautoria); push; derrubar Docker.
