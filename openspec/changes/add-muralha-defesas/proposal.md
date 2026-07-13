## Why

O Goliseu tem artilharia (quem faz gol) mas nenhum reconhecimento simétrico da
DEFESA — quem menos sofre. Existe só o destaque isolado "melhor defesa" (que, pior,
conta os 0×0 de W.O. como se fossem jogos) e a maior SEQUÊNCIA de jogos sem sofrer;
não há um ranking de defesas nem uma contagem de clean sheets por competidor. A
"Muralha" fecha essa lacuna e dá ao lado defensivo do jogo o mesmo palco da artilharia
— um gancho de engajamento por quase nada.

É **ZERO-DDL**: o dado já existe. `resultadoDoLado` (`src/features/standings/insights.ts`,
já exportada) computa, por lado de cada partida, `cleanSheet` e os gols sofridos,
**excluindo W.O. e duplo W.O.** (retorna `cleanSheet: false` nos ramos de W.O.; só o
0×0 REAL conta). A Muralha é um novo ranking derivado dessa regra já testada — não uma
reimplementação.

## What Changes

- **Fetcher `getMuralha(supabase, { tournamentIds })`** (`src/features/league/data/`),
  espelhando `getArtilharia`: lê `matches` (placar_1/2, status, wo, wo_vencedor,
  wo_duplo, vaga_1/2) + `tournament_slots` (competitor_id, nome, escudo), casa
  lado→competidor em memória e agrega por competidor via uma função pura nova
  `calcularMuralha` que reusa a regra de `resultadoDoLado` (exclui W.O.). Dispensa
  `match_goals` (defesa vem do placar do adversário). Só partidas encerradas e lados
  competitivos (com `competitor_id`) — avulso por-nome fica de fora, como na artilharia.
- **Função pura `calcularMuralha`** (em `insights.ts` ou módulo irmão): recebe as
  partidas elegíveis + o mapa lado→competidor e devolve, por competidor,
  `{ jogos, clean_sheets, gols_sofridos }` contando só jogos REAIS. Testada em Vitest.
- **Componente `MuralhaRanking`** (RSC) espelhando `ArtilhariaRanking`: posição +
  escudo + nome + clean sheets (destaque) + gols sofridos. Ordenação: **clean sheets
  DESC → gols sofridos ASC → jogos DESC → nome** (premia consistência defensiva
  sustentada por mais jogos, não quem jogou menos). Estado vazio embutido.
- **Superfícies (as mesmas 3 da artilharia):** aba de estatística da página do torneio
  (`torneios/[id]`, só gerado/competitivo), pirâmide/temporada (`ligas/[id]`, agregando
  os `tournamentIds` de todas as divisões, Apertura+Clausura), e um card na carreira do
  competidor (`ligas/competidor/[id]`), alimentado por um contador de clean sheets
  acrescentado ao insight já existente do competidor.

## Capabilities

### Added Capabilities
- `clean-sheets`: ranking de defesas (Muralha) por competidor — clean sheets e gols
  sofridos em jogos reais (exclui W.O.), nas superfícies de torneio, pirâmide e
  competidor, espelhando a artilharia.

## Impact

- **Banco de dados:** NENHUM. Zero DDL — deriva de `matches` sob a RLS existente.
- **Código:** 1 função pura + 1 fetcher + 1 componente RSC + fiação em 3 páginas + 1
  contador no insight do competidor. Reusa a regra de exclusão de W.O. já testada.
- **Segurança:** nada novo — o fetcher roda sob a RLS do usuário (mesma visibilidade da
  artilharia; não-dono só vê rodada liberada).
- **Testes:** Vitest de `calcularMuralha` (clean sheet real vs W.O. 0×0 vs duplo W.O.;
  agregação por competidor; ordenação/desempate; jogo não encerrado ignorado; lado sem
  competitor ignorado); componente com estado vazio.
