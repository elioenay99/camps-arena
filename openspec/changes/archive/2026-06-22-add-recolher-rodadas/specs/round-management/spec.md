## ADDED Requirements

### Requirement: Recolhimento de rodadas pelo dono

O dono (ou admin/árbitro — capacidade `pode_arbitrar_torneio`) de um campeonato SHALL poder RECOLHER rodadas já liberadas, voltando as partidas correspondentes a OCULTAS (`liberada_em = null`) — a operação inversa da liberação. SHALL existir uma Server Action `recolherRodadas(tournamentId, alvo)` com a MESMA autorização da liberação (`pode_arbitrar_torneio` no pré-check + a policy de UPDATE do dono como backstop) e o mesmo gate de torneio não-encerrado, onde `alvo` SHALL cobrir:

- `{ tipo: "tudo" }` — recolhe todas as partidas liberadas do torneio (volta a nenhuma liberada);
- `{ tipo: "rodada", rodada: N }` — recolhe a rodada `N` (base do "recolher última rodada");
- `{ tipo: "faseGrupos" }` — recolhe todas as partidas de fase de grupos (`grupo` não nulo).

O recolhimento SHALL ser idempotente e SHALL atingir só partidas EFETIVAMENTE liberadas (`liberada_em <= now()`), setando `liberada_em = null` — sem cancelar agendamentos futuros (`liberada_em > now()`, estado não exposto hoje) nem tocar o que já está oculto. O recolhimento SHALL valer mesmo para rodadas com partidas JÁ JOGADAS (encerradas): o placar permanece gravado e apenas deixa de ser visível para quem não é dono até a rodada ser religada (o trigger de ciclo de vida não bloqueia, pois placar/status não mudam). A action SHALL revalidar a página e NÃO SHALL disparar notificações. Como divisões de pirâmide são `tournaments`, a action SHALL valer igualmente para ligas.

#### Scenario: Recolher tudo (desfaz "liberar tudo")

- **WHEN** o dono que liberou todas as rodadas escolhe "Recolher tudo"
- **THEN** todas as partidas liberadas voltam a `liberada_em = null` (ocultas) e o console volta a oferecer a liberação uma a uma

#### Scenario: Recolher a última rodada liberada

- **WHEN** o dono escolhe "Recolher última rodada"
- **THEN** a maior rodada atualmente liberada volta a oculta; as anteriores seguem liberadas

#### Scenario: Recolher rodada já jogada mantém o placar

- **WHEN** o dono recolhe uma rodada que tem partida encerrada com placar
- **THEN** a partida volta a oculta (some para o não-dono) mas o placar permanece gravado, reaparecendo intacto ao religar

#### Scenario: Recolhimento é só do dono/organização

- **WHEN** um usuário sem capacidade de arbitrar tenta recolher rodadas
- **THEN** a operação é negada (checagem na action + policy de UPDATE)

#### Scenario: Recolher o que já está oculto não tem efeito

- **WHEN** o dono recolhe uma rodada já oculta
- **THEN** nada muda (o filtro `liberada_em is not null` torna a ação idempotente)
