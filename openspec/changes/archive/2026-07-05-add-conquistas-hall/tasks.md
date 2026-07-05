# Tasks — add-conquistas-hall

## 0. Baseline

- [ ] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test` —
  registrar contagem verde (verde final = zero falhas novas vs. baseline).

## 1. Schema / DDL (aditivo, idempotente) — `supabase/schema.sql` + `ddl.sql`

- [ ] 1.1 Tabela `public.conquistas` (`create table if not exists`): colunas +
  CHECK de `tipo`/`escopo` (`escopo` mantém `torneio`/`copa` por forward-compat),
  `unique (escopo, ref_id, competitor_id, tipo)`, índices `(competitor_id)` e
  `(escopo, ref_id)`. `competitor_id` FK `league_competitors on delete cascade`;
  `ref_id` polimórfico SEM FK.
- [ ] 1.2 RLS de `conquistas`: `enable row level security`; policy
  `conquistas_select` (anon+authenticated) espelhando
  `league_competitors_select_visivel`. Grant APENAS `select`. NENHUM
  grant/policy de insert/update/delete.
- [ ] 1.3 RPC `registrar_conquistas_temporada(uuid, jsonb)` (SECURITY DEFINER,
  `search_path=''`): gate dono + season `em_fluxo|encerrada`; delete-then-insert
  do escopo; (a) campeão/vice das entries SÓ em `formato='liga'` de ciclo ANUAL
  (`tournament_id_clausura is null`), (b) promovido/rebaixado de `destino`, (c)
  artilheiro de `match_goals`, (d) payload `p_premios` (campeão/vice de liga-split
  + grupos_mata_mata + destaques) com guardas de tipo (num-guard em
  nivel/valor_num, UUID-guard em competitor_id), `distinct on (competitor_id,
  tipo)` de dedup, e `exists()` de pertencimento à temporada. Grant execute a
  `authenticated`.
- [ ] 1.4 `openspec/changes/add-conquistas-hall/ddl.sql` = recorte exato + pré/pós
  -checagens. NÃO aplicar (REGRA 4 — o dono aplica, vendo o SQL antes).

## 2. Encerramento da LIGA — `src/actions/leaguePyramid.ts`

- [ ] 2.1 Em `confirmarFluxoTemporada`, premiar ANTES do flip para `encerrada`:
  DEPOIS de congelar as entries (passo 2) e `montarProximaTemporada` (passo 3), e
  ANTES do UPDATE `season → 'encerrada'` (que passa a ser o ÚLTIMO write), montar
  `p_premios` e chamar `registrar_conquistas_temporada`. Erro da RPC = fatal
  (retorna erro genérico → re-run em `em_fluxo` reexecuta, idempotente).
- [ ] 2.2 **Remap slot→competitor_id** ao montar `p_premios`: traduzir os ids
  chaveados por SLOT de `calcularDestaques`/`resultadoDaChave` para
  `competitor_id` via `league_division_entries` (`slot_id`↔`competitor_id`) ou o
  helper `rechavearInsights` (`insights.ts:514`) ANTES de montar o payload. Campeão/
  vice de divisão liga-SPLIT vêm do vencedor da grande final
  (`resolverCampeaoDivisaoSplit`/`getGrandeFinal`) e de `grupos_mata_mata` de
  `resultadoDaChave`; destaques de `calcularDestaques`.
- [ ] 2.3 Gerar o pôster (link) + disparar push best-effort (ver 4/5); `await`
  antes de `revalidatePath`/return. Falha de pôster/push NÃO derruba o encerramento.
- [ ] 2.4 Testes: RPC chamada ANTES do flip; re-run em `em_fluxo` reexecuta sem
  duplicar; sem destaques ⇒ chamada com `[]`; push best-effort mockado não derruba
  a ação.
- [ ] 2.5 **Teste de regressão do remap** (major #3): montar `p_premios` com SLOT
  ids (em vez de competitor_id) DEVE resultar em destaque AUSENTE — o teste falha
  se a action esquecer a tradução slot→competitor.
- [ ] 2.6 **Teste do campeão SPLIT** (blocker): temporada `apertura_clausura` em
  que o líder da tabela combinada ≠ vencedor da grande final → o troféu Campeão
  vai ao VENCEDOR DA FINAL (via payload), NÃO ao `posicao_final=1`, e há UMA só
  linha `campeao` na divisão (sem duplicata bloco a + bloco d).

## 3. Leitura — `src/features/league/data/getConquistasDoCompetidor.ts`

- [ ] 3.1 `getConquistasDoCompetidor(supabase, { competitorId })` (`server-only`)
  → troféus do competidor, agrupáveis por `(escopo, ref_id, ref_rotulo)`,
  ordenados por `conquistado_em desc`.
- [ ] 3.2 Testes: agrupa por temporada; resolve o competidor certo; estado vazio.

## 4. Pôster — `src/features/og/temporada.tsx` + rota

- [ ] 4.1 `renderTemporadaOg` reusando o estilo/marca de `renderRodadaOg`
  (campeão da elite + subiu/caiu).
- [ ] 4.2 Rota `src/app/dashboard/ligas/[id]/temporada/[seasonId]/imagem/route.tsx`
  (dono-gated, 404 sem oráculo — espelho da rota de rodada).
- [ ] 4.3 Testes de rota: 404 sem auth/posse; 200 PNG p/ o dono.

## 5. Push — `src/actions/leaguePyramid.ts`

- [ ] 5.1 Após premiar (ainda antes do flip), `enviarNotificacoes(supabase,
  participantes, {título/corpo "Temporada encerrada…", url da liga}, callerId)` —
  best-effort, gated por co-participação, `await` antes de redirect.
- [ ] 5.2 Testes: destinatários = participantes; no-op sem VAPID; nunca lança.

## 6. UI — estante — `src/features/league/components/competidor/`

- [ ] 6.1 `CompetidorHallDaFama` (RSC) via `getConquistasDoCompetidor`: estante/
  timeline por temporada, escudo/rótulo/valor, destaque dourado ao campeão,
  estado vazio. Ao lado de `CompetidorConquistas` (contagens agregadas PERMANECEM).
- [ ] 6.2 Validação visual 390px (mobile-first) da estante.

## 7. Gate

- [ ] 7.1 `openspec validate add-conquistas-hall --strict` = valid.
- [ ] 7.2 `pnpm typecheck && pnpm lint && pnpm test` verdes (vs. baseline 0.1).
- [ ] 7.3 pgTAP de RLS de `conquistas` (par ALLOW/DENY: leitura por visibilidade;
  escrita direta NEGADA por ausência de grant) — na suíte de RLS existente.
- [ ] 7.4 Revisão adversarial por workflow (writer autoritativo, idempotência,
  RLS, format-gate de campeão, remap slot→competitor) = 0 must_fix.
