## ADDED Requirements

### Requirement: Compartilhar a classificação

A superfície de classificação SHALL oferecer um botão "Compartilhar classificação"
(client) junto ao `StandingsTable`, no torneio de formato **liga** (pontos corridos) e
em cada divisão da pirâmide. O botão SHALL baixar o PNG da rota de imagem de
classificação correspondente (torneio: `.../classificacao/imagem`; divisão:
`.../temporada/[seasonId]/divisao/[divisionSeasonId]/imagem`) e entregá-lo via
`compartilharWhatsApp`, com texto montado no servidor (`mensagemClassificacao`). SHALL
estar disponível a qualquer usuário logado que enxerga a tabela (a leitura da
classificação já é livre a logados), sem gating por papel. Torneios de formato de
grupos NÃO SHALL exibir o botão nesta change (frente futura).

#### Scenario: Compartilhar a tabela de um torneio
- **WHEN** um usuário logado toca "Compartilhar classificação" na página do torneio
- **THEN** o card PNG da tabela é gerado e entregue ao seletor de compartilhamento

#### Scenario: Compartilhar a tabela de uma divisão de liga
- **WHEN** um usuário logado toca "Compartilhar classificação" numa divisão da pirâmide
- **THEN** o card PNG daquela divisão (com zonas de sobe/cai) é gerado e compartilhado
