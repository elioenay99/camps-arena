## Contexto

A artilharia é o molde de PLUMBING (slot→competitor): `getArtilharia(supabase, {
tournamentIds })` (`getArtilharia.ts`) → `ArtilhariaRanking` (RSC), em torneio
(`torneios/[id]/page.tsx`, gate `ehGerado`), pirâmide (`ligas/[id]/page.tsx`, agrega
`tournamentIdsTemporada`) e competidor (`ligas/competidor/[id]/page.tsx`). A regra de
defesa por lado já existe e é testada: `resultadoDoLado(p, lado)` em `insights.ts:88`
retorna `{ resultado, wo, cleanSheet }` — `cleanSheet:false` nos dois ramos de W.O.
(linhas 90 e 97) e `cleanSheet: dele===0` só no placar real (103). `ehElegivel`
(`insights.ts:30`, PRIVADO) faz o narrowing para `PartidaCronoElegivel`
(status encerrada, dois lados não-nulos e distintos).

## Decisão 1 — `calcularMuralha` mora em `insights.ts` e reusa `ehElegivel`

`calcularMuralha` NÃO reimplementa elegibilidade nem exclusão de W.O.: vive DENTRO de
`insights.ts` (como `calcularForma`/`calcularDestaques`) para reusar o `ehElegivel`
privado. Por partida elegível e por lado, chama `resultadoDoLado`; **se `r.wo`, pula o
lado inteiro** (não conta jogo, nem clean sheet, nem gols sofridos). Usa `r.cleanSheet`
para o contador (nunca recomputa `dele===0`). **Os gols sofridos NÃO vêm de
`resultadoDoLado`** (ela não retorna contagem) — são o placar do adversário lido
diretamente da partida, somados só nos jogos reais. Saída por competidor:
`{ jogos, clean_sheets, gols_sofridos }`. Testada em Vitest.

## Decisão 2 — Fetcher com query PRÓPRIA + mapeamento gateado

`getMuralha` reusa de `getArtilharia` APENAS o passo `tournament_slots`→competitor e o
casamento lado→competidor em memória. A query de matches é PRÓPRIA (a de `getArtilharia`
só pega `id, vaga_1, vaga_2` e deriva de `match_goals` — inútil aqui): seleciona
`placar_1, placar_2, status, wo_vencedor, wo_duplo, vaga_1, vaga_2` com
`.eq('status','encerrada')`; NÃO lê `match_goals`. O shim para `PartidaCronoElegivel`
mapeia **gateado em `m.wo`**, espelhando `getCompetidorInsights.ts:82`:
`woVencedor: m.wo ? canon(m.wo_vencedor) : null` e `woDuplo: m.wo === true && m.wo_duplo
=== true`. Usar `wo_vencedor` cru seria um bug: um `wo_vencedor` residual num match
não-W.O. dispararia o ramo de W.O. em `resultadoDoLado` e mataria um clean sheet real.

## Decisão 3 — Ordenação premia consistência (jogos DESC)

Clean sheets DESC → gols sofridos ASC → **jogos DESC** → nome. Jogos DESC (não ASC)
evita premiar quem foi eliminado cedo: com o mesmo nº de clean sheets e mesmos gols
sofridos, quem jogou MAIS sustentou a defesa por mais tempo (média de gols menor) e
fica na frente. Clean sheets é o número-título; gols sofridos, a métrica secundária.

## Decisão 4 — Carreira do competidor (3 pontos de toque)

`calcularDestaquesCompetidor`/`getCompetidorInsights` já iteram `resultadoDoLado`.
Acrescentar um acumulador de `cleanSheet` exige: (a) novo campo de TOTAL de clean
sheets na interface `DestaquesCompetidor`; (b) atualizar a const `VAZIO` de
`getCompetidorInsights` (senão o typecheck quebra por shape incompleto); (c) render em
`CompetidorForma`, com rótulo DISTINTO do card de streak já existente — "Total sem
sofrer gol: N" (total) vs. o "Jogos sem sofrer gol" que hoje é a maior SEQUÊNCIA.

## Decisão 5 — Placement no torneio: seção, não 6ª aba

A `TabsList` mobile é `grid auto-cols-fr` SEM rolagem (`tabs.tsx`, 2–4 abas); um torneio
gerado já tem ~5 abas. A Muralha NÃO vira aba nova: renderiza como 2ª seção DENTRO da
aba de estatística/artilharia existente (empilhada abaixo do `ArtilhariaRanking`),
renomeando o rótulo da aba se fizer sentido (ex.: "Números"). Na pirâmide
(`ligas/[id]`) é seção empilhada — seguro empilhar abaixo dos Artilheiros.

## Riscos

- **Distorção de nº de jogos** (mata-mata): mitigada pela ordenação por clean sheets +
  jogos DESC.
- **Mistura por-clube × por-nome** num torneio: `ehElegivel` já descarta match com lado
  nulo; lados avulsos (sem `competitor_id`) são ignorados no casamento, como na
  artilharia. Se houver match misto (um lado clube, outro nome), creditar o lado com
  competitor é aceitável (paridade com `getArtilharia`, que credita por-lado).
