# Tasks — add-change-password

## 1. Schema e action

- [x] 1.1 `authSchema.ts`: `changePasswordSchema` (senhaAtual obrigatória,
      novaSenha ≥6, confirmar coincide, nova ≠ atual) + tipo.
- [x] 1.2 `auth.ts`: `alterarSenha` — valida, exige sessão com e-mail,
      re-autentica com a senha atual (`signInWithPassword`), grava a nova
      (`updateUser`); sucesso terminal sem redirect.

## 2. UI

- [x] 2.1 `ChangePasswordForm` (folha client, padrão `UpdatePasswordForm`):
      3 campos + erros por campo + confirmação de sucesso.
- [x] 2.2 `/dashboard/conta`: card "Alterar senha" + e-mail do usuário.
- [x] 2.3 Item "Conta" no nav do dashboard (`layout.tsx`).

## 3. Testes

- [x] 3.1 `authSchema.test.ts`: changePasswordSchema (válido, curta, divergente,
      igual à atual, atual vazia).
- [x] 3.2 `auth.test.ts`: alterarSenha (inválido, sem sessão, senha atual
      incorreta, sucesso, falha do updateUser).

## 4. Validação e fechamento

- [x] 4.1 Gates: typecheck/lint/test/build.
- [x] 4.2 Validação visual no app (logado): fluxo de troca de senha.
- [x] 4.3 Commit + push + CI + archive.
