## ADDED Requirements

### Requirement: Competidor único por temporada entre divisões

O sistema SHALL impedir, na validação da pirâmide, que um mesmo competidor (clube ou nome
livre normalizado) ocupe duas divisões diferentes da mesma temporada, alinhando a validação de
borda ao índice único por competição do banco. A repetição entre divisões SHALL produzir um
erro de campo preciso, não um erro genérico de falha na criação.

#### Scenario: Mesmo clube em duas divisões é barrado na validação

- **WHEN** o organizador monta uma pirâmide com o mesmo clube (ou o mesmo nome livre) em duas divisões da temporada
- **THEN** a validação aponta a repetição com mensagem de campo antes de tentar gravar

### Requirement: Integridade do promédio plurianual

O sistema SHALL ler o histórico completo de pontos e jogos ao calcular o promédio plurianual
que define o corte de subida/descida, de forma determinística e independente de qualquer limite
de linhas do servidor de dados, preservando a soma integral de toda a vida do competidor.

#### Scenario: Histórico extenso não trunca a soma

- **WHEN** o cálculo do corte lê um histórico de promédio que excede o limite de linhas por resposta do servidor
- **THEN** a leitura percorre todas as páginas e a soma reflete o histórico completo
