# tournament-lifecycle Specification

## Purpose
TBD - created by archiving change add-tournament-closing. Update Purpose after archive.
## Requirements
### Requirement: Encerramento de torneio pelo dono
O sistema SHALL permitir que SOMENTE o dono encerre um torneio (status →
`encerrado`) via Server Action, com sessão válida e propriedade conferida por
FILTRO no servidor (torneio inexistente, alheio ou já encerrado recebem a
MESMA resposta — sem oráculo). Qualquer status diferente de `encerrado` SHALL
ser encerrável — encerrar um rascunho é o cancelamento de um torneio que não
começou. O encerramento SHALL ser permitido mesmo com partidas em aberto
(decisão de produto): elas ficam congeladas pelo lifecycle existente e fora da
classificação. A escrita SHALL ser confirmada (`select()` — corrida/RLS → 0
linhas → orientação de recarregar).

#### Scenario: Dono encerra torneio ativo
- **WHEN** o dono aciona Encerrar torneio e confirma
- **THEN** o status vira `encerrado`, as partidas dele somem do dashboard de ativas e convites/partidas novas passam a ser rejeitados pelos gates existentes

#### Scenario: Rascunho é cancelável
- **WHEN** o dono encerra um torneio em rascunho (liga/mata-mata que nunca iniciou)
- **THEN** o torneio vira `encerrado` normalmente

#### Scenario: Não-dono ou torneio já encerrado recebem resposta única
- **WHEN** a action é invocada por quem não é dono, em torneio inexistente ou já encerrado
- **THEN** retorna erro único sem revelar qual condição falhou, e nada é escrito

#### Scenario: Sem sessão é rejeitado
- **WHEN** a action é invocada sem usuário autenticado
- **THEN** retorna erro e nada muda no banco

### Requirement: Reabertura de torneio pelo dono
O sistema SHALL permitir que o dono reabra um torneio `encerrado` via Server
Action (mesmas garantias de sessão/propriedade/confirmação). O status de
retorno SHALL ser DERIVADO do estado: torneio de formato gerado
(`liga`/`mata_mata`) sem NENHUMA partida gerada (nenhuma com `rodada`) volta a
`rascunho` (a tabela/chave nunca foi gerada — reabrir como ativo criaria um
torneio ativo sem partidas e sem painel de Iniciar); nos demais casos volta a
`ativo`.

#### Scenario: Reabrir torneio com partidas geradas volta a ativo
- **WHEN** o dono reabre uma liga ou mata-mata cuja tabela/chave já foi gerada
- **THEN** o status volta a `ativo` e os consoles do dono (encerrar/reabrir partida, avançar fase) voltam a funcionar

#### Scenario: Reabrir formato gerado cancelado no rascunho volta a rascunho
- **WHEN** o dono reabre uma liga ou mata-mata encerrada SEM partidas geradas
- **THEN** o status volta a `rascunho` (painel de Iniciar e convites voltam a valer)

#### Scenario: Reabrir avulso volta a ativo
- **WHEN** o dono reabre um torneio avulso encerrado
- **THEN** o status volta a `ativo`

#### Scenario: Só torneio encerrado é reabrível
- **WHEN** a reabertura é tentada num torneio que não está encerrado
- **THEN** a action retorna a resposta única de propriedade e nada é escrito

### Requirement: Console de lifecycle na página do torneio
A página do torneio SHALL exibir, SOMENTE para o dono: "Encerrar torneio"
quando o status não é `encerrado`, com confirmação em DOIS cliques que avisa
quantas partidas em aberto serão congeladas (contagem derivada dos dados que a
página já tem — sem query extra); e "Reabrir torneio" quando o status é
`encerrado`. Para quem não é o dono, os controles NÃO SHALL aparecer (a
autorização real permanece na action + RLS).

#### Scenario: Encerrar exige confirmação com aviso
- **WHEN** o dono clica Encerrar torneio com 3 partidas em aberto
- **THEN** o botão pede confirmação explícita citando as 3 partidas que serão congeladas, e só o segundo clique executa

#### Scenario: Reabrir visível em torneio encerrado
- **WHEN** o dono abre a página de um torneio encerrado
- **THEN** vê o botão Reabrir torneio (único controle de ADMINISTRAÇÃO do torneio nesse estado — a gestão de participantes permanece liberada em encerrado, exceto mata-mata com chave gerada)

#### Scenario: Visitante e participante não veem o console
- **WHEN** quem não é dono abre a página em qualquer status
- **THEN** os botões de encerrar/reabrir torneio não são renderizados

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

