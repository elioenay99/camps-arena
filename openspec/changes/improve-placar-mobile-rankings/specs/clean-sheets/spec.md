## ADDED Requirements

### Requirement: Ranking de defesas (Muralha) limitado a top 10 com expansão

O ranking de defesas (Muralha) SHALL exibir por padrão apenas os 10 primeiros, com um
controle "Ver mais" que revela a lista completa e alterna para "Ver menos", com alvo de
toque ≥44px e estado acessível (`aria-expanded`/`aria-controls`), espelhando a artilharia.
Com 10 ou menos, o controle NÃO SHALL aparecer.

#### Scenario: Muralha longa mostra top 10 + ver mais
- **WHEN** a Muralha tem mais de 10 competidores
- **THEN** só os 10 primeiros aparecem, com um botão "Ver mais (N)" que expande o restante
