## 1. Dados e ambiente (DDL manual)

- [x] 1.1 Tabela `teams` (`id`, `nome`, `escudo_url`, `external_id`, `provider` default 'api-football', `created_at`, `unique(provider, external_id)`) proposta em `supabase/schema.sql`
- [x] 1.2 Colunas `time_1`/`time_2 uuid references teams(id) on delete set null` + índices em `matches` (aditivo; `participante_1/2` intactos)
- [x] 1.3 RLS de `teams`: SELECT público + INSERT autenticado (cache via INSERT idempotente). `lock_match_relations` NÃO trava `time_1/time_2` de propósito (clube é cosmético, editável pelo participante; RLS já restringe UPDATE) — confirmar preferência
- [x] 1.4 `src/lib/supabase/database.types.ts` atualizado (tabela `teams` + `time_1/2` em `matches` + FKs)
- [ ] 1.5 Handoff: usuário aplica o `schema.sql` no SQL Editor e confirma
- [x] 1.6 `API_FOOTBALL_KEY` adicionada ao `.env.example` (server-side, sem `NEXT_PUBLIC_`)

## 2. Server Action de busca + validação

- [x] 2.1 `src/schema/teamSchema.ts` (Zod): `teamSearchSchema` (mín. 3 chars) + `teamResultSchema` (externalId, nome, escudoUrl)
- [x] 2.2 `src/actions/teams.ts` → `searchTeams(query)`: `fetch` à API-Football com `API_FOOTBALL_KEY` (header `x-apisports-key`), só server-side; normaliza `response[].team` → `{ externalId, nome, escudoUrl }[]`; trata erro/timeout/quota sem vazar detalhes
- [x] 2.3 `selectTeam(...)`: cache idempotente em `teams` por `provider+external_id` (select-then-insert com fallback de corrida), retorna `teamId` local; exige sessão
- [x] 2.4 Cache best-effort via `next.revalidate` (24h) na busca; defesas principais = debounce (Fase 3) + cache em `teams`

## 3. UI — autocomplete e escudo

- [x] 3.1 `src/features/team/components/TeamSearchInput.tsx` (Client): combobox com debounce ~350ms + guarda de corrida chamando `searchTeams`, lista com escudo; retorna o clube via `onSelect`
- [x] 3.2 `src/features/team/components/TeamCrest.tsx`: `next/image` do escudo + placeholder (iniciais + cor estável) em ausência/erro
- [x] 3.3 `next.config.ts`: `images.remotePatterns` para `media.api-sports.io/football/teams/**`
- [x] 3.4 a11y/pt-BR: combobox ARIA (role/aria-expanded/activedescendant/listbox/option), navegação por teclado (↑/↓/Enter/Esc), estados Buscando…/erro/vazio

## 4. Integração no fluxo

- [ ] 4.1 Permitir escolher o clube de cada lado ao criar/editar a partida (form mínimo), gravando `matches.time_1/time_2`
- [ ] 4.2 Exibir o clube + escudo no `MatchCard` (dashboard) e no `MatchScoreModal`, usando `TeamCrest`
- [ ] 4.3 Atribuição da fonte de dados (ex.: rodapé "Dados de clubes via API-Football") — premissa não comercial

## 5. Validação e qualidade

- [ ] 5.1 Testes (vitest) da `searchTeams`/`selectTeam` com `fetch` e Supabase mockados (sucesso, termo curto, erro de API, upsert idempotente)
- [ ] 5.2 Auditoria via workflow adversarial (segurança da key server-side, RLS de `teams`, não regressão da Fase 4)
- [ ] 5.3 Quality gates: `tsc` · `lint` · `test` · `build`
- [ ] 5.4 Validação live (browser): buscar clube → selecionar → ver escudo no card/modal; placeholder em clube sem escudo
- [ ] 5.5 Commits convencionais por entrega + archive do change
