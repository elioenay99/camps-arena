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

