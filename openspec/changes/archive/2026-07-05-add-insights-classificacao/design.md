# Design — add-insights-classificacao

Camada de INSIGHTS derivada 100% de `matches`. Compute PURO (sem IO), no estilo
de `computeStandings.ts`; fetchers finos; RSC-first (uma única folha `"use
client"`: o picker de rival). ZERO schema/DDL, ZERO input novo.

## 1. Extração behavior-preserving do confronto direto (`standings-engine`)

Hoje o desempate de 2 usa a closure `pontosConfronto(eu, rival)` em
`computeStandings.ts` (~344-370), que soma os pontos de `eu` nas partidas
elegíveis entre os dois, respeitando W.O. e duplo W.O. Extraímos essa lógica
LITERAL para uma função pura exportada:

```ts
// src/features/standings/computeStandings.ts
export function pontosDoConfronto(
  eu: string,
  rival: string,
  partidas: PartidaClassificavel[],
  regras: RegrasPontuacao,
): number
```

- A função filtra internamente por `ehElegivel` (idempotente: o motor já lhe
  passa `elegiveis`, mas filtrar de novo mantém a função correta isolada) e
  reproduz o corpo atual byte-a-byte (duplo W.O. → derrota para ambos; W.O. →
  vitória/derrota pelo vencedor explícito; senão compara placares).
- Dentro de `computeStandings`, a closure vira
  `(eu, rival) => pontosDoConfronto(eu, rival, elegiveis, regras)`. O resultado da
  classificação é IDÊNTICO — os testes atuais de desempato são o oráculo.

Decisão: manter a função em `computeStandings.ts` (não num módulo novo) — ela
compartilha `PartidaClassificavel`/`RegrasPontuacao`/`ehElegivel` e o motor é seu
consumidor primário. `insights.ts` importa dela quando precisa dos PONTOS; para o
painel rico (V/E/D + gols) usa a agregação própria (§4).

## 2. Chave de ordenação cronológica

`computeStandings` é comutativo (acumuladores) e por isso ignora ordem. Forma,
sequências e o histórico do confronto PRECISAM de ordem. Definimos um recorte que
ESTENDE o do motor com os campos de ordenação (todos já selecionados por
`getTournamentClassificacao`):

```ts
export interface PartidaCronologica extends PartidaClassificavel {
  rodada: number | null   // ordem natural de disputa da liga; null no avulso
  criadaEm: string        // matches.created_at (ISO) — desempate estável
  id: string              // matches.id — desempate final determinístico
}
```

Dois comparadores puros, escolhidos pelo ESCOPO da superfície:

`ordenarCronologico` (COMPETIÇÃO ÚNICA — torneio/divisão), MESMO PRINCÍPIO da
lista de `partidasAbertas` (`getTournamentClassificacao.ts` ~580-593: rodada asc,
null por último, depois cronológico), NÃO idêntico — aquela usa
rodada→posicao→perna→created_at (sem `id`); aqui é:

1. `rodada` asc — `null` (avulso) vai por ÚLTIMO entre numeradas; numa competição
   homogênea ou todas têm rodada (liga) ou nenhuma tem (avulso), então o ramo
   nunca mistura os dois na prática.
2. `criadaEm` asc (comparação lexicográfica de ISO 8601 = cronológica).
3. `id` asc — desempate FINAL estável, determinístico cross-runtime (code-point).

`ordenarPorData` (CARREIRA do competidor — CROSS-COMPETIÇÃO): `criadaEm` asc →
`id` asc, SEM rodada-first. **Por quê (A4):** `rodada` é numerada POR competição;
a carreira do competidor abrange N temporadas/divisões, então ordenar por rodada
global misturaria cronologias (a rodada 1 da temporada 3 viria antes da rodada 38
da temporada 1). A data de criação é a única ordem cronológica global honesta.

Por que não `updated_at` ("encerrada em") em nenhum dos dois? `updated_at` muda a
cada reabertura/reedição de placar e reordenaria a forma a cada lançamento;
`created_at` é a ordem de DISPUTA, estável.

## 3. Forma (últimos 5) — `calcularForma`

```ts
export type ResultadoForma = "V" | "E" | "D"
export interface ItemForma {
  resultado: ResultadoForma
  wo: boolean   // W.O. ou duplo W.O. (a UI pode marcar o badge)
  rodada: number | null
}
/** Por participante (id OPACO — slot no competitivo, user no avulso), a lista
 * CRONOLÓGICA asc de resultados. A UI fatia os últimos 5. */
export function calcularForma(partidas: PartidaCronologica[]): Map<string, ItemForma[]>
```

