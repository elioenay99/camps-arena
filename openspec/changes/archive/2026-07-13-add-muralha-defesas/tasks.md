## 1. Regra pura (dentro de insights.ts)

- [x] 1.1 `calcularMuralha(partidas, mapaLadoCompetidor)` DENTRO de `insights.ts` (reusa
  o `ehElegivel` privado). Por partida elegível e lado: `resultadoDoLado`; se `r.wo`,
  PULA o lado (não conta jogo/cs/gols); usa `r.cleanSheet`; gols sofridos = placar do
  adversário lido direto (resultadoDoLado NÃO retorna contagem). Saída por competidor
  `{ jogos, clean_sheets, gols_sofridos }`.
- [x] 1.2 Testes Vitest: 0×0 real conta; W.O. 0×0 e duplo W.O. NÃO contam (lado pulado);
  agregação por competidor; jogo não encerrado ignorado (via `ehElegivel`); ordenação
  clean sheets DESC → GC ASC → jogos DESC → nome.

## 2. Fetcher e ranking

- [x] 2.1 `getMuralha(supabase, { tournamentIds })` — query PRÓPRIA de matches
  (`placar_1/2, status, wo_vencedor, wo_duplo, vaga_1/2`, `.eq('status','encerrada')`,
  SEM `match_goals`); reusa de `getArtilharia` só o passo `tournament_slots`→competitor
  e o casamento lado→competidor. Shim p/ `PartidaCronoElegivel` GATEADO em `m.wo`
  (`woVencedor: m.wo ? canon(m.wo_vencedor) : null`, `woDuplo: m.wo && m.wo_duplo`) —
  espelha `getCompetidorInsights.ts:82`, nunca `wo_vencedor` cru. Ordena via a regra da
  1.1.
- [x] 2.2 `MuralhaRanking` (RSC) espelhando `ArtilhariaRanking`: posição + escudo +
  nome + clean sheets (título) + gols sofridos. Estado vazio.

## 3. Superfícies

- [x] 3.1 Torneio (`torneios/[id]/page.tsx`): fetch (gate `ehGerado`) + render como 2ª
  SEÇÃO dentro da aba de estatística/artilharia (NÃO criar 6ª aba — a TabsList mobile é
  grid sem rolagem). Empilhar abaixo do `ArtilhariaRanking`; renomear o rótulo da aba se
  fizer sentido.
- [x] 3.2 Pirâmide (`ligas/[id]/page.tsx`): fetch agregando `tournamentIdsTemporada` +
  render empilhado abaixo dos Artilheiros (seção, seguro).
- [x] 3.3 Competidor (`ligas/competidor/[id]/page.tsx`): (a) novo campo de TOTAL de clean
  sheets em `DestaquesCompetidor`; (b) atualizar a const `VAZIO` de
  `getCompetidorInsights` (senão typecheck quebra); (c) render em `CompetidorForma` com
  rótulo DISTINTO do streak — "Total sem sofrer gol" (total) vs. o card de SEQUÊNCIA
  existente.

## 4. Gate

- [ ] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verde.
- [ ] 4.2 Validação visual 390px + desktop, temas dark/light (mesma superfície da artilharia).
