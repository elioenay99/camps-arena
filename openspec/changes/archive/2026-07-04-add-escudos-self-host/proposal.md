## Why

Hoje `teams.escudo_url` guarda a URL do CDN da API-Football
(`https://media.api-sports.io/football/teams/<id>.png`) — a CHECK
`teams_escudo_url_dominio` (`supabase/schema.sql`) FORÇA esse host. Logo, em TODO
render de classificação/pirâmide/partida, o navegador de cada visitante busca o
escudo direto do CDN de terceiro (**hotlink**). Consequências:

- **Dependência externa no caminho de render**: a disponibilidade visual dos
  escudos fica refém do CDN da api-sports (rate-limit, hotlink-protection ou
  indisponibilidade quebram a imagem para o público).
- **Privacidade/controle**: o IP de cada visitante é exposto a um terceiro a cada
  carregamento; não controlamos cache nem headers da imagem.

`selectTeam` (`src/actions/teams.ts`) já materializa o clube em `public.teams` no
cache (idempotente por `provider+external_id`), e o render lê `teams.escudo_url` do
banco — **o render NÃO chama a API-Football**. O gap é exclusivamente a IMAGEM
apontar pro CDN. A correção é self-hostar a imagem no nosso Storage.

## What Changes

- **Novo bucket público `escudos`** (Supabase Storage), espelhando o hardening do
  `avatars`: `public=true`, `file_size_limit` 256KB, `allowed_mime_types`
  `{png,webp,svg+xml}`, SEM policy SELECT ampla (leitura por URL direta), INSERT
  liberado a `authenticated` (cache compartilhado, não por-dono), SEM UPDATE/DELETE
  amplas (escudo WRITE-ONCE pela app).
- **Helper `rehospedarEscudo`** (`src/lib/escudos.ts`): baixa o escudo de origem
  (best-effort, timeout curto), sobe em `escudos/<external_id>.png` (chave
  determinística, `upsert`), e devolve a URL pública do Storage. Non-fatal:
  qualquer falha devolve a URL de origem (fallback), nunca bloqueia.
- **`selectTeam` self-hosta o escudo ao cachear clube NOVO** (antes do INSERT, pois
  `teams` não tem policy de UPDATE via RLS), gravando a URL do Storage. Clube já
  cacheado NÃO re-hospeda (idempotência).
- **CHECK `teams_escudo_url_dominio` relaxada** para aceitar api-sports (transição)
  OU a URL pública do bucket `escudos` (casando o path, sobrevive a prod-ref vs
  local), preservando a intenção anti-injeção.
- **Backfill** (`scripts/backfill-escudos.ts`): migra os registros legados
  (escudo no CDN / nulo com external_id) reusando o helper. Idempotente,
  resiliente, roda com `service_role`.
- **Testes**: helper (sucesso + fallbacks) e `selectTeam` (self-host, idempotência,
  fallback non-fatal, escudo nulo).

## Capabilities

### New Capabilities
<!-- Nenhuma. -->

### Modified Capabilities
- `team-search`: ao cachear o clube, o escudo é servido do Storage próprio (não do
  CDN de terceiro); o render nunca depende de `media.api-sports.io`; a queda do
  rehost não bloqueia o cache (fallback pra origem); o backfill migra os legados.

## Impact

- **Código**: `src/lib/escudos.ts` (novo helper), `src/actions/teams.ts` (rehost no
  `selectTeam`), `src/lib/security/csp.ts` (comentário de transição),
  `src/features/og/rodada.tsx` (allowlist de host anti-SSRF no fetch de escudo).
- **Consumidor server-side de escudo**: `src/features/og/rodada.tsx` é o único
  cold-path que embute o escudo (fetch server-side non-fatal → data URL na imagem
  da rodada); passa a servir do Storage pós-backfill e agora restringe o fetch aos
  hosts confiáveis (api-sports + Storage do projeto), fechando o SSRF via
  `escudo_url` do banco.
- **Testes**: `src/lib/escudos.test.ts` (novo), `src/actions/teams.test.ts`.
- **Banco (DDL manual)**: `supabase/schema.sql` — bucket `escudos` + policies +
  CHECK relaxada. **needs_db = true**; o dono aplica no Supabase (DDL exata em
  `openspec/changes/add-escudos-self-host/ddl.sql`).
- **Backfill (manual)**: `scripts/backfill-escudos.ts` — o dono/orquestrador roda
  com `service_role` DEPOIS de aplicar a DDL. Não roda no CI nem no deploy.
- **Não-impacto**: `next.config.ts` já libera o host do Storage (avatars) em
  `remotePatterns`; a CSP `img-src` já cobre `supabaseHttps`; `TeamCrest` mantém o
  `onError` → placeholder de iniciais. Cores do clube não vêm da API (fora de
  escopo). `searchTeams` inalterado.
- **Risco**: a CHECK relaxada é aditiva (não rejeita registros que a anterior
  aceitava). Enquanto o backfill não roda, escudos legados seguem no CDN (aceito
  pelo ramo de transição) — sem regressão. `media.api-sports.io` permanece na CSP
  e no `next.config` durante a transição; pode sair após backfill 100%.
- **Fora de escopo (follow-up)**: remover o ramo api-sports da CHECK/CSP/next.config
  após o backfill migrar 100% dos registros.
