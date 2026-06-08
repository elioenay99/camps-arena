# auth — Delta Spec

## ADDED Requirements

### Requirement: Alteração de senha pelo usuário autenticado

O usuário AUTENTICADO SHALL poder trocar a própria senha dentro do app, sem o
fluxo de recuperação por e-mail, em uma rota protegida do painel
(`/dashboard/conta`). A action `alterarSenha` SHALL exigir a senha ATUAL e
re-autenticar (`signInWithPassword`) antes de gravar a nova (`updateUser`); a
nova senha SHALL ter no mínimo 6 caracteres, coincidir com a confirmação e ser
diferente da atual. Em sucesso, SHALL confirmar inline (sem redirect); falha de
senha atual SHALL retornar erro no campo da senha atual, sem gravar a nova.

#### Scenario: Troca com senha atual correta

- **WHEN** o usuário informa a senha atual correta e uma nova senha válida
- **THEN** a senha é atualizada e o app confirma a troca sem deslogar

#### Scenario: Senha atual incorreta

- **WHEN** o usuário informa uma senha atual incorreta
- **THEN** a troca é negada com erro no campo da senha atual e a senha NÃO muda

#### Scenario: Nova senha igual à atual

- **WHEN** a nova senha é igual à atual
- **THEN** a validação rejeita antes de qualquer chamada ao Supabase
