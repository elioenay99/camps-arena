## MODIFIED Requirements

### Requirement: Troféus estruturais da liga derivados de dados congelados
Os troféus estruturais de uma temporada de liga SHALL ser derivados do resultado
JÁ CONGELADO por competidor (`league_division_entries.posicao_final` e
`destino`), NÃO de entrada do cliente: em divisão `liga` de ciclo ANUAL (sem
Clausura — `tournament_id_clausura is null`), Campeão = posição final 1 e Vice =
posição 2; Promovido = destino `sobe` e Rebaixado = destino `cai` (todo formato);
Artilheiro derivado de `match_goals` considerando APENAS gols NORMAIS (`contra =
false`) — gols contra NÃO SHALL contar para o Artilheiro (o join a `match_goals`
na RPC de premiação SHALL filtrar `and g.contra = false`, de modo que nenhum gol
contra, nem o anônimo `jogador` nulo, materialize um artilheiro fictício na FOTO
durável do hall da fama). Nas divisões coroadas por CHAVE — divisão `liga` SPLIT
(`apertura_clausura`, campeão = vencedor da grande final) e `grupos_mata_mata`
(campeão = vencedor do mata-mata) — onde a posição final diverge do coroado, o
Campeão/Vice NÃO SHALL sair da posição final: SHALL vir do resultado da chave
computado autoritativamente pelo servidor, sem gerar linha `campeao` duplicada.

#### Scenario: Campeão de divisão liga anual é o 1º colocado congelado
- **WHEN** a temporada é encerrada e uma divisão `liga` de ciclo anual tem o competidor X em `posicao_final = 1`
- **THEN** X recebe o troféu Campeão daquela divisão

#### Scenario: Campeão de temporada split é o vencedor da grande final
- **WHEN** numa divisão `liga` de temporada `apertura_clausura` o líder da tabela combinada é X mas o competidor W vence a grande final
- **THEN** o troféu Campeão vai para W (vencedor da final), não para X, e há uma única linha `campeao` na divisão

#### Scenario: Campeão de divisão grupos_mata_mata vem da chave
- **WHEN** numa divisão `grupos_mata_mata` o competidor Z vence o mata-mata mas não tem `posicao_final = 1`
- **THEN** o troféu Campeão vai para Z (coroado pela chave), não para o 1º do rank de corte de grupos

#### Scenario: Promovido segue o destino congelado
- **WHEN** o competidor Y tem `destino = 'sobe'` na divisão
- **THEN** Y recebe o troféu Promovido

#### Scenario: Cliente não decide os troféus estruturais
- **WHEN** o encerramento é acionado
- **THEN** promovido/rebaixado/artilheiro e o campeão de divisão liga vêm de dados congelados/persistidos, não de valores enviados pelo cliente

#### Scenario: Gol contra não materializa artilheiro no hall da fama
- **WHEN** uma temporada é encerrada e o maior somatório de gols de uma divisão inclui um gol contra (ou um gol contra anônimo, `jogador` nulo)
- **THEN** o troféu Artilheiro é derivado só dos gols normais (`contra = false`), e nenhum artilheiro fictício/nulo é gravado na estante
