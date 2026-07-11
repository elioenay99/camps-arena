# Tasks — add-contador-wo-tecnico

## 0. Baseline
- [ ] 0.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm test:rls` (guardar
  contagens de HEAD) — verde final = zero falhas novas vs. baseline.

## 1. Módulo puro da regra (o coração) — `src/features/standings/woStreak.ts`
- [ ] 1.1 `export const LIMITE_WO_SEGUIDOS = 3` e `export type EventoWo = { rodada:
  number; tipo: 'wo_loss' | 'wo_win' | 'jogou'; perdoado: boolean }`.
- [ ] 1.2 `export function calcularStreakWo(eventos: EventoWo[]): number` — máquina da
  escada (wo_loss soma / perdoado zera; presente com streak<3 zera / ≥3 trava).
  Assume `eventos` ordenados por rodada asc.
- [ ] 1.3 Vitest `woStreak.test.ts` EXAUSTIVO: 1 e 2 seguidos + jogar zera; 3 seguidos
  + jogar NÃO zera; 4/5 seguidos; wo_win no meio (streak<3) zera; wo_win com streak≥3
  NÃO zera; duplo W.O. (dois wo_loss) soma; perdoado zera; sequências mistas;
  lista vazia → 0.

## 2. DDL (aditivo, idempotente) — `supabase/schema.sql` + `ddl.sql`
- [ ] 2.1 Tabela `public.wo_perdoes` (FKs `match_id`/`user_id`/`tournament_id`/
  `perdoado_por`, `perdoado_em default now()`), UNIQUE `(match_id, user_id)`, índice
  `(tournament_id, user_id)`. RLS ENABLE + policy SELECT gated
  (`pode_ver_bastidores_torneio OR pode_gerir_torneio`). GRANT SELECT a
  authenticated; `revoke insert,update,delete,truncate,references,trigger from anon,
  authenticated` (defesa em profundidade, espelha `coach_tenures`); `revoke select
  ... from anon` (fecha o auto-grant do Supabase → anon falha-fechado 42501).
- [ ] 2.2 `wo_sofridos_do_tecnico(uuid, uuid) returns table(match_id uuid)`
  `sql stable security definer set search_path=''`: distinct dos `wo_loss` do técnico
  na janela meio-aberta de todas as tenures dele no torneio. `revoke all on function
  ... from public, anon, authenticated`.
- [ ] 2.3 `sequencia_disciplina_torneio(uuid) returns table(user_id uuid, slot_id
  uuid, rodada integer, tipo text, perdoado boolean)` `plpgsql stable security definer
  set search_path=''`: gate interno `auth.uid()` não-nulo + `pode_gerir_torneio` →
  `NAO_AUTORIZADO`; itera tenures ABERTAS (`encerrada_em is null`, `user_id not
  null`); classifica cada partida encerrada da janela (`rodada >= rodada_inicio` E
  `(rodada_fim is null or rodada < rodada_fim)` — paridade literal com
  `partidaNaJanela`) em wo_loss/wo_win/jogou + `perdoado`; `slot_id` = slot da tenure.
  **ORDEM TOTAL** (o fold é posicional; ida-e-volta empata rodada+posicao): `order by
  user_id, rodada asc nulls last, posicao asc nulls last, perna asc nulls first, id
  asc`. `revoke ... from public, anon`; `grant execute ... to authenticated`.
- [ ] 2.4 `perdoar_wo_tecnico(uuid, uuid) returns integer` `plpgsql security definer
  set search_path=''`: `auth.uid()` não-nulo + `pode_gerir_torneio`; insere
  `wo_sofridos_do_tecnico` em `wo_perdoes` (`on conflict (match_id, user_id) do
  nothing`), retorna `row_count`. `revoke ... from public, anon`; `grant execute ...
  to authenticated`.
- [ ] 2.5 `expulsar_tecnico_wo(uuid, uuid) returns integer` `plpgsql security definer
  set search_path=''`: `auth.uid()` não-nulo + `pode_gerir_torneio`; `update
  tournament_slots set user_id = null where id = p_slot_id and tournament_id =
  p_tournament_id and user_id is not null` (o AFTER UPDATE fecha a tenure → próximo
  técnico streak 0), retorna `row_count`. `revoke ... from public, anon`; `grant
  execute ... to authenticated`. NÃO reusar `expulsarTecnico` (dono-only, fica
  intacta).
- [ ] 2.6 `ddl.sql` com o SQL exato dentro de UMA transação + pré/pós-checagens
  (tabela existe; anon NÃO executa a sequência nem lê `wo_perdoes` → 42501; perdão e
  expulsão idempotentes). NÃO aplicar (REGRA 4 — mostrar ao dono; aplicar via MCP após
  aprovação).

## 3. Tipos gerados — `src/lib/supabase/database.types.ts`
- [ ] 3.1 `wo_perdoes` Row/Insert/Update. Se `generate typescript types` via MCP não
  estiver disponível offline, editar à mão e sinalizar.
- [ ] 3.2 Bloco Functions: `wo_sofridos_do_tecnico`, `sequencia_disciplina_torneio`,
  `perdoar_wo_tecnico`, `expulsar_tecnico_wo` com Args/Returns corretos.

## 4. Camada TS — fetcher + actions
- [ ] 4.1 `src/features/league/data/getDisciplinaWoTorneio.ts`: chama
  `sequencia_disciplina_torneio`, agrupa por `user_id`, `streak =
  calcularStreakWo(eventos)`, resolve nome/avatar (padrão de `getTecnicoProfile.ts`),
  devolve `{userId, nome, avatarUrl, slotId, streak}` ordenado por `streak` desc,
  incluindo só `streak > 0`.
- [ ] 4.2 `perdoarWoTecnico(tournamentId, userId)` em `src/actions/wo.ts`: pré-check
  `podeGerir` (`src/lib/autorizacao.ts`), chama a RPC, `revalidatePath`, retorna
  `{ok, perdoados}`. Estilo das outras actions de `wo.ts`.
- [ ] 4.3 Action `expulsarTecnicoWo(tournamentId, slotId)` em `src/actions/wo.ts`:
  pré-check `podeGerir`, chama a RPC `expulsar_tecnico_wo`, `revalidatePath`, retorna
  `{ok, expulsou}`. NÃO reusar `expulsarTecnico` (dono-only).
- [ ] 4.4 Vitest das actions (mock supabase, estilo `wo.test.ts`): `perdoarWoTecnico`
  e `expulsarTecnicoWo` — não-autenticado / não-gestor barrado; gestor chama a RPC e
  retorna o resultado.

## 5. UI — seção de administração do torneio
- [ ] 5.1 Componente RSC `DisciplinaWoTecnicos.tsx` (feature dir coerente): lista os
  técnicos com `streak > 0` — avatar + nome (link `/dashboard/ligas/tecnico/[userId]`),
  badge do streak ("N W.O. seguidos"; `>= LIMITE` destacado "crítico" na paleta).
  Empty state "Nenhum técnico com W.O. seguidos."
- [ ] 5.2 Folhas client `PerdoarWoButton` / `ExpulsarTecnicoButton` (`"use client"`,
  confirmação inline em dois cliques (padrão do repo) + `sonner`), aparecem JUNTAS só quando `streak >=
  LIMITE_WO_SEGUIDOS` (ambas gated por `podeGerir`, sem flag `ehDono`). Textos:
  Perdoar = "Zera a contagem de W.O. seguidos. Não altera resultados nem
  classificação."; Expulsar = "Remove o técnico da vaga. O próximo que entrar começa
  do zero." Toast de sucesso do Perdoar = "Contagem zerada" (NÃO expor o número de
  perdões — a materialização varre todas as tenures e pode exceder o streak visível).
  Streak 1-2 = só o número.
- [ ] 5.3 Integração em `src/app/dashboard/torneios/[id]/page.tsx`: nova
  `SecaoTorneio` "Disciplina — W.O. seguidos" na área gated `podeGerir` (perto de
  "Solicitações de W.O."), fetch de `getDisciplinaWoTorneio`. Mobile-first 390px,
  dark padrão, RSC-first.

## 6. pgTAP REAIS — `supabase/tests/rls_wo_disciplina.sql`
- [ ] 6.1 Harness de `rls_copa_tecnico.sql` (seed superuser +
  `session_replication_role=replica`; depois triggers ON + jwt claims; asserts sob
  `set local role authenticated`/`anon` p/ evitar falso-verde de superuser). Registrar
  em `run.sh` (já varre `rls_*.sql`).
- [ ] 6.2 Assert: `sequencia_disciplina_torneio` classifica wo_loss/wo_win/jogou,
  marca `perdoado`, respeita a janela meio-aberta e só tenures abertas.
- [ ] 6.3 Assert (gate): authenticated NÃO-admin → `NAO_AUTORIZADO` em `sequencia_...`
  e `perdoar_...`; anon → erro; dono/admin → funciona.
- [ ] 6.4 Assert: `perdoar_wo_tecnico` insere e é IDEMPOTENTE (2ª chamada = 0); depois
  a sequência marca `perdoado`.
- [ ] 6.5 Assert (RLS): anon/authenticated NÃO inserem direto em `wo_perdoes` (42501);
  anon NÃO lê `wo_perdoes` (42501); `wo_sofridos_do_tecnico` não executável por
  authenticated.
- [ ] 6.6 Assert: duplo W.O. aparece como `wo_loss` pros DOIS técnicos.
- [ ] 6.7 Assert (`expulsar_tecnico_wo`): authenticated não-gestor → `NAO_AUTORIZADO`;
  anon → erro; gestor NÃO-dono → esvazia a vaga (`user_id` null) e o AFTER UPDATE
  FECHA a tenure (o técnico some da sequência); 2ª chamada na vaga vazia → 0.

## 7. Gate
- [ ] 7.1 `openspec validate add-contador-wo-tecnico --strict` = valid.
- [ ] 7.2 `pnpm typecheck && pnpm lint && pnpm test` verdes (vs. baseline).
- [ ] 7.3 `pnpm test:rls` (OBRIGATÓRIO — garantias em plpgsql) verde vs. baseline + os
  novos asserts de disciplina.
- [ ] 7.4 `pnpm build` verde.
- [ ] 7.5 DDL: mostrar `ddl.sql` ao dono; aplicar em PROD via MCP após aprovação;
  pós-checagens + `get_advisors` sem novo ERROR. (PENDENTE DO DONO — o agente não
  aplica DDL em PROD.)
- [ ] 7.6 Validação visual logada (seção de disciplina no torneio, badges, botões
  Perdoar/Expulsar, empty state) em 390px + desktop, dark/light. Pendência do dono se
  o agente não puder logar.
