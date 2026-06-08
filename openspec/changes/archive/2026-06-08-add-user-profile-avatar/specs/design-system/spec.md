# design-system — Delta Spec

## ADDED Requirements

### Requirement: Componente UserAvatar

O design system SHALL ter um `UserAvatar` reutilizável para a identidade visual
de PESSOAS (distinto do `TeamCrest`, que é de clubes). Com URL de foto, SHALL
renderizar a imagem via `next/image` (recortada em círculo); sem URL ou em erro
de carregamento, SHALL cair para um placeholder com as iniciais do nome e uma
cor estável derivada do nome. É decorativo (`aria-hidden`): o nome acompanha em
texto onde for usado.

#### Scenario: Com foto

- **WHEN** o usuário tem `avatar` definido
- **THEN** o `UserAvatar` mostra a foto recortada em círculo

#### Scenario: Sem foto

- **WHEN** o usuário não tem `avatar` (ou a imagem falha)
- **THEN** o `UserAvatar` mostra as iniciais sobre a cor estável do nome
