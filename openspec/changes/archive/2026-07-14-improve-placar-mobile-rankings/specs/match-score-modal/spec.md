## ADDED Requirements

### Requirement: Modal de placar responsivo no mobile/PWA

O modal de lançar placar SHALL exibir os dois lados em formato de placar **lado a lado**
("A × B") já na largura base de mobile (~360-390px), NÃO empilhados verticalmente. Cada
lado SHALL renderizar UMA única identidade — um escudo (competitivo) ou foto (avulso) de
~40px com fallback de iniciais, o nome UMA vez e o técnico como subtítulo — sem duplicar
escudo ou nome. O botão "Chamar" (do lado convocável) e a busca de clube (só no avulso)
SHALL ficar FORA das colunas de placar, numa seção de largura total abaixo do scoreboard,
para não distorcer a simetria/altura das colunas. O scaffold rolável do Dialog (corpo com
scroll, rodapé fixo) SHALL ser preservado.

#### Scenario: Placar lado a lado no mobile
- **WHEN** o modal de lançar placar é aberto num viewport de ~390px
- **THEN** os dois times aparecem em duas colunas na mesma linha (com "×" no meio), cada um com escudo compacto, nome, técnico e stepper — sem um time empilhado sobre o outro

#### Scenario: Identidade sem duplicação
- **WHEN** um lado é um clube (competitivo)
- **THEN** o escudo e o nome do clube aparecem UMA vez por lado (não duas)

#### Scenario: Scroll preservado
- **WHEN** o conteúdo do modal excede a altura da tela
- **THEN** o corpo rola e o rodapé "Salvar/Fechar" permanece fixo e visível (comportamento do Dialog inalterado)

### Requirement: Autores dos gols recolhidos por padrão

A seção "Autores dos gols (opcional)" SHALL ser recolhida por padrão NO CASO COMUM,
revelada ao tocar num controle "Autores dos gols (opcional)" (alvo de toque ≥44px). Ela
SHALL, porém, iniciar ABERTA quando houver autores já gravados (preload editável das
superfícies de organizador), para que eles não fiquem escondidos. O estado dos autores
já digitados SHALL persistir ao recolher/expandir (apenas a visibilidade muda; nada é
descartado). A foto de evidência (modo proposta) SHALL permanecer fora dessa seção
recolhível.

#### Scenario: Autores começam recolhidos
- **WHEN** o modal de placar abre
- **THEN** a seção de autores dos gols aparece recolhida, e o modal fica curto para o caso comum de só lançar o placar

#### Scenario: Expandir preserva o que foi digitado
- **WHEN** o usuário adiciona autores, recolhe e expande de novo a seção
- **THEN** os autores digitados continuam lá

#### Scenario: Autores gravados começam à mostra
- **WHEN** o organizador abre o modal de uma partida que já tem autores de gol gravados
- **THEN** a seção de autores aparece expandida (os autores existentes ficam visíveis para editar)

### Requirement: Stepper compacto (2-up) e safe-area no rodapé

O stepper principal de placar SHALL ser compacto o suficiente para os dois lados caberem
lado a lado (2 colunas) SEM scroll horizontal em telas de 360px, mantendo alvo de toque
de ~40px (o layout 2-up tem prioridade sobre elevar o toque para 44px). O rodapé do modal
SHALL aplicar padding inferior de safe-area (`max(1rem, env(safe-area-inset-bottom))`)
para que os botões não fiquem sob a barra de gestos no PWA standalone.

#### Scenario: Steppers cabem 2-up em tela pequena
- **WHEN** o placar lado a lado é exibido a 360px
- **THEN** os steppers dos dois lados cabem sem scroll horizontal no card

#### Scenario: Rodapé reserva safe-area
- **WHEN** o modal é renderizado
- **THEN** o rodapé aplica `padding-bottom: max(1rem, env(safe-area-inset-bottom))` (piso de 1rem hoje; efetivo como reserva de gestos quando `viewport-fit: cover` for adotado)
