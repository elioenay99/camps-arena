## 1. Filtro de lifecycle do torneio

- [x] 1.1 `getActiveMatches.ts`: filtrar no servidor — embed `!inner` (seguro: `tournament_id` NOT NULL; RLS de tournaments é `using (true)`) + `.neq("tournament.status", "encerrado")` no ALIAS; tipo `tournament` deixa de ser `| null`; comentário do porquê
- [x] 1.2 `getActiveMatches.test.ts`: builder encadeável (2 `.neq`) + cenário assertando `!inner` no select e `.neq` no alias com SÓ `encerrado` (falha-segura)

## 2. Código morto

- [x] 2.1 `TeamSearchInput.tsx`: remover o ternário inalcançável `results.length === 0` ("Nenhum clube encontrado.") — `mostrarLista` garante `results.length > 0` no branch final
- [x] 2.2 Confirmar que os testes de DOM existentes passam sem ajuste

## 3. Validação

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 3.2 `openspec validate fix-dashboard-filter-e-deadcode --strict`
- [x] 3.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
