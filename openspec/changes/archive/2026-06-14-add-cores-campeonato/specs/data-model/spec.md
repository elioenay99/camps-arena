# data-model — Delta Spec

## ADDED Requirements

### Requirement: Identidade de cor por campeonato e por divisão

O modelo de dados SHALL permitir que cada campeonato (torneio e pirâmide) e cada
divisão de uma pirâmide carregue uma identidade de **duas cores** — `cor_primaria` e
`cor_secundaria` — armazenadas como hexadecimal `#rrggbb` minúsculo, ou ausentes.

As colunas `cor_primaria` e `cor_secundaria` SHALL existir em `tournaments`,
`league_competitions` e `league_division_seasons`, SHALL ser *nullable*, e SHALL ser
restringidas por CHECK ao padrão `^#[0-9a-f]{6}$` quando não nulas.

A resolução da cor efetiva SHALL seguir herança, sem exigir gravação redundante: uma
divisão usa a sua cor, senão a da competição; um torneio usa a sua cor. Ausência total
de cor SHALL resultar no tema padrão do app (sem tematização), preservando o visual de
todo campeonato já existente.

As cores de uma divisão SHALL persistir entre temporadas: ao montar a próxima temporada,
`cor_primaria`/`cor_secundaria` de cada divisão SHALL ser copiada para a temporada N+1,
junto com a demais configuração da divisão.

#### Scenario: Hex inválido é rejeitado pelo banco

- **WHEN** se tenta gravar `cor_primaria = 'red'` ou `'#ABC'` ou `'#xyz123'` em qualquer
  das três tabelas
- **THEN** o CHECK rejeita a escrita; somente `NULL` ou `#rrggbb` minúsculo é aceito

#### Scenario: Campeonato sem cor mantém o tema do app

- **WHEN** um torneio ou divisão tem ambas as cores `NULL`
- **THEN** a página renderiza no tema base do app (Dracula/Canarinho), sem wrapper de cor

#### Scenario: Cor da divisão sobrevive à virada de temporada

- **WHEN** uma pirâmide com cores por divisão monta a temporada N+1
- **THEN** cada divisão da nova temporada nasce com as mesmas `cor_primaria`/`cor_secundaria`
  da divisão correspondente na temporada anterior

#### Scenario: Só o dono altera as cores

- **WHEN** um usuário que não é dono do campeonato tenta atualizar as cores
- **THEN** a operação é negada (checagem de posse na action + policy de UPDATE por-linha),
  enquanto o dono consegue atualizar a qualquer momento
