## ADDED Requirements

### Requirement: Tabela wo_perdoes (baseline de perdão disciplinar)
O modelo de dados SHALL incluir a tabela `public.wo_perdoes` como baseline
persistido e auditável de perdões de W.O.-derrota, sem alterar `matches` nem
standings. Ela SHALL ter `match_id → matches(id) on delete cascade`,
`user_id → users(id) on delete cascade`, `tournament_id → tournaments(id) on delete
cascade`, `perdoado_por → users(id) on delete set null`, `perdoado_em timestamptz
default now()`, UNIQUE `(match_id, user_id)` (idempotência) e índice
`(tournament_id, user_id)`. A escrita SHALL ocorrer exclusivamente via a RPC
`perdoar_wo_tecnico` (`SECURITY DEFINER`).

#### Scenario: Perdão é único por partida e técnico
- **WHEN** o mesmo W.O.-derrota de um técnico é perdoado duas vezes
- **THEN** a constraint UNIQUE `(match_id, user_id)` mantém um único registro (2ª tentativa não cria linha)

### Requirement: Funções de derivação, perdão e expulsão disciplinar
O modelo SHALL incluir quatro funções `SECURITY DEFINER` com `search_path=''`:
`wo_sofridos_do_tecnico(uuid, uuid)` (helper INTERNO que lista os `match_id` de
W.O.-derrota do técnico na janela meio-aberta das tenures dele no torneio),
`sequencia_disciplina_torneio(uuid)` (leitura gated que devolve `user_id, slot_id,
rodada, tipo, perdoado` por técnico de tenure ABERTA, em ORDEM TOTAL — `rodada,
posicao, perna, id` — para o fold posicional do streak ser determinístico),
`perdoar_wo_tecnico(uuid, uuid)` (escrita gated e idempotente que retorna o número de
perdões novos) e `expulsar_tecnico_wo(uuid, uuid)` (escrita gated que esvazia
`tournament_slots.user_id` da vaga amarrada ao torneio, disparando o fecho da tenure,
e retorna as linhas afetadas). Nenhuma dessas funções SHALL alterar `matches`,
`coach_tenures` diretamente ou standings.

#### Scenario: A sequência classifica os eventos em ordem total determinística
- **WHEN** `sequencia_disciplina_torneio` é chamada por um gestor num torneio com confrontos de ida-e-volta
- **THEN** ela devolve, por técnico de tenure aberta, as partidas encerradas da janela classificadas em `wo_loss`/`wo_win`/`jogou` com o flag `perdoado`, ordenadas por ordem total (`rodada, posicao, perna, id`) — sem ambiguidade entre as duas pernas

#### Scenario: O perdão materializa os W.O.-derrota atuais
- **WHEN** `perdoar_wo_tecnico` é chamada para um técnico
- **THEN** todos os W.O.-derrota atuais dele (via `wo_sofridos_do_tecnico`) são inseridos em `wo_perdoes` e a função retorna quantos perdões novos criou

#### Scenario: A expulsão esvazia a vaga e fecha a tenure
- **WHEN** `expulsar_tecnico_wo` é chamada por um gestor para uma vaga com técnico
- **THEN** `tournament_slots.user_id` daquela vaga (amarrada ao `tournament_id`) é esvaziado, o trigger fecha a tenure, e a função retorna 1 (ou 0 se a vaga já estava vazia)
