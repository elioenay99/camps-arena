## Context

Projeto greenfield. Stack fixada: Next.js 16 (App Router, `src/`, RSC-first), TypeScript strict, Tailwind v4, shadcn/ui, Supabase (PostgreSQL + Auth + RLS), Zod + React Hook Form. Idioma base pt-BR. Mutações por Server Actions (sem rotas HTTP tradicionais). Entrega faseada com portão de aprovação humana entre cada fase.

## Goals / Non-Goals

**Goals:**
- Fundação reprodutível (Docker dev) e design system com dark/light.
- Segurança em profundidade: RLS no banco + checagem de propriedade na Server Action.
- Sessão via cookies (`@supabase/ssr`) compatível com RSC e middleware.

**Non-Goals:**
- Aplicar DDL/migrations automaticamente (feito manualmente pelo usuário — política do projeto).
- Sistema de chaveamento/bracket de torneios (futuro).
- Pagamentos, notificações push, real-time websockets.

## Decisions

- **shadcn/ui base Radix (não Base UI).** O preset default novo (`base-nova`) usa Base UI e não fornece o componente `form`; a Fase 2 exige RHF+Zod. Escolhido `radix-nova` (pacote unificado `radix-ui`) por alinhamento com o ecossistema/docs. `form.tsx` foi adicionado manualmente (não está no registry do preset).
- **next-themes com `attribute="class"`, `defaultTheme="dark"`.** Tema escuro como padrão (requisito de UI), com toggle e `suppressHydrationWarning` no `<html>`.
- **Server Actions em `src/actions`** como única via de mutação. `revalidatePath('/dashboard')` para invalidar cache após escrita.
- **Autorização dupla:** RLS (`UPDATE` restrito a `auth.uid()` envolvido na partida) + verificação explícita de identidade na action antes do UPDATE. Se um falhar, o outro barra.
- **Supabase via Marketplace da Vercel** (decisão do usuário): envs auto-injetadas e sincronizadas no projeto.
- **Toasts via `sonner`** (substituto oficial do `toast` descontinuado no shadcn).
- **Docker dev** com bind mount + `node_modules`/`.next` como volumes do container e polling de FS para hot reload.

## Risks / Trade-offs

- [RLS mal configurada expõe escrita] → Política `UPDATE` validada por `@agent-security-engineer` na Fase 2; testes de autorização na Fase 5.
- [`service_role` vazar para o client] → Nunca prefixar com `NEXT_PUBLIC_`; usar somente em código server-side; `.env.local` no `.gitignore`.
- [Hot reload falho em volume Docker] → `WATCHPACK_POLLING/CHOKIDAR_USEPOLLING` habilitados.
- [Migrations manuais divergirem do código] → `supabase/schema.sql` versionado é a fonte de verdade; o usuário aplica e confirma.
- [Sessão SSR/cookies inconsistente entre middleware e RSC] → usar helpers oficiais `@supabase/ssr` (server, client e middleware) sem customização ad-hoc.

## Migration Plan

1. Fundação (F1) → aprovação. 2. Banco/Auth (F2): gerar `schema.sql`, usuário aplica DDL no Supabase. 3. UI/Actions (F3–F4). 4. Dashboard + deploy Vercel (F5). Rollback: cada fase é um conjunto coeso de commits; reverter por commit. Banco: `schema.sql` idempotente onde possível.

## Open Questions

- Provedor de avatar (upload Supabase Storage vs URL externa) — definir na F2.
- Estratégia de login (magic link vs senha) — usar método nativo Supabase; confirmar na F2.
