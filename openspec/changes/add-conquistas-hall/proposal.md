## Why

Hoje as "conquistas" de um competidor da pirâmide são **contagens agregadas
recomputadas a cada render** (`getCompetitorProfile` →
`CompetidorConquistas`: `titulosElite/titulos/acessos/quedas`). Não há o
**momento da premiação** nem uma estante de troféus específicos por temporada:
nada persiste que "o Ataias foi Campeão da Série A na Temporada 3, com o
artilheiro Endrick (23 gols)". Sem esse registro, não há hall da fama estável,
nem pôster de "Temporada encerrada", nem push de premiação — a profundidade
competitiva que a vitrine de pirâmide + hall da fama (landing) já promete
visualmente.

Esta change transforma o instante de ENCERRAMENTO de uma **temporada de liga**
numa **FOTO persistida** dos motores que já existem (`computeStandings`,
`calcularDestaques`, `resultadoDaChave`, `getArtilharia`, o fluxo da pirâmide):
grava os troféus daquela temporada encerrada na estante do competidor, gera um
pôster compartilhável e dispara um push best-effort. Os troféus são estáveis
(não recomputados), idempotentes (re-executar o fluxo não duplica) e gravados
**apenas** pelo caminho autoritativo do encerramento — nunca por INSERT livre do
cliente.

