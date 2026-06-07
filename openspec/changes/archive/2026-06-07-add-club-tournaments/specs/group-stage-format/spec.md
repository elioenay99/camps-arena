# group-stage-format — Delta Spec

## MODIFIED Requirements

### Requirement: Iniciar torneio de grupos com configuração no painel
O início dos formatos de grupos SHALL operar sobre VAGAS (slot ids nos motores de montagem/sorteio; partidas de grupo e chave com vaga_1/vaga_2), mantendo G/K, modos de distribuição, promote-first e recuperação como especificado. Potes/manual referenciam vagas (clubes) — cabeças de chave são CLUBES. NÃO SHALL exigir técnicos presentes.

#### Scenario: Grupos sorteados entre clubes
- **WHEN** o dono inicia grupos com sorteio
- **THEN** os grupos particionam as VAGAS e o round-robin nasce entre vagas

### Requirement: Geração do mata-mata a partir dos grupos
A classificação por grupo e o cruzamento SHALL operar sobre vagas (computeStandings por slot id); a chave nasce entre vagas. Pré-checagem de semeados em participants morre.

#### Scenario: Classificados são clubes
- **WHEN** o mata-mata dos grupos é gerado
- **THEN** os K melhores CLUBES de cada grupo entram na chave
