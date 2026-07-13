## ADDED Requirements

### Requirement: Compartilhar o pôster do técnico

O perfil global do técnico SHALL oferecer, no cabeçalho, um botão "Compartilhar
pôster" (client) que baixa o PNG da rota de imagem do técnico
(`ligas/tecnico/[userId]/imagem`) via `fetch` same-origin e o entrega por
`compartilharWhatsApp`, com texto montado no servidor (`mensagemTecnico`). SHALL estar
disponível a qualquer usuário logado (o perfil do técnico já é leitura pública a
logados), espelhando o padrão de `CompartilharRodadaButton`.

#### Scenario: Compartilhar o pôster do técnico
- **WHEN** um usuário logado toca "Compartilhar pôster" no perfil de um técnico
- **THEN** o pôster PNG (campanha de sempre + troféus) é gerado e entregue ao seletor de compartilhamento
