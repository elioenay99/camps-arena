# Hardening de segurança do Supabase (baseline do Security Advisor)

## Why

O Security Advisor do Supabase (project `bfxmdypdxbbfedtqsqik`) reporta 1 ERROR + vários
WARN de SEGURANÇA acumulados ao longo das fases. O usuário (security-consciente) pediu para
atacar isto DEPOIS da pirâmide (agora entregue). Nenhum é exploração ativa, mas reduzem a
superfície exposta pela API PostgREST e pelo Storage. Baseline registrada em
[[arena-seguranca-supabase]].

## What Changes

DDL via MCP (mostrando o SQL antes — REGRA 4), espelhada em `supabase/schema.sql`:

1. **[ERROR] view `public.users_public` SECURITY DEFINER** → `security_invoker = on`. A view
   (`select id, nome, avatar from users`) NÃO é consumida por nenhum código do app (só consta
   em `database.types.ts`), então `invoker` zera o lint sem adicionar leitura anônima nova.
   (Decisão do dono: refatorar p/ invoker; refinada para invoker-only por estar órfã.)

2. **[WARN] funções SECURITY DEFINER expostas como RPC** → `revoke execute ... from anon,
   authenticated, public` em 12 funções que NUNCA deveriam ser RPC (rodam como trigger ou
   dentro de RLS): triggers `lock_league_season`, `lock_league_division_season`,
   `lock_league_competitor_identity`, `lock_division_tournament_reopen`, `lock_match_lifecycle`,
   `lock_match_relations`, `lock_slot_relations`, `handle_new_user`, `valida_resultado_mata_mata`,
   `block_slot_invite_por_nome`; helpers de RLS `eh_dono_competition`, `eh_participante`.
   Verificado: NENHUM código do app chama esses nomes via `rpc(...)`.

3. **[WARN] bucket `avatars` permite listagem** → dropar a policy `avatars leitura publica`
   (SELECT amplo em `storage.objects`). Objetos continuam acessíveis por URL (bucket público);
   verificado que o app NÃO lista avatars (só usa URLs diretas).

4. **[WARN] `auth_leaked_password_protection` off** → habilitar (Auth settings do dashboard;
   passo manual do usuário OU via management API).

### Mantido por design (NÃO mexer)
- RPCs legítimas que validam posse/código por dentro: `montar_temporada`/`montar_playoff`/
  `montar_barragem`/`montar_grande_final` (authenticated), `aceitar_convite`/`aceitar_convite_vaga`
  (authenticated), `info_convite`/`info_convite_vaga` (authenticated — a página de convite exige login).
- `teams_insert_authenticated WITH CHECK (true)`: catálogo de clubes (qualquer logado adiciona um
  clube do API-Football ao criar torneio, via server action `src/actions/teams.ts`). INSERT-only,
  dado de catálogo (sem posse). Intencional.

## Out of scope (follow-ups registrados)
- **`users_select_authenticated using=true` expõe `celular` (telefone) de TODOS os usuários a
  qualquer logado** — ligado ao atalho "Chamar no WhatsApp". Escopar para co-participantes é uma
  decisão de produto/RLS separada (toca uma feature real).
- Supabase LOCAL (dev/prod separados) — bloco de infra próprio.

## Impact
- Specs: `row-level-security` (exposição da API endurecida).
- DDL em PROD via MCP + espelho em `supabase/schema.sql`. Sem mudança de código de app.
- Validação: re-rodar `get_advisors(security)` até zerar o ERROR + os WARN tratáveis; smoke ao
  vivo do fluxo de convite (login) e do upload/leitura de avatar.
