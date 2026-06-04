## Why

Dois achados da varredura de 2026-06-03, ambos no caminho do dashboard/busca:

1. **Bug latente de lifecycle** — `getActiveMatches` (`src/features/match/data/getActiveMatches.ts:58`) filtra só o status da PARTIDA (`.neq("status", "encerrada")`); o status do TORNEIO embutido é trazido mas ignorado. Partidas `agendada`/`em_andamento` de um torneio `encerrado` continuam no dashboard — hoje invisível (torneios semeados como `ativo`), mas explode quando o lifecycle de torneio (Tier 1) chegar.
2. **Código morto enganoso** — em `TeamSearchInput.tsx`, o branch "Nenhum clube encontrado." (estado vazio) é **inalcançável**: `mostrarLista` (linha 122) só abre o dropdown com `loading || erro || results.length > 0`, então o ternário `results.length === 0` nunca renderiza. O comportamento visível (vazio → lista fechada, sem mensagem) é deliberado e **assertado pelo teste de DOM** (`TeamSearchInput.test.tsx:240`, da revisão adversarial do add-team-search); o branch morto só confunde o leitor sugerindo um estado de UI que não existe.

## What Changes

- **`getActiveMatches` passa a ocultar partidas de torneio `encerrado`, filtrando no servidor**: o embed do torneio vira `!inner` e a query ganha `.neq("tournament.status", "encerrado")` (o caminho usa o ALIAS `tournament` — exigência do PostgREST para embeds aliased). Falha-segura e simétrico ao `.neq` de matches: exclui SÓ `encerrado` — `rascunho`, `ativo` e qualquer status futuro aparecem por padrão.
- **Por que `!inner` é seguro**: `matches.tournament_id` é `NOT NULL` com `ON DELETE CASCADE` (`supabase/schema.sql:52`) — não existe partida sem torneio, então o inner join não descarta nada além do filtro; e a RLS `tournaments_select_public` é `using (true)`, então o embed nunca é ocultado por RLS. O tipo `PartidaAtiva.tournament` deixa de ser `| null` para refletir o schema.
- **Remoção do branch morto** em `TeamSearchInput.tsx` (ternário `results.length === 0` + parágrafo "Nenhum clube encontrado."), preservando o comportamento atual assertado em teste.
- **Testes**: cenário novo em `getActiveMatches.test.ts` assertando a forma da query (`!inner` no select + `.neq` no alias com valor `encerrado`); testes de DOM existentes seguem válidos sem ajuste.

## Capabilities

### New Capabilities
<!-- Nenhuma. -->

### Modified Capabilities
- `dashboard`: a listagem de partidas ativas considera também o lifecycle do torneio — partidas de torneio encerrado saem do dashboard.

## Impact

- **Código**: `src/features/match/data/getActiveMatches.ts` (embed `!inner` + filtro server-side + tipo `tournament` não-nulo), `src/features/team/components/TeamSearchInput.tsx` (remoção de branch morto). `MatchCard.tsx` consome `tournament?.titulo` e segue compilando sem ajuste.
- **Testes**: `src/features/match/data/getActiveMatches.test.ts` (builder encadeável + cenário novo). `TeamSearchInput.test.tsx` inalterado (a assertion `queryByText("Nenhum clube encontrado.")` → null continua verdadeira).
- **Banco**: nenhum DDL.
- **Não-impacto**: comportamento visível da busca de clube inalterado; demo público inalterado.
- **Fora de escopo (registrado para o transversal de UX)**: tornar o estado vazio da busca VISÍVEL ("Nenhum clube encontrado.") seria mudança de UX que contraria a decisão assertada na revisão adversarial anterior — se desejado, vira proposal própria.
