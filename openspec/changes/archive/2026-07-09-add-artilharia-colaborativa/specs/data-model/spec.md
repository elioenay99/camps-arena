## MODIFIED Requirements

### Requirement: Tabela de autores de gols
A tabela `public.match_goals` SHALL registrar os autores dos gols de uma partida,
com as colunas: `id uuid pk default gen_random_uuid()`, `match_id uuid not null
references matches(id) on delete cascade`, `lado smallint not null check (lado in
(1,2))`, `jogador text` (nome livre, guardado com `btrim`; NULLABLE — só o gol
contra admite nome nulo), `gols int not null default 1 check (gols between 1 and
99)`, `contra boolean not null default false`, `created_at timestamptz not null
default now()`. A coluna `contra` SHALL indicar um GOL CONTRA: quando `true` o gol
conta para o placar do lado mas NÃO entra no ranking, e `jogador` é OPCIONAL
(nome do adversário); quando `false` o gol é NORMAL e `jogador` é obrigatório e
entra no ranking. Uma CHECK `match_goals_jogador_valido` SHALL exigir `(jogador is
not null and char_length(btrim(jogador)) between 1 and 60) or (jogador is null and
contra = true)` — todo nome presente respeita 1..60 (inclusive o do gol contra
nomeado) e o nome nulo só é aceito com `contra = true`.

A unicidade SHALL ser imposta por DOIS índices ÚNICOS PARCIAIS FUNCIONAIS
disjuntos por `contra`: `match_goals_unico` sobre `(match_id, lado,
lower(btrim(jogador)))` `where contra = false` (um autor NORMAL por partida/lado,
case-insensitive) e `match_goals_contra_unico` sobre `(match_id, lado,
lower(btrim(coalesce(jogador, ''))))` `where contra = true` (um gol contra por
partida/lado/nome, com o nome ANÔNIMO — nulo/vazio — colapsando numa ÚNICA linha
de tally por lado). Os predicados disjuntos SHALL permitir que um gol normal e um
gol contra do mesmo nome no mesmo lado coexistam. Um índice em `(match_id)` SHALL
acelerar as leituras por partida. A tabela NÃO SHALL denormalizar `competitor_id`:
o competidor é resolvido por JOIN `match_goals.lado → matches.vaga_{lado} →
tournament_slots.competitor_id` (o lado é imutável).

#### Scenario: Um autor por partida/lado com contagem
- **WHEN** o mesmo autor marca 2 gols para o lado 1 numa partida
- **THEN** há UMA linha em `match_goals` para `(match_id, 1, autor)` com `gols = 2`

#### Scenario: Grafia divergente do mesmo autor colide
- **WHEN** já existe "Endrick" no lado 1 e tenta-se inserir "endrick" no lado 1 da mesma partida (ambos gols normais)
- **THEN** o índice único parcial `match_goals_unico` rejeita a segunda linha

#### Scenario: Gol normal e gol contra do mesmo nome coexistem
- **WHEN** há um gol normal "Endrick" e um gol contra "Endrick" no mesmo lado da mesma partida
- **THEN** ambas as linhas são aceitas (índices parciais disjuntos por `contra`)

#### Scenario: Gol contra anônimo é único por lado
- **WHEN** dois gols contra sem nome (`jogador` nulo) são inseridos no mesmo lado da partida
- **THEN** o índice `match_goals_contra_unico` (com `coalesce(jogador,'')`) rejeita a segunda linha — o anônimo é um único tally por lado

#### Scenario: Nome nulo só é aceito em gol contra
- **WHEN** tenta-se inserir uma linha com `jogador` nulo e `contra = false`
- **THEN** a CHECK `match_goals_jogador_valido` rejeita a operação

#### Scenario: Apagar a partida apaga os gols
- **WHEN** uma partida com autores registrados é apagada
- **THEN** as linhas de `match_goals` daquela partida são removidas (cascade)
