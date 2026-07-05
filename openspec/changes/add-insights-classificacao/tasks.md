# Tasks — add-insights-classificacao

## 0. Baseline

- [x] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test`.
  Registrar a contagem verde (verde final = igual ao baseline, zero regressão).

## 1. Refactor behavior-preserving do confronto direto (`standings-engine`)

- [x] 1.1 Extrair a lógica da closure `pontosConfronto` (`computeStandings.ts`
  ~344-370) para a função pura exportada `pontosDoConfronto(eu, rival, partidas,
  regras): number`, filtrando internamente por `ehElegivel`. Corpo LITERAL
  (duplo W.O. → derrota ambos; W.O. → vitória/derrota pelo vencedor; senão placar).
- [x] 1.2 Trocar a closure por `(eu, rival) => pontosDoConfronto(eu, rival,
  elegiveis, regras)`. Rodar a suíte do motor — resultado IDÊNTICO (oráculo:
  testes de desempate atuais 100% verdes).
- [x] 1.3 Teste discriminante: `pontosDoConfronto` isolada bate com o
  comportamento antigo em W.O., duplo W.O., ida-e-volta e nunca-se-enfrentaram.
  **Should-fix (e):** + um caso de input NÃO-elegível (status≠encerrada;
  self-match `participante_1===participante_2`; lado `null`) assertando
  contribuição ZERO — trava o filtro `ehElegivel` interno novo (o motor sempre
  passa pré-filtrado, então nenhum teste atual cobre isso).

## 2. Camada pura de insights — `src/features/standings/insights.ts` (NOVO)

- [x] 2.1 Tipos: `PartidaCronologica` (extends `PartidaClassificavel` + `rodada`,
  `criadaEm`, `id`), `ItemForma`, `Destaques` (+ `DestaqueParticipante`,
  `Goleada`, `SequenciaParticipante`), `DestaquesCompetidor` (A5),
  `InsightsClassificacao`, `JogoConfronto`, `ConfrontoDireto` (com `duploWo`,
  `aDerrotas`, `bDerrotas` — A3).
- [x] 2.2 Comparadores: `ordenarCronologico` (rodada asc, null por último;
  `criadaEm` asc; `id` asc — competição única) e `ordenarPorData` (`criadaEm` asc
  → `id` asc — carreira cross-competição, A4). MESMO PRINCÍPIO (não idêntico) ao
  de `partidasAbertas`.
- [x] 2.3 `calcularForma(partidas, ordenar?)` → `Map<string, ItemForma[]>`
  cronológico asc; V/E/D espelha `aplicarPartida` (ordem woDuplo→woVencedor→placar,
  flag `wo`).
- [x] 2.4 `calcularDestaques(linhas, partidas)`: melhor ataque/defesa de `linhas`
  (só `jogos>0`; ataque null se máx=0; **should-fix (b):** GP/GC da tabela como
  está, W.O. incluído); maior goleada (exclui W.O.); invencibilidade/vitórias/
  clean sheets (**should-fix (c):** 0x0 REAL estende, W.O. quebra); média de gols
  por jogo jogado (exclui W.O.).
- [x] 2.4b `calcularDestaquesCompetidor(id, partidas, ordenar?)` (A5): agregado
  V/E/D + GP/GC do competidor, maior goleada DELE, sequências, média de gols
  marcados — SEM ataque/defesa relativos.
- [x] 2.5 `confrontoDireto(idA, idB, partidas, ordenar?)` → histórico agregado
  (jogos asc, `resultadoA` por jogo, `aVitorias/empates/bVitorias/duploWo`,
  `aDerrotas/bDerrotas` derivados, GP/GC de A); W.O. respeita o vencedor; **A3:**
  duplo W.O. conta em `duploWo` (não vira vitória de ninguém), invariantes
  `jogos.length = aV+bV+e+duploWo`, `aDerrotas=bV+duploWo`, `bDerrotas=aV+duploWo`;
  nunca-se-enfrentaram = vazio. `rechavearInsights(ins, mapear)` (remap de ids).
- [x] 2.6 Testes exaustivos: forma cronológica; W.O. na forma; <5 jogos; zero
  jogos; sequência quebrada por empate/derrota; **clean sheet 0x0-REAL estende vs
  W.O.-0x0 quebra (teste discriminante, should-fix c)**; goleada ignora W.O. e
  desempata determinístico; média com/sem W.O.; confronto vazio e agregado;
  **duplo W.O. no confronto (1 jogo "W.O. duplo", 0V/0E/0B, duploWo=1, gols 0,
  invariantes — A3)**; destaques de carreira sem ataque/defesa relativos (A5).

## 3. Fetchers de classificação (torneio grátis; divisão via plumbing — A1)

- [x] 3.1 `getTournamentClassificacao`: montar `PartidaCronologica[]` de
  `linhasPartidas` (`{ ...lados, rodada, criadaEm: created_at, id }`), computar
  `calcularForma`+`calcularDestaques` e devolver `ClassificacaoTorneio.insights`
  (chaveado por SLOT no competitivo). Nenhuma query nova.
- [x] 3.2 **A1 — plumbing da divisão:** `carregarLinhasBaseDivisao` ganha
  `insightsPorSlot: InsightsClassificacao | null` em `LinhasBaseDivisao`
  (NÃO-SPLIT: repassa `classificacao.insights`; SPLIT: `null`, fora do MVP).
  `getDivisionStandings` re-chaveia com `rechavearInsights(insightsPorSlot, slot
  => competitorPorSlot.get(slot) ?? slot)` e expõe `DivisaoStandings.insights`
  em TODOS os ramos de return. NÃO afirmar "zero query extra" no split.
- [x] 3.3 Testes: `insights` do torneio bate com o histórico mockado; remap
  slot→competitor da divisão casa os ids certos; split → `insights` null.

## 4. Fetchers da página do competidor (NOVOS, `server-only`) — REMAP (A2)

- [x] 4.1 `getCompetidorInsights(supabase, { competitorId })` — competidor→slots→
  matches (todas as temporadas); **A2:** re-chaveia o LADO do competidor (e o
  `wo_vencedor`) para `competitorId` canônico ANTES das puras; roda
  `calcularForma(…, ordenarPorData)` + `calcularDestaquesCompetidor` (A5, A4);
  ignora avulso. Trilha de `getArtilheirosDoCompetidor`.
- [x] 4.2 `getConfrontoDireto(supabase, { competitorAId, competitorBId })` — slots
  de A e B → matches entre eles; **A2:** re-chaveia lado∈slotsA→A, lado∈slotsB→B
  (e `wo_vencedor`) → `confrontoDireto(A, B, partidas, ordenarPorData)`. Degrada
  para confronto vazio em IO.
- [x] 4.3 `getRivaisDoCompetidor(supabase, { competitorId })` — **should-fix (d):**
  demais `league_competitors` da MESMA competição, `.neq("id", competitorId)`,
  dedup por id, `{ id, nome, escudoUrl }`.
- [x] 4.4 Testes: **A2 — sem remap o confronto casaria ZERO; com remap casa os
  jogos certos** (fixture com 2 slots por competidor em temporadas distintas);
  carreira soma através de temporadas ordenada por DATA (A4); rivais não incluem o
  próprio; separação de identidade por competidor.

## 5. UI — Classificação (torneio + liga)

- [x] 5.1 `StandingsTable`: coluna opcional "Forma" (`formaPorParticipante?`),
  badges V/E/D dos últimos 5 com `aria-label` legível (não só cor), tons reusando
  a paleta de zona; ausência da prop = tabela inalterada.
- [x] 5.2 Bloco "Destaques" (card RSC) na página do torneio e da liga, consumindo
  `insights`; estado vazio quando não há jogos encerrados.
- [ ] 5.3 Validação visual 390px (`ClassificacaoResponsiva`): coluna forma não
  estoura nos dois modos (rolar/caber); destaques legíveis no mobile. — DEFERIDO
  ao orquestrador (validação visual ao vivo). Código pronto: coluna oculta no modo
  "caber" (`group-data-[modo=caber]/standings:hidden`).

## 6. UI — Página do competidor

- [x] 6.1 Seção forma + destaques do competidor (cards no estilo de
  `CompetidorConquistas`), via `getCompetidorInsights`; estado vazio.
- [x] 6.2 Painel de confronto direto: picker de rival (ÚNICA folha `"use client"`,
  `<select>`) → **should-fix (a):** ao mudar, chama a server action de LEITURA
  `carregarConfrontoDireto(competitorAId, rivalId)` (`src/actions/insights.ts` →
  `getConfrontoDireto`) e renderiza o histórico no cliente (jogos com placar/
  rodada/resultado, escudos `TeamCrest`, agregado V/E/D + duplo W.O. + GP/GC).
  NUNCA lista de `<Link>` prefetchável. Estado "sem histórico entre os dois".
- [ ] 6.3 Validação visual 390px do painel + picker. — DEFERIDO ao orquestrador.

## 7. Gate de qualidade

- [x] 7.1 `openspec validate add-insights-classificacao --strict` = valid.
- [x] 7.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (igual
  ao baseline — o refactor do §1 não regride nada).
- [ ] 7.3 Revisão adversarial (workflow): forma/sequências/goleada conferem com o
  histórico; refactor do confronto é behavior-idêntico; zero DDL; a11y dos badges.
  — DEFERIDO ao orquestrador.
