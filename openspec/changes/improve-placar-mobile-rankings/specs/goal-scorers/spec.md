## ADDED Requirements

### Requirement: Ranking de artilharia limitado a top 10 com expansão

O ranking de artilharia (Artilheiros) SHALL exibir por padrão apenas os 10 primeiros
colocados, com um controle "Ver mais" (mostrando quantos restam) que revela a lista
completa e alterna para "Ver menos". O controle SHALL ter alvo de toque ≥44px e estado
acessível (`aria-expanded`/`aria-controls`). Quando o ranking tiver 10 ou menos
colocados, o controle NÃO SHALL aparecer.

#### Scenario: Lista longa mostra top 10 + ver mais
- **WHEN** a artilharia tem mais de 10 artilheiros
- **THEN** só os 10 primeiros aparecem, com um botão "Ver mais (N)" que expande o restante

#### Scenario: Lista curta não mostra o controle
- **WHEN** a artilharia tem 10 ou menos artilheiros
- **THEN** todos aparecem e não há botão "Ver mais"
