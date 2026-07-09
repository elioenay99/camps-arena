# Tasks — add-copa-tecnico-heranca

## 0. Baseline
- [x] 0.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` (guardar
  contagens) — verde final = zero falhas novas vs. baseline.

## 1. DDL (aditivo, idempotente) — `supabase/schema.sql` + `ddl.sql`
- [x] 1.1 `cup_entries add column if not exists competitor_id uuid references
  public.league_competitors(id) on delete set null`; índice parcial
  `cup_entries_competitor_idx ... where competitor_id is not null`. Comentar que é a
  proveniência de liga (NULL para por-nome/origem-copa/manual).
- [x] 1.2 `classificacao_final_divisao` — adicionar `competitor_id uuid` ao `returns
  table` e ao `select` (retornar `lde.competitor_id`/`lcomp.id`). **NÃO usar `create
  or replace`** (muda tipo de retorno → `42P13`): confirmar a assinatura exata dos
  args, então `drop function if exists public.classificacao_final_divisao(<args>);`
  seguido de `create function ...` com o corpo ATUAL + a coluna nova (`security
  definer`, `search_path=''`), e **RE-EMITIR** `revoke execute on function
  public.classificacao_final_divisao(<args>) from public, anon;` + `grant execute ...
  to authenticated;` (o DROP apaga os privilégios). Sem CASCADE (nenhum objeto do
  banco referencia a função). NÃO tocar `classificacao_final_copa`. pós-check: anon
  NÃO consegue executar.
- [x] 1.3 `create or replace function montar_copa(...)` — reproduzir o corpo atual e,
  no loop de slots, quando `ce.competitor_id NOT NULL`: buscar
  `league_competitors.holder_user_id`, aplicar dedup `v_holders_usados` (2º técnico
  repetido → `user_id` NULL, mantém `competitor_id`) espelhando
  `montar_playoff`/`montar_barragem`/`montar_grande_final`, e inserir a vaga com
  `competitor_id` + `user_id`. Quando NULL, inserir `competitor_id`/`user_id` NULOS
  (atual). Preservar toda a validação existente (ENTRY_DE_OUTRA_EDICAO, COPA_HETEROGENEA,
  geometria, sentinela `cup_seasons.tournament_id`, `update cup_entries.slot_id`).
- [x] 1.4 `ddl.sql` com o SQL exato + pré/pós-checagens (coluna existe; a RPC retorna
  competitor_id; montar_copa grava competitor_id numa vaga de origem-divisão). NÃO
  aplicar (REGRA 4 — mostrar ao dono; aplicar via MCP após aprovação).

## 2. Tipos gerados — `src/lib/supabase/database.types.ts`
- [x] 2.1 `cup_entries` Row/Insert/Update: `competitor_id: string | null`.
- [x] 2.2 `classificacao_final_divisao` Returns: incluir `competitor_id: string | null`.
- [x] 2.3 **Interfaces de domínio (BLOQUEANTE typecheck):** estender
  `OrigemClassificacao` (`src/features/cup/types.ts:~55-66`) e `EntradaPool`
  (`~82-99`) com `competitor_id: string | null`.

## 3. Derivação propaga `competitor_id`
- [x] 3.1 O loader `lerOrigemViaRpc` (`src/actions/cups.ts:~684-713`): mapear
  `competitor_id: l.competitor_id` no ramo `divisao` (~689-700) e `competitor_id:
  null` no ramo `copa` (~702-712). Incluir `competitor_id: e.competitor_id` no insert
  de `cup_entries` (~651-661).
- [x] 3.2 `src/features/cup/derivacao.ts` (`derivarPool`): incluir `competitor_id`
  APENAS na entry por-CLUBE (`team_id` presente) vinda de origem-DIVISÃO; por-nome/
  rótulo, origem-copa e manual → `null` (mesmo que a RPC devolva competitor_id de um
  competidor de divisão por-nome — a regra é `team_id` presente).
- [x] 3.3 `src/actions/cups.ts` (`derivarVagasCopa`): gravar `cup_entries.competitor_id`
  seguindo a mesma regra (por-clube de divisão).
- [x] 3.4 Testes (mock): entry por-clube de divisão recebe competitor_id; entry
  por-nome (mesmo de divisão), de copa e manual recebe null.
- [x] 3.5 **Comentários load-bearing** (a change inverte premissas afirmadas):
  reescrever o cabeçalho de `cup_entries` (`schema.sql:~4083`), o cabeçalho +
  insert-de-slot de `montar_copa` (`~4350/~4527`), `iniciarEdicaoCopa`
  (`cups.ts:~1032/1068`), o docblock de `getTecnicoCampanha` (`~62-64`, que hoje diz
  "copa NÃO gera tenure") e o comentário de `classificacao_final_copa` — para
  refletir "copa por-CLUBE de origem-divisão herda competitor_id/técnico; por-nome/
  origem-copa/manual seguem NULOS".

## 4. Censo de consumidores (auditar + ajustar SÓ onde regride)
- [x] 4.1 `getTecnicoProfile.ts`: confirmar que a contagem de temporadas ignora
  `season_id` nulo (já faz `if (t.season_id)`); **ajustar** `vigente` para considerar
  só tenures de temporada (`season_id NOT NULL`) — tenure de copa aberta NÃO marca o
  clube "· atual". Teste do ajuste.
- [x] 4.2 `getTecnicosDoCompetidor.ts`: garantir que a tenure de copa (season nula,
  não mapeável a `final_tournament_id`) recebe o mesmo tratamento das de
  playoff/barragem (não vira temporada fantasma na timeline). Teste.
- [x] 4.3 `getConquistasDoTecnico.ts`: confirmar (com teste) que tenure de copa
  (season nula) NÃO herda troféu de liga.
- [x] 4.4 `getTecnicoCampanha.ts`/`getConfrontoTecnicos.ts`: confirmar (teste) que
  jogo de copa creditável (vaga do técnico com competitor_id) ENTRA na campanha/H2H.
- [x] 4.5 Consumidores `competitor_id → slots → matches` (`getCompetidorInsights`,
  `getConfrontoDireto`, `getArtilheirosDoCompetidor`): confirmar que incluir jogos de
  copa é benigno/desejado (paridade com playoff/barragem/final) e que NADA por-torneio
  (classificação da liga) muda. Documentar; ajustar só se houver regressão real.

## 5. pgTAP REAIS — `supabase/tests/`
- [x] 5.1 Autorar `supabase/tests/<nnn>_copa_tecnico.sql` exercitando contra Postgres
  REAL: (a) `classificacao_final_divisao` retorna `competitor_id`; (b) após
  `montar_copa`, a vaga de origem-divisão tem `competitor_id`+`user_id` (holder) e a
  por-nome/manual tem NULOS; (c) dedup: dois participantes do mesmo técnico → 2ª vaga
  `user_id` NULL; (d) o trigger abriu a tenure de copa (competitor_id, season NULL)
  para a vaga herdada e NÃO abriu para a sem competitor_id; (e) uma partida de copa
  encerrada nessa vaga é atribuível ao técnico (aparece via a trilha de
  `coach_tenures`).

## 6. Gate
- [x] 6.1 `openspec validate add-copa-tecnico-heranca --strict` = valid.
- [x] 6.2 `pnpm typecheck && pnpm lint && pnpm test` verdes (vs. baseline).
- [x] 6.3 `pnpm test:rls` (OBRIGATÓRIO — garantias em plpgsql) verde vs. baseline + os
  novos asserts de copa.
- [x] 6.4 `pnpm build` verde.
- [ ] 6.5 DDL: mostrar `ddl.sql` ao dono; aplicar em PROD via MCP após aprovação;
  pós-checagens + `get_advisors` sem novo ERROR. (PENDENTE DO DONO — o agente não
  aplica DDL em PROD; `ddl.sql` pronto para aprovação.)
- [ ] 6.6 Validação visual logada (perfil do técnico com jogos de copa na campanha/
  confronto). Pendência do dono se o agente não puder logar.
