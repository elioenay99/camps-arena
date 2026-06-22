## 1. Implementação

- [x] 1.1 `src/features/og/rodada.tsx`: extrair helper puro `alturaDaRodada(n: number, temRestantes: boolean): number` com as constantes (ROW_H/ROW_GAP/HEADER_H/RESTANTES_H/FOOTER_H) e piso `max(1080, …)`.
- [x] 1.2 Calcular `height = alturaDaRodada(visiveis.length, restantes > 0)` e passar `{ width: 1080, height }` ao `ImageResponse` (em vez do `SIZE` fixo).
- [x] 1.3 Remover `flex: 1` do container de confrontos (altura natural; rodapé assenta abaixo).
- [x] 1.4 Elevar `MAX_LINHAS` para 20.

## 2. Testes

- [x] 2.1 Teste de `alturaDaRodada`: monotonicamente crescente em `n`; piso 1080 para `n` pequeno; soma os termos esperados (incl. `temRestantes`); limiar do piso (n=4/5) e teto (n=20).

## 3. Gates de qualidade

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes. (typecheck/lint limpos; 1193 testes; build OK)
- [x] 3.2 Revisão adversarial (workflow de 3 lentes + juiz cético) — veredito `aprovado`, 0 `must_fix`. Os 3 `should_fix` foram incorporados: constantes line-height-aware (CABECALHO_H 372→385, RODAPE_H 118→126) + comentário honesto; justificativa de `MAX_LINHAS` corrigida (pior caso = fase de grupos ~16); testes de limiar/teto.
- [x] 3.3 Validação ao vivo: render do PNG real via `renderRodadaOg` com 10 e 25 confrontos → 1080×1917 e 1080×3385 (20 visíveis + "+5 confrontos"); inspeção visual confirmou TODOS os jogos, rodapé abaixo do último e nada cortado.

## 4. Arquivar

- [x] 4.1 `openspec archive fix-imagem-rodada-overflow`; commit (pt-BR, sem coautoria); push.
