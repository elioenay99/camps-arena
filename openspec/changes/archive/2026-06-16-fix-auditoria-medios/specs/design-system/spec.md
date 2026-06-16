# design-system — delta fix-auditoria-medios

## ADDED Requirements

### Requirement: Acessibilidade de formulários e controles de ação

Os formulários da aplicação e os controles de ação SHALL atender critérios WCAG de uso por leitor de tela,
teclado e toque. Cada campo com erro de validação SHALL associar programaticamente sua mensagem ao input
(via `aria-describedby` apontando o `id` da mensagem) e anunciá-la (`role="alert"`/`aria-live`), além do
resumo geral do formulário — não bastando o realce visual (WCAG 3.3.1, 1.3.1). Estados comunicados por cor
SHALL ter um reforço NÃO-cromático (texto/ícone com rótulo acessível) — em particular o lado vencedor de um
confronto de mata-mata, cujo placar pode não desambiguar o desfecho em agregado/W.O. (WCAG 1.4.1). Os botões
de AÇÃO IRREVERSÍVEL (W.O., expulsar, encerrar, sair) SHALL ter alvo de toque de pelo menos 40px de altura no
mobile, com espaçamento adequado entre alvos adjacentes, sem regredir os botões pequenos legítimos do resto
da interface. O contraste de texto SHALL atender WCAG AA nos dois temas.

#### Scenario: Erro de campo anunciado e associado

- **WHEN** um usuário submete um formulário com um campo inválido (login, cadastro, perfil, criar partida,
  criar torneio, recuperação/atualização de senha, ou o campo de cor)
- **THEN** a mensagem de erro daquele campo é associada ao input (`aria-describedby`) e anunciada por leitor
  de tela (`role="alert"`/`aria-live`), além do resumo do formulário

#### Scenario: Vencedor do confronto legível sem cor

- **WHEN** um leitor de tela (ou um usuário que não percebe a cor) inspeciona um confronto de mata-mata já
  decidido na chave
- **THEN** o lado que avançou é identificado por um reforço não-cromático (ícone/`sr-only` "vencedor"), mesmo
  quando o placar exibido não desambigua (agregado, W.O.)

#### Scenario: Alvo de toque das ações irreversíveis

- **WHEN** um usuário no mobile (390px) interage com uma ação irreversível (W.O., expulsar técnico, encerrar)
- **THEN** o controle tem alvo de toque de pelo menos 40px de altura, com espaçamento que evita toque acidental
  em alvos adjacentes
