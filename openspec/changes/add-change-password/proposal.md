# Proposal — add-change-password

## Why

Hoje só existe a RECUPERAÇÃO de senha por e-mail (`/recuperar-senha` →
`/atualizar-senha` sobre a sessão de recovery). Falta o usuário JÁ AUTENTICADO
trocar a própria senha dentro do app, sem precisar do fluxo de e-mail — uma
expectativa básica de qualquer painel de conta.

## What Changes

- **Nova action `alterarSenha`** (`auth.ts`): exige a senha ATUAL e re-autentica
  (`signInWithPassword`) antes de gravar a nova (`updateUser`) — defesa contra
  sessão sequestrada e norma de segurança. Sucesso é terminal SEM redirect
  (confirmação inline; o usuário continua no app).
- **`changePasswordSchema`** (`authSchema.ts`): senha atual (obrigatória), nova
  (mín. 6), confirmação; a nova precisa ser diferente da atual.
- **Página `/dashboard/conta`**: card "Alterar senha" + e-mail do usuário; novo
  item "Conta" no nav do dashboard. Rota protegida pelo middleware como o resto
  do `/dashboard`.
- **`ChangePasswordForm`**: folha client (padrão `UpdatePasswordForm`) com os
  três campos, erros por campo e confirmação de sucesso.

## Capabilities

### Modified Capabilities

- `auth`: alteração de senha pelo usuário autenticado (re-autenticação com a
  senha atual + gravação da nova).
- `dashboard`: rota/aba "Conta" com o formulário de troca de senha.

## Impact

- **Auth**: 1 action nova, 1 schema novo. Reusa o cliente SSR e o padrão
  `AuthState`. Nenhuma mudança de banco, RLS ou triggers.
- **UI**: 1 página, 1 componente client, 1 item de nav.
- **Não muda**: login, cadastro, recuperação por e-mail, confirmação por link.
