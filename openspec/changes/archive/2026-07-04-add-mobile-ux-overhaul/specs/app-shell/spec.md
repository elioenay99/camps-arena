## ADDED Requirements

### Requirement: Navegação do dashboard colapsa em menu no mobile

A navegação do dashboard SHALL colapsar num menu acionado por um botão
(hambúrguer) no mobile e SHALL permanecer inline (links lado a lado) a partir de
`sm`/`md`. A barra cobre Painel/Torneios/Ligas/Copas/Explorar/Nova partida. O
menu mobile SHALL: destacar a seção ativa, fechar ao navegar e ao tocar fora,
expor `aria-expanded`/`aria-controls` no botão de acionamento, e oferecer alvos de
toque de ao menos 44px. O toggle de tema, o avatar da conta e "Sair" SHALL
permanecer acessíveis no cabeçalho. Nenhuma dependência nova SHALL ser
introduzida.

#### Scenario: Cabeçalho enxuto no celular

- **WHEN** o dashboard é aberto em 390px
- **THEN** as seções ficam atrás de um botão de menu (hambúrguer) e o cabeçalho não
  quebra em múltiplas linhas de pills

#### Scenario: Navegar pelo menu mobile

- **WHEN** o usuário abre o menu e toca numa seção
- **THEN** navega para a seção e o menu fecha; a seção atual aparece destacada

### Requirement: Guarda global de overflow horizontal

O `body` SHALL impedir a rolagem horizontal acidental da viewport inteira
(`overflow-x: clip`), como rede de segurança. Essa guarda SHALL NOT substituir os
consertos por-elemento (containers largos como tabelas e bracket continuam
isolando o próprio scroll interno).

#### Scenario: Elemento largo isolado não rola a página toda

- **WHEN** algum conteúdo excede a largura da tela num ponto não previsto
- **THEN** a página como um todo não rola horizontalmente (a guarda contém o
  vazamento), enquanto os containers com scroll próprio seguem funcionando
