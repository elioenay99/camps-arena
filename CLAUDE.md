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
NÃO pausar entre fases pedindo aprovação humana. O fluxo é:
1. **OpenSpec**: criar a proposal da mudança (`openspec/changes/<id>/` —
   proposal/design/tasks/specs).
2. **Verificação por WORKFLOW**: disparar um workflow que revisa a proposal — faz
   sentido? escopo coerente? riscos/edge cases cobertos?
3. **Se o workflow aprovar** (sem devoluções/changes_required): **IMPLEMENTAR TUDO
   de uma vez, sem pausar**. Se devolver, corrigir a proposal e re-verificar.
Manter os portões de QUALIDADE (typecheck/lint/test/build + revisão adversarial por
workflow) antes de commitar — são gates AUTOMÁTICOS, não pausas para o humano.
Únicas paradas que ainda exigem o humano: decisões de PRODUTO genuínas
(AskUserQuestion) e mostrar o SQL antes de aplicar DDL em produção (REGRA 4 + grant
de MCP). Tudo o mais é autônomo.

## Dev local
- `pnpm dev` (host) ou `docker compose up` (container, hot reload em http://localhost:3000)
