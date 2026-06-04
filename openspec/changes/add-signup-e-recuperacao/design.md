## Context

Login existente: Server Action `login` + `LoginForm` (useActionState), sessão por cookies via `@supabase/ssr`, middleware protegendo `/dashboard`. Trigger `handle_new_user` (security definer) cria `public.users` com `nome`/`celular` de `raw_user_meta_data`. `env.NEXT_PUBLIC_SITE_URL` validada (change `add-env-validation`) — base para os links de e-mail.

## Goals / Non-Goals

- **Goals**: cadastro self-service com perfil completo (nome + celular BR); recuperação de senha de ponta a ponta; nenhuma regressão no login.
- **Non-Goals**: OAuth/social login; magic link como método primário; alteração de e-mail; verificação de celular; página de perfil (Tier 3); redirecionar usuário logado para fora de `/login`/`/cadastro` (comportamento atual preservado).

## Decisions

### 1. Confirmação por `token_hash` + `verifyOtp`, com fallback `code`

O padrão SSR oficial usa templates de e-mail com `{{ .TokenHash }}` apontando para `/auth/confirm` → `verifyOtp({ type, token_hash })`. Vantagem decisiva sobre `exchangeCodeForSession` puro: **não depende do code verifier em cookie**, então o link funciona aberto em outro navegador/dispositivo (caso comum: cadastro no desktop, e-mail no celular).

Como a troca de template é passo manual do usuário, o handler também aceita `?code=` (default `{{ .ConfirmationURL }}` com PKCE) → `exchangeCodeForSession`. Limitação conhecida do fallback: só funciona no navegador que iniciou o fluxo. Templates a configurar (dashboard → Auth → Email Templates):

- *Confirm signup*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard`
- *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/atualizar-senha`

### 2. Signup tolera os dois modos de confirmação

`signUp` com confirmação LIGADA → `data.session === null` → estado "Conta criada! Confira seu e-mail…". Com confirmação DESLIGADA → sessão presente → `redirect("/dashboard")`. O código não assume configuração do projeto.

### 3. Anti-enumeração em todas as pontas

- `signup`: mensagem de sucesso idêntica exista ou não a conta (com confirmação ligada o Supabase já retorna usuário ofuscado para e-mail repetido); erros reais viram mensagem genérica.
- `forgotPassword`: SEMPRE a mesma resposta ("Se houver uma conta para este e-mail, enviamos o link."), inclusive em erro do Supabase — log no servidor, resposta neutra ao cliente.
- Espelha a decisão existente do `login` ("E-mail ou senha inválidos.").

### 4. `updatePassword` exige sessão e não pede a senha antiga

O fluxo de recovery cria sessão autenticada via `verifyOtp`; `auth.updateUser({ password })` opera sobre ela. Sem sessão (link expirado/acesso direto), o middleware já redireciona (`/atualizar-senha` protegido) e a action revalida com `getUser()` (defesa em profundidade). Pedir a senha antiga inviabilizaria exatamente o caso de uso (senha esquecida).

### 5. `safeRedirectPath` vira módulo compartilhado

`auth.ts` é `"use server"` (só exporta async). O guard anti open-redirect é necessário também no route handler (param `next`). Movido para `src/lib/safe-redirect.ts` com testes; `auth.ts` importa de lá. Regra inalterada: começa com `/` e não com `//`.

### 6. AuthState ganha `success?: string`

Os fluxos de signup/recuperação têm estado terminal de sucesso SEM redirect (confira o e-mail). Campo opcional novo no `AuthState` — retrocompatível com o `LoginForm`.

### 7. Formulários espelham o padrão do LoginForm

`useActionState` + `useFormStatus`, Input/Label/Button do design system, erros por campo via `fieldErrors`, `noValidate`. Sem dependência nova (React Hook Form fica para formulários complexos; estes têm 1-4 campos).

## Risks / Trade-offs

- **Template não atualizado**: fluxo cai no fallback `?code=` (mesmo navegador). Mitigado: pendência explícita do usuário + fallback funcional.
- **`/atualizar-senha` protegido pelo middleware**: link expirado → redirect a `/login?redirectTo=/atualizar-senha`; após logar, o usuário ainda consegue trocar a senha — degradação aceitável.
- **E-mail de recovery para conta inexistente não é enviado** (Supabase silencia) — indistinguível para o cliente, que é o objetivo.
- **Rate-limit**: o nativo do Supabase para e-mails de auth (sem trabalho extra nesta change).
