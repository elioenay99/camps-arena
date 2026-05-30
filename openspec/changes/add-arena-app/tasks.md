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

- [ ] 2.1 Schemas Zod em `src/schema/` (matchSchema, authSchema) com formato BR (celular)
- [ ] 2.2 `supabase/schema.sql`: tabelas `users`, `tournaments`, `matches`
- [ ] 2.3 Ativar RLS e políticas (SELECT público, UPDATE restrito ao dono)
- [ ] 2.4 Provisionar Supabase via Marketplace da Vercel + envs
- [ ] 2.5 Clientes Supabase server/client em `src/lib/supabase/` (`@supabase/ssr`)
- [ ] 2.6 `src/middleware.ts` protegendo rotas administrativas
- [ ] 2.7 Login minimalista com Server Actions (Supabase Auth)
- [ ] 2.8 Revisão `@agent-backend-architect` (schema) e `@agent-security-engineer` (RLS)

## 3. Modal "Menu da Partida" (Fase 3)

- [ ] 3.1 `MatchScoreModal` (Client Component) com Dialog do shadcn
- [ ] 3.2 Cabeçalho estático + subtítulos dinâmicos via props
- [ ] 3.3 Colunas por participante com incremento/decremento (useState otimista)
- [ ] 3.4 Botões WhatsApp (`wa.me/`) com telefones via props
- [ ] 3.5 Botões "SALVAR PLACAR" e "FECHAR" com contraste no dark mode

## 4. Server Actions e Mutações (Fase 4)

- [ ] 4.1 `updateMatchScore` em `src/actions/match.ts`
- [ ] 4.2 Verificar identidade e rejeitar se não for dono da partida
- [ ] 4.3 UPDATE em `matches` + `revalidatePath('/dashboard')`
- [ ] 4.4 Conectar ao botão "SALVAR PLACAR" com `useTransition`
- [ ] 4.5 Toast de sucesso (sonner)
- [ ] 4.6 Auditoria `@agent-security-engineer` da checagem de propriedade

## 5. Páginas, Listagens e Otimização (Fase 5)

- [ ] 5.1 Página protegida `src/app/(dashboard)` (RSC) listando partidas ativas
- [ ] 5.2 `loading.tsx` com Skeleton do shadcn
- [ ] 5.3 `error.tsx` amigável e seguro
- [ ] 5.4 `.env.example` final (público + secreto + propriedades do site)
- [ ] 5.5 `/sc:analyze` qualidade + `/sc:test` integração
- [ ] 5.6 Documentação de deploy na Vercel (envs + logs)
- [ ] 5.7 Commits convencionais por entrega + encerramento de sessão
