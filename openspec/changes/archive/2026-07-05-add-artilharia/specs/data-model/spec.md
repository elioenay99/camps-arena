## ADDED Requirements

### Requirement: Tabela de autores de gols
A tabela `public.match_goals` SHALL registrar os autores dos gols de uma
partida, com as colunas: `id uuid pk default gen_random_uuid()`, `match_id uuid
not null references matches(id) on delete cascade`, `lado smallint not null
check (lado in (1,2))`, `jogador text not null` (nome livre, guardado com
`btrim`), `gols int not null default 1 check (gols between 1 and 99)`,
`created_at timestamptz not null default now()`. Uma CHECK
`match_goals_jogador_tam` SHALL exigir `char_length(btrim(jogador)) between 1 and
60`. Um índice ÚNICO FUNCIONAL SHALL impor uma linha por `(match_id, lado,
lower(btrim(jogador)))` — um autor por partida/lado (case-insensitive), com a
contagem em `gols`. Um índice em `(match_id)` SHALL acelerar as leituras por
partida. A tabela NÃO SHALL denormalizar `competitor_id`: o competidor é
resolvido por JOIN `match_goals.lado → matches.vaga_{lado} →
tournament_slots.competitor_id` (o lado é imutável).

#### Scenario: Um autor por partida/lado com contagem
- **WHEN** o mesmo autor marca 2 gols para o lado 1 numa partida
- **THEN** há UMA linha em `match_goals` para `(match_id, 1, autor)` com `gols = 2`

#### Scenario: Grafia divergente do mesmo autor colide
- **WHEN** já existe "Endrick" no lado 1 e tenta-se inserir "endrick" no lado 1 da mesma partida
- **THEN** o índice único funcional rejeita a segunda linha

#### Scenario: Apagar a partida apaga os gols
- **WHEN** uma partida com autores registrados é apagada
- **THEN** as linhas de `match_goals` daquela partida são removidas (cascade)

### Requirement: Autores propostos na proposta de placar
A tabela `public.match_score_proposals` SHALL ganhar a coluna `autores jsonb
null`, guardando a lista `[{lado, jogador, gols}]` proposta pelo técnico até a
resolução. Na APROVAÇÃO os autores SHALL ser materializados em `match_goals`
atomicamente pela RPC; na REJEIÇÃO SHALL ser descartados junto com a proposta
(cascade/atualização de status). A coluna SHALL ser nullable e retrocompatível
(propostas sem autores nascem `null`).

#### Scenario: Proposta guarda os autores
- **WHEN** o técnico propõe 2x0 com `autores = [{lado:1,jogador:"Vini",gols:2}]`
- **THEN** a linha em `match_score_proposals` tem `autores` com esse jsonb

#### Scenario: Proposta sem autores é válida
- **WHEN** o técnico propõe um placar sem informar autores
- **THEN** `autores` fica `null` e a proposta é aceita normalmente
