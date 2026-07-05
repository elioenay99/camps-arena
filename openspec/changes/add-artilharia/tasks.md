# Tasks — add-artilharia

## 0. Baseline

- [x] 0.1 Baseline HEAD `77f4130`: typecheck ✓, lint ✓, test 1405/1405 ✓. Zero
  falhas pré-existentes (verde final = zero falhas).

## 1. Schema / DDL (aditivo, idempotente) — `supabase/schema.sql` + `ddl.sql`

- [x] 1.1 Tabela `public.match_goals` (`create table if not exists`): colunas +
  CHECKs (`lado in (1,2)`, `gols between 1 and 99`, `char_length(btrim(jogador))
  between 1 and 60`), índice único FUNCIONAL `(match_id, lado,
  lower(btrim(jogador)))`, índice em `(match_id)`.
- [x] 1.2 `alter table public.match_score_proposals add column if not exists
  autores jsonb;` (nullable, retrocompat).
- [x] 1.3 RLS de `match_goals`: `enable row level security`; SELECT espelha
  `matches_select_visivel`; INSERT/DELETE espelham `pode_arbitrar_torneio` OU
  participante avulso liberado + não encerrado.
- [x] 1.4 Grants: `select` a anon+authenticated; `insert, delete` a authenticated.
- [x] 1.5 Estender a RPC `aprovar_proposta_placar` (SECURITY DEFINER): ler
  `sp.autores`, delete-then-insert em `match_goals` agregando por `(lado,
  lower(btrim(jogador)))`, no mesmo passo atômico do placar/encerramento.
- [x] 1.6 `openspec/changes/add-artilharia/ddl.sql` com o SQL exato + pré-checagens
  (estilo dos comentários existentes). NÃO aplicar (REGRA 4 — dono aplica).

## 2. Schema Zod — `src/schema/matchSchema.ts`

- [x] 2.1 `autorGolSchema = { lado: 1|2, jogador: trim 1..60, gols: int 1..99 }`.
- [x] 2.2 `autores` opcional em `updateMatchScoreSchema` e `proporPlacarSchema`
  com `superRefine`: soma por lado ≤ placar; sem duplicata no lado (case-insensitive).
- [x] 2.3 Testes: soma acima do placar; nome vazio/longo; gols 0/100; duplicata;
  autores válidos; ausência (retrocompat).

## 3. Fluxo direto — `src/actions/match.ts`

- [x] 3.1 `updateMatchScore`: após o UPDATE de placar OK, se `autores !==
  undefined`, delete `match_goals` por `match_id` e insere os novos (se houver);
  erro limpo em falha. Sem `autores` = intocado.
- [x] 3.2 Testes: grava/substitui; rejeita autores excedendo (Zod); sem autores
  = comportamento atual; falha de insert retorna erro.

## 4. Fluxo proposta — `src/actions/scoreProposals.ts`

- [x] 4.1 `proporPlacar`: ler `autores` do FormData (JSON), validar via schema,
  gravar em `match_score_proposals.autores`.
- [x] 4.2 Testes: guarda autores; proposta sem autores = `null`; autores inválidos
  recusados.

## 5. Camada de dados — funções `server-only`

- [x] 5.1 `src/features/match/data/getScorerSuggestions.ts` —
  `getScorerSuggestions(supabase, { competitorId })` → `string[]` (nomes do
  competidor por frequência).
- [x] 5.2 `src/features/league/data/getArtilharia.ts` — `getArtilharia(supabase,
  { tournamentIds })` → `ArtilhariaLinha[]` (competitorId, competitorNome,
  jogador, gols; ordenado desc; ignora avulso).
- [x] 5.3 `src/features/league/data/getArtilheirosDoCompetidor.ts` —
  `getArtilheirosDoCompetidor(supabase, { competitorId })` → `{jogador, gols}[]`.
- [x] 5.4 Testes: ranking resolve o competidor certo; separa mesmo nome sob
  competidores diferentes; autocomplete escopado; carreira soma por temporada.

## 6. Gate

- [x] 6.1 `openspec validate add-artilharia --strict` = valid.
- [x] 6.2 `pnpm typecheck && pnpm lint && pnpm test` verdes.
- [x] 6.3 Imprimir o SHAPE das funções de dados + marca `ARTILHARIA_BACKEND_OK`.

## 7. UI

- [x] 7.1 Modal de placar (`MatchScoreModal`): captura opcional de autores por
  lado (lista `{nome, gols}`) com autocomplete via `<datalist>` alimentado pela
  server action `sugestoesDeAutorGol` (resolve competidor pela vaga → chama
  `getScorerSuggestions`, lazy ao abrir). Envia `autores` por `onSave` (direto) E
  `onEnviarProposta` (proposta, JSON no FormData). Soma por lado > placar mostra
  aviso inline e bloqueia o envio; sem tocar na captura = `undefined` (preserva).
  Só nos lados COM vaga (competitivo). `vagaId1/2` propagados por `OpenMatchesList`
  e `MatchCard`.
- [x] 7.2 Ranking de artilharia (`ArtilhariaRanking`, RSC): aba "Artilheiros" na
  página do torneio (competitivo) via `getArtilharia({tournamentIds:[id]})` +
  seção na página da liga agregando TODOS os torneios da temporada. Escudo via
  `TeamCrest` (placeholder), link ao competidor (`prefetch={false}`), estado vazio.
- [x] 7.3 Seção "Artilheiros" na página do competidor (`CompetidorArtilheiros`,
  RSC) via `getArtilheirosDoCompetidor({competitorId})` — cards no estilo do hall
  da fama (Conquistas), destaque dourado ao artilheiro principal, estado vazio.
