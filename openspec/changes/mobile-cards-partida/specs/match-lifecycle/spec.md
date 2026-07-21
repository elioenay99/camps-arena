## ADDED Requirements

### Requirement: Densidade e identidade da lista de partidas em aberto no mobile

A lista de partidas em aberto SHALL usar a mesma identidade visual do histórico: rótulo de
rodada, escudo de cada lado (`TeamCrest`, com fallback de iniciais), placar como elemento
de maior peso visual e nome de cada lado oculto por CSS no mobile (`hidden sm:inline`),
permanecendo no DOM em todos os breakpoints. A pill de status e o marcador "(vaga aberta)"
SHALL continuar presentes.

As AÇÕES da partida (chamar no WhatsApp, solicitar/marcar W.O., editar placar, encerrar)
SHALL permanecer VISÍVEIS no mobile — não SHALL ser recolhidas atrás de um disclosure —,
mas SHALL ser dispostas em grade de 2 colunas no mobile (1 coluna quando há uma única
ação), com a ação primária ("Editar placar") e o indicador de proposta pendente ocupando a
linha inteira. De `sm:` para cima o cluster SHALL manter o arranjo em linha (flex) atual.
Todo alvo de toque SHALL ter ao menos 44px de altura no mobile.

A superfície SHALL permanecer Server Component (contenção do celular do adversário) e
NENHUM gate de exibição (`mostrarEncerrar`, proposta pendente, competitivo, quem joga a
partida) SHALL mudar.

#### Scenario: Partidas em aberto legíveis a 390px

- **WHEN** a lista de partidas em aberto é renderizada no mobile
- **THEN** cada partida mostra escudo de cada lado e o placar em destaque, com as ações em
  grade de 2 colunas e a ação primária ocupando a linha inteira

#### Scenario: Ações diárias continuam a um toque

- **WHEN** o organizador abre a aba de partidas no celular
- **THEN** "Editar placar", "Encerrar" e "W.O." estão visíveis diretamente no card, sem
  passo intermediário

#### Scenario: Gates de papel preservados

- **WHEN** a partida tem proposta de placar pendente, ou o usuário não arbitra, ou o lado
  não é competitivo
- **THEN** os mesmos controles de antes aparecem ou somem, apenas rearranjados no layout
