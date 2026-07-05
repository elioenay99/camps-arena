# match-mutations Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Server Action de atualização de placar
O sistema SHALL fornecer uma Server Action `updateMatchScore` que recebe o ID da
partida e os placares finais e persiste o UPDATE na tabela `matches`. Partida
`encerrada` NÃO SHALL aceitar alteração de placar — a action rejeita com mensagem
específica antes de tocar o banco.

O schema (`updateMatchScoreSchema`) SHALL aceitar um campo OPCIONAL `autores:
{lado:1|2, jogador, gols}[]` onde `jogador` é `btrim` 1..60 e `gols` é inteiro
1..99; a soma de `gols` por lado SHALL ser ≤ ao placar daquele lado e um autor
NÃO SHALL se repetir no mesmo lado (case-insensitive) — violação retorna erro de
validação sem gravar nada. Quando `autores` é informado, a action SHALL — após o
UPDATE de placar bem-sucedido e a mesma checagem de autorização já aplicada —
SUBSTITUIR os autores daquela partida (delete-then-insert por `match_id`) na
tabela `match_goals` pelo client da SESSÃO. `autores` ausente SHALL preservar os
gols existentes (retrocompat); `autores: []` SHALL limpar os gols da partida. Uma
falha ao gravar os autores SHALL retornar erro.

#### Scenario: Atualização persistida
- **WHEN** o dono da partida envia placares válidos para partida não-encerrada
- **THEN** a partida é atualizada no banco e o cache do dashboard é revalidado

#### Scenario: Partida encerrada rejeita placar
- **WHEN** um participante tenta salvar placar numa partida encerrada
- **THEN** a action retorna erro informando que a partida está encerrada, sem UPDATE

#### Scenario: Placar com autores substitui os gols da partida
- **WHEN** `updateMatchScore` recebe placar 2x1 e `autores` com 3 gols coerentes
- **THEN** o placar é salvo e `match_goals` da partida passa a refletir exatamente esses autores

#### Scenario: Autores excedendo o placar são rejeitados
- **WHEN** `updateMatchScore` recebe placar 1x0 e `autores` somando 2 gols no lado 1
- **THEN** a action retorna erro de validação e nem placar nem gols são alterados

#### Scenario: Placar sem autores não toca os gols
- **WHEN** `updateMatchScore` recebe placar sem o campo `autores`
- **THEN** só o placar é atualizado e os gols existentes permanecem

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

