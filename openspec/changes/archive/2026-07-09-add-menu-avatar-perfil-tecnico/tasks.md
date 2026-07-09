# Tasks — add-menu-avatar-perfil-tecnico

## 0. Baseline
- [ ] 0.1 `pnpm typecheck && pnpm lint && pnpm test` (guardar contagem) — verde final
  = zero falhas novas vs. baseline.

## 1. AccountMenu (novo componente client)
- [ ] 1.1 `src/features/nav/components/AccountMenu.tsx` (`"use client"`): Popover
  (reusa `@/components/ui/popover`) com gatilho = `UserAvatar` (size 32) dentro de um
  botão redondo 44px com `aria-label="Sua conta"` (mesmo estilo do avatar atual).
  Props `{ userId: string; nome: string | null; avatar: string | null }`.
- [ ] 1.2 Conteúdo do menu (align="end"), itens com alvo 44px (`min-h-11`), foco
  visível, pt-BR, ícones lucide:
  - "Meu perfil de técnico" → `<Link href={`/dashboard/ligas/tecnico/${userId}`}>`
  - "Conta" → `<Link href="/dashboard/conta">`
  - separador
  - "Sair" → `<form action={logout}>` com `<button>` (importa `logout` de
    `@/actions/auth`).
- [ ] 1.3 Fechar o Popover ao navegar (clicar num Link) — controlar `open` ou usar
  `onClick` que fecha; garantir Escape/click-fora (nativo do Popover). Sem cor
  hardcoded (tokens), legível nos 2 temas.

## 2. Header — `src/app/dashboard/layout.tsx`
- [ ] 2.1 Substituir o bloco `<Link href="/dashboard/conta">…<UserAvatar…></Link>` +
  o `<form action={logout}>` (botão Sair solto) por
  `<AccountMenu userId={perfil.id} nome={perfil.nome ?? null} avatar={perfil.avatar ?? null} />`.
  Manter `<ModeToggle />` ao lado. Remover imports que ficarem órfãos (logout/UserAvatar
  se não usados mais no layout).

## 3. Testes
- [ ] 3.1 `AccountMenu.test.tsx` (jsdom): abre o menu; os 3 itens presentes;
  "Meu perfil de técnico" → href `/dashboard/ligas/tecnico/<userId>`; "Conta" → href
  `/dashboard/conta`; "Sair" dentro de um `<form>` (action de logout). Mockar `logout`.

## 4. Gate
- [ ] 4.1 `openspec validate add-menu-avatar-perfil-tecnico --strict` = valid.
- [ ] 4.2 `pnpm typecheck && pnpm lint && pnpm test` verdes (vs. baseline).
- [ ] 4.3 `pnpm build` verde. (`pnpm test:rls` inalterado — zero DDL.)
- [ ] 4.4 Validação visual 390px + desktop, 2 temas (abrir menu, itens, navegação,
  logout). Requer login (pendência do dono se o agente não puder logar).
