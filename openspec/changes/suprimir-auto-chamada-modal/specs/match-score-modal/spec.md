# match-score-modal — Delta Spec

## MODIFIED Requirements

### Requirement: Atalhos de contato via WhatsApp

O modal SHALL oferecer botões que abrem `wa.me/` com os telefones dos participantes injetados via props, usando o helper compartilhado de link/mensagem (capability `match-engagement`): a conversa SHALL abrir com a mensagem de convocação pré-preenchida (adversário, título do torneio e link da página) em vez de chat vazio. O botão de uma coluna SHALL aparecer apenas quando aquele lado é convocável pelo usuário logado (o ADVERSÁRIO dele) — o lado do PRÓPRIO usuário NÃO SHALL exibir o botão (sem auto-chamada), mesmo tendo celular válido.

#### Scenario: Abrir conversa com mensagem pronta

- **WHEN** o usuário aciona o botão de chamar o adversário
- **THEN** um link `wa.me/` com o telefone correspondente e a mensagem de convocação codificada em `?text=` é aberto

#### Scenario: Sem auto-chamada na própria coluna

- **WHEN** o modal é aberto e uma das colunas é o próprio usuário logado (lado não convocável), ainda que ele tenha celular válido
- **THEN** aquela coluna NÃO exibe o botão "Chamar"; apenas a coluna do adversário exibe o atalho
