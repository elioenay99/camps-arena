## 1. Helper de rehost (`src/lib/escudos.ts`)

- [x] 1.1 Criar `rehospedarEscudo(supabase, externalId, origemUrl): Promise<string>`: download best-effort (timeout 8s), valida content-type de imagem e tamanho ≤256KB, sobe em `escudos/<external_id>.png` (`contentType image/png`, `cacheControl 31536000`, `upsert: true`), devolve `getPublicUrl`
- [x] 1.2 Non-fatal: qualquer falha (download não-ok/timeout, não-imagem, vazio, grande demais, erro de upload) devolve `origemUrl` inalterada; nunca lança
- [x] 1.3 Exportar `ESCUDOS_BUCKET`

## 2. Integração no `selectTeam` (`src/actions/teams.ts`)

- [x] 2.1 Após o guard `existente` (clube já cacheado retorna cedo → idempotência), chamar `rehospedarEscudo` ANTES do INSERT (a tabela não tem UPDATE via RLS), só quando `escudoUrl` não for nulo
- [x] 2.2 Inserir a URL FINAL (`escudoFinal`) em `escudo_url`; escudo nulo grava nulo sem chamar o helper

## 3. DDL (defesa em profundidade — dono aplica)

- [x] 3.1 Em `supabase/schema.sql`, criar o bucket público `escudos` (`file_size_limit` 262144, `allowed_mime_types {png,webp,svg+xml}`) via `insert ... on conflict do update` (espelha avatars)
- [x] 3.2 Policies do `escudos`: drop da SELECT ampla (leitura por URL); INSERT liberado a `authenticated`; SEM UPDATE/DELETE amplas
- [x] 3.3 Relaxar a CHECK `teams_escudo_url_dominio`: aceitar `null` OU api-sports (transição) OU `%/storage/v1/object/public/escudos/%` (Storage próprio, casando path)
- [x] 3.4 Entregar a DDL exata + `count(*)` de pré-checagem em `openspec/changes/add-escudos-self-host/ddl.sql` (NÃO aplicar)

## 4. Backfill (script — dono roda)

- [x] 4.1 Criar `scripts/backfill-escudos.ts`: lista `teams` com escudo no CDN ou nulo, reconstrói a origem (o próprio `escudo_url` ou `media.api-sports.io/football/teams/<external_id>.png`), reusa `rehospedarEscudo`, faz `UPDATE` com `service_role`
- [x] 4.2 Idempotente (só toca não-migrados), resiliente (pula falhas, loga), com `--dry-run`; documentar como rodar e o pré-requisito de aplicar a DDL antes (NÃO rodar)

## 5. CSP / config

- [x] 5.1 Comentário de transição em `src/lib/security/csp.ts` (host do Storage já coberto por `supabaseHttps`; `media.api-sports.io` pode sair após backfill 100%). `next.config.ts` já libera o host do Storage — sem mudança

## 6. Testes (gate verde local)

- [x] 6.1 `src/lib/escudos.test.ts`: sucesso (URL do Storage); fallbacks (download não-ok, throw, não-imagem, vazio, grande demais, upload falho) → origem. Mock de `fetch` + client de Storage (sem rede/DB real)
- [x] 6.2 `src/actions/teams.test.ts`: clube novo grava a URL do Storage (rehost chamado com origem/external_id); clube cacheado NÃO re-hospeda; rehost falho grava a origem e retorna `ok`; escudo nulo grava nulo sem chamar o helper
- [x] 6.3 `pnpm typecheck && pnpm lint && pnpm test` verdes localmente

## 7. Validação

- [x] 7.1 `openspec validate add-escudos-self-host --strict`
- [ ] 7.2 `pnpm build` (o orquestrador roda na tab de gate)
- [ ] 7.3 DDL aplicada pelo dono; backfill rodado pelo dono (fora do escopo do specialist)
