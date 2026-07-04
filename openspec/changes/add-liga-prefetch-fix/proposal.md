## Why

Ao abrir a página da pirâmide (`/dashboard/ligas/[id]`), a `StandingsTable` de cada
divisão renderiza uma linha por competidor, e cada linha é um `<Link>` para
`/dashboard/ligas/competidor/{id}` (o link é criado pela capability `league-pyramid`,
requirement "Página do competidor com histórico plurianual"). Numa pirâmide de duas
divisões de ~20, são ~40 links no viewport de uma vez.

O `<Link>` do App Router (Next 16) faz **prefetch automático quando entra no
viewport** (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md:298`).
Cada prefetch é uma requisição RSC que RENDERIZA a página-alvo do competidor, e essa
página chama `getCompetitorProfile(id)` — um fetch pesado no Supabase (agregados,
conquistas, promédio, timeline). ~40 prefetches simultâneos = ~40 renders concorrentes
de `getCompetitorProfile` (N+1) que estouram o backend; uma leva devolve HTTP 503.
O sintoma foi observado ao vivo ao abrir a pirâmide.

Nenhum `<Link>` do app seta `prefetch` hoje (`rg prefetch src` = zero), então todos
herdam o prefetch-no-viewport padrão. Não há `src/middleware.ts` nem rate-limit.

## What Changes

- **Desligar o prefetch automático SÓ do `<Link>` de competidor da `StandingsTable`**
  (`src/features/standings/components/StandingsTable.tsx`, o único ramo `hrefCompetidorBase`).
  Valor escolhido: `prefetch={false}` — no App Router isso significa "Prefetching will
  never happen both on entering the viewport and on hover"
  (`link.md:304`), eliminando a rajada no viewport. A navegação por CLIQUE segue
  intacta (prefetch ≠ navegação: ao clicar, o Next busca a rota-alvo normalmente).
- **Teste.** Asserção em `StandingsTable.test.tsx` de que o link de competidor
  renderiza com `prefetch={false}` (via mock do `next/link` capturando a prop) e de
  que sem `hrefCompetidorBase` o nome continua texto puro (torneios avulsos inalterados).

Escopo mínimo e cirúrgico: apenas o link de competidor da pirâmide. Os demais `<Link>`
da página (Equipe, Identidade, Abrir torneio, Voltar à pirâmide) NÃO são tocados — são
poucos e não formam rajada.

## Impact

- **SEM DDL, SEM mudança de dados, SEM migration.** Uma prop numa folha de UI.
- Arquivos: `src/features/standings/components/StandingsTable.tsx` (1 prop),
  `src/features/standings/components/StandingsTable.test.tsx` (assertions).
- A `StandingsTable` roda também em torneios avulsos SEM `hrefCompetidorBase` (nome em
  texto, sem link) — esse caminho é byte-idêntico.
- Custo aceito: some também o prefetch-on-hover desse link (no App Router `false`
  desliga os dois). Ver `design.md` §2 — é aceitável e a alternativa (hover-only) não
  existe como valor de prop no App Router.

### Follow-up OPCIONAL (fora de escopo — NÃO implementar aqui)

- **429 + `Retry-After` no backend.** Exigiria infra de rate-limit NOVA (não há
  middleware nem limiter no repo). O fix de prefetch já elimina a rajada e satisfaz
  todos os critérios de aceite; um limiter especulativo seria over-engineering.
- **Otimizar o N+1 interno de `getCompetitorProfile`** (agregar as queries). Outra
  frente, independente deste fix.
