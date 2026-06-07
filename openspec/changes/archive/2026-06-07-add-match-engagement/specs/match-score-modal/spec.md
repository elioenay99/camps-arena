# match-score-modal — Delta Spec

## MODIFIED Requirements

### Requirement: Atalhos de contato via WhatsApp
O modal SHALL oferecer botões que abrem `wa.me/` com os telefones dos participantes injetados via props, usando o helper compartilhado de link/mensagem (capability `match-engagement`): a conversa SHALL abrir com a mensagem de convocação pré-preenchida (adversário, título do torneio e link da página) em vez de chat vazio.

#### Scenario: Abrir conversa com mensagem pronta
- **WHEN** o usuário aciona o botão de chamar um participante
- **THEN** um link `wa.me/` com o telefone correspondente e a mensagem de convocação codificada em `?text=` é aberto