- Elegibilidade: mesma `ehElegivel` do motor (encerrada, dois lados, distintos).
- V/E/D espelha `aplicarPartida` EXATAMENTE:
  - `woDuplo` → `D` para os dois (`wo: true`).
  - `woVencedor` → `V` para o vencedor, `D` para o perdedor (`wo: true`).
  - senão: compara `placar_1`/`placar_2` (V/E/D) (`wo: false`).
- Ordena as elegíveis pelo comparador §2 e faz um único pass, empilhando o item
  em CADA um dos dois lados. A UI faz `.slice(-5)`.
- **Edge — <5 jogos:** a lista vem com o que houver (0..4); a UI mostra menos
  badges. **Zero jogos:** participante ausente do Map (a UI trata como vazio).

## 4. Destaques automáticos — `calcularDestaques`

```ts
export interface DestaqueParticipante { participanteId: string; valor: number }
export interface Goleada {
  vencedorId: string; perdedorId: string
  placarVencedor: number; placarPerdedor: number; diferenca: number
  rodada: number | null; matchId: string
}
export interface SequenciaParticipante { participanteId: string; extensao: number }
export interface Destaques {
  melhorAtaque: DestaqueParticipante | null
  melhorDefesa: DestaqueParticipante | null
  maiorGoleada: Goleada | null
  maiorInvencibilidade: SequenciaParticipante | null
  maiorSequenciaVitorias: SequenciaParticipante | null
  maiorSequenciaCleanSheets: SequenciaParticipante | null
  mediaGolsPorJogo: number
}
export function calcularDestaques(
  linhas: LinhaClassificacao[],   // reaproveita o já computado (sem recomputar)
  partidas: PartidaCronologica[],
): Destaques
```

- **Melhor ataque/defesa:** derivados de `linhas` (só as com `jogos > 0`) — maior
  `golsPro` / menor `golsContra`. Empate → o de melhor posição (a lista já vem
  ordenada); `null` quando ninguém jogou; melhor ataque também `null` se o máximo
  de gols pró é 0 (ninguém marcou). **Should-fix (b):** GP/GC vêm da TABELA como
  está — incluem os 0 gols dos W.O. (consistente com o que o usuário já lê na
  classificação). A distorção do "W.O.-farming" (um lado que vence muitos W.O.
  não infla ataque, mas também não é penalizado) é ACEITA e documentada na spec;
  NÃO recomputamos a tabela.
