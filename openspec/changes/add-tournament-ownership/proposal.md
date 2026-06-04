## Why

Segundo item do Tier 1. Hoje `tournaments` não tem dono (`id`, `titulo`, `status`) e a RLS é SELECT público irrestrito com **escrita negada a todos** — torneios só nascem semeados à mão no dashboard do Supabase. Sem `created_by` não há como (a) deixar o usuário criar o próprio torneio pela app, nem (b) restringir quem edita/encerra cada torneio. É o pré-requisito direto de criação de partida (Tier 1c) e de convites (Tier 3).

## What Changes

- **DDL (defesa em profundidade no banco; usuário aplica `schema.sql` manualmente)** em `tournaments`:
  - `created_by uuid references public.users(id) on delete set null` (anulável: torneios de sistema/legados; `set null` evita apagar o torneio quando o dono some — simétrico a `matches.participante_*`).
  - `is_public boolean not null default true` (default `true` preserva a visibilidade dos torneios já semeados e o comportamento atual do dashboard).
  - índice `tournaments_created_by_idx` (a RLS filtra por `created_by`).
- **RLS de `tournaments` reescrita**:
  - SELECT (`anon, authenticated`): `is_public OR created_by = auth.uid()` — público vê os públicos; o dono vê também os seus privados.
  - INSERT (`authenticated`): `with check (created_by = auth.uid())` — o dono é sempre quem cria.
  - UPDATE (`authenticated`): `using` e `with check` em `created_by = auth.uid()` — só o dono edita e não transfere a posse.
  - DELETE (`authenticated`): `using (created_by = auth.uid())`.
- **Server Action `createTournament`** (`src/actions/tournaments.ts`): exige sessão, valida `titulo`/`isPublic` com Zod, insere com `created_by = user.id` (nunca confia em valor do cliente) e redireciona ao dashboard. Segurança em profundidade: RLS no banco + checagem na action.
- **Schema** `createTournamentSchema` (`src/schema/tournamentSchema.ts`): `titulo` (2–80) + `isPublic` (boolean, default `true`).
- **UI**: página `/dashboard/torneios/novo` (RSC protegida) + `TournamentForm` (folha client, espelha o padrão dos forms de auth) + link "Novo torneio" no dashboard.
- **Testes**: `src/actions/tournaments.test.ts` (entrada inválida não toca o banco; sem sessão rejeita; `created_by` setado server-side; sucesso redireciona) e `src/schema/tournamentSchema.test.ts`.

## Capabilities

### New Capabilities
- `tournament-management`: criação de torneio com dono via Server Action.

### Modified Capabilities
- `data-model`: `tournaments` ganha `created_by` e `is_public`.
- `row-level-security`: `tournaments` deixa de ser leitura pública irrestrita com escrita negada e passa a ter visibilidade por dono/público e escrita restrita ao dono.

## Impact

- **Código**: `src/actions/tournaments.ts` (novo), `src/schema/tournamentSchema.ts` (+teste), `src/app/dashboard/torneios/novo/page.tsx` (novo), `src/features/tournament/components/TournamentForm.tsx` (novo), `src/app/dashboard/page.tsx` (link).
- **Banco (DDL manual)**: `supabase/schema.sql` — 2 colunas + índice + 4 policies. **needs_db = true**; o usuário aplica (instruções em `docs/pendencias-manuais.md`).
- **Impacto no dashboard (esperado e seguro)**: `getActiveMatches` embute `tournaments!inner`; com a nova RLS, partidas de torneio **privado de outro usuário** somem do dashboard de quem não é dono. Torneios semeados são `is_public = true` (default) → nada muda hoje. É o comportamento multi-tenant correto.
- **Não-impacto**: criação de partida ainda é Tier 1c (sem INSERT em `matches` aqui); demo público (torneios públicos seguem visíveis); login/cadastro.
- **Decisão de produto (reversível)**: visibilidade padrão pública. Trocar para privado-por-padrão é só `default false` + ajuste do form — registrado caso o produto prefira depois.
- **Fora de escopo**: editar/encerrar torneio pela UI (a RLS já habilita; a tela vem quando o lifecycle de status entrar); listagem dedicada "meus torneios".
