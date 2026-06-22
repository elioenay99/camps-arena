## Why

A cadência de rodadas só anda num sentido: `liberarRodadas` torna rodadas ocultas visíveis (`liberada_em = now()`, idempotente via `.is(liberada_em, null)`), mas **não há como RECOLHER** — voltar uma rodada (ou todas) para oculta. Um dono que clica "Liberar tudo" sem querer fica preso: não consegue voltar para "nenhuma liberada" nem retomar a liberação uma a uma. A operação inversa é viável e barata (a coluna `liberada_em` já existe; a policy `matches_update_tournament_owner` por `pode_arbitrar_torneio` já permite o dono/árbitro setar a coluna; o trigger `lock_match_lifecycle` só trava placar/status/W.O., não `liberada_em`). **Sem DDL.**

## What Changes

- **Server Action `recolherRodadas(tournamentId, alvo)`** — inversa de `liberarRodadas`: seta `liberada_em = null` nas partidas do alvo que estão liberadas (`liberada_em is not null`). Idempotente. Mesma autorização (`pode_arbitrar_torneio`) e mesmo gate de torneio não-encerrado.
- **Alvos**: `{ tipo: "tudo" }` (volta tudo para oculto), `{ tipo: "rodada", rodada: N }` (uma rodada — base do "recolher última"), `{ tipo: "faseGrupos" }` (grupos).
- **Recolhe mesmo rodadas JÁ JOGADAS** (decisão do dono): o placar permanece gravado, só some da visão de quem não é dono até religar. O trigger não bloqueia (não toca placar/status).
- **UI**: o console "Liberação de rodadas" passa a ter, além dos botões de liberar, **"Recolher última rodada"** (a maior rodada liberada), **"Recolher tudo"** (com confirmação, igual "Liberar tudo") e **"Recolher fase de grupos"** (em torneios de grupos). A "última rodada liberada" é derivada no client de `rodadasLiberacao` (sem novo fetch).
- **Sem notificação** (recolher esconde; não dispara push, diferente de liberar).

## Capabilities

### Modified Capabilities

- **round-management**: nova capacidade de RECOLHER rodadas (inversa da liberação), pelo mesmo papel e mesmos alvos canônicos por `rodada`/`grupo`.

## Impact

- **Sem DDL.** Reusa `matches.liberada_em` + a policy/trigger existentes.
- **Código**: `alvoRecolhimentoSchema` (`src/schema/liberacaoSchema.ts`), action `recolherRodadas` (`src/actions/tournaments.ts`), UI `LiberarRodadasButtons` (passa a liberar E recolher), testes.
- **Segurança**: igual à liberação — `pode_arbitrar_torneio` no pré-check + RLS `matches_update_tournament_owner` como backstop; torneio encerrado fica fora.
- **Compatibilidade**: nenhuma mudança no que já está liberado/jogado até o dono recolher; avulso (sem `rodada`) continua fora.
