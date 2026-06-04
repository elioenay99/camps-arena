## Why

Hoje o app só tem login (`src/actions/auth.ts`): usuários nascem por fora (criados à mão no dashboard do Supabase, perfil via trigger `handle_new_user`). Sem cadastro não há multi-usuário real — é o primeiro item do Tier 1 e pré-requisito de ownership de torneio e convites. E sem recuperação de senha, qualquer senha esquecida vira atendimento manual.

O terreno já está pronto: `signupSchema` (nome, e-mail, senha, `celularBR`) existe em `src/schema/authSchema.ts`, e o trigger `handle_new_user` (`supabase/schema.sql:153`) já popula `public.users` a partir de `raw_user_meta_data` (`nome`, `celular`) — **cadastro não precisa de DDL**.

## What Changes

- **Server Action `signup`** (`src/actions/auth.ts`): valida com `signupSchema`, chama `auth.signUp` com `options.data = { nome, celular }` (o trigger cria o perfil) e `emailRedirectTo` apontando para `/auth/confirm`. Com confirmação de e-mail LIGADA (default do Supabase), retorna estado de sucesso "confira seu e-mail"; com confirmação desligada (sessão presente), redireciona ao dashboard. Mensagens genéricas — não revelam se o e-mail já existe (anti-enumeração; o próprio Supabase ofusca o caso "já cadastrado" quando a confirmação está ligada).
- **Server Action `forgotPassword`**: valida e-mail e chama `resetPasswordForEmail` com `redirectTo` para `/auth/confirm?next=/atualizar-senha`. SEMPRE responde com a mesma mensagem de sucesso, exista a conta ou não (anti-enumeração).
- **Server Action `updatePassword`**: exige sessão (a sessão de recovery criada pelo link), valida nova senha + confirmação e chama `auth.updateUser`. Sucesso redireciona ao dashboard.
- **Route Handler GET `/auth/confirm`** (`src/app/auth/confirm/route.ts`): troca o token do link de e-mail por sessão. Caminho primário `token_hash` + `type` → `verifyOtp` (padrão SSR recomendado; funciona mesmo abrindo o link em outro navegador). Fallback `?code=` → `exchangeCodeForSession` (cobre templates de e-mail ainda não atualizados). Param `next` validado contra open-redirect (mesma regra do `redirectTo` do login). Falha → `/login?aviso=link-invalido`.
  - **Exceção registrada à regra "nunca rotas de API"**: callback de link de e-mail é um GET vindo do cliente de e-mail — não existe como Server Action. É endpoint de navegação (redirect), não de mutação de dados da UI; o padrão oficial do Supabase SSR exige esse handler.
- **Páginas novas** (RSC + form client nas folhas, espelhando `/login`): `/cadastro` (SignupForm), `/recuperar-senha` (ForgotPasswordForm), `/atualizar-senha` (UpdatePasswordForm, rota protegida).
- **`/login` ganha** links "Criar conta" / "Esqueci minha senha" e exibe aviso quando `?aviso=link-invalido`.
- **Middleware**: `/atualizar-senha` entra em `PROTECTED_PREFIXES`.
- **Helper `safeRedirectPath`** extraído de `auth.ts` para `src/lib/safe-redirect.ts` (arquivos `"use server"` só exportam async; o route handler também precisa do guard) + testes.
- **Schemas novos**: `forgotPasswordSchema`, `updatePasswordSchema` (senha + confirmação com refine de igualdade).
- **Testes**: `src/actions/auth.test.ts` (signup/forgotPassword/updatePassword + login básico), `src/lib/safe-redirect.test.ts`, teste do route handler `/auth/confirm` (token_hash, fallback code, link inválido, guard de open-redirect no `next`).

## Capabilities

### New Capabilities
<!-- Nenhuma: tudo é extensão da capability `auth`. -->

### Modified Capabilities
- `auth`: ganha cadastro de conta, recuperação de senha e confirmação por link de e-mail; a página de atualização de senha entra nas rotas protegidas.

## Impact

- **Código**: `src/actions/auth.ts` (+3 actions), `src/schema/authSchema.ts` (+2 schemas), `src/lib/safe-redirect.ts` (novo), `src/app/auth/confirm/route.ts` (novo), `src/app/{cadastro,recuperar-senha,atualizar-senha}/page.tsx` (novos), `src/features/auth/components/{SignupForm,ForgotPasswordForm,UpdatePasswordForm}.tsx` (novos), `src/app/login/page.tsx` (links/aviso — só a página RSC; `LoginForm.tsx` permanece intacto), `src/lib/supabase/middleware.ts` (prefixo protegido).
- **Banco**: nenhum DDL — o trigger `handle_new_user` já cobre o cadastro.
- **PENDÊNCIA DO USUÁRIO (dashboard Supabase, manual como DDL)**: (1) atualizar os templates de e-mail *Confirm signup* e *Reset password* para o formato `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email|recovery&next=...` (detalhes no design.md); (2) conferir *Site URL* e adicionar `<site>/auth/confirm` à allow list de *Redirect URLs* em **cada ambiente** — incluindo o wildcard de preview da Vercel (`https://*-<projeto>.vercel.app/auth/confirm`), já que `NEXT_PUBLIC_SITE_URL` é inlinada em build e previews apontariam para produção sem isso; (3) opcional: habilitar *Secure password change* (AAL2) no dashboard para exigir reautenticação na troca de senha. Até a config dos templates, o fallback `?code=` mantém o fluxo funcionando no MESMO navegador que iniciou.
- **Segurança**: anti-enumeração nas três actions; open-redirect fechado no `next`/`redirectTo`; senha mínima de 6 (alinhada ao default do Supabase); rate-limit de e-mails é o nativo do Supabase.
- **Não-impacto**: demo público, fluxo de login existente, RLS (trigger é `security definer`).
