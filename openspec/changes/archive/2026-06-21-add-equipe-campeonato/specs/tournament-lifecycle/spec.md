# tournament-lifecycle — Delta Spec

## ADDED Requirements

### Requirement: Capacidades sobre o ciclo de vida do torneio

As ações de ciclo de vida e estrutura SHALL exigir capacidade **gerir** (dono ou admin):
iniciar liga/mata-mata/grupos, avançar fase, gerar mata-mata dos grupos, **encerrar**
torneio e atualizar cores. Liberar rodadas, encerrar/reabrir **partida**,
marcar W.O. e fechar rodada SHALL exigir capacidade **arbitrar** (dono, admin ou árbitro).
A ação de **reabrir o torneio** (status do torneio `encerrado`→aberto) SHALL permanecer
**dono-only** no app-layer E no banco (trigger), independentemente de papel.

#### Scenario: Admin encerra, só dono reabre

- **WHEN** um admin encerra um torneio
- **THEN** a ação é aceita (capacidade gerir)
- **WHEN** o mesmo admin tenta reabrir o torneio encerrado
- **THEN** a ação é recusada no app-layer e, por POST direto, pelo trigger
  `lock_tournament_reopen` — apenas o dono reabre

#### Scenario: Árbitro lança placar e libera rodada, mas não inicia fase

- **WHEN** um árbitro registra o placar de uma partida liberada e libera as próximas
  rodadas
- **THEN** ambas as ações são aceitas (capacidade arbitrar)
- **AND** tentar iniciar ou avançar uma fase é recusado (exige capacidade gerir)

### Requirement: Operações irreversíveis da liga são dono-only

A virada de temporada da pirâmide SHALL ser **dono-only**, mesmo para admins: confirmar o
fluxo de sobe/cai e montar a próxima temporada são irreversíveis por qualquer papel (nem o
dono desfaz). Demais operações de liga (montar divisões, playoffs, grandes finais, calcular
o fluxo) SHALL exigir capacidade **gerir** (dono ou admin de liga).

#### Scenario: Admin monta a liga mas não vira a temporada

- **WHEN** um admin de liga monta divisões, playoffs e calcula o fluxo de sobe/cai
- **THEN** as ações são aceitas (capacidade gerir)
- **WHEN** o mesmo admin tenta confirmar o fluxo ou montar a próxima temporada
- **THEN** é recusado no app-layer e no banco — só o dono vira a temporada
