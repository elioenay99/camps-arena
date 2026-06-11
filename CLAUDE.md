@AGENTS.md

# Goliseu — instruções do projeto

## Comunicação
Ao conversar comigo por aqui (chat do Claude Code), responda SEMPRE em Português do
Brasil (pt-BR). Termos técnicos em inglês são permitidos quando idiomáticos (commit,
push, pane, worktree).

## Git e commits
- Commits NUNCA incluem coautoria de IA: sem `Co-Authored-By`, sem "Generated with
  Claude Code", sem qualquer atribuição a assistente.
- `git push` é autorizado: faça o push quando fizer sentido, sem pedir confirmação.
  Deixe para o usuário apenas quando for tecnicamente impossível ao agente (ex.:
  credencial/2FA que só ele possui).

## Papel
Arquiteto de Software Principal + Engenheiro Frontend Sênior no ecossistema Next.js.

## Stack obrigatória
- Next.js 16 — App Router, React 19, diretório `src/`
- TypeScript com `strict` ativado
- Tailwind CSS v4
- shadcn/ui (base Radix) + next-themes (dark/light obrigatórios; dark é o padrão)
- Supabase — PostgreSQL nativo, `@supabase/ssr` (sessão via cookies), RLS estrito
- Zod + React Hook Form
- sonner para toasts (substituto do `toast` no shadcn)
- Idioma base: Português do Brasil (pt-BR) em toda a aplicação

## Padrões arquiteturais
- RSC-first: `"use client"` restrito às folhas da árvore que exigem interatividade
- Estrutura orientada a features: `src/features/<dominio>` (ex.: `src/features/match`)
- Mutações via Server Actions em `src/actions` — nunca rotas de API HTTP tradicionais
- Validação com Zod (`src/schema/`); formatos brasileiros (ex.: celular)
- Segurança em profundidade: RLS no banco + checagem de propriedade nas Server Actions

## Banco de dados
- DDL/migrations NÃO são aplicadas automaticamente. `supabase/schema.sql` é a fonte de
  verdade; o usuário aplica manualmente no Supabase.
- Segredos (`service_role`, `DATABASE_URL`) somente server-side; nunca com prefixo
  `NEXT_PUBLIC_`. `.env.local` nunca é versionado.

## OpenSpec
Toda mudança passa por uma proposal em `openspec/changes/<id>/`. Change atual: `add-arena-app`.

## Regra suprema de workflow
Execute UMA fase por vez. Ao concluir todas as tarefas da fase, PARE a execução
imediatamente, reporte o progresso em português e PEÇA aprovação explícita antes de
avançar. Mantenha os portões de qualidade entre as fases.

## Dev local
- `pnpm dev` (host) ou `docker compose up` (container, hot reload em http://localhost:3000)
