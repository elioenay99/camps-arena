## Why

Terceiro item do Tier 2. Cada lado da partida pode representar um clube real (`time_1`/`time_2`, identidade cosmética escolhida pelos participantes), mas esses dados não aparecem em lugar nenhum agregado — "qual clube rende mais?" é uma pergunta natural num campeonato entre amigos que o app já tem dados para responder de graça.

## What Changes

- **Fetcher estendido** (`getTournamentClassificacao`): a MESMA query de partidas ganha `time_1`/`time_2` + embeds `teams` (nome, escudo); o retorno ganha `clubes` — classificação de clubes calculada pelo MESMO motor (`computeStandings`), com as partidas re-chaveadas por clube (`participante_* → time_*`). Partida sem os dois clubes definidos não pontua na tabela de clubes (elegibilidade do motor já cuida).
- **UI**: seção "Clubes" na página do torneio (abaixo do histórico), reusando o `StandingsTable` existente — as linhas de clube têm o mesmo shape (`LinhaComNome`). Seção omitida sem clube pontuado.
- **Testes**: extensão dos testes do fetcher (clubes computados com as regras do torneio, partida sem clube ignorada, embeds travados no select, snapshot único).

## Capabilities

### New Capabilities
- `club-stats`: classificação de clubes do torneio.

### Modified Capabilities
- `standings-page`: o fetcher devolve a terceira projeção (`clubes`).

## Impact

- **Código**: `src/features/standings/data/getTournamentClassificacao.ts` (+`clubes`, +teste), `src/app/dashboard/torneios/[id]/page.tsx` (seção).
- **Banco**: NENHUMA mudança (zero DDL/RLS — `teams` já é SELECT público). Sem pendência manual.
- **Reuso total**: zero código novo de cálculo — o motor é agnóstico à semântica do id (participante ou clube); a CHECK `matches_times_distintos` + o guard de self-match do motor protegem a integridade.
- **Fora de escopo**: escudos na tabela (o `StandingsTable` atual é textual; coluna de escudo é polimento futuro); stats de clube cross-torneio; desempenho por participante+clube.
