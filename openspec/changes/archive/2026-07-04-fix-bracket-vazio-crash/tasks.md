## 0. Baseline

- [x] 0.1 Baseline HEAD `cc2abc2`: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test`
  1384/1384 ✓ (101 arquivos), `pnpm build` ✓ (exit 0). Zero falhas pré-existentes —
  verde final = igual ao baseline.

## 1. Confirmar a causa-raiz

- [x] 1.1 `BracketView.tsx` chama `tamanhoChaveDasPartidas`+`rodadaBaseDaChave` no topo
  sem guard de vazio; `rodadaBaseDaChave` (`gerarChaveMataMata.ts:399-410`) lança
  "Chave sem partidas geradas." em array vazio.
- [x] 1.2 Gatilho: `getGrandeFinal.ts` path "(A) Final montada" retorna `partidas: []`
  quando `final_tournament_id` setado mas chave não gerada; `page.tsx:558` renderiza
  `<BracketView partidas={grandeFinal.partidas} />` sem guard (o `PlayoffsPanel:356` já
  guarda).

## 2. Camada 1 — BracketView resiliente (essencial)

- [x] 2.1 No topo de `BracketView`, derivar as partidas geradas
  (`rodada != null && posicao != null`); se vazio, retornar cedo o estado gracioso
  ("A chave ainda não foi gerada."). Espelha `resultadoDaChave:670`.

## 3. Camada 2 — guard no caller (consistência)

- [x] 3.1 `ligas/[id]/page.tsx`: `bracket={grandeFinal.partidas.length > 0 ?
  <BracketView .../> : null}` — espelha o guard do `PlayoffsPanel`.

## 4. Teste de regressão

- [x] 4.1 `BracketView.test.tsx`: `<BracketView partidas={[]} />` NÃO lança e renderiza
  "A chave ainda não foi gerada." (regressão do crash 500).

## 5. Gate

- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — verde (igual ao
  baseline 0.1).
- [x] 5.2 `openspec validate fix-bracket-vazio-crash --strict` = valid.
- [ ] 5.3 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 5.4 Validação visual ao vivo (390px): abrir uma pirâmide SPLIT com grande final
  montada e não gerada e confirmar que a página abre sem 500. (ORQUESTRADOR)
