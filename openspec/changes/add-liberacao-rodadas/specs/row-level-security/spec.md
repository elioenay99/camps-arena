# row-level-security — Delta Spec

## MODIFIED Requirements

### Requirement: Leitura pública de partidas

O sistema SHALL permitir SELECT em uma partida quando o solicitante for o **dono do
torneio** dela (`tournaments.created_by = auth.uid()`, o que inclui divisões de pirâmide,
que são `tournaments`), **sem qualquer restrição de liberação** — o dono vê todas as suas
partidas.

Para qualquer outro solicitante (público/anônimo, participante do torneio via
`eh_participante()`, ou o próprio jogador/técnico da partida), o SELECT SHALL ser permitido
**apenas quando a partida estiver liberada** (`liberada_em is not null and liberada_em <=
now()`) E o torneio for visível a ele (público, ou ele participa) ou ele for jogador/técnico
da partida. Partidas **ocultas** (`liberada_em` nulo ou no futuro) NÃO SHALL ser visíveis a
ninguém além do dono — inclusive o adversário de uma rodada ainda não liberada NÃO SHALL
ver o confronto.

Partidas de torneios privados de terceiros SHALL continuar invisíveis a quem não participa
do torneio nem da partida.

#### Scenario: Visitante só lê rodadas liberadas de torneio público

- **WHEN** um visitante (autenticado ou não) consulta partidas de um torneio público com
  rodadas ocultas
- **THEN** apenas as partidas com `liberada_em <= now()` são retornadas; as ocultas não

#### Scenario: Dono vê todas as rodadas, inclusive ocultas

- **WHEN** o dono do torneio consulta as partidas
- **THEN** todas são retornadas, liberadas ou não

#### Scenario: Jogador não vê a própria partida antes de liberada

- **WHEN** o jogador (participante_1/2 ou técnico de uma vaga) de uma partida ainda oculta
  consulta essa partida
- **THEN** a política RLS não retorna a partida enquanto ela não for liberada

#### Scenario: Jogador vê a própria partida depois de liberada

- **WHEN** a rodada é liberada e o jogador consulta a própria partida
- **THEN** a partida é retornada

#### Scenario: Participante do torneio vê só o liberado em torneio privado

- **WHEN** um participante confirmado consulta as partidas de um torneio privado com
  rodadas ocultas
- **THEN** só as rodadas liberadas são retornadas (as ocultas não, mesmo sendo participante)

### Requirement: Escrita restrita ao dono da partida

Partidas AVULSAS: o participante (participante_1/2 = auth.uid()) ou o dono do torneio SHALL
poder atualizar placar/clube. Partidas COMPETITIVAS: SHALL poder atualizar quem for TÉCNICO
de uma das vagas da partida ou o dono do torneio.

Para o caminho do **participante/técnico** (não-dono), o UPDATE SHALL ser permitido apenas
quando a partida estiver **liberada** (`liberada_em is not null and liberada_em <= now()`),
tanto no `using` quanto no `with check`. Em consequência, o participante NÃO SHALL conseguir
(a) alterar uma partida oculta, nem (b) **ocultar** (`liberada_em = null`) ou **agendar**
(`liberada_em > now()`) uma partida liberada — a guarda no `with check` rejeita ambos. Fica
um resíduo aceito no v1: numa partida já liberada, o participante poderia reescrever
`liberada_em` para OUTRO instante passado (que ainda satisfaz `<= now()`); isso é inócuo
porque `liberada_em` é consumido apenas como booleano (`<= now()`) — a partida segue
liberada. Endurecer essa coluna (defesa de coluna no trigger, "só o dono altera
`liberada_em`") fica como follow-up se a evolução (agendamento/auditoria da change 3) passar
a depender do valor exato.

O caminho do **dono** (`matches_update_tournament_owner`) SHALL permanecer sem restrição de
liberação: o dono altera qualquer partida sua, inclusive `liberada_em` (é por ele que a
liberação acontece). Status segue restrito ao dono (trigger), como hoje.

#### Scenario: Técnico lança placar em partida liberada

- **WHEN** o técnico atual de um dos clubes atualiza o placar de uma partida liberada
- **THEN** a escrita passa (RLS + trigger de lifecycle)

#### Scenario: Técnico não escreve em partida oculta

- **WHEN** o técnico tenta atualizar uma partida com `liberada_em` nulo/futuro
- **THEN** a escrita é negada pela RLS

#### Scenario: Participante não oculta nem agenda a própria partida

- **WHEN** um participante tenta, via POST direto, setar `liberada_em = null` ou um instante
  futuro na própria partida liberada
- **THEN** o `with check` rejeita a escrita (a partida não pode ser ocultada nem agendada
  pelo participante)

#### Scenario: Dono libera a rodada

- **WHEN** o dono atualiza `liberada_em` das partidas de uma rodada
- **THEN** a escrita passa (policy do dono), sem depender da guarda de liberação
