# hall-of-fame Specification

## Purpose
TBD - created by archiving change add-conquistas-hall. Update Purpose after archive.
## Requirements
### Requirement: Premiação persistida ao encerrar uma temporada de liga
Ao ENCERRAR uma temporada de liga, o sistema SHALL PERSISTIR os troféus daquela
temporada na estante (`public.conquistas`) do competidor persistente
(`league_competitors`), como uma FOTO estável do instante do fechamento. Os
troféus NÃO SHALL ser recomputados a cada leitura — uma vez gravados, permanecem
estáveis até um novo encerramento da mesma temporada. O conjunto de troféus SHALL
incluir, quando houver dado: Campeão, Vice, Promovido, Rebaixado, Artilheiro,
Melhor Ataque, Melhor Defesa e Melhor Sequência. Torneio avulso e copa estão FORA
de escopo desta capability (identidade não persistente / chaveamento distinto).

#### Scenario: Encerrar temporada popula a estante
- **WHEN** o dono encerra uma temporada com o competidor "Ataias" em 1º da Série A
- **THEN** a estante do "Ataias" passa a ter um troféu Campeão da Série A daquela temporada, persistido

#### Scenario: Troféu é estável (não recomputado)
- **WHEN** a página do competidor é aberta várias vezes após o encerramento
- **THEN** os mesmos troféus persistidos são exibidos sem recomputar a classificação

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

### Requirement: Estante de troféus na página do competidor
A página do competidor SHALL exibir uma estante (hall da fama) com os troféus
PERSISTIDOS, agrupados por temporada/competição, mostrando escudo/rótulo do
competidor (resolvidos por join, não denormalizados) e o rótulo/valor de cada
troféu. As contagens agregadas atuais (`CompetidorConquistas`) SHALL permanecer.
Quando o competidor não tiver troféus persistidos, a estante SHALL exibir um
estado vazio explícito.

#### Scenario: Estante agrupa por temporada
- **WHEN** o competidor tem troféus de duas temporadas distintas
- **THEN** a estante os agrupa por competição/temporada com seus rótulos estáveis

#### Scenario: Estante vazia
- **WHEN** o competidor ainda não tem nenhum troféu persistido
- **THEN** a estante mostra um estado vazio, sem quebrar a página

