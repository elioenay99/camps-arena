## 1. Fundações

- [x] 1.1 `src/lib/safe-redirect.ts`: extrair `safeRedirectPath` de `auth.ts` (+ `src/lib/safe-redirect.test.ts`)
- [x] 1.2 `src/schema/authSchema.ts`: `forgotPasswordSchema` (e-mail) e `updatePasswordSchema` (senha min 6 + confirmação igual)

## 2. Server Actions (`src/actions/auth.ts`)

- [x] 2.1 `AuthState` ganha `success?: string`; `login` passa a usar o helper compartilhado
- [x] 2.2 `signup`: valida, `signUp` com `options.data {nome, celular}` + `emailRedirectTo` → sucesso "confira o e-mail" (sem sessão) ou redirect `/dashboard` (com sessão); mensagens genéricas (anti-enumeração)
- [x] 2.3 `forgotPassword`: valida, `resetPasswordForEmail` com `redirectTo` → SEMPRE a mesma resposta de sucesso
- [x] 2.4 `updatePassword`: exige `getUser()`, valida, `updateUser({ password })` → redirect `/dashboard`

## 3. Route handler de confirmação

- [x] 3.1 `src/app/auth/confirm/route.ts` (GET): `token_hash`+`type` → `verifyOtp`; fallback `code` → `exchangeCodeForSession`; `next` via `safeRedirectPath`; falha → `/login?aviso=link-invalido`

## 4. UI

- [x] 4.1 `SignupForm` + página `/cadastro` (nome, e-mail, celular, senha)
- [x] 4.2 `ForgotPasswordForm` + página `/recuperar-senha`
- [x] 4.3 `UpdatePasswordForm` + página `/atualizar-senha`
- [x] 4.4 `/login`: links "Criar conta" e "Esqueci minha senha"; aviso quando `?aviso=link-invalido`
- [x] 4.5 Middleware: `/atualizar-senha` em `PROTECTED_PREFIXES`

## 5. Testes

- [x] 5.1 `src/actions/auth.test.ts`: signup (inválido não chama Supabase; metadata correto; sucesso sem sessão; redirect com sessão; erro genérico), forgotPassword (resposta idêntica com/sem erro), updatePassword (sem sessão rejeita; atualiza e redireciona), login (inválido; credencial errada genérica)
- [x] 5.2 `src/lib/safe-redirect.test.ts`: interno aceito; externo/`//`/vazio → default
- [x] 5.3 Teste do route handler: token_hash ok; code ok; sem params → login com aviso; `next` externo não redireciona para fora

## 6. Validação

- [x] 6.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 6.2 `openspec validate add-signup-e-recuperacao --strict`
- [x] 6.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [x] 6.4 `pnpm build` verde
- [ ] 6.5 (usuário) Templates de e-mail + Redirect URLs no dashboard Supabase
