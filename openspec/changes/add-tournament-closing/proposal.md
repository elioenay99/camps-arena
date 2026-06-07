# Proposal — add-tournament-closing

## Why

O ciclo de vida do torneio não fecha pela app: existe `status = 'encerrado'`
com efeitos implementados em TODAS as camadas (dashboard filtra, lifecycle de
partida congela, convite rejeita, partida manual bloqueia), mas NENHUMA action
leva um torneio até ele — o mata-mata decide o campeão e o torneio fica
"ativo" para sempre; liga e avulso idem. Gap registrado como fora de escopo no
design do add-knockout-format; decisões de produto fechadas via
AskUserQuestion (2026-06-06): o dono encerra E reabre; encerrar é livre mesmo
com partidas em aberto (com aviso na UI — cobre torneio abandonado/abortado).

## What Changes

- Nova Server Action `encerrarTorneio(tournamentId)`: só o dono, qualquer
  status ≠ `encerrado` (encerrar um rascunho é o "cancelar"), propriedade por
  FILTRO (resposta única, sem oráculo), `.select()` confirma a escrita.
- Nova Server Action `reabrirTorneio(tournamentId)`: só o dono, só torneio
  `encerrado`. O status de retorno é DERIVADO: formato gerado (liga/mata-mata)
  SEM partidas geradas (nenhuma com `rodada`) volta a `'rascunho'` — reabrir
  como "ativo" criaria liga/chave ativa sem partidas, um beco; nos demais
  casos volta a `'ativo'`.
- UI: console do dono na página do torneio — "Encerrar torneio" com
  confirmação em dois cliques e AVISO do nº de partidas em aberto que serão
  congeladas (elas não pontuam); "Reabrir torneio" em torneio encerrado
  (primeiro controle do dono visível nesse estado).
- **Zero DDL**: a policy `tournaments_update_owner` já autoriza o UPDATE do
  dono; todos os efeitos de `encerrado` já existem.

## Capabilities

### New Capabilities

- `tournament-lifecycle`: encerramento e reabertura do torneio pelo dono —
  transições, derivação do status de retorno, console na página do torneio,
  aviso de partidas abertas.

### Modified Capabilities

(nenhuma — os efeitos de `encerrado` já estão especificados nas capabilities
existentes e não mudam; este change adiciona apenas o caminho de chegada/saída
do estado)

## Impact

- **Actions**: `src/actions/tournaments.ts` (+2 actions no padrão
  mudarStatusComoDono das partidas).
- **UI**: página do torneio (`dashboard/torneios/[id]`) + novo componente
  client do console (confirmação em dois cliques, padrão do repo sem
  AlertDialog).
- **Banco**: nada (RLS existente cobre; sem trigger — POST direto do dono
  mudando o próprio status não tem vítima terceira).
- **Não muda**: dashboard, getActiveMatches, convites, lifecycle de partida
  (os gates por torneio encerrado já existem e passam a ser alcançáveis).
