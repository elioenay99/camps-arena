## Contexto

`BracketView` é um componente RSC puro. Seu contrato de entrada é uma lista de
`PartidaDaChave`. Três das suas funções de derivação — `rodadaBaseDaChave`,
`tamanhoChaveDasPartidas` (que chama a primeira) — assumem pelo menos UMA partida com
`rodada`+`posicao` não-nulos; sem isso, `rodadaBaseDaChave` lança por design ("Chave sem
partidas geradas."). O motor foi escrito para NÃO ser chamado com chave vazia — mas o
caller da grande final (`getGrandeFinal` path (A)) pode, legitimamente, produzir
`partidas: []` (final montada, chave ainda não gerada), e a página o renderiza sem guard.

## Decisão 1 — onde blindar

Blindar no PRÓPRIO `BracketView` (não só no caller). Motivo: um componente de UI puro
não pode derrubar a árvore de render por causa de uma entrada válida-porém-vazia. Um
guard só no caller deixaria a bomba armada para o próximo consumidor. O `resultadoDaChave`
do mesmo módulo já adota exatamente esse padrão (`if (geradas.length === 0) return
indecisa`) — seguimos a convenção existente do código.

A checagem espelha o filtro de `resultadoDaChave`: partidas GERADAS são as que têm
`rodada != null && posicao != null`. Se o filtro fica vazio, retornamos cedo. (Filtrar em
vez de só testar `partidas.length` é mais fiel: uma lista com partidas sem `rodada`/
`posicao` também estouraria `rodadaBaseDaChave`.)

## Decisão 2 — o que renderizar no vazio

Um placeholder curto e discreto ("A chave ainda não foi gerada."), no mesmo tom do
`ConfrontoFuturo` ("A definir") já presente no arquivo. Alternativa `return null`
descartada: o `GrandeFinalPanel` recebe o bracket como `prop` e o exibe num bloco com
moldura; um `null` deixaria um vazio mudo. Um texto curto comunica o estado
("montada, aguardando geração") sem inventar semântica de produto nova.

## Decisão 3 — guard no caller (defesa em profundidade)

Mesmo com o `BracketView` já blindado, adicionamos o guard no caller da grande final
(`page.tsx`) por CONSISTÊNCIA com o `PlayoffsPanel` da mesma página, que já faz
`f.partidas.length > 0 ? <BracketView/> : null`. Duas defesas: a de UI (não crashar) e a
do caller (não montar o bracket sem partidas). O caller escolhe passar `null`, que o
`GrandeFinalPanel` já sabe tratar (a moldura da grande final permanece; o estado textual
vem do próprio painel).

## Fora de escopo

- A semântica de `estado` do `getGrandeFinal` (em_andamento/decidida quando a chave está
  vazia) NÃO muda — é decisão de produto.
- Cópia própria do `GrandeFinalPanel` para o estado "montada sem chave" — opcional e
  secundário; não implementado aqui (o crash-proof é suficiente e mínimo).

## Riscos

- **Nenhum de dados.** Sem DDL/migration.
- **Regressão visual**: só o caminho de chave vazia muda (antes: 500; agora: placeholder/
  nada). Chaves com partidas são byte-idênticas — o guard retorna antes só quando não há
  nenhuma partida gerada. Coberto pelo teste de regressão + gate.
