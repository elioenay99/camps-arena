## MODIFIED Requirements

### Requirement: Server Action de atualização de placar
O sistema SHALL fornecer uma Server Action `updateMatchScore` que recebe o ID da partida e os placares finais e persiste o UPDATE na tabela `matches`. Partida `encerrada` NÃO SHALL aceitar alteração de placar — a action rejeita com mensagem específica antes de tocar o banco.

#### Scenario: Atualização persistida
- **WHEN** o dono da partida envia placares válidos para partida não-encerrada
- **THEN** a partida é atualizada no banco e o cache do dashboard é revalidado

#### Scenario: Partida encerrada rejeita placar
- **WHEN** um participante tenta salvar placar numa partida encerrada
- **THEN** a action retorna erro informando que a partida está encerrada, sem UPDATE
