# Tasks — hardening-seguranca-supabase

Gate: DDL via MCP mostrando o SQL ANTES (REGRA 4); espelhar em `supabase/schema.sql`;
re-rodar `get_advisors(security)`; smoke ao vivo (convite + avatar).

## 1. Verificação (read-only) — FEITA
- [x] 1.1 `get_advisors(security)` baseline atual (pós-5.x): 1 ERROR + WARNs categorizados.
- [x] 1.2 Confirmar que nenhum código do app chama os 12 alvos de revoke via `rpc(...)` (grep vazio).
- [x] 1.3 Confirmar que o app NÃO lista avatars no storage (grep vazio).
- [x] 1.4 Confirmar que `users_public` é órfã (só em `database.types.ts`) → invoker-only é seguro.
- [x] 1.5 Confirmar fluxo de `teams` (server action `actions/teams.ts`) e de `info_convite*` (login).

## 2. DDL (via MCP; espelhar em schema.sql)
- [x] 2.1 SQL mostrado ao usuário (REGRA 4) + AskUserQuestion (aplicar tudo + smoke).
- [x] 2.2 `alter view public.users_public set (security_invoker = on)`. (migration `hardening_seguranca_supabase`)
- [x] 2.3 `revoke execute` dos 10 TRIGGERS de `anon, authenticated, public`. **LIÇÃO:** os 2 helpers
  de RLS (`eh_dono_competition`/`eh_participante`) NÃO podem ser revogados — funções chamadas DENTRO
  de policy RLS EXIGEM EXECUTE do papel que consulta. O revoke deles quebrou `matches` (smoke pegou:
  `permission denied for function eh_participante`) → REVERTIDO (migration `hardening_restaura_helpers_rls_execute`,
  autorizado por AskUserQuestion). O `schema.sql:832-835` já documentava isso; o memo de segurança estava errado.
- [x] 2.4 `drop policy "avatars leitura publica" on storage.objects` (objeto continua por URL).
- [x] 2.5 Aplicado via MCP; espelhado em `supabase/schema.sql` (view + drop da policy + bloco de revokes no fim).
- [x] 2.6 `database.types.ts` sem mudança necessária (a view continua existindo; só muda a opção).
- [x] 2.7 (follow-up 2026-06-15) `revoke execute on function public.eh_co_participante(uuid) from
  public, anon, authenticated`. Função introduzida pela change `hardening-celular-coparticipantes`
  como predicado INTERNO da RPC `celulares_de_contato` (DEFINER) — não é usada em NENHUMA policy
  (≠ `eh_dono_competition`/`eh_participante` da lição 2.3) nem chamada como RPC pelo app, então o
  revoke é seguro. Provado: RPC `celulares_de_contato` segue executável por authenticated sem erro;
  os 2 WARNs (`anon`/`authenticated_security_definer_function_executable`) sumiram do advisor.
  Espelhado em `supabase/schema.sql`. (migration `revoke_execute_eh_co_participante_publico`)

## 3. Auth (painel/manual)
- [x] 3.1 Habilitar `leaked_password_protection` (Auth settings do dashboard — **passo do usuário**).
  LIGADO pelo usuário em 2026-06-15. NOTA: o advisor tem cache e ainda pode reportar `Disabled` por
  alguns minutos após o toggle; re-rodar `get_advisors(security)` antes de arquivar (task 5.2) p/
  confirmar que o WARN sumiu.

## 4. Validação
- [x] 4.1 `get_advisors(security)` pós-fix: **ERROR zerado** + **10 trigger-funcs zeradas**. Restam só
  WARNs por design: 2 helpers de RLS (precisam de EXECUTE), RPCs legítimas (`montar_*`/`aceitar_*`/`info_*`),
  `teams_insert` (catálogo) e o toggle de leaked-password (painel).
- [x] 4.2 Smoke ao vivo: `/dashboard` (partidas ativas) volta sem erro após o revert; ligas/torneios OK.

## 5. Encerramento
- [ ] 5.1 Commit (pt-BR, Conventional Commits, sem coautoria) + push.
- [ ] 5.2 `openspec archive hardening-seguranca-supabase`.
- [ ] 5.3 Atualizar [[arena-seguranca-supabase]] com o resultado (advisor pós-fix).
