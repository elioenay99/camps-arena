# Tasks — add-liberacao-rodadas

Gates: DDL nasce no **Supabase local** (psql) → `database.types.ts` atualizado do LOCAL →
selects/actions/UI. Promoção a prod via **MCP mostrando o SQL** só no fim. Espelhar em
`supabase/schema.sql`. Quality gates (typecheck/lint/test/build) + review adversarial por
workflow antes de commitar. Validação ao vivo 390px, 2 temas, conta de teste, contra o LOCAL.

## 1. DDL (local-first, idempotente)
- [ ] 1.1 `ddl.sql`: `matches.liberada_em timestamptz` (`add column if not exists`) +
  `set default now()` + comentário + backfill `update ... where liberada_em is null` +
  índice `matches_liberada_em_idx (tournament_id, liberada_em)`.
- [ ] 1.2 Reescrever `matches_select_visivel` (dono vê tudo; demais exigem
  `liberada_em is not null and liberada_em <= now()` nos ramos público/participante/jogador).
- [ ] 1.3 Reescrever `matches_update_participant` com a guarda `liberada_em <= now()` no
  `using` e no `with check` (protege a coluna; jogador só mexe em liberada).
- [ ] 1.4 Aplicar no LOCAL via `psql`; conferir: anon/2º usuário não vê partida `liberada_em
  null`; dono vê; UPDATE de placar barrado em oculta; reaplicar o bloco (idempotência, sem
  42710/42P07). NÃO mexer em `local-grants.sql` (grant é por tabela).
- [ ] 1.5 Espelhar em `supabase/schema.sql` (coluna+default+comentário, índice, as 2 policies).
- [ ] 1.6 Atualizar `database.types.ts` (Row/Insert/Update de `matches` com `liberada_em:
  string | null`).

## 2. Geração das partidas (cadência)
- [ ] 2.1 `iniciarTorneio` (liga, `tournaments.ts:~366-395`): aceitar `opts?: { liberarTudo?:
  boolean }` (default `true`); no payload, `liberada_em: null` quando `liberarTudo=false`,
  omitir quando `true`.
- [ ] 2.2 `iniciarTorneioGrupos` (`tournaments.ts:~1169-1176`): idem (`liberarTudo` default
  `true`; `liberada_em: null` por rodada quando manual).
- [ ] 2.3 Confirmar que os demais inserts nascem liberados (default `now()`, sem mudança):
  `iniciarMataMata`, `avancarFase`, `gerarMataMataDosGrupos`, `gerarChaveSemeada`,
  `gerarFaseGruposSemeada`, `createMatch` (avulso). Byes incluídos.
- [ ] 2.4 `iniciarDivisao` (pirâmide) NÃO passa `liberarTudo` ⇒ divisões nascem liberadas
  (zero regressão). Conferir o call-site.

## 3. Schema + Actions
- [ ] 3.1 `schema/`: `alvoLiberacaoSchema` (discriminated union `rodada`/`ate`/`faseGrupos`/
  `tudo`; `rodada` int ≥ 1).
- [ ] 3.2 `liberarRodadas(tournamentId, alvo)` (nova action, molde `fecharRodada`): posse por
  `created_by` + `neq status encerrado`; `update matches set liberada_em = now()` filtrando
  alvo + `.is("liberada_em", null)` + `.select("id")` (confirma efeito, sem `ok:true` cego);
  `revalidatePath("/dashboard/torneios/${id}")`. Mensagem de posse sem oráculo.
- [ ] 3.3 Jogabilidade do não-dono: NÃO precisa de gate de action — a RLS já oculta a partida
  do jogador (cai no "Partida não encontrada"). Confirmar (não regredir) que
  `updateMatchScore`/`solicitarWO` continuam barrando via RLS; caminhos do dono intocados.

