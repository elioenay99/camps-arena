## ADDED Requirements

### Requirement: Acesso à equipe da liga pela página da temporada

A página de equipe de uma pirâmide de ligas SHALL ser acessível pela rota
`/dashboard/ligas/[id]/equipe`, onde `[id]` é o **id da temporada** (`league_seasons.id`) — o
mesmo `[id]` da página da temporada e da Identidade. A página SHALL resolver a temporada para a
**competição** (`league_competitions`), gateando por capacidade GERIR (dono/admin) — sem acesso
ou inexistente → 404 sem oráculo —, e SHALL usar o id da **competição** (não o da temporada) para
listar e gerir membros e convites. Tratar o `[id]` da rota como se fosse o id da competição SHALL
ser considerado defeito (causava 404 inclusive para o dono).

#### Scenario: Dono abre a equipe da liga pela temporada

- **WHEN** o dono ou um admin clica em "Equipe" na página da temporada de uma pirâmide
- **THEN** a página de equipe carrega (membros, convites, adicionar membro), resolvendo a temporada para a competição

#### Scenario: Sem capacidade gerir, 404 sem oráculo

- **WHEN** alguém sem capacidade GERIR acessa a rota de equipe da liga
- **THEN** recebe 404, sem revelar a existência do recurso (igual à página de Identidade)