O escopo é **LIGA-only**. Torneio avulso e copa ficam de fora (ver "Fora de
escopo"): o torneio avulso não tem identidade persistente
(`tournament_slots.competitor_id` nasce NULL, não há perfil de competidor avulso)
e a copa já premia "imortais" chaveando por `team_id/rotulo` (não
`league_competitors`). A tabela nasce genérica (aceita `escopo`
`torneio`/`copa`) para não travar essas evoluções.

## What Changes

- **Schema (DDL aditivo, só documentado — não aplicado).** Nova tabela
  `public.conquistas`: um troféu por linha, referenciando o competidor
  persistente (`league_competitors.id`), o `tipo` do troféu (enum textual), o
  `escopo` (`temporada`/`torneio`/`copa` — só `temporada` é gravado nesta change)
  + `ref_id` polimórfico (season, sem FK) + `ref_rotulo` materializado (rótulo
  estável da temporada no fechamento), `nivel` opcional (divisão), `valor_texto`
  + `valor_num` opcionais (ex.: "Série A", "23 gols", "12 vitórias seguidas") e
  `jogador` (nome do artilheiro). O competidor NÃO é denormalizado — nome/escudo
  resolvem por join (lição da artilharia). Unicidade `(escopo, ref_id,
  competitor_id, tipo)` garante idempotência.
- **RLS de `conquistas` — SELECT-only, sem writer via PostgREST.** A LEITURA
  espelha a visibilidade do competidor (`league_competitors_select_visivel`:
  competição `ativa`, dono, ou quem vê bastidores). NÃO há grant de
  `insert/update/delete` a nenhum papel: o ÚNICO writer é a RPC
  `SECURITY DEFINER` de premiação, que ignora RLS. Isto fecha, no banco, a regra
  "nenhum troféu é gravado por caminho não-autoritativo".
- **Writer autoritativo — RPC `registrar_conquistas_temporada(p_season_id,
  p_premios)` (`SECURITY DEFINER`).** DERIVA em SQL, das entries JÁ CONGELADAS por
  `confirmarFluxoTemporada` (`league_division_entries.posicao_final/destino`), os
  troféus estruturais e o Artilheiro (de `match_goals`), sem confiar em nada do
  cliente:
  - **Campeão/Vice** por posição final — **apenas** em divisão `liga` de ciclo
    ANUAL (`tournament_id_clausura is null`), onde o campeão é o 1º da tabela.
  - **Promovido/Rebaixado** por `destino` (correto em todo formato).
  - **Artilheiro** por divisão.
  Os prêmios do PAYLOAD (`p_premios`, computados no caminho de fechamento pelo
  servidor confiável): **Campeão/Vice das divisões coroadas por chave** — liga
  SPLIT (`apertura_clausura`, campeão = vencedor da grande final via
  `resolverCampeaoDivisaoSplit`) e `grupos_mata_mata` (`resultadoDaChave`), onde
  `posicao_final` diverge do coroado — e **Melhor Ataque/Defesa/Sequência**
  (`calcularDestaques`). Todos validados (competidor pertence à temporada; tipo
  permitido; guardas de tipo antes dos casts; payload deduplicado por
  `(competidor, tipo)`). Idempotente por delete-then-insert do escopo.
- **Encerramento passa a premiar — ANTES do flip final.**
  `confirmarFluxoTemporada` (único caminho de encerrar a temporada) chama a RPC
  (+ gera o pôster + dispara o push) com a season ainda em `em_fluxo` (as entries
  já foram congeladas no passo anterior); o flip para `encerrada` passa a ser o
  ÚLTIMO write. Assim um re-run após falha parcial (que cai no early-return de
  `encerrada`) NÃO deixa a estante vazia para sempre: enquanto a season está
  `em_fluxo`, o fluxo inteiro reexecuta idempotente.
- **UI — estante de troféus (RSC).** Nova seção `CompetidorHallDaFama` na página
  do competidor (ao lado/abaixo de `CompetidorConquistas`), lendo os troféus
  PERSISTIDOS agrupados por temporada (timeline/estante), com escudo/rótulo/valor.
  As contagens agregadas atuais permanecem.
- **Pôster + push.** Route Handler de imagem "Temporada encerrada" (campeão +
  quem subiu/caiu) reusando a infra `next/og` do card de rodada; push
  best-effort "Temporada encerrada: veja o campeão, quem subiu e quem caiu" aos
  participantes (gated por co-participação), sempre `await` antes de redirect.

## Capabilities

### New Capabilities
- `hall-of-fame`: hall da fama persistido — o conjunto de troféus por temporada
  encerrada, a semântica de "foto no fechamento" (persistida, estável,
  idempotente), e a estante na página do competidor.

### Modified Capabilities
- `data-model`: tabela `public.conquistas`.
- `row-level-security`: políticas de `conquistas` (SELECT-only) + a autoridade
  exclusiva da RPC de premiação como writer.
- `league-pyramid`: encerrar a temporada materializa os troféus (ANTES do flip
  final) + gera pôster + dispara push.
- `og-images`: pôster "Temporada encerrada" compartilhável.
- `push-notifications`: push best-effort de temporada encerrada.

## Impact

- **Banco de dados (DDL ADITIVO, MOSTRADO ao dono — REGRA 4; esta change
  documenta, não aplica).** `supabase/schema.sql` (fonte de verdade) +
  `openspec/changes/add-conquistas-hall/ddl.sql` (recorte exato, idempotente,
  com pré-checagens). Escopo: tabela `conquistas` (+ índices + RLS SELECT-only +
  grant só de `select`), 1 RPC `SECURITY DEFINER` de premiação (grant só a
  `authenticated`). Nada destrutivo; nenhum dado existente é alterado.
- **Código de aplicação:**
  - `src/actions/leaguePyramid.ts` (`confirmarFluxoTemporada`: TRADUZ
    slot→`competitor_id` (via `league_division_entries` / `rechavearInsights`),
    monta `p_premios` via `calcularDestaques` + campeão/vice de `resultadoDaChave`
    nas divisões mata-mata, chama a RPC ANTES do flip para `encerrada`, gera pôster
    + push).
  - `src/features/league/data/getConquistasDoCompetidor.ts` (`server-only`:
    lê a estante do competidor).
  - `src/features/og/temporada.tsx` + rota
    `src/app/dashboard/ligas/[id]/temporada/[seasonId]/imagem/route.tsx`
    (pôster "Temporada encerrada").
  - **UI (pode ser outro specialist, MESMA change):**
    `CompetidorHallDaFama` (RSC) na página do competidor.
- **Segurança/autorização:** RLS `conquistas` = SELECT-only por visibilidade do
  competidor; ZERO grant de escrita → forja por PostgREST impossível. A RPC
  re-verifica dono + temporada em fechamento + pertencimento do competidor +
  idempotência. Os troféus ESTRUTURAIS (campeão/vice de liga, promovido,
  rebaixado, artilheiro) são derivados de dados CONGELADOS (sem confiança no
  cliente); os do PAYLOAD (campeão/vice de mata-mata + ataque/defesa/sequência)
  vêm de compute do servidor confiável, sem impacto cross-usuário (troféu
  por-temporada, não leaderboard global) — ver design.md ("Modelo de confiança").
- **Push:** best-effort (`enviarNotificacoes`, contrato que NUNCA lança e é no-op
  sem VAPID) — nunca bloqueia o encerramento; sempre `await` antes de redirect.
- **Dependências:** nenhuma nova.
- **Testes:** RPC (deriva campeão/vice das entries só em `liga` de ciclo anual;
  **temporada SPLIT com líder da combinada ≠ vencedor da final ⇒ Campeão vai ao
  vencedor da final, sem duplicata**; deriva promovido/rebaixado/artilheiro;
  campeão/vice de chave + destaques do payload validados; **payload com slot ids
  NÃO grava destaque** — regressão do remap; payload malformado ou com
  `(competidor, tipo)` duplicado é ignorado/deduplicado sem abortar;
  delete-then-insert idempotente; gate de posse/estado);
  `confirmarFluxoTemporada` (chama a RPC ANTES do flip;
  re-run em `em_fluxo` reexecuta; push best-effort não derruba a ação);
  `getConquistasDoCompetidor` (agrupa por temporada, resolve competidor por join).
  RLS de `conquistas` exercitada em pgTAP (par ALLOW/DENY). Supabase mockado; suíte
  atual permanece verde.

## Fora de escopo (follow-up documentado)

- **Torneio avulso na estante.** O avulso não tem identidade persistente:
  `createTournament` não preenche `tournament_slots.competitor_id` (nasce NULL) e
  não há perfil de competidor avulso. Premiar torneio exige antes modelar uma
  identidade persistente que chaveie por `league_competitors`. A tabela
  `conquistas` já aceita `escopo='torneio'` (forward-compat); a RPC e o gancho no
  `encerrarTorneio` ficam para uma change seguinte.
- **Copas na estante.** `cup_entries` chaveia por `team_id/rotulo` (não
  `league_competitors.id`) e a copa já premia "imortais". Integrar exige mapear
  `cup_entries → league_competitors` (não garantido hoje). `escopo='copa'` fica
  forward-compat.
- **Assistências / MVP da partida** como troféus.
- **Recomputo retroativo** de temporadas já encerradas antes desta change (a
  estante nasce a partir dos próximos encerramentos; um backfill opcional pode
  reusar a mesma RPC depois).