## 4. Data layer + página
- [ ] 4.1 `getTournamentClassificacao`: `liberada_em` no `.select()` de matches e nos tipos
  `PartidaAberta`/`PartidaEncerrada`; derivar `rodadasLiberacao[]` e `proximaRodadaOculta`;
  corrigir o comentário (não recebe mais "todas" as partidas para o não-dono). Varrer também
  `getActiveMatches.ts` e `getDivisionClassificacaoCombinada.ts` (comentários "RLS devolve
  todas").
- [ ] 4.2 Página `torneios/[id]/page.tsx`: seção "Liberação de rodadas" (RSC, `SecaoTorneio`,
  `CalendarClock`), antes de "Partidas em aberto", gateada por `ehDono && ehGerado`; passa
  `rodadasLiberacao`/`proximaRodadaOculta`/`ehGrupos`/`tournamentId`.
- [ ] 4.3 **Aviso do não-dono (HIGH do gate)**: quando `!ehDono && torneio.status==="ativo"`
  e nada visível (linhas/grupos/chave/partidasAbertas/encerradas vazios), exibir banner "As
  próximas rodadas ainda não foram liberadas pelo organizador" no lugar dos empty-states de
  não-iniciado (`page.tsx:324,343,353-355,396-397`). Rascunho mantém os empty-states atuais.

## 5. UI (mobile-first, sonner)
- [ ] 5.1 `LiberarRodadasButtons` (client, `src/features/match/components/`): botões Liberar
  próxima / próximas N / fase de grupos (só `ehGrupos`) / tudo (confirmação 2 cliques);
  `useTransition` + `toast`. "Próximas N" derivado das N menores rodadas ocultas REAIS de
  `rodadasLiberacao` (rótulo clampado à contagem real), não aritmética. Some quando não há
  rodada oculta.
- [ ] 5.2 Pills de estado por rodada (Lock/Unlock) na seção, padrão Chip do projeto; a11y
  (`aria-hidden` decorativo + `sr-only` legível).
- [ ] 5.3 Toggle "Liberar todas as rodadas agora" no painel de início standalone (liga e
  grupos), default marcado; propaga `liberarTudo` para a action.

## 6. Testes
- [ ] 6.1 `liberarRodadas`: posse negada a não-dono; cada `alvo` gera o filtro certo;
  idempotência (`liberada_em is null`); torneio encerrado negado.
- [ ] 6.2 Geração: `liberarTudo=false` ⇒ `liberada_em: null`; default ⇒ omitido. Invariante:
  nenhum INSERT de lote de liga/grupos nasce `status='encerrada'` (sem bye oculto).
- [ ] 6.3 `getTournamentClassificacao`: `rodadasLiberacao`/`proximaRodadaOculta`; revisar
  testes que assumiam "todas as partidas".

## 7. Gates + review + validação
- [ ] 7.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (usar `${PIPESTATUS[0]}`,
  não `echo` no pipe).
- [ ] 7.2 Workflow de review adversarial do diff → corrigir HIGH/CRITICAL.
- [ ] 7.3 Validação ao vivo (LOCAL, 390px, 2 temas; DOIS usuários autenticados — dono +
  participante/observador de torneio público, pois as páginas vivem sob `/dashboard`):
  torneio liga manual → não-dono vê o aviso "rodadas não liberadas" (não os empty-states de
  não-iniciado) e tabela parcial após liberação parcial; dono vê tudo + seção; liberar
  próxima → aparece (recarregando) e fica jogável; liberar tudo; torneio de grupos → liberar
  fase de grupos; mata-mata nasce liberado; realtime: placar de partida oculta não vaza ao
  não-dono.

## 8. Encerramento
- [ ] 8.1 Promover DDL a prod via **MCP `apply_migration`** mostrando o SQL; `get_advisors`.
- [ ] 8.2 Commit pt-BR (sem coautoria) + push.
- [ ] 8.3 `openspec archive add-liberacao-rodadas`; atualizar memória de retomada.
