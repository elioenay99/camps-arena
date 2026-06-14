# Tasks — add-cores-campeonato

> Revisado após gate adversarial (workflow `wu73vrxnh`).

Gates: DDL nasce no **Supabase local** (psql) → `database.types.ts` gerado do LOCAL →
selects/actions → UI. Promoção a prod via **MCP mostrando o SQL** só no fim. Espelhar em
`supabase/schema.sql`. Quality gates (typecheck/lint/test/build) + review adversarial por
workflow antes de commitar. Validação ao vivo claro+escuro a 390px.

## 1. DDL (local-first, idempotente)
- [x] 1.1 SQL: `cor_primaria`/`cor_secundaria` (`add column if not exists`) + por CHECK
  `drop constraint if exists` ANTES de `add constraint` (hex `^#[0-9a-f]{6}$`), nas 3
  tabelas (`tournaments`, `league_competitions`, `league_division_seasons`).
- [x] 1.2 Aplicar no LOCAL via `psql`; conferir CHECK (rejeita `#ABC`/`red`/`#xyz`, aceita
  null e `#aabbcc`); re-rodar o bloco p/ provar idempotência (sem 42710).
- [x] 1.3 Espelhar em `supabase/schema.sql` (3 tabelas).
- [x] 1.4 **Gerar `database.types.ts` do LOCAL** (`mcp__supabase generate_typescript_types`
  contra o local OU hand-roll) — ANTES de tocar selects/actions; conferir Row/Insert/Update
  das 3 tabelas com as 2 colunas.

## 2. Núcleo de tema
- [x] 2.1 `globals.css`: `.champ-theme` (fallback cru) + `@supports (oklch(from …))` com
  derivação por tema (`:root` e `.dark`): `--primary`/`--primary-foreground`/`--ring`.
  Afinar L p/ AA. NÃO remapear `--accent`.
- [x] 2.2 `championshipTheme.ts`: helper `champThemeProps(primary?, secondary?)` → `{className,
  style}` (ou `null`), injeta `--brand-primary/secundaria` + `--primary-foreground` (onColor
  por luminância da crua, p/ fallback). Helper puro `onColor(hex)`.
- [x] 2.3 `ColorField` (`components/ui/color-field.tsx`): controlado (`value`/`onChange` +
  `name` opcional p/ FormData); `<input type=color>` + hex textual (controle primário) +
  swatch. A11y: Label/htmlFor, aria-label, foco `ring-ring`, `aria-invalid` no hex inválido.
- [x] 2.4 `ChampionshipIdentity.tsx`: escudo (gradiente das cruas) + título (contraste próprio).

## 3. Schema + Actions
- [x] 3.1 `schema/corSchema.ts`: `corHex` (regex case-insensitive + `.transform(toLowerCase)`)
  + `coresOpcionais`.
- [x] 3.2 `tournamentSchema`: + `corPrimaria?`/`corSecundaria?`.
- [x] 3.3 `leaguePyramidSchema`: cores na pirâmide + por divisão.
- [x] 3.4 `createTournament`: grava cores no INSERT.
- [x] 3.5 `createCompetition`: grava cores na competição e nas division_seasons da 1ª temporada.
- [x] 3.6 `montarProximaTemporada`: **DUAS pontas** — (a) `cor_primaria, cor_secundaria` no
  `.select()` de `geometriaPorNivel` (`leaguePyramid.ts:1877`); (b) `cor_primaria/secundaria`
  no objeto `divisoesParaCriar` (`~:2010-2023`).
- [x] 3.7 Actions novas (só dono, posse + revalidate): `atualizarCoresTorneio`,
  `atualizarCoresPiramide`, `atualizarCoresDivisao`.

## 4. Data layer + integração nas páginas
- [x] 4.1 `getTournamentClassificacao`: + `cor_primaria, cor_secundaria` no `.select()`
  (`:311`) e no tipo `TorneioClassificacao` (`:18-30`). Helper `resolverCoresTorneio(supabase, id,
  torneio)` com fallback por `league_division_seasons` (por `tournament_id` /
  `tournament_id_clausura` / `final_tournament_id` → `divisao.cor ?? competicao.cor`).
- [x] 4.2 `torneios/[id]/page.tsx`: espalhar `champThemeProps(coresResolvidas)` na `<main>`
  (preservando `flex-1 flex-col`) + `ChampionshipIdentity` no header.
- [x] 4.3 `getSeason`: trazer `competition.cor_*` e `division_seasons.cor_*`.
- [x] 4.4 `ligas/[id]/page.tsx` + `DivisaoCard`: aplicar `champThemeProps(div.cor ??
  competicao.cor)` em **cada card** (não na `<main>`); `ChampionshipIdentity` no card;
  header da pirâmide neutro (cor da competição). Garantir nav (layout acima) fora.
  O `DivisaoCard` já tem `style` (`--stagger`) → **merge por spread** (`{...stagger,
  ...themeProps?.style}`), nunca substituir; idem `className` via `cn(...)`.
- [x] 4.5 `ColorField` no `TournamentForm` (2 campos via `name`, preview) e no `LeagueWizard`
  (default da pirâmide + por divisão via state/patch `atualizarDivisao`, herança visível).
- [x] 4.6 Telas de edição `/torneios/[id]/cores` e `/ligas/[id]/cores` (só dono, preview ao vivo).

## 5. Testes
- [x] 5.1 Unit: resolução de herança (divisão ?? competição ?? null) — função pura.
- [x] 5.2 Unit/zod: `corHex` aceita `#aabbcc`/`#AABBCC` (→ minúsculo), rejeita `#ABC`/`red`/`#xyz`/vazio.
- [x] 5.3 Unit: `onColor(hex)` devolve texto legível (claro/escuro) por luminância.
- [x] 5.4 Action: `atualizarCores*` nega não-dono e aceita dono (mock supabase).
- [x] 5.5 Copy N+1: **criar** teste de `montarProximaTemporada` (mock) asserindo cópia de
  AMBAS as colunas (não existe teste do copy hoje); se inviável no mock, cobrir em 6.3.

## 6. Gates + Review + Validação
- [x] 6.1 `pnpm typecheck && lint && test && build` (`${PIPESTATUS[0]}`).
- [x] 6.2 Workflow de review adversarial do diff → corrigir HIGH/CRITICAL.
- [x] 6.3 Validação ao vivo (Supabase local, conta de teste, 390px) em **claro e escuro**:
  torneio com par vívido → tematizado, nav intacta, contraste AA, **queda vermelha / acesso
  na cor do campeonato** → editar cores (some/herda). Liga: cores por divisão (cada divisão
  sua cor; header pirâmide neutro) → abrir o torneio de uma divisão e ver a cor (fallback) →
  N+1 copia as cores.

## 7. Encerramento
- [x] 7.1 Promover DDL a prod via MCP (mostrar SQL) + `get_advisors` + conferir types.
- [x] 7.2 Commit pt-BR (sem coautoria) + push.
- [x] 7.3 `openspec archive add-cores-campeonato`.
