## 1. Banco: coluna `listada` (fonte de verdade + tipos)

- [x] 1.1 `supabase/schema.sql`: adicionar `alter table public.tournaments add column if not exists listada boolean not null default false;` junto ao bloco de visibilidade de `tournaments` (perto de `is_public`).
- [x] 1.2 `supabase/schema.sql`: adicionar `alter table public.league_competitions add column if not exists listada boolean not null default false;` junto à definição da tabela (coluna inline + alter defensivo para DBs existentes).
- [x] 1.3 `supabase/schema.sql`: índices parciais `tournaments_listada_idx` e `league_competitions_listada_idx` (`(created_at desc) where listada`).
- [x] 1.4 `src/lib/supabase/database.types.ts`: adicionar `listada: boolean` em `Row` e `listada?: boolean` em `Insert`/`Update` de `tournaments` e `league_competitions`.
- [ ] 1.5 (ORQUESTRADOR) aplicar o DDL no PROD via MCP após aprovação do dono (mostrar o SQL — REGRA 4). O specialist NÃO aplica. **NOTA: o orquestrador informou que o DDL JÁ FOI APLICADO** (migração `add_listada_vitrine_publica`).

## 2. Server Action: toggle `listada` (gateada por `podeGerir`)

- [x] 2.1 Action de toggle do TORNEIO (`src/actions/tournaments.ts`, `definirListadaTorneio`): recebe `{ tournamentId, listada }`, valida por Zod, checa `podeGerir(supabase, { tournamentId })`, REJEITA se o torneio for divisão (`liga_do_torneio` != null), e faz `update tournaments set listada = ... where id = tournamentId`. `revalidatePath` da página do torneio e da vitrine.
- [x] 2.2 Action de toggle da LIGA (`src/actions/leaguePyramid.ts`, `definirListadaLiga`): recebe `{ competitionId, seasonId, listada }`, valida por Zod, checa `podeGerir(supabase, { competitionId })`, faz `update league_competitions set listada = ... where id = competitionId`. `revalidatePath` da temporada e da vitrine.
- [x] 2.3 Ambas retornam resultado tipado (`{ ok } | { ok, error }`) e não vazam detalhes internos em erro (Sentry no catch).

## 3. UI: toggle "Listar na vitrine pública" (só gestor)

- [x] 3.1 Componente de toggle (`ListarVitrineToggle`, client leve: checkbox+label espelhando `TurnoDivisaoControl` — não há `Switch` shadcn no projeto — otimista + sonner) que chama a action do escopo. Estado inicial = valor de `listada`.
- [x] 3.2 Página do TORNEIO: renderizar o toggle na área "Administração do torneio" **somente quando `gerir && !ehDivisao`**. Passa `listada` atual do torneio.
- [x] 3.3 Página da LIGA: renderizar o toggle na área de gestão **somente quando `podeGerir`**, escrevendo em `temporada.competicao.id`. `getSeason` passou a expor `listada` da competição (embed + `TemporadaCompleta.competicao.listada`).
- [x] 3.4 (RESSALVA 1) Página do TORNEIO: `listada` exposto no loader `getTournamentClassificacao` (`.select(...)` + `listada: boolean` na interface `TorneioClassificacao`); a página passa `torneio.listada` como estado inicial.

## 4. Vitrine "Explorar"

- [x] 4.1 Loader `src/features/discovery/data/getVitrine.ts` (`server-only`): query ligas `listada=true` AND `status='ativa'` (embed `league_seasons(id, numero, status)` → season corrente = maior `numero`); query torneios `listada=true` AND `is_public=true` EXCLUINDO divisões (Set das 3 FKs de `league_division_seasons`). `ItemVitrine` ordenado por `created_at desc`; card sem season é omitido. **(RESSALVA 2) dono SÓ da view `public.users_public` (id/nome) — sem join em `auth.users`, sem PII.**
- [x] 4.2 Página `src/app/dashboard/explorar/page.tsx` (RSC): `redirect('/login?redirectTo=/dashboard/explorar')` se `!user`; cards (`ChampionshipBadge`/tema, `StatusPill`/`SeasonStatusPill`, dono via `users_public`) com link à visão read-only. Estado vazio: "Nenhuma competição pública ainda".
- [x] 4.3 `loading.tsx` (skeleton) coerente com os outros índices.
- [x] 4.4 Nav: `{ href: "/dashboard/explorar", rotulo: "Explorar" }` no `LINKS` de `src/app/dashboard/layout.tsx` (ativo por prefixo).

## 5. Botão "Compartilhar" (só gestor)

- [x] 5.1 `CompartilharCompetitionButton` (client): monta a URL absoluta (`window.location.origin + path`) e chama `compartilharWhatsApp({ texto, title })` SEM `getFile` (só link). Recebe `path` e `titulo`.
- [x] 5.2 Página do TORNEIO: botão só quando `gerir`, `path = /dashboard/torneios/[id]`.
- [x] 5.3 Página da LIGA: botão só quando `podeGerir`, `path = /dashboard/ligas/[season_id]`.

## 6. Testes

- [x] 6.1 Loader da vitrine (`getVitrine.test.ts`): lista liga `ativa`+`listada` e torneio `is_public`+`listada` de terceiros; EXCLUI divisão; resolve o `season_id` corrente; omite liga sem season; estado vazio.
- [x] 6.1b (RESSALVA 3) Loader: liga `arquivada`+`listada` NÃO aparece (filtro `status='ativa'`); torneio `listada` mas `is_public=false` NÃO aparece (filtro `is_public=true`).
- [x] 6.2 Actions de toggle (`definirListada.test.ts`): `podeGerir=false` → rejeitado (torneio e liga); torneio divisão → rejeitado; caminho feliz grava `listada`.
- [x] 6.3 Página da vitrine (`explorar/page.test.tsx`): `!user` → redirect; com dados → cards com href correto; sem dados → estado vazio.
- [x] 6.4 UI dos toggles: escondido para `!podeGerir`; escondido no torneio quando `ehDivisao`; visível para gestor de torneio de topo e de liga (asserções nas page.test do torneio e da liga + comportamento em `ListarVitrineToggle.test.tsx`).
- [x] 6.5 Botão compartilhar: presente só para gestor nas duas páginas (page.test) + comportamento em `CompartilharCompetitionButton.test.tsx`.
- [x] 6.6 Suíte completa verde (`pnpm test`): 1342 testes / 97 arquivos, sem regressão.

## 7. Qualidade e validação

- [x] 7.1 Gate mecânico: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` — todos verdes.
- [ ] 7.2 (ORQUESTRADOR) validação visual mobile **390px**: abrir `/dashboard/explorar` com competições listadas (cards + link); toggle na gestão da liga e do torneio de topo (ausente em divisão e para não-gestor); botão compartilhar só para gestor. (Specialist não dirige browser.)
- [ ] 7.3 (ORQUESTRADOR) revisão adversarial por workflow do diff (foco: divisão nunca vira card; toggle/escrita gateados; vitrine não expõe nada além da RLS de leitura). (Specialist não spawna workflow.)
- [x] 7.4 `openspec validate add-vitrine-publica-e-compartilhar --strict` = valid.
