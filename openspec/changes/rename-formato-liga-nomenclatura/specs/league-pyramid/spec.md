# league-pyramid — Delta Spec

## MODIFIED Requirements

### Requirement: Navegação da divisão para a liga-mãe

A página de um torneio de divisão de pirâmide SHALL oferecer um link para a
página da temporada da liga-mãe (`/dashboard/ligas/[season_id]`), permitindo ao
jogador da divisão alcançar a pirâmide (o torneio é divisão quando
`liga_do_torneio` resolve a competição-mãe). O texto do link SHALL ser
**"Ver pirâmide"**. O `season_id` SHALL ser resolvido a partir do torneio da
divisão (`league_division_seasons` por `tournament_id`/`tournament_id_clausura`);
quando não resolver, o link SHALL ser omitido.

#### Scenario: Link da divisão abre a pirâmide

- **WHEN** um usuário autenticado abre um torneio que é divisão de uma pirâmide
  visível
- **THEN** a página exibe um link "Ver pirâmide" que navega para a página da
  temporada da liga-mãe
