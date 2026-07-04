## ADDED Requirements

### Requirement: BracketView resiliente a chave sem partidas geradas

O componente `BracketView` (`src/features/knockout/components/BracketView.tsx`) SHALL
tratar graciosamente o caso em que recebe uma lista de partidas vazia (`partidas: []`),
renderizando um estado gracioso ("A chave ainda não foi gerada.") em vez de lançar erro.
O componente NÃO SHALL, em NENHUMA hipótese, derrubar a árvore de render (throw) por
causa de uma entrada válida-porém-vazia: as funções de derivação `rodadaBaseDaChave` e
`tamanhoChaveDasPartidas` lançam `"Chave sem partidas geradas."` quando não há partida
gerada, então o componente SHALL detectar a lista vazia ANTES de chamá-las e retornar
cedo o estado gracioso — espelhando o guard já existente em `resultadoDaChave`
(`gerarChaveMataMata.ts:670`, `if (geradas.length === 0) return indecisa`). Como o tipo
`PartidaDaChave` tem `rodada`/`posicao` não-nulos, a lista vazia é o único caminho que
alcança o throw. Uma chave com ao menos uma partida SHALL renderizar exatamente como hoje
(byte-idêntica).

Consumidores que possam produzir uma chave vazia — em particular o bracket da grande
final da pirâmide SPLIT em `dashboard/ligas/[id]/page.tsx`, cujo fetcher
`getGrandeFinal` (path "Final montada") pode retornar `partidas: []` quando a final foi
montada mas a chave ainda não foi gerada — SHALL, por consistência (defesa em
profundidade), guardar a montagem do `BracketView` com `partidas.length > 0`, espelhando
o guard já usado pelo `PlayoffsPanel` na mesma página. A correção NÃO SHALL alterar a
semântica de estado (`em_andamento`/`decidida`) do `getGrandeFinal` — é apenas
crash-proof.

#### Scenario: Grande final SPLIT montada e não gerada abre sem 500

- **WHEN** um usuário abre `/dashboard/ligas/[id]` de uma pirâmide SPLIT cuja divisão
  tem a grande final montada (`final_tournament_id` setado) mas a chave da final ainda
  NÃO foi gerada (`getGrandeFinal` retorna `partidas: []`)
- **THEN** a página renderiza normalmente (sem 500), exibindo o estado gracioso da
  grande final em vez de lançar `"Chave sem partidas geradas."`

#### Scenario: BracketView com lista de partidas vazia não lança

- **WHEN** `BracketView` é renderizado com `partidas={[]}`
- **THEN** ele renderiza o estado gracioso ("A chave ainda não foi gerada.") sem lançar
  erro e sem derrubar a árvore de render

#### Scenario: Chave com partidas permanece inalterada

- **WHEN** `BracketView` recebe ao menos uma partida
- **THEN** o guard de vazio NÃO intercepta e a chave é renderizada exatamente como antes
  do fix (colunas por fase, confrontos, campeão) — byte-idêntica
