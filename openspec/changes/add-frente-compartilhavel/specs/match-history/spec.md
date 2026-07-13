## ADDED Requirements

### Requirement: Compartilhar resultado de uma partida encerrada

O histórico de partidas SHALL oferecer, no cluster de ações de cada partida
ENCERRADA, um botão "Compartilhar resultado" (client) que baixa o PNG da rota de
imagem do resultado (`fetch` same-origin) e o entrega via `compartilharWhatsApp`
(Web Share API com arquivo no mobile; fallback desktop: copiar texto + baixar +
`wa.me`), com o texto montado no servidor (`mensagemResultado`). O botão SHALL estar
disponível a qualquer usuário logado que enxerga a partida (não gated por papel de
organizador), espelhando `CompartilharRodadaButton`. Partidas não encerradas NÃO
SHALL exibir o botão.

#### Scenario: Compartilhar um resultado
- **WHEN** um usuário logado toca "Compartilhar resultado" numa partida encerrada
- **THEN** o card PNG do resultado é gerado e entregue ao seletor de compartilhamento com o texto do confronto

#### Scenario: Partida em andamento não oferece o botão
- **WHEN** a partida ainda não foi encerrada
- **THEN** o botão "Compartilhar resultado" não aparece
