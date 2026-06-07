# knockout-format — Delta Spec

## MODIFIED Requirements

### Requirement: Iniciar torneio mata-mata com modo de chaveamento
O início do mata-mata SHALL operar sobre VAGAS (slot ids no motor; partidas com vaga_1/vaga_2; bye = vaga_2 nula persistida como hoje), mantendo os três modos de chaveamento, byes e validações atuais. NÃO SHALL exigir técnicos presentes; a pré-checagem de semeados em participants morre (vagas pertencem ao torneio por construção, validadas pela policy de INSERT).

#### Scenario: Chave entre vagas com bye
- **WHEN** um mata-mata de 5 clubes inicia
- **THEN** a chave nasce entre vagas com os byes persistidos (vaga_2 nula) como antes

### Requirement: Avanço de fase pelo dono
O avanço SHALL decidir confrontos por vaga vencedora e inserir a fase seguinte entre VAGAS, mantendo todas as regras atuais (fases relativas, 3º lugar, 23505, congelamento de reabertura).

#### Scenario: Vencedores avançam como vagas
- **WHEN** o dono avança a fase
- **THEN** os confrontos seguintes pareiam as vagas vencedoras

### Requirement: Mata-mata não aceita partida manual nem adesão tardia
Partida manual segue bloqueada em formatos gerados. A adesão SHALL ser por convite de VAGA e — diferente do modelo anterior — SHALL valer também com o torneio ATIVO (assumir clube órfão/substituição); o que não existe mais é entrar como pessoa avulsa fora de vaga.

#### Scenario: Assumir clube com a chave em andamento
- **WHEN** alguém aceita o convite de uma vaga órfã com o torneio ativo
- **THEN** assume o clube e herda as partidas da chave
