## 1. teams — sanidade (DDL)
- [x] 1.1 CHECK `teams_nome_tam` (`char_length(btrim(nome)) between 1 and 80`) e `teams_external_id_num` (`external_id is null or external_id ~ '^[0-9]+$'`) na tabela `public.teams`; espelhar em `schema.sql` + `migration.sql`.
- [x] 1.2 `with_check` da policy `teams_insert_authenticated` valida os mesmos predicados (em vez de `true`).
- [x] 1.3 Pré-checagem: SELECT no PROD confirmando que `nome`/`external_id` já gravados satisfazem os CHECKs (antes de aplicar). Confirmar o teto do Zod do nome p/ casar o `80`.

## 2. montarProximaTemporada interna
- [x] 2.1 Remover `export` de `montarProximaTemporada` (`src/actions/leaguePyramid.ts`); confirmar que o único caller (`confirmarFluxoTemporada`) segue compilando.

## 3. Sentry redige e-mail
- [x] 3.1 `scrub.ts`: regex EMAIL aplicada em `scrubString`; atualizar comentário do cabeçalho.
- [x] 3.2 `scrub.test.ts`: e-mail redigido em message/extra/breadcrumb.

## 4. Podar celular não-convocável no Flight
- [x] 4.1 `MatchCard.tsx`: zerar `celular`/`mensagemWhatsApp` do lado não-convocável antes de passar ao modal.
- [x] 4.2 `MatchCard.test.tsx`: assert `celular === null` no lado não-convocável.

## 5. Unicidade cross-divisão (pirâmide)
- [x] 5.1 `leaguePyramidSchema.ts`: checagem cross-divisão no `superRefine` (clube `t:<id>` + nome `r:<lower(trim)>`), issue na 2ª ocorrência; corrigir comentário enganoso.
- [x] 5.2 `LeagueWizard.tsx`: guard de adicionar clube/nome varre todas as `divisoes`.
- [x] 5.3 `createCompetition` (leaguePyramid.ts): mapear 23505 de `league_competitors` p/ mensagem específica (backstop).
- [x] 5.4 Teste: nome/clube repetido entre divisões → issue de validação.

## 6. Promédio — leitura completa
- [x] 6.1 `promedios.ts`: paginar a query do histórico (`.order("id")` + `.range`) acumulando até página incompleta; soma idêntica.
- [x] 6.2 Teste: paginação acumula 2+ páginas (soma completa).

## 7. Gates
- [x] 7.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes (+ testes novos).
- [x] 7.2 Revisão adversarial do diff por workflow sem `must_fix`.
- [x] 7.3 Validação ao vivo: CHECK de `teams` via psql (nome vazio/>80 recusado; válido aceito); fluxo de pirâmide com clube repetido entre divisões mostra erro de campo (não genérico).

## 8. DDL + arquivar
- [x] 8.1 DDL de `teams` no LOCAL (psql) e no PROD (MCP, mostrando SQL). Gate = **sem NOVO ERROR no advisor**. ATENÇÃO: `rls_policy_always_true` PODE PERSISTIR — vem de `teams_select_public using(true)` (cache público by-design, fora do escopo desta change); não tratar como regressão.
- [x] 8.2 `openspec archive fix-lows-latentes`; commit (pt-BR, sem coautoria); push.
