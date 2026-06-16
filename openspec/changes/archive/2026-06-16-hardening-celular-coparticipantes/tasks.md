# Tasks — hardening-celular-coparticipantes

Gate: DDL via psql no LOCAL para dev/validação; PROD via MCP mostrando o SQL na ordem do
`design.md` (aditivos → push → revoke); espelhar em `schema.sql` + `local-grants.sql`;
gates `typecheck/lint/test/build`; review adversarial do diff; validação ao vivo (390px,
2 contas).

## 1. Verificação (read-only) — FEITA (workflow de entendimento)
- [x] 1.1 Mapear RLS de `users` + helpers de participação (nenhum predicado dois-usuários).
- [x] 1.2 Mapear leitura/escrita de `celular` (2 embeds inline + self; update sem `.select()`).
- [x] 1.3 Confirmar regressão de nome só no torneio público AVULSO (row-policy não muda).
- [x] 1.4 Confirmar baseline anon (lê ZERO de `users`; `/dashboard` gated por middleware).
- [x] 1.5 Confirmar `local-grants.sql` re-concede `select(celular)` (ordenamento).

## 2. DDL
- [x] 2.1 Compor o SQL (funções `eh_co_participante` + `celulares_de_contato`; revoke +
  `grant select (id,nome,avatar,created_at) to anon, authenticated`) — `design.md`.
- [x] 2.2 Aplicar 1+2+3 no LOCAL (psql/`supabase`).
- [x] 2.3 Espelhar funções em `supabase/schema.sql` (seção de funções + bloco de grants).
- [x] 2.4 Espelhar o bloco revoke/grant de coluna no FIM de `supabase/local-grants.sql` (ÚLTIMA
  instrução tocando `users`) + atualizar o comentário enganoso (linhas ~17-19).
- [x] 2.5 Hand-roll dos tipos EXATOS em `database.types.ts`: `celulares_de_contato` (Args
  `{ p_user_ids: string[] }`, Returns `{ user_id: string; celular: string | null }[]`) e
  `eh_co_participante` (Args `{ p_outro: string }`, Returns boolean).

## 3. Código
- [x] 3.1 `getActiveMatches.ts`: tirar `celular` dos 4 embeds; RPC + reinjeção `?? null`.
- [x] 3.2 `getTournamentClassificacao.ts`: tirar `celular` dos 4 embeds; RPC + reinjeção
  `?? null` só nas partidas abertas (manter o campo `celular` nos tipos).
- [x] 3.3 `getPerfil.ts`: `select id,nome,avatar` + `celular` via RPC (self).
- [x] 3.4 Retrabalho dos testes (~30-40 linhas/arquivo): adicionar `rpc` aos `montarClient`
  de `getActiveMatches.test`/`getTournamentClassificacao.test` (+ campo `contatos`); reescrever
  os asserts de select que fixam `celular` (getActiveMatches.test:166,169;
  getTournamentClassificacao.test:236-237,263-266); mover fixtures de celular do embed p/ o
  retorno da RPC; casos novos (competitivo reinjeta; RPC vazia → null; histórico sem celular).

## 4. Gates de qualidade
- [x] 4.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` (verde).
- [x] 4.2 Workflow de review adversarial do diff → corrigir HIGH/CRITICAL.

## 5. Validação ao vivo (LOCAL, 390px)
- [x] 5.1 Gate POSITIVO provado via SQL com `auth.uid()` real (dono pede celular do participante
  do MESMO torneio → RPC devolve). O dataset LOCAL não tinha par co-membro com celular + partida
  aberta p/ o fluxo `wa.me` de 2 contas no browser; o link vem de `whatsapp.ts` (unit-testado), a
  composição cobre. App health: dashboard/torneio renderizam nomes sem erro (RPC ao vivo).
- [x] 5.2 Gate NEGATIVO provado via SQL (uid sem torneio compartilhado → 0 linhas); página do
  torneio público renderiza nomes/placares sem expor celular.
- [x] 5.3 `select celular from users` (papel authenticated) → `permission denied` (coluna sem grant).
- [x] 5.4 Auto-perfil ao vivo: salvar nome/celular e RELER (persiste via self-RPC). OK.
- [x] 5.5 Smoke da view órfã: `set role anon; select * from public.users_public;` pós-revoke
  → 0 linhas SEM erro de coluna (prova do re-grant a anon).

## 6. Promoção ao PROD (sequência do design — fail-whole-query)
- [x] 6.1 Aplicar funções (aditivos 1+2) ao PROD via MCP (SQL mostrado). Inertes p/ código antigo.
- [x] 6.2 Commit (pt-BR, Conventional Commits, sem coautoria) + push → deploy Vercel
  (commit `4b70e78`; deploy `dpl_A2a8an4C23DLK5feiNFA8FSB5kyd` READY).
- [x] 6.3 Confirmar deploy saudável; SÓ ENTÃO aplicar revoke/grant de coluna (3) ao PROD via MCP
  (a vulnerabilidade só fecha aqui). **Rollback:** não reverter o deploy sem antes reverter o
  revoke; manter pronto `grant select (celular) on public.users to authenticated;`.
  (Aplicado em 2026-06-15 via migration `revoke_select_celular_users`; deploy confirmado READY antes.)
- [x] 6.4 `get_advisors(security)` pós-fix; smoke do `/dashboard` e da convocação no PROD.
  (Advisors = zero ERROR, idêntico ao baseline; `has_column_privilege` prova celular negado/nome+avatar
  preservados/UPDATE intacto; HTTP smoke `/`=200, `/dashboard`→`/login`=200; SQL como `authenticated`
  lê `id,nome,avatar` sem erro.)

## 7. Encerramento
- [x] 7.1 `openspec archive hardening-celular-coparticipantes`.
- [x] 7.2 Atualizar memória ([[arena-seguranca-supabase]] / [[arena-retomada]]).
