## 1. Fundação e Design System (Fase 1)

- [x] 1.1 Scaffold Next.js 16 (App Router, `src/`, TypeScript strict)
- [x] 1.2 Tailwind v4 + shadcn/ui (base Radix, CSS variables, base neutra)
- [x] 1.3 Componentes shadcn: button, card, dialog, input, label, form, sonner
- [x] 1.4 ThemeProvider (next-themes) com dark padrão + toggle e Toaster no layout
- [x] 1.5 Idioma base pt-BR no `<html>` e metadados
- [x] 1.6 Ambiente Docker de dev (Dockerfile.dev, docker-compose.yml, .dockerignore)
- [x] 1.7 `.env.example` com variáveis públicas/secretas
- [x] 1.8 Validar build de produção e typecheck

## 2. Dados, Supabase e Autenticação (Fase 2)

- [x] 2.1 Schemas Zod em `src/schema/` (matchSchema, authSchema) com formato BR (celular)
- [x] 2.2 `supabase/schema.sql`: tabelas `users`, `tournaments`, `matches` (+ enums, triggers, view users_public)
- [x] 2.3 Ativar RLS e políticas (SELECT público em matches, UPDATE restrito ao participante + trava de reatribuição; users só logado + view pública sem PII)
- [ ] 2.4 Provisionar Supabase via Marketplace da Vercel + envs (handoff guiado ao usuário)
- [x] 2.5 Clientes Supabase server/client em `src/lib/supabase/` (`@supabase/ssr`)
- [x] 2.6 `src/proxy.ts` (convenção Next 16; ex-middleware) protegendo `/dashboard`
- [x] 2.7 Login minimalista com Server Actions (Supabase Auth) + stub `/dashboard` com logout
- [x] 2.8 Revisão `@agent-backend-architect` (schema) e `@agent-security-engineer` (RLS) via workflow

## 3. Modal "Menu da Partida" (Fase 3)

- [x] 3.1 `MatchScoreModal` (Client Component) com Dialog do shadcn
- [x] 3.2 Cabeçalho estático + subtítulos dinâmicos via props (título acessível = a partida)
- [x] 3.3 Colunas por participante com incremento/decremento (useState otimista, a11y)
- [x] 3.4 Botões WhatsApp (`wa.me/`) com telefones via props (DDI BR por comprimento)
- [x] 3.5 Botões "SALVAR PLACAR" e "FECHAR" com contraste WCAG AA no dark mode

## 4. Server Actions e Mutações (Fase 4)

- [x] 4.1 `updateMatchScore` em `src/actions/match.ts`
- [x] 4.2 Verificar identidade (`getUser`) e rejeitar se não for dono da partida
- [x] 4.3 UPDATE em `matches` (só placares) + `.select()` de confirmação + `revalidatePath('/dashboard')`
- [x] 4.4 Conectar "SALVAR PLACAR" via `useTransition` no modal + wrapper client `MatchScoreModalConnected`
- [x] 4.5 Toast de sucesso (sonner) no salvamento real
- [x] 4.6 Auditoria de segurança (workflow adversarial multi-agente) da checagem de propriedade

## 5. Páginas, Listagens e Otimização (Fase 5)

- [x] 5.1 Página protegida `/dashboard` (RSC) listando partidas ativas (query com embed, MatchCard, estado vazio)
- [x] 5.2 `loading.tsx` com Skeleton do shadcn (espelha o card, sem CLS)
- [x] 5.3 `error.tsx` amigável e seguro (`unstable_retry`, só `digest`, sem vazar detalhes)
- [x] 5.4 `.env.example` final (público + secreto + URL canônica do site)
- [x] 5.5 Análise de qualidade (workflows adversariais) + testes (vitest): action `updateMatchScore`, schema e `getActiveMatches` cobertos (24 testes). Validação live no browser fica como follow-up (depende de schema aplicado + seed)
- [x] 5.6 Documentação de deploy na Vercel (`docs/deploy-vercel.md` — envs + schema manual + logs)
- [ ] 5.7 Commits convencionais por entrega (Fase 5 commitada); encerramento/archive pendente (handoff 2.4)
