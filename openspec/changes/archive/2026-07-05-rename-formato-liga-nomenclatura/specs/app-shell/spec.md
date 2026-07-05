# app-shell — Delta Spec

## MODIFIED Requirements

### Requirement: Navegação do dashboard colapsa em menu no mobile

A navegação do dashboard SHALL colapsar num menu acionado por um botão
(hambúrguer) no mobile e SHALL permanecer inline (links lado a lado) a partir de
`sm`/`md`. A barra cobre Painel/Torneios/Pirâmides/Copas/Explorar/Nova partida. O
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

#### Scenario: Seção das pirâmides rotulada "Pirâmides"

- **WHEN** o usuário abre a navegação (inline no desktop ou o menu no mobile)
- **THEN** a seção que aponta para `/dashboard/ligas` aparece rotulada
  "Pirâmides" (não "Ligas"), coerente com o H1 e o título da própria tela
