## Why

O Arena precisa de uma aplicação web para gerir torneios e partidas, permitindo que cada participante lance o placar da própria partida com segurança. Hoje não existe base de código; esta mudança estabelece a fundação (design system) e todo o fluxo vertical até o lançamento de placar autenticado e autorizado.

## What Changes

- Scaffolding Next.js 16 (App Router, `src/`, TypeScript strict), Tailwind v4 e shadcn/ui com tema claro/escuro (next-themes), tendo dark como padrão.
- Ambiente Docker local de desenvolvimento com hot reload.
- Modelo de dados PostgreSQL (`users`, `tournaments`, `matches`) no Supabase, com **RLS estrito**: SELECT público, UPDATE restrito ao dono da partida.
- Autenticação via Supabase Auth com `@supabase/ssr` (sessão por cookies) e middleware protegendo rotas administrativas.
- Validação com Zod + React Hook Form, incluindo formatos brasileiros (ex.: celular).
- UI core: modal "Menu da Partida" (`MatchScoreModal`) para lançamento de placar com atualização otimista.
- Mutação via **Server Action** `updateMatchScore` com checagem de propriedade (rejeita se o usuário não for dono da partida) e `revalidatePath`.
- Dashboard protegido (RSC) listando partidas ativas, com `loading.tsx`/`error.tsx`, e documentação de deploy na Vercel.

## Capabilities

### New Capabilities
- `design-system`: fundação de UI — Next.js 16, Tailwind v4, shadcn/ui, temas claro/escuro e ambiente de dev em Docker.
- `data-model`: tabelas `users`, `tournaments`, `matches` e suas relações no PostgreSQL/Supabase.
- `row-level-security`: políticas RLS — SELECT público e UPDATE restrito ao dono da partida.
- `auth`: autenticação Supabase com SSR por cookies e proteção de rotas via middleware.
- `match-score-modal`: modal de lançamento de placar com atualização otimista e atalhos de contato (WhatsApp).
- `match-mutations`: Server Action de atualização de placar com autorização por propriedade e revalidação de cache.
- `dashboard`: página protegida que lista partidas ativas, com estados de carregamento e erro.

### Modified Capabilities
<!-- Nenhuma: projeto greenfield, sem specs existentes. -->

## Impact

- **Código novo:** `src/app/**`, `src/components/**`, `src/features/match/**`, `src/actions/**`, `src/lib/supabase/**`, `src/schema/**`, `src/middleware.ts`, `supabase/schema.sql`.
- **Dependências:** Next 16, React 19, Tailwind v4, shadcn/ui (Radix), next-themes, `@supabase/ssr`, `@supabase/supabase-js`, react-hook-form, zod, @hookform/resolvers, sonner.
- **Infra:** Docker dev (`Dockerfile.dev`, `docker-compose.yml`); projeto Supabase provisionado via Marketplace da Vercel; variáveis de ambiente na Vercel.
- **Segurança:** RLS no banco + checagem de propriedade na Server Action (defesa em profundidade). DDL/migrations são aplicadas manualmente pelo usuário (não automatizadas).
