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
- O congelamento de participants do mata-mata é ESTENDIDO: com a chave gerada,
  sair/remover ficam bloqueados também em torneio `encerrado` (achado da
  validação adversarial: encerrado agora é REABRÍVEL — a sequência encerrar →
  sair → reabrir recriaria o travamento permanente do avanço de fase que o
  add-knockout-format fechou). Mata-mata cancelado no rascunho segue livre.
- **DDL mínima**: só a cláusula estendida da policy
  `participants_delete_self_or_owner` (seção 11 das pendências). As actions de
  encerrar/reabrir em si não exigem DDL (a policy
  `tournaments_update_owner` já autoriza o UPDATE do dono; todos os efeitos de
  `encerrado` já existem).

## Capabilities

### New Capabilities

- `tournament-lifecycle`: encerramento e reabertura do torneio pelo dono —
  transições, derivação do status de retorno, console na página do torneio,
  aviso de partidas abertas.

### Modified Capabilities

- `tournament-participants`: a exceção de sair/remover no mata-mata passa de
  "status ativo" para "chave gerada" (ativo, ou encerrado com partidas
  geradas) — consequência de encerrado ser reabrível.
- `row-level-security`: policy de DELETE de `participants` espelha a regra
  estendida.

## Impact

- **Actions**: `src/actions/tournaments.ts` (+2 actions no padrão
  mudarStatusComoDono das partidas); `participants.ts` (`chaveEmAndamento`
  estendida).
- **UI**: página do torneio (`dashboard/torneios/[id]`) + novo componente
  client do console (confirmação em dois cliques, padrão do repo sem
  AlertDialog); `listaCongelada` cobre encerrado-com-chave.
- **Banco**: 1 policy reescrita (`participants_delete_self_or_owner`) — seção
  11 de `docs/pendencias-manuais.md`. Sem ela o app funciona, mas o backstop
  contra POST direto fica defasado da action.
- **Não muda**: dashboard, getActiveMatches, convites, lifecycle de partida
  (os gates por torneio encerrado já existem e passam a ser alcançáveis).
