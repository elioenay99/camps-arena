# tournament-management — Delta Spec

## MODIFIED Requirements

### Requirement: Criação de torneio com dono
A criação SHALL registrar created_by e visibilidade como hoje. Para formatos COMPETITIVOS, o formulário SHALL incluir a montagem dos CLUBES (mínimo 2; máximo do formato): busca de clube (API-Football/cache teams) e lista das vagas; a action SHALL criar torneio + vagas + convites por vaga (códigos únicos com retry de colisão), SEM entrada automática do dono e SEM convite genérico. Para o formato AVULSO, o fluxo atual permanece (participants + convite genérico + entrada do dono).

#### Scenario: Competitivo nasce com vagas e convites
- **WHEN** o dono cria uma liga com 4 clubes
- **THEN** nascem 4 vagas (sem técnicos) cada uma com seu link de convite

#### Scenario: Avulso preserva o fluxo antigo
- **WHEN** o dono cria um torneio avulso
- **THEN** ele entra como participante e o convite genérico é gerado como hoje
