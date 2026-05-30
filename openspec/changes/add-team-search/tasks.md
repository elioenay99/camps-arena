## 1. Dados e ambiente (DDL manual)

- [ ] 1.1 Propor em `supabase/schema.sql`: tabela `teams` (`id uuid pk`, `nome text not null`, `escudo_url text`, `external_id text`, `provider text not null default 'api-football'`, `created_at timestamptz`, `unique(provider, external_id)`)
- [ ] 1.2 Propor colunas `time_1`/`time_2 uuid references public.teams(id) on delete set null` em `matches` (aditivo; `participante_1/2` intactos)
- [ ] 1.3 RLS de `teams`: SELECT autenticado; INSERT/UPSERT por usuário logado (cache). Atualizar trigger `lock_match_relations` para travar reatribuição de `time_1/time_2` (exceto `service_role`)
- [ ] 1.4 Atualizar `src/lib/supabase/database.types.ts` à mão (nova tabela + colunas)
- [ ] 1.5 Handoff: usuário aplica o `schema.sql` no SQL Editor e confirma
- [ ] 1.6 Adicionar `API_FOOTBALL_KEY` ao `.env.example` (server-side, sem `NEXT_PUBLIC_`)

## 2. Server Action de busca + validação

- [ ] 2.1 `src/schema/teamSchema.ts` (Zod): termo de busca (mín. 3 chars) e shape do clube (nome, escudo_url, external_id)
- [ ] 2.2 `src/actions/teams.ts` → `searchTeams(query)`: `fetch` à API-Football com `API_FOOTBALL_KEY` (header), só server-side; mapeia resposta para `{ externalId, nome, escudoUrl }[]`; trata erro/timeout sem vazar detalhes
- [ ] 2.3 `selectTeam(...)`: upsert do clube em `teams` (cache por `provider+external_id`), retornando o `team.id` local
- [ ] 2.4 Cache do resultado de busca (Next 16 `use cache`/`cacheLife` ou Runtime Cache) para aliviar o limite grátis

## 3. UI — autocomplete e escudo

- [ ] 3.1 `src/features/team/components/TeamSearchInput.tsx` (Client): autocomplete com debounce ~350ms chamando `searchTeams`, lista de resultados com escudo
- [ ] 3.2 `src/features/team/components/TeamCrest.tsx`: `next/image` do escudo + fallback placeholder (iniciais + cor) em ausência/erro de carregamento
- [ ] 3.3 `next.config.ts`: `images.remotePatterns` para `media.api-sports.io`
- [ ] 3.4 a11y/pt-BR: rótulos, estados de carregamento/erro, navegação por teclado no autocomplete

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
