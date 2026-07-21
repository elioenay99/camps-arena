## MODIFIED Requirements

### Requirement: Identidade local do competidor da pirâmide

`public.league_competitors` SHALL representar a identidade do competidor DENTRO de uma
pirâmide, e SHALL incluir uma coluna `escudo_url` nullable que sobrepõe, apenas naquela
liga, o escudo do clube no catálogo global `public.teams`.

`public.teams.escudo_url` SHALL permanecer a fonte do catálogo compartilhado e NÃO SHALL
ser alterado por esta funcionalidade.

A coluna `escudo_url` de `league_competitors` SHALL ser protegida por uma CHECK que
restringe a URL ao Storage do próprio projeto, com o **host ancorado** — `%` permitido
apenas na sub-referência do projeto e no restante do path, nunca à frente do host. A CHECK
é a única defesa no banco contra gravação direta via anon key (que ignora o Zod da
aplicação) e existe porque a URL é consumida por um fetch server-side nos cards OG.

A coluna SHALL ser independente de `team_id`: nenhuma restrição SHALL exigir clube do
catálogo para haver escudo próprio, de modo que competidor por `rotulo` também possa ter
escudo.

#### Scenario: Override não vaza para o catálogo

- **WHEN** um competidor recebe escudo personalizado
- **THEN** `public.teams` permanece inalterado e o mesmo clube em outra pirâmide segue com
  o escudo do catálogo

#### Scenario: URL fora do Storage do projeto é rejeitada pelo banco

- **WHEN** uma gravação direta tenta pôr em `league_competitors.escudo_url` uma URL cujo
  host não é o Storage do projeto
- **THEN** a CHECK rejeita a gravação

### Requirement: Proveniência do competidor nas vagas e nas entradas de copa

`tournament_slots.competitor_id` e `cup_entries.competitor_id` SHALL continuar apontando
para `league_competitors`, e SHALL ser o caminho canônico — de um único hop — para
resolver atributos de identidade local do competidor a partir de uma vaga ou de uma
entrada de copa.

Ambos SHALL permanecer nullable: `null` significa torneio avulso/legado ou entrada de copa
manual/por-nome, e SHALL degradar para o catálogo global.

#### Scenario: Vaga de liga alcança a identidade local em um hop

- **WHEN** uma consulta parte de `tournament_slots`
- **THEN** `competitor_id` permite ler a identidade local sem percorrer
  `league_division_seasons → league_seasons → league_competitions`
