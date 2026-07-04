## ADDED Requirements

### Requirement: Rolagem usável do bracket no mobile

O bracket (mata-mata) SHALL manter a rolagem horizontal como forma de navegar
entre as fases e SHALL torná-la usável no mobile, sem estourar a viewport da
página, permanecendo um componente de servidor (RSC, sem JavaScript novo). A
rolagem SHALL: "encaixar" por fase (scroll-snap por coluna), sinalizar
visualmente que há conteúdo além das bordas (affordance de gradiente nas laterais)
e usar cards mais estreitos no mobile e a largura atual no desktop. O texto do
campeão SHALL quebrar (`break-words`) e não vazar a largura da tela.

#### Scenario: Chaveamento de 8/16 em 390px

- **WHEN** um usuário abre o chaveamento de uma copa em 390px
- **THEN** o bracket rola horizontalmente com "encaixe" por fase, mostra um
  gradiente indicando que há mais fases à direita/esquerda, e a página como um todo
  não rola horizontalmente

#### Scenario: Nome de campeão longo não estoura

- **WHEN** o campeão é uma competição por-nome com nome longo (palavra única)
- **THEN** o nome quebra em linhas dentro da faixa, sem vazar a largura da tela
