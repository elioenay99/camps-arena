# Proposal — add-liberacao-rodadas

## Why

Hoje, assim que o dono gera a tabela de um campeonato (torneio ou divisão de liga),
**todas as rodadas ficam visíveis de uma vez** para quem enxerga o torneio (público,
participante, jogador). O dono quer poder **liberar as rodadas com cadência** — estilo
Brasileirão: revela a próxima rodada quando quiser, mantendo as futuras ocultas até lá.

Esta é a **change 2** de um conjunto maior já desenhado com o dono (cores → liberação de
rodadas → payload de WhatsApp). A change 1 (cores do campeonato/divisão) já está em
produção. A liberação é a base da change 3: quando o dono libera uma rodada, o app vai
preparar a **lista de participantes + a imagem da rodada** para o WhatsApp (consome as
cores). Aqui construímos só o **gating de visibilidade/jogabilidade por rodada** e os
controles de liberação.

Decisões de produto já tomadas com o dono (não reverter sem perguntar):
- **Cadência v1 = MANUAL**: o dono libera *uma rodada*, *até a rodada N* (próximas N),
  *a fase de grupos inteira* ou *tudo*. Agendamento automático (1/dia via cron) é a fase 2.
- O gating **vale para torneio E liga** (cada divisão de pirâmide já É um `tournaments`).
- A liberação usa `timestamptz` — a fase 2 (agendar no futuro) já fica suportada pelo tipo.

Decisões de produto novas tomadas nesta change (default sensato, autônomo — documentadas
para o dono revisar):
- **Oculta = oculta para todos menos o dono.** Antes de liberada, a partida não aparece
  nem para o público, nem para o participante do torneio, **nem para o próprio jogador da
  partida** — senão o adversário da rodada futura veria o confronto antes da revelação.
- **Liberar = visível E jogável.** Enquanto oculta, a partida não é jogável (o jogador não
  lança placar nem pede W.O.); ao liberar, fica visível e jogável. O dono age sempre.
- **Classificação do não-dono é PARCIAL** — reflete só as rodadas já liberadas. É o efeito
  desejado (não vaza resultado de rodada ainda não anunciada); a tabela "completa" pertence
  ao dono. Para o dono, nada muda: ele vê tudo.
- **Escolha de cadência na largada do torneio standalone**: ao iniciar, o dono escolhe
  *"Liberar todas as rodadas agora"* (padrão, = comportamento atual) ou *"Vou liberar
  manualmente"* (nasce tudo oculto; o dono revela com os controles). Divisões de pirâmide e
  fases de mata-mata/chave **nascem liberadas** (a chave já serializa via "Avançar fase").

## What Changes

Introduz **liberação de rodadas por cadência manual**, com gating de visibilidade e
jogabilidade na própria partida, sempre preservando o acesso total do dono.

- **Dados (DDL aditiva)**: coluna `matches.liberada_em timestamptz` (*nullable*,
  `default now()`). `NULL` = oculta; `<= now()` = liberada; `> now()` = agendada (fase 2,
  sem UI no v1). Backfill `now()` em todas as partidas existentes (nada some). Índice
  `(tournament_id, liberada_em)` para o filtro da RLS/listas.

- **RLS (segurança em profundidade)**:
  - `matches_select_visivel` reescrita: o **dono** (`tournaments.created_by`) vê tudo; os
    demais ramos (público, participante, jogador/técnico) só veem a partida quando
    `liberada_em is not null and liberada_em <= now()`.
  - `matches_update_participant` ganha a mesma guarda (`liberada_em <= now()` no `using` e
    no `with check`): o jogador só mexe em partida liberada e NÃO consegue ocultá-la
    (`null`) nem agendá-la (futuro). O `matches_update_tournament_owner` segue intocado (o
    dono faz tudo). Não é preciso trigger novo (resíduo inócuo no v1: o participante poderia
    reescrever `liberada_em` para outro instante passado — sem efeito, pois é lido como
    booleano; endurecimento por trigger fica como follow-up).

- **Geração das partidas**: `iniciarTorneio` (liga) e `iniciarTorneioGrupos` (fase de
  grupos) ganham um parâmetro `liberarTudo` (default `true`). `true` ⇒ rodadas nascem
  liberadas; `false` ⇒ nascem **ocultas** (o dono revela). Os demais caminhos de inserção
  (mata-mata, avanço de fase, chave de grupos, chave da pirâmide, fase de grupos da
  pirâmide, partida avulsa) **nascem liberados** (default `now()`).

- **Server Action de liberação** `liberarRodadas(tournamentId, alvo)` (só dono):
  `alvo ∈ { tipo:"rodada", rodada } | { tipo:"ate", rodada } | { tipo:"faseGrupos" } |
  { tipo:"tudo" }`. Faz `update matches set liberada_em = now()` filtrando por
  `tournament_id` + alvo + `liberada_em is null` (idempotente), com `.select("id")` para
  confirmar efeito. Checagem de posse via `tournaments.created_by` (molde de `fecharRodada`).
  Jogabilidade do não-dono é barrada **automaticamente pela RLS**: a partida oculta nem é
  retornada ao jogador, então `updateMatchScore`/`solicitarWO` caem no "Partida não
  encontrada" existente — não é preciso gate extra na action (distinguir "existe mas oculta"
  exporia a existência, o que contraria o objetivo).

- **UI (mobile-first, 390px)**:
  - Seção "Liberação de rodadas" só-do-dono na página do torneio (`torneios/[id]`),
    listando cada rodada com estado (liberada/oculta) e botões *Liberar próxima rodada*,
    *Liberar próximas 3*, *Liberar fase de grupos* (só formatos com grupos) e *Liberar
    tudo* (este com confirmação em dois cliques). Vale para liga porque a divisão linka
    para a página do torneio.
  - Toggle de cadência no painel de início do torneio standalone.
  - **Aviso para o não-dono** quando o torneio está ativo mas nada foi liberado: em vez dos
    empty-states de "torneio não iniciado" (que mentiriam), a página mostra "As próximas
    rodadas ainda não foram liberadas pelo organizador" — condição derivada do
    `status='ativo'` do torneio (o não-dono não distingue "não iniciado" de "oculto").
  - Comentários enganosos sobre "a RLS devolve todas as partidas" corrigidos em
    `getTournamentClassificacao`, `getActiveMatches` e `getDivisionClassificacaoCombinada`.

## Impact

- **Specs**: `data-model` (coluna nova), `row-level-security` (SELECT e UPDATE de
  partida), `round-management` (liberação + cadência na geração + nascem-liberadas),
  `standings-page` (lista de partidas mostra estado/controle; classificação parcial do
  não-dono).
- **Banco**: DDL aditiva e idempotente. Aplicada primeiro no **Supabase local** (psql),
  espelhada em `supabase/schema.sql`, promovida a prod via **MCP mostrando o SQL**.
  `database.types.ts` regenerado/atualizado.
- **Código**: `src/actions/{match,wo,tournaments}.ts`, `src/features/standings/data/getTournamentClassificacao.ts`,
  geradores que inserem partidas, `schema/`, e componentes em `src/features/match` /
  `src/features/tournament` / página `torneios/[id]`.
- **Compatibilidade**: comportamento atual preservado por default (`liberarTudo=true` +
  backfill). Quem não usar a cadência não percebe diferença.
- **Fora de escopo**: agendamento automático (cron), liberação por grupo individual
  (apenas a fase de grupos inteira no v1), payload de WhatsApp e imagem da rodada (change 3).
