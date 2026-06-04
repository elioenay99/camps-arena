## 1. Shell autenticado

- [x] 1.1 `src/features/nav/components/NavLinks.tsx` (client): links com aria-current por pathname
- [x] 1.2 `src/app/dashboard/layout.tsx`: header (marca, NavLinks, ModeToggle, Sair via logout)
- [x] 1.3 Remover headers duplicados: `dashboard/page.tsx` (marca+Sair), `torneios/[id]/page.tsx` (marca+voltar), boundaries (`dashboard/loading|error|not-found`, `torneios/[id]/loading|error`)

## 2. Landing

- [x] 2.1 `src/app/page.tsx`: logado → redirect /dashboard; visitante → hero + destaques + CTAs Criar conta/Entrar (remove demo)

## 3. Validação

- [x] 3.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [x] 3.2 `openspec validate add-app-nav-e-landing --strict`
- [x] 3.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [x] 3.4 `pnpm build` verde
