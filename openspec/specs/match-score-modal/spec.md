# match-score-modal Specification

## Purpose
TBD - created by archiving change add-arena-app. Update Purpose after archive.
## Requirements
### Requirement: Modal de lançamento de placar
O sistema SHALL exibir um modal "Menu da Partida" com cabeçalho estático e subtítulos dinâmicos (times, rodada, participantes) recebidos via props do servidor.

#### Scenario: Subtítulos dinâmicos
- **WHEN** o modal é aberto para uma partida específica
- **THEN** os nomes dos times, a rodada e os participantes são exibidos conforme os dados da partida

### Requirement: Controles de incremento de placar com atualização otimista
O modal SHALL oferecer, por participante, controles de incremento e decremento que atualizam o placar localmente de forma otimista antes da persistência.

#### Scenario: Incremento local imediato
- **WHEN** o usuário toca em incrementar o placar de um lado
- **THEN** o valor exibido aumenta imediatamente sem esperar o servidor

#### Scenario: Decremento não fica negativo
- **WHEN** o placar está em zero e o usuário decrementa
- **THEN** o valor permanece em zero

### Requirement: Atalhos de contato via WhatsApp

O modal SHALL oferecer botões que abrem `wa.me/` com os telefones dos participantes injetados via props, usando o helper compartilhado de link/mensagem (capability `match-engagement`): a conversa SHALL abrir com a mensagem de convocação pré-preenchida (adversário, título do torneio e link da página) em vez de chat vazio. O botão de uma coluna SHALL aparecer apenas quando aquele lado é convocável pelo usuário logado (o ADVERSÁRIO dele) — o lado do PRÓPRIO usuário NÃO SHALL exibir o botão (sem auto-chamada), mesmo tendo celular válido.

#### Scenario: Abrir conversa com mensagem pronta

- **WHEN** o usuário aciona o botão de chamar o adversário
- **THEN** um link `wa.me/` com o telefone correspondente e a mensagem de convocação codificada em `?text=` é aberto

#### Scenario: Sem auto-chamada na própria coluna

- **WHEN** o modal é aberto e uma das colunas é o próprio usuário logado (lado não convocável), ainda que ele tenha celular válido
- **THEN** aquela coluna NÃO exibe o botão "Chamar"; apenas a coluna do adversário exibe o atalho

### Requirement: Apresentação do modal de placar

O modal "Menu da Partida" SHALL ser apresentado com o idioma visual da marca:
título em tipografia de display, caixa do placar com profundidade (elevação) e o
número do placar com destaque. O botão de SALVAR o placar SHALL usar a cor
primária do tema (não o verde do WhatsApp, que SHALL ficar reservado ao atalho de
contato). A apresentação SHALL ser legível e operável no viewport de celular
(390px) e NÃO SHALL alterar a atualização otimista, a persistência, o atalho
`wa.me` por coluna (sem auto-chamada), a seleção de clube nem os papéis acessíveis
e regiões live.

#### Scenario: Botão de salvar usa a cor primária

- **WHEN** o modal é aberto
- **THEN** o botão de salvar o placar usa a cor primária do tema, e o verde
  permanece apenas no atalho de WhatsApp

#### Scenario: Apresentação não altera comportamento

- **WHEN** o usuário ajusta o placar, salva, ou aciona o atalho de WhatsApp
- **THEN** o comportamento (atualização otimista, persistência, link `wa.me` por
  coluna sem auto-chamada, papéis acessíveis) permanece como antes, apenas com a
  nova moldura visual

### Requirement: Seleção de clube apenas no avulso

O "Menu da Partida" SHALL oferecer a busca/troca de clube de cada lado (`TeamSearchInput`)
SOMENTE em partidas **avulsas**, onde o clube é cosmético por partida. Em partidas
**competitivas** (liga, mata-mata, grupos, fase de liga — lados por `tournament_slot`/vaga),
o clube vem do torneio e SHALL ser apenas **exibido** (escudo + nome), SEM campo de busca. O
controle apresentacional SHALL ser governado por uma única decisão derivada de a partida ser
competitiva (presença de vaga), de modo que o avulso permaneça inalterado e o competitivo não
exiba a busca.

#### Scenario: Partida de torneio não mostra a busca de clube

- **WHEN** o usuário abre o "Menu da Partida" de uma partida competitiva (clube vindo do torneio)
- **THEN** o clube de cada lado é exibido (escudo + nome), sem o campo "Buscar clube"

#### Scenario: Partida avulsa mantém a busca de clube

- **WHEN** o usuário abre o "Menu da Partida" de uma partida avulsa
- **THEN** cada lado oferece o campo de busca para escolher/trocar o clube

### Requirement: Modo de envio do placar conforme a capacidade

O "Menu da Partida" SHALL operar em dois modos para o placar, conforme quem o abre:
- **Direto** (avulso, OU usuário com capacidade de **arbitrar** num competitivo): o botão grava o
  placar como hoje, sem exigir foto.
- **Proposta** (competitivo, usuário SEM arbitrar mas técnico de uma vaga): o botão SHALL ser
  "Enviar para aprovação" e SHALL exigir o **anexo de uma foto** (com pré-visualização) antes de
  habilitar o envio; ao enviar, cria uma proposta pendente (não altera o placar oficial).

O modo SHALL ser derivado no servidor (capacidade + se a partida é competitiva) e passado ao modal;
o modal não decide autorização por conta própria.

#### Scenario: Técnico vê o modo proposta com foto

- **WHEN** um técnico (sem arbitrar) abre o menu de uma partida competitiva
- **THEN** o botão é "Enviar para aprovação" e só habilita após anexar a foto

#### Scenario: Aprovador vê o modo direto

- **WHEN** o dono/admin/árbitro abre o menu da partida
- **THEN** o botão grava o placar diretamente, sem exigir foto

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

