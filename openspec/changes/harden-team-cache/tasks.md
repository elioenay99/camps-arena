## 1. Validação de entrada (Zod)

- [x] 1.1 Em `src/schema/teamSchema.ts`, endurecer `teamResultSchema`/`selectTeamSchema`: `escudoUrl` = `null` OU URL `https` com host exatamente `media.api-sports.io` (via `.url()` + refine de protocolo/host, sem regex frágil)
- [x] 1.2 `nome`: `min(1).max(80)`; `externalId`: `regex(/^\d+$/)`
- [x] 1.3 Garantir que o `normalizar` de `searchTeams` continua compatível (logos da API casam o host); ajustar se algum campo passar a ser rejeitado
- [x] 1.4 (validação) Alinhar o refine de `escudoUrl` à CHECK do banco e ao `next.config.ts`: prefixo cru `https://media.api-sports.io/` + path `/football/teams/` (fecha domínio nu, `/` final, `?`, `#`, `:443`)

## 2. Server Actions

- [x] 2.1 Em `src/actions/teams.ts`, exigir sessão em `searchTeams`: `auth.getUser()` no topo; sem usuário → `{ ok: false, error: "Você precisa estar autenticado." }`, ANTES de qualquer chamada à API
- [x] 2.2 Em `src/actions/match.ts` (`updateMatchTeams`), incluir `time_1, time_2` no `select` da partida; após aplicar o patch, rejeitar quando `time_1` e `time_2` resultantes forem o mesmo clube não-nulo, com mensagem clara

## 3. DDL (defesa em profundidade — usuário aplica)

- [x] 3.1 Em `supabase/schema.sql`, adicionar CHECK em `teams`: `escudo_url IS NULL OR escudo_url LIKE 'https://media.api-sports.io/%'` (via `ALTER TABLE ... ADD CONSTRAINT`, guardado por `DROP CONSTRAINT IF EXISTS` + `ADD`)
- [x] 3.2 Em `supabase/schema.sql`, adicionar CHECK em `matches`: `time_1 IS NULL OR time_2 IS NULL OR time_1 <> time_2`
- [x] 3.3 Documentar no `schema.sql` (comentário) a verificação de dados legados antes de aplicar a constraint de `escudo_url`

## 4. Testes

- [x] 4.1 `src/actions/teams.test.ts`: cobrir `searchTeams` sem sessão → rejeita e NÃO chama `fetch`; ajustar os testes existentes para mockar usuário autenticado
- [x] 4.2 `src/actions/teams.test.ts`: `selectTeam` com `escudoUrl` fora do domínio (e nome/externalId inválidos, e domínio confiável sem path) → rejeitado, sem INSERT
- [x] 4.3 `src/actions/match-teams.test.ts`: `updateMatchTeams` com o mesmo clube nos dois lados → rejeitado, sem UPDATE (cobrir o caso de patch parcial sobre estado existente)

## 5. Validação

- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test` verdes localmente
- [x] 5.2 `openspec validate harden-team-cache --strict`
- [x] 5.3 Workflow de validação adversarial (4 lentes + veredito): `approved_with_nits`, 0 must_fix; should_fix (alinhamento Zod↔CHECK) e nit (comentário do cache) aplicados
