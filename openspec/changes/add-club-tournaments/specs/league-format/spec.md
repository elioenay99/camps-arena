# league-format — Delta Spec

## MODIFIED Requirements

### Requirement: Iniciar torneio de liga
O início da liga SHALL operar sobre as VAGAS do torneio: o motor recebe os slot ids (ordenados por code-point), as partidas nascem com vaga_1/vaga_2 e a promoção de status segue o padrão atual (INSERT lote + idempotência + barreira por índice de par de vagas). Iniciar SHALL exigir ao menos 2 vagas e NÃO SHALL exigir técnicos presentes.

#### Scenario: Liga inicia sem nenhum técnico
- **WHEN** o dono inicia uma liga com 4 clubes e nenhum técnico
- **THEN** a tabela completa é gerada entre as vagas (técnicos chegam por convite depois)

#### Scenario: Partidas nascem entre vagas
- **WHEN** a tabela é gerada
- **THEN** cada partida referencia vaga_1/vaga_2 (participante_1/2 nulos)