- **Maior goleada:** maior `|placar_1 − placar_2|` numa ÚNICA partida elegível,
  **excluindo W.O./duplo W.O.** (0x0 no banco, sem jogo real — coerente com "W.O.
  não conta como goleada"). Guarda os dois lados, o placar e a diferença; empate
  de diferença resolve pelo comparador §2 (mais antiga primeiro), determinístico.
- **Sequências (por participante, ordem §2):**
  - *Invencibilidade* — run máximo de `V`|`E` (usa o resultado creditado, então
    W.O. a favor conta como parte da invencibilidade, espelhando os pontos).
  - *Vitórias consecutivas* — run máximo de `V` (W.O. a favor conta).
  - *Clean sheets* — run máximo de jogos sem sofrer gol. **Should-fix (c):** um
    empate 0x0 REAL É clean sheet e ESTENDE a sequência (para os DOIS lados); já
    W.O./duplo W.O. (0x0 sem jogo) QUEBRA a sequência (tratado como "jogo não
    elegível a clean sheet"). A distinção sai da ORDEM dos flags `woDuplo →
    woVencedor → placar` (igual `aplicarPartida`): o ramo de placar só decide
    clean sheet quando NÃO é W.O.; aí `golsSofridos === 0` (inclui o 0x0 real) →
    clean sheet. Cenário + teste discriminante na spec.
  - Empate de extensão → menor id (determinístico); guarda um único recordista
    por categoria (MVP; a UI mostra o dono e a extensão).
- **Média de gols por jogo:** `Σ(placar_1+placar_2) / nºjogos` sobre as partidas
  elegíveis **jogadas** (exclui W.O./duplo W.O. do numerador E do denominador —
  0x0 forjado deprimiria a média). Zero jogos jogados → `0`.

## 5. Painel de confronto direto — `confrontoDireto` (compute) + fetchers

Compute puro, rico (o motor só precisava de pontos; o painel precisa do detalhe):

```ts
export interface JogoConfronto {
  matchId: string; rodada: number | null; criadaEm: string
  placarA: number; placarB: number
  resultadoA: "V" | "E" | "D"   // perspectiva de A (espelha aplicarPartida)
  wo: boolean; woDuplo: boolean
}
export interface ConfrontoDireto {
  jogos: JogoConfronto[]            // cronológico asc (§2)
  aVitorias: number; empates: number; bVitorias: number
  duploWo: number                   // A3: derrota MÚTUA, não vitória de ninguém
  aDerrotas: number; bDerrotas: number   // derivados (ver invariantes)
  aGolsPro: number; aGolsContra: number  // do lado A; B é o espelho
}
export function confrontoDireto(
  idA: string, idB: string, partidas: PartidaCronologica[],
  ordenar?: (a: PartidaCronologica, b: PartidaCronologica) => number,
): ConfrontoDireto
```

- **A3 — duplo W.O. no agregado.** O tipo antigo (`aVitorias/empates/bVitorias`)
  NÃO representava o duplo W.O. (derrota de A E de B: `a+e+b < jogos.length`).
  Adicionamos `duploWo` e derivamos `aDerrotas`/`bDerrotas`, com as invariantes:
  - `jogos.length === aVitorias + bVitorias + empates + duploWo`
  - `aDerrotas === bVitorias + duploWo`
  - `bDerrotas === aVitorias + duploWo`

  Implementação: por jogo guardamos `resultadoA ∈ {V,E,D}` espelhando
  `aplicarPartida` (duplo W.O. → `D` para A; W.O. → V/D pelo vencedor; senão
  placar). Agregamos `aVitorias = #{V}`, `empates = #{E}`, `duploWo = #{woDuplo}`,
  `bVitorias = #{D e NÃO woDuplo}` (o D de A que não é duplo é vitória de B). Gols
  só de jogos reais (W.O. sem gols).
- **Edge — nunca se enfrentaram:** `jogos: []`, todos os agregados 0 (a UI mostra
  "sem histórico entre os dois"). A carreira passa `ordenarPorData` (§2, A4).

### Fetchers (`server-only`) — REMAP slot→competidor (A2)

As funções puras chaveiam por participante = SLOT (as `matches` trazem
`vaga_1`/`vaga_2` = slot; um competidor tem N slots, um por temporada). Os
fetchers do competidor operam por `competitor_id`. **Sem remap,
`confrontoDireto(A, B, partidas)` casa ZERO jogos e `calcularForma` fragmenta por
slot.** Por isso cada fetcher REESCREVE `participante_1`/`participante_2` (e o
`wo_vencedor`) de cada `PartidaCronologica` de slot→competitor_id ANTES de chamar
as funções puras — mesmo padrão do remap de `getDivisionStandings.ts:294-298` e da
trilha de `getArtilheirosDoCompetidor.ts:57-83`.

- `getCompetidorInsights(supabase, { competitorId })` — `tournament_slots` do
  competidor (`competitor_id = competitorId`) → `slotSet`; `matches` onde
  `vaga_1|vaga_2 ∈ slotSet` (`.or(in.())`, trilha de artilharia). Cada match vira
  `PartidaCronologica` com o LADO do competidor re-chaveado para `competitorId`
  canônico (o adversário mantém o slot dele — irrelevante, só lemos a entrada do
  competidor); `wo_vencedor ∈ slotSet` também vira `competitorId`. Roda
  `calcularForma(partidas, ordenarPorData).get(competitorId)` (últimos jogos) +
  `calcularDestaquesCompetidor(competitorId, partidas)` (A5 — ver abaixo). Ignora
  avulso (sem `competitor_id`), como `getArtilheirosDoCompetidor`.
- `getConfrontoDireto(supabase, { competitorAId, competitorBId })` — slots de A e
  de B; `matches` de A → filtra em memória as em que o OUTRO lado ∈ slots de B.
  Re-chaveia lado∈slotsA → `competitorAId`, lado∈slotsB → `competitorBId` (e o
  `wo_vencedor`) → `confrontoDireto(A, B, partidas, ordenarPorData)`. RLS de
  `matches` é a barreira. Degrada para confronto vazio em erro de IO.
- `getRivaisDoCompetidor(supabase, { competitorId })` — **Should-fix (d):** os
  demais `league_competitors` que compartilham a MESMA competição
  (`competition_id` do competidor), com `.neq("id", competitorId)` explícito,
  deduplicados por id, `{ id, nome, escudoUrl }` para o picker. Compartilhar a
  competição É compartilhar temporada(s) — decisão de produto TOMADA. Sem placar.

### A5 — destaques de CARREIRA do competidor (`calcularDestaquesCompetidor`)

`calcularDestaques` (torneio/divisão) tem melhorAtaque/melhorDefesa RELATIVOS
entre `linhas` — com UMA linha (o competidor sozinho) degeneram para o próprio,
inúteis. Para a carreira definimos um tipo/função SEM ataque/defesa relativos:

```ts
export interface DestaquesCompetidor {
  jogos: number; vitorias: number; empates: number; derrotas: number
  golsPro: number; golsContra: number   // marcados/sofridos pelo competidor
  maiorGoleada: Goleada | null           // a maior vitória DELE (exclui W.O.)
  maiorInvencibilidade: number           // extensão da maior sequência
  maiorSequenciaVitorias: number
  maiorSequenciaCleanSheets: number
  mediaGolsPorJogo: number               // gols MARCADOS por jogo real (exclui W.O.)
}
export function calcularDestaquesCompetidor(
  participanteId: string, partidas: PartidaCronologica[],
  ordenar?: (a: PartidaCronologica, b: PartidaCronologica) => number,
): DestaquesCompetidor
```

A UI do competidor consome `DestaquesCompetidor`; a UI de torneio/divisão consome
`Destaques` (relativo). Ambas as funções são puras e testadas em separado.

## 6. Onde entra sem query extra

- **Torneio:** `getTournamentClassificacao` já carrega TODAS as partidas com
  `rodada`/`created_at`/`id`/`status`/`placar`/`wo`/`wo_duplo`/`wo_vencedor`.
  Reusa `linhasMotor` (re-chaveado por formato) acrescido de `{ rodada, criadaEm,
  id }` para montar `PartidaCronologica[]`, roda `calcularForma`+`calcularDestaques`
  e devolve em `ClassificacaoTorneio.insights` — ZERO viagem nova ao banco.
- **Liga/divisão (A1 — NÃO é grátis lá):** `getDivisionStandings` NÃO carrega
  matches — consome `base.linhasBase` de `carregarLinhasBaseDivisao`. Correção do
  plumbing:
  - `getTournamentClassificacao` computa `insights` (chaveado por SLOT) da MESMA
    query — aí sim "zero query extra".
  - `carregarLinhasBaseDivisao` ganha um campo `insightsPorSlot:
    InsightsClassificacao | null` em `LinhasBaseDivisao`; no ramo NÃO-SPLIT ele
    apenas repassa `classificacao.insights` (slot) — ZERO viagem nova.
  - `getDivisionStandings` re-chaveia esse `insightsPorSlot` slot→competitor com o
    MESMO `competitorPorSlot` já montado (`getDivisionStandings.ts:294-298`), via
    o helper puro `rechavearInsights(insights, slot => competitorPorSlot.get(slot)
    ?? slot)`, e expõe em `DivisaoStandings.insights`.
  - **Ramo SPLIT (Apertura+Clausura via `getDivisionClassificacaoCombinada`, que
    hoje só devolve `{linhas}`): insights de liga no ciclo split ficam FORA do
    MVP.** `insightsPorSlot = null` no split → o bloco de destaques/forma não
    renderiza para a divisão split. Escolha deliberada (opção ii do brief): unir
    as partidas dos dois turnos com a normalização de slot exigiria estender o
    combinado a devolver as partidas; o custo não se paga no MVP. Documentado como
    limitação; a forma/destaques da divisão ANUAL (o caso comum) funcionam.
- **Competidor:** os 3 fetchers novos (§5) — a página do competidor não tinha os
  matches à mão.

## 7. UI

- **StandingsTable:** nova coluna "Forma" (opcional via prop `formaPorParticipante?:
  Map<string, ItemForma[]>`; ausente = tabela inalterada). Badge por resultado
  reusa os tons já existentes (V = `primary`/verde de acesso, E = `muted`, D =
  `destructive`), cada um com `aria-label` ("Vitória"/"Empate"/"Derrota"; W.O. →
  "Vitória por W.O." etc.) — cor NÃO é o único sinal (a11y). Bloco "Destaques"
  como card RSC acima/abaixo da tabela.
- **Competidor:** seção de forma + destaques (cards no estilo de
  `CompetidorConquistas`/hall da fama) e o painel de confronto. **Should-fix (a) —
  picker SEM prefetch em massa (classe do incidente 503):** o picker é um client
  component (`<select>`) que, ao mudar, chama UMA server action de LEITURA
  (`carregarConfrontoDireto(competitorAId, rivalId)` → `getConfrontoDireto`) sob
  demanda e renderiza o painel no cliente com os dados retornados. NUNCA uma lista
  de `<Link>` prefetchável, NUNCA navegação que re-roda a rota RSC cara. Os
  agregados/escudos (`TeamCrest`) do resultado vêm da action; os rótulos (nome de
  A e do rival) já estão nas props (perfil + lista de rivais).
- Grupos de copa: o compute é genérico e serve, mas o MVP de UI fica em
  torneio+liga; encaixe em grupos é opcional e documentado.

## 8. Não-objetivos

- Sem schema/DDL, sem `match_goals` (goleada/média usam o PLACAR), sem input novo.
- Sem persistência/cache dos insights (recomputados por request — baratos, puros).
- Sem xG, sem assistências, sem gráficos temporais (evolução) além do que os
  cards mostram.
