## Why

A página da pirâmide `/dashboard/ligas/[id]` retorna **500** (Vercel runtime error,
route `/dashboard/ligas/[id]`, latente desde 2026-06-15) quando uma divisão SPLIT tem a
grande final **montada mas ainda não gerada**. Cadeia da falha:

- `src/features/knockout/components/BracketView.tsx` chama, no TOPO do componente,
  `tamanhoChaveDasPartidas(partidas)` e `rodadaBaseDaChave(partidas)` — SEM guard de
  lista vazia.
- `rodadaBaseDaChave` (`src/features/knockout/gerarChaveMataMata.ts:399-410`) lança
  `Error("Chave sem partidas geradas.")` quando NENHUMA partida tem `posicao`+`rodada`
  (array vazio → `menor` fica `Infinity` → throw). `tamanhoChaveDasPartidas` chama
  `rodadaBaseDaChave` internamente, então também estoura.
- Gatilho real: `src/features/league/data/getGrandeFinal.ts` (path "(A) Final montada",
  ~:196-215) — quando a divisão tem `final_tournament_id` setado mas a chave da final
  ainda não foi gerada (`finalClass.chave` vazio), retorna um objeto **não-null com
  `partidas: []`** (estado `em_andamento`/`decidida`).
- `src/app/dashboard/ligas/[id]/page.tsx:558` renderiza
  `bracket={<BracketView partidas={grandeFinal.partidas} />}` INCONDICIONALMENTE quando
  `ehSplit && grandeFinal`. Com `partidas: []` → `BracketView([])` → throw no render →
  500 na página TODA.

O `resultadoDaChave` (`gerarChaveMataMata.ts:670`) já trata o caso vazio corretamente
(`if (geradas.length === 0) return indecisa`); o `PlayoffsPanel` na mesma página também
já guarda (`f.partidas.length > 0 ? <BracketView/> : null`, `page.tsx:356`). O
`BracketView` e o caller da grande final são as duas peças que faltam blindar.

## What Changes

Defesa em profundidade — duas camadas, sem tocar a semântica de produto do
`getGrandeFinal`:

- **Camada 1 (essencial) — `BracketView` resiliente.** No topo do componente, ANTES de
  chamar `tamanhoChaveDasPartidas`/`rodadaBaseDaChave`, derivar as partidas GERADAS
  (`p.rodada != null && p.posicao != null`) e, se não houver nenhuma, renderizar um
  estado gracioso ("A chave ainda não foi gerada.") em vez de estourar. Espelha o guard
  de `resultadoDaChave:670`. Assim NENHUM caller consegue mais derrubar a árvore de
  render passando uma chave vazia.
- **Camada 2 (consistência) — guard no caller.** Em `ligas/[id]/page.tsx`, renderizar o
  bracket da grande final só quando há partidas:
  `bracket={grandeFinal.partidas.length > 0 ? <BracketView .../> : null}` — espelha o
  guard do `PlayoffsPanel` logo acima.
- **Teste de regressão.** Em `BracketView.test.tsx`: `<BracketView partidas={[]} />` NÃO
  lança e renderiza o estado gracioso.

A SEMÂNTICA do `estado` do `getGrandeFinal` (em_andamento/decidida) NÃO muda — fora de
escopo (é produto). O fix é apenas crash-proof.

## Impact

- **SEM DDL, SEM mudança de dados, SEM migration.** Um guard de UI + um guard no caller.
- Arquivos: `src/features/knockout/components/BracketView.tsx` (guard de vazio),
  `src/app/dashboard/ligas/[id]/page.tsx` (1 condicional no `bracket`),
  `src/features/knockout/components/BracketView.test.tsx` (teste de regressão).
- Chaves NÃO-vazias renderizam byte-idênticas (o guard só intercepta o caso vazio).
