## 1. Módulo central de ambiente

- [x] 1.1 Criar `src/lib/env.ts`: schema Zod (`NEXT_PUBLIC_SUPABASE_URL` URL obrigatória; `NEXT_PUBLIC_SUPABASE_ANON_KEY` string não vazia; `NEXT_PUBLIC_SITE_URL` URL com default `http://localhost:3000`), `parseEnv(raw)` puro que trata `""` como ausente e lança erro em pt-BR nomeando cada variável, e `export const env` com referências ESTÁTICAS a `process.env.NEXT_PUBLIC_*`
- [x] 1.2 Accessor `apiFootballKey()` no mesmo módulo: leitura em runtime de `API_FOOTBALL_KEY`, `""` → `undefined`, server-only por uso (Server Action)

## 2. Consumidores

- [x] 2.1 `src/lib/supabase/client.ts`, `server.ts` e `middleware.ts`: trocar `process.env.X!` por `env.X`
- [x] 2.2 `src/app/layout.tsx`: `metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL)` (default migra para o schema)
- [x] 2.3 `src/actions/teams.ts`: trocar `process.env.API_FOOTBALL_KEY` por `apiFootballKey()` (comportamento gracioso inalterado)
- [x] 2.4 Garantir zero `process.env` restante em `src/` fora de `src/lib/env.ts`

## 3. Fail-fast no build

- [x] 3.1 `next.config.ts`: side-effect import `./src/lib/env` (com comentário do porquê)
- [x] 3.2 `.env.example`: nota curta de que as variáveis de runtime são validadas em build/boot por `src/lib/env.ts`

## 4. Testes

- [x] 4.1 `vitest.config.ts`: `test.env` com dummies das públicas obrigatórias (parse eager em imports transitivos)
- [x] 4.2 `src/lib/env.test.ts`: ausentes → erro nomeando TODAS as faltantes; `""` tratado como ausente; URL inválida rejeitada; default de `NEXT_PUBLIC_SITE_URL`; parse válido retorna objeto tipado; `apiFootballKey()` (presente / ausente / em branco / stub por teste)
- [x] 4.3 Suíte inteira verde (78 existentes + novos), sem ajuste nos testes existentes

## 5. Validação

- [x] 5.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 5.2 `openspec validate add-env-validation --strict`
- [x] 5.3 Workflow de validação adversarial multi-lente + veredito; aplicar must_fix/should_fix
- [x] 5.4 `pnpm build` local verde (valida o import no `next.config.ts` de ponta a ponta)
