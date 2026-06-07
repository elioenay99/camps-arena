# Proposal — add-rounds-walkover

## Why

Segunda metade da virada clube-cêntrica (decisões do usuário em 2026-06-07,
via AskUserQuestion). Com a vaga sendo o clube, um clube pode ficar ÓRFÃO
(sem técnico) no meio do torneio — e hoje a partida desse clube fica presa em
aberto para sempre, travando a progressão da liga/grupos e o avanço da chave.
Falta também o conceito de RODADA como unidade operacional: hoje `matches.rodada`
é só um número imutável gerado pelo motor; não há "rodada corrente", nem como
fechá-la, nem o que fazer com partidas que ninguém vai jogar.

Decisões fechadas (AskUserQuestion 2026-06-07):
- **Fechar rodada = automático + botão**: a rodada fecha sozinha quando todas
  as partidas entre clubes COM técnico encerram; o adm também força a qualquer
  momento. Ao fechar, toda partida ainda aberta contra clube ÓRFÃO vira W.O.
  automático.
- **Não-comparecimento**: o adm marca W.O. direto; o ADVERSÁRIO pode SOLICITAR
  o W.O. (registro no app) e o adm aceita/recusa.
- **Vencedor do W.O.**: o adm aponta o vencedor ao marcar (cobre órfão e
  não-comparecimento sem ambiguidade).
- **Efeito do W.O.**: vitória SÓ NOS PONTOS (`tournaments.pontos_vitoria`),
  ZERO gols — não conta GP/GC/saldo nem como empate no confronto direto. Na
  CHAVE: decide o confronto inteiro (ida-e-volta inclusive).
- **UI**: partidas em aberto agrupadas por rodada, com botão "Fechar rodada N".

Pré-requisito já entregue: `add-club-tournaments` (vagas, clube órfão).

## What Changes

- **`matches` ganha `wo boolean` (default false) + `wo_vencedor uuid`** (FK
  `tournament_slots`, anulável): W.O. é uma partida `encerrada` com `wo=true`,
  placar `0x0` (respeita "zero gols") e o slot vencedor explícito. Sem 4º
  status (preserva todo o lifecycle/RLS existente).
- **Tabela nova `match_wo_requests`** (solicitação de W.O. pelo adversário,
  padrão do `slot_invites`): `match_id`, `solicitante_slot`, `motivo`, `status`
  (pendente/aceito/recusado), timestamps. O técnico da vaga adversária abre; o
  dono resolve.
- **`computeStandings` ganha o ramo W.O.**: quando `woVencedor` está presente,
  soma só `vitoria`/`derrota` aos pontos e NÃO toca gols/saldo; o confronto
  direto conta como vitória/derrota (não empate pelo `0x0`).
- **Decisão da chave**: `decidirConfronto` lê `woVencedor` — W.O. numa perna
  decide o confronto inteiro (sem esperar a volta nem exigir agregado).
- **Triggers da chave** (`valida_resultado_mata_mata`): early-return quando
  `wo=true` (hoje `0x0` em jogo único seria rejeitado como empate).
- **Rodada ativa = DERIVADA** (sem tabela/coluna nova): `MIN(rodada)` entre
  partidas não-encerradas. "Fechar rodada" é uma ACTION que varre as partidas
  abertas daquela rodada e resolve as órfãs por W.O. automático — não persiste
  estado de rodada.
- **Actions novas** (`match.ts`/`wo.ts`): `marcarWO(matchId, vencedorSlotId)`,
  `fecharRodada(tournamentId, rodada)`, `solicitarWO(matchId)`,
  `responderWO(requestId, aceito)`.
- **Fetcher**: `getTournamentClassificacao` embeda `wo`/`wo_vencedor`,
  identifica clubes órfãos por rodada e carrega solicitações pendentes (dono).
- **UI**: partidas em aberto agrupadas por rodada (`RodadaSection` com botão
  "Fechar rodada N"); ação W.O. na partida (adm marca; adversário solicita);
  console de solicitações pendentes para o dono; rótulo "W.O." no histórico e
  na chave.
- **DDL manual**: seção 14 das pendências (colunas + tabela + policies + ajuste
  de 1 trigger).

## Capabilities

### New Capabilities

- `round-management`: rodada ativa derivada, fechamento de rodada (automático
  ao encerrar a última partida real + botão do adm), varredura de órfãs por
  W.O. automático.
- `match-walkover`: W.O. (representação, efeito nos motores, marcação pelo adm,
  fluxo de solicitação pelo adversário com aceite/recusa do dono).

### Modified Capabilities

- `data-model`: colunas `wo`/`wo_vencedor` em matches; tabela
  `match_wo_requests`.
- `row-level-security`: policies de `match_wo_requests`; UPDATE de W.O. em
  matches pelo dono.
- `standings-engine`: ramo de W.O. (vitória só nos pontos, zero gols,
  confronto direto por vitória/derrota).
- `knockout-format`: W.O. decide o confronto inteiro; early-return do trigger
  de decisividade.
- `match-lifecycle`: W.O. como encerramento; reabrir limpa o W.O.
- `dashboard`: indicador de solicitação de W.O. pendente / partidas das
  minhas vagas.

## Impact

- **Banco**: 2 colunas em matches, 1 tabela nova (+~4 policies), 1 ajuste de
  trigger (early-return W.O.). Nenhuma tabela de rodadas, nenhum enum novo.
- **Motores**: `computeStandings` (ramo W.O.), `decidirConfronto`
  (`gerarChaveMataMata`) — ambos puros, testados exaustivamente.
- **Actions/fetchers**: `match.ts`/`wo.ts` (marcar/fechar/solicitar/responder),
  `getTournamentClassificacao` (embeds + rodada ativa + solicitações).
- **UI**: `OpenMatchesList` → agrupado por rodada; novas folhas client de W.O.;
  console de solicitações; rótulo W.O. em histórico/chave.
- **Não muda**: motores de geração (liga/knockout/grupos), formato avulso,
  auth, criação/lifecycle de torneio, modelo de vagas.
- **Escopo**: rodadas+W.O. valem nos formatos COMPETITIVOS (liga, mata-mata,
  grupos, fase de liga). Avulso não tem rodada nem clube órfão — intocado.
