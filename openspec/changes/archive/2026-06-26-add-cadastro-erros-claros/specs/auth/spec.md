# auth — Delta Spec

## ADDED Requirements

### Requirement: Mensagens de erro acionáveis no cadastro

Quando o `signUp` do Supabase falha, a action de cadastro SHALL traduzir o erro em mensagem
acionável (pt-BR) conforme a causa, em vez de uma única mensagem genérica, **sem revelar se o
e-mail já possui conta** (mantém a anti-enumeração do requisito "Cadastro de conta"):

- Limite de envio de e-mail (`over_email_send_rate_limit` ou HTTP 429) SHALL produzir uma
  mensagem dedicada que NÃO atribui culpa ao usuário e orienta tentar de novo em alguns minutos.
- Senha recusada pela política (`weak_password`) SHALL produzir erro no campo **senha**.
- E-mail recusado (`email_address_invalid`) SHALL produzir erro no campo **e-mail**.
- Qualquer outra falha (incluindo e-mail já cadastrado) SHALL cair na mensagem genérica.

#### Scenario: Limite de e-mail não culpa o usuário

- **WHEN** o `signUp` falha com `over_email_send_rate_limit` (ou status 429)
- **THEN** a action responde com mensagem de "muitos cadastros agora, tente em alguns minutos",
  sem erro por campo

#### Scenario: Senha fraca é apontada no campo

- **WHEN** o `signUp` falha com `weak_password`
- **THEN** a action responde com erro associado ao campo senha

#### Scenario: E-mail inválido é apontado no campo

- **WHEN** o `signUp` falha com `email_address_invalid`
- **THEN** a action responde com erro associado ao campo e-mail

#### Scenario: Falha desconhecida mantém o genérico e a anti-enumeração

- **WHEN** o `signUp` falha por outra causa (ex.: e-mail já cadastrado)
- **THEN** a action responde com a mensagem genérica, sem revelar a existência da conta
