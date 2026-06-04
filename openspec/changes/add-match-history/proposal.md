## Why

Segundo item do Tier 2. A página do torneio mostra a classificação, mas os resultados que a produziram são invisíveis — quem quer conferir "quando foi 2x1?" não tem onde olhar. O dashboard só lista partidas ATIVAS (encerrada some de lá por design). O histórico fecha esse buraco no lugar natural: a própria página do torneio, abaixo da classificação.

## What Changes

- **Fetcher estendido** (`getTournamentClassificacao`): a MESMA query de partidas (que já alimenta o motor) passa a selecionar `id`/`updated_at` e a ordenar por `updated_at` desc; o retorno ganha `partidasEncerradas` — lista shaped para exibição (nomes resolvidos com fallback, placares, data de encerramento). UMA viagem ao banco continua servindo classificação E histórico.
- **UI `MatchHistoryList`** (`src/features/match/components/`): componente RSC puro — lista "Partidas encerradas" com `nome 2 x 1 nome` e data pt-BR. Seção omitida quando não há encerradas (o estado vazio da classificação já orienta).
- **Página do torneio**: seção "Partidas encerradas" abaixo da classificação.
- **Testes**: extensão dos testes do fetcher (mapeamento de `partidasEncerradas`, ordem, fallback de participante nulo, colunas novas travadas no select).

## Capabilities

### New Capabilities
- `match-history`: histórico de partidas encerradas do torneio.

### Modified Capabilities
- `standings-page`: a página passa a exibir também o histórico (fetcher devolve as duas fatias).

## Impact

- **Código**: `src/features/standings/data/getTournamentClassificacao.ts` (+`partidasEncerradas`, +teste), `src/features/match/components/MatchHistoryList.tsx` (novo), `src/app/dashboard/torneios/[id]/page.tsx` (seção).
- **Banco**: NENHUMA mudança (zero DDL, zero RLS — leitura já coberta). Sem pendência manual.
- **Semântica de data**: `updated_at` é a melhor aproximação de "encerrada em" (a partida encerra no último lançamento de placar); registrado como limitação — um `encerrada_em` dedicado só se o lifecycle de partida evoluir.
- **Fora de escopo**: histórico global cross-torneio; paginação (MVP traz tudo do torneio — mesmo trade-off da classificação, design D7 anterior); escudos de clube no histórico; reabrir partida.
