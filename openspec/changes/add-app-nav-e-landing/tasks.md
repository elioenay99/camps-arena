## 1. Shell autenticado

- [ ] 1.1 `src/features/nav/components/NavLinks.tsx` (client): links com aria-current por pathname
- [ ] 1.2 `src/app/dashboard/layout.tsx`: header (marca, NavLinks, ModeToggle, Sair via logout)
- [ ] 1.3 Remover headers duplicados: `dashboard/page.tsx` (marca+Sair), `torneios/[id]/page.tsx` (marca+voltar), boundaries (`dashboard/loading|error|not-found`, `torneios/[id]/loading|error`)

## 2. Landing

- [ ] 2.1 `src/app/page.tsx`: logado → redirect /dashboard; visitante → hero + destaques + CTAs Criar conta/Entrar (remove demo)

## 3. Validação

- [ ] 3.1 `pnpm typecheck && pnpm lint && pnpm test` verdes
- [ ] 3.2 `openspec validate add-app-nav-e-landing --strict`
- [ ] 3.3 Workflow de validação adversarial + veredito; aplicar must_fix/should_fix
- [ ] 3.4 `pnpm build` verde
