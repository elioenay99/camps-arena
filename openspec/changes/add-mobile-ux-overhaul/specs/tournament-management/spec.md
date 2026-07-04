## ADDED Requirements

### Requirement: Barra de seções do torneio cabe sem rolagem no mobile

A barra de abas do detalhe do torneio (Classificação/Partidas/Rodadas/Vagas) SHALL
caber na largura da tela sem rolagem horizontal no mobile, distribuindo as abas
(2 a 4, conforme o perfil) em colunas de largura igual, com ícone + rótulo curto;
no desktop SHALL exibir o rótulo por extenso. O nome acessível completo de cada
aba SHALL ser preservado (via `sr-only`) em todas as larguras, mantendo leitores
de tela e testes por nome acessível intactos. O contador de pendências (badge)
SHALL permanecer visível.

#### Scenario: Quatro abas em 390px

- **WHEN** um árbitro/gestor de um torneio gerado com rodadas abre o detalhe em
  390px (pior caso, 4 abas)
- **THEN** as quatro abas aparecem lado a lado sem rolagem, com ícone + rótulo
  curto, e o nome acessível completo permanece disponível

### Requirement: Ações de partidas e vagas não estouram a viewport no mobile

Os clusters de ação de partidas e vagas SHALL empilhar em largura total no mobile
e voltar inline no desktop, sem que nenhum botão seja cortado na borda. Os botões
cobertos são Chamar/Solicitar W.O./W.O./Editar placar/Encerrar (partida) e
Copiar/Gerar/Expulsar/Assumir/Desistir (vaga). A URL de convite SHALL quebrar em
linhas (`break-all`) e
permanecer 100% visível e selecionável, sem estourar a largura da tela.

#### Scenario: Card de partida do organizador em 390px

- **WHEN** o organizador vê uma partida com todas as ações disponíveis em 390px
- **THEN** os botões empilham full-width e nenhum fica cortado; a pill de status
  acompanha a linha de informação

#### Scenario: URL de convite legível na aba Vagas

- **WHEN** a aba Vagas é aberta em 390px com o console de moderação
- **THEN** a URL de convite quebra em linhas dentro do card, inteira e
  selecionável, sem vazar a largura da tela
