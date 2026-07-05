# Tasks — add-tecnicos-historico

## 0. Baseline

- [ ] 0.1 Capturar baseline do HEAD: `pnpm typecheck && pnpm lint && pnpm test` —
  registrar contagem verde (verde final = zero falhas novas vs. baseline).

## 1. Schema / DDL (aditivo, idempotente) — `supabase/schema.sql` + `ddl.sql`

- [x] 1.1 Tabela `public.coach_tenures` (`create table if not exists`): colunas +
  FKs (`slot_id`/`competitor_id`/`tournament_id` cascade; `season_id`/
  `division_season_id` cascade nullable; `user_id` set null) + CHECK "no máximo um"
  `coach_tenure_user_ou_nome` (`user_id` **vs** `nome`; ambos nulos = técnico
  removido) + `rodada_inicio`/`rodada_fim`/`aberta_em`/`encerrada_em`.
- [x] 1.2 Índices: único parcial `coach_tenures_slot_aberta_uk (slot_id,
  coalesce(user_id, sentinela)) where encerrada_em is null` + `user_idx`/
  `competitor_idx`/`season_idx`.
- [x] 1.3 Helpers `fn_rodada_corrente(uuid)` (STABLE, min rodada não-encerrada) e
  `fn_resolver_season_divisao(uuid)` (season/division por `tournament_id OR
  tournament_id_clausura`), `SECURITY DEFINER`/`search_path=''`, EXECUTE revogado
  de `public`/`anon`/`authenticated` (internos).
- [x] 1.4 Função de trigger `fn_registrar_coach_tenure` (`SECURITY DEFINER`,
  `search_path=''`, SEM `raise`, gate `competitor_id NOT NULL`): AFTER INSERT
  (abre por user_id / por-nome / nada); AFTER UPDATE OF user_id (OLD≠NEW → fecha
  aberta + abre nova por `fn_rodada_corrente`). Trigger `tournament_slots_
  registrar_coach_tenure AFTER INSERT OR UPDATE OF user_id`.
- [x] 1.5 RLS de `coach_tenures`: `enable row level security`; policy
  `coach_tenures_select` (anon+authenticated) espelhando `conquistas_select` via
  `league_competitors`. Grant APENAS `select`. REVOKE explícito de insert/update/
  delete/truncate/references/trigger. NENHUM grant/policy de escrita.
- [x] 1.6 Backfill idempotente (`NOT EXISTS`): 1 tenure vigente por vaga de liga a
  partir do técnico ATUAL (conta OU rótulo local). Documentar a limitação (só o
  técnico final das temporadas encerradas).
- [x] 1.7 `openspec/changes/add-tecnicos-historico/ddl.sql` = recorte exato +
  pré/pós-checagens. NÃO aplicar (REGRA 4 — o dono aplica, vendo o SQL antes).
- [x] 1.8 `src/lib/supabase/database.types.ts` atualizado À MÃO: `coach_tenures`
  (Row/Insert/Update + Relationships) e `fn_rodada_corrente` (Args/Returns).

## 2. Perfil do CLUBE por técnico — `src/features/league/data/` + página

- [ ] 2.1 `getTecnicosDoCompetidor(supabase, { competitorId })` (`server-only`):
  `coach_tenures` por `competitor_id` left join `users`/`league_seasons`,
  ordenado por `numero, rodada_inicio` → timeline por temporada (quem comandou,
  rodadas i–f, marca o vigente-final). Resolve o técnico por join (por-nome usa
  `coach_tenures.nome`).
- [ ] 2.2 Render da timeline no perfil do competidor
  (`src/app/dashboard/ligas/competidor/[id]/page.tsx`), ao lado de
  `CompetidorHallDaFama`. Espelha `TemporadaTimeline`. Estado vazio explícito.
- [ ] 2.3 Testes: agrupa por temporada; marca vigente-final; inclui por-nome como
  técnico local; ordena i–f; estado vazio.

## 3. Perfil do TÉCNICO (global) — rota nova + fetchers

- [ ] 3.1 `getTecnicoProfile(supabase, { userId })` (`server-only`, só `user_id
  NOT NULL`): identidade `users(id,nome)` + tenures join `league_competitors`/
  `teams`/`league_competitions`/`league_seasons`; agrega clubes comandados,
  temporadas e resultado por-stint quando vigente (`encerrada_em IS NULL`) (join
  `league_division_entries` por `competitor_id + division_season_id`).
- [ ] 3.2 `getConquistasDoTecnico(supabase, { userId })` (`server-only`): pares
  `(competitor_id, season_id)` das tenures VIGENTES (`encerrada_em IS NULL`) →
  `conquistas` escopo `temporada`, agrupado por técnico. Devolve o `Trofeu[]` de
  `getConquistasDoCompetidor`. **SPLIT: DEDUPLICAR por `(competitor_id, season_id)`
  e resolver o campeão pela tenure do torneio DECISIVO** (grande final se houver,
  senão a Clausura) — ver "Regra do SPLIT" no design.md.
- [ ] 3.3 Rota `src/app/dashboard/ligas/tecnico/[userId]/page.tsx` (uuid validado,
  espelha `competidor/[id]`): server component com `Promise.all`, hall herdado +
  clubes comandados. Respeita a RLS da competição (público — decisão 8).
- [ ] 3.4 Link do técnico a partir da classificação
  (`getTournamentClassificacao.ts:389-390` já lê `tecnico {id,nome}`) e da
  timeline do clube.
- [ ] 3.5 Testes: perfil agrega clubes/temporadas; EXCLUI por-nome (sem conta);
  troféu herdado só do par vigente-final; troca no meio → quem saiu NÃO herda o
  troféu; **SPLIT com técnicos distintos Apertura/Clausura → troféu ao do turno
  decisivo, sem duplicar o par**; uuid inválido → 404.

## 4. Cobertura do TRIGGER (SQL — pgTAP, rodável no Supabase LOCAL)

- [ ] 4.1 Descrever no `ddl.sql`/spec e cobrir em pgTAP: materialização com
  `user_id` propagado ABRE tenure (`rodada_inicio NULL`, vigente); vaga por-nome
  abre tenure de rótulo; clube vazio não abre nada.
- [ ] 4.2 Convite (`aceitar_convite_vaga`) em vaga órfã ABRE tenive vigente com
  `rodada_inicio = fn_rodada_corrente`.
- [ ] 4.3 Expulsão/desistência FECHA a tenure vigente (`rodada_fim`,
  `encerrada_em`).
- [ ] 4.4 TROCA DUPLA na mesma temporada = 2 tenures FECHADAS + 1 VIGENTE; o
  índice único parcial impede 2 vigentes por vaga+usuário.
- [ ] 4.5 Slot AVULSO (`competitor_id NULL`) → trigger NÃO grava tenure (gate de
  escopo). NÃO simular trigger em jsdom.

## 5. Gate

- [ ] 5.1 `openspec validate add-tecnicos-historico --strict` = valid.
- [ ] 5.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (vs.
  baseline 0.1).
- [ ] 5.3 pgTAP do trigger + RLS de `coach_tenures` (par ALLOW/DENY: leitura por
  visibilidade; escrita direta NEGADA por ausência de grant) — na suíte de RLS
  existente / Supabase LOCAL.
- [ ] 5.4 Validação visual 390px (mobile-first) da timeline do clube e do perfil
  do técnico.
- [ ] 5.5 Revisão adversarial por workflow (trigger writer único, sem `raise`,
  gate de escopo, atribuição do troféu ao vigente-final, exclusão do por-nome,
  RLS espelhada, REVOKE) = 0 must_fix.
