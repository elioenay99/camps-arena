# match-mutations Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Server Action de atualização de placar
O sistema SHALL fornecer uma Server Action `updateMatchScore` que recebe o ID da partida e os placares finais e persiste o UPDATE na tabela `matches`.

#### Scenario: Atualização persistida
- **WHEN** o dono da partida envia placares válidos
- **THEN** a partida é atualizada no banco e o cache do dashboard é revalidado

### Requirement: Autorização por propriedade na action
A `updateMatchScore` SHALL verificar a identidade do usuário autenticado e SHALL rejeitar a transação com erro quando ele não for participante da partida.

#### Scenario: Não dono rejeitado
- **WHEN** um usuário que não participa da partida invoca a action
- **THEN** a transação é rejeitada com erro e nenhum dado é alterado

### Requirement: Feedback de carregamento e sucesso
A UI SHALL refletir o estado de carregamento durante a action e SHALL emitir uma notificação de sucesso ao concluir.

#### Scenario: Estado de carregamento
- **WHEN** a action está em execução
- **THEN** o botão de salvar exibe estado de carregamento

#### Scenario: Notificação de sucesso
- **WHEN** a atualização conclui com sucesso
- **THEN** um toast de sucesso é exibido

