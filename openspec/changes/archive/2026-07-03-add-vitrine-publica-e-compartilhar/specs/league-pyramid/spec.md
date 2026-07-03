## ADDED Requirements

### Requirement: Listar a liga na vitrine pública (opt-in)

A página da temporada SHALL oferecer, na área de gestão, um toggle "Listar na
vitrine pública" que alterna a coluna `league_competitions.listada` da
COMPETIÇÃO-mãe (`temporada.competicao.id`, não a season). O toggle SHALL ser
renderizado SOMENTE quando o usuário tem capacidade GERIR (`podeGerir`) sobre a
liga. A persistência SHALL ocorrer via Server Action que valida a entrada, checa
`podeGerir` pela `competitionId`, e atualiza a própria linha (`update
league_competitions set listada = ... where id = competitionId`), confiando na
RLS de update do dono existente (sem policy nova). A coluna SHALL ter default
`false` (opt-in real). Listar a liga publica a pirâmide inteira; a vitrine linka a
temporada CORRENTE.

#### Scenario: Gestor publica a liga na vitrine

- **WHEN** o dono (ou admin) de uma liga ativa aciona o toggle "Listar na vitrine
  pública"
- **THEN** `league_competitions.listada` passa a `true` e a liga passa a aparecer
  na vitrine (enquanto `status = 'ativa'`), com o card linkando a temporada
  corrente

#### Scenario: Toggle ausente para não-gestor

- **WHEN** um usuário sem capacidade GERIR abre a página da temporada
- **THEN** o toggle "Listar na vitrine pública" NÃO é renderizado e a Server
  Action rejeita a alteração de `listada`

### Requirement: Compartilhar a liga

A página da temporada SHALL oferecer um botão "Compartilhar" visível SOMENTE ao
gestor (`podeGerir`), que compartilha o link canônico da página da temporada
(`/dashboard/ligas/[season_id]`) pelo padrão existente (Web Share API no celular,
copiar para a área de transferência no desktop). O botão SHALL reutilizar a
orquestração de compartilhamento já usada por `CompartilharRodadaButton` (sem
imagem — apenas o link).

#### Scenario: Gestor compartilha o link da liga

- **WHEN** o gestor aciona "Compartilhar" na página da temporada
- **THEN** o app dispara o Web Share (celular) ou copia o link canônico da
  temporada (desktop)

#### Scenario: Botão ausente para não-gestor

- **WHEN** um leitor sem capacidade GERIR abre a página da temporada
- **THEN** o botão "Compartilhar" não é renderizado
