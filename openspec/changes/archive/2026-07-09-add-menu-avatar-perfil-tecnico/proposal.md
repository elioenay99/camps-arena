## Why

O avatar no header hoje é um `<Link>` simples para `/dashboard/conta`
(`src/app/dashboard/layout.tsx:60-73`), e o "Sair" é um botão solto ao lado. Não
há caminho no header para o usuário chegar ao PRÓPRIO perfil de técnico (a carreira
recém-criada em `add-perfil-tecnico-carreira`) — ele só existe em
`/dashboard/ligas/tecnico/[userId]`, alcançável hoje só via links de terceiros.

O dono quer acessar a própria carreira a partir do avatar. Decisão dele (escolhida
entre 3 opções): **o avatar vira um menu** com "Meu perfil de técnico", "Conta" e
"Sair" — a carreira mora na página dedicada (nada duplicado na Conta, que segue só
de ajustes).

## What Changes

- **Avatar do header vira um MENU (Popover).** Substitui o `<Link href=
  "/dashboard/conta">` que envolve o `UserAvatar` por um novo componente client
  `AccountMenu` que abre um menu ancorado no avatar com três itens:
  - **Meu perfil de técnico** → `/dashboard/ligas/tecnico/${userId}` (o próprio
    `auth.uid()`, já disponível via `getPerfil().id`).
  - **Conta** → `/dashboard/conta` (o destino atual do avatar).
  - **Sair** → a server action `logout` (hoje o botão solto), agora DENTRO do menu.
- **Header enxuga.** O botão "Sair" solto sai do header e passa a ser o item "Sair"
  do menu; o `ModeToggle` (tema) permanece solto ao lado do avatar.
- **Reuso do Popover existente (sem dependência nova).** Usa `src/components/ui/
  popover.tsx` (Radix Popover já instalado) — NÃO adiciona `@radix-ui/react-dropdown-menu`,
  coerente com a higiene de dependências. Itens são folhas nativamente focáveis
  (`<Link>` e o `<form action={logout}>`), com o gatilho rotulado (`aria-label`),
  navegáveis por teclado, fecháveis por Escape/click-fora (comportamento do Popover).
- **Sem mudança de dados/rota/permissão.** `layout.tsx` já busca `perfil` via
  `getPerfil()` e passa `nome`/`avatar`; agora passa também `userId = perfil.id`. A
  página de técnico já trata o caso "sem histórico" (estado vazio) — um usuário sem
  passagens vê o próprio perfil vazio, sem 404 (a own-row é sempre legível).

## Capabilities

### Modified Capabilities
- `app-shell`: a entrada de conta no header deixa de ser um link único para o avatar
  e passa a ser um MENU (Meu perfil de técnico / Conta / Sair); "Sair" migra do botão
  solto para dentro do menu.

## Impact

- **Código de aplicação:**
  - `src/features/nav/components/AccountMenu.tsx` (NOVO, `"use client"`): Popover com
    gatilho = `UserAvatar` (size 32, no mesmo alvo redondo de 44px) e conteúdo com os
    três itens; ícones lucide (perfil/ajustes/sair). Props `{ userId: string; nome:
    string | null; avatar: string | null }`. Importa `logout` de `@/actions/auth`.
  - `src/app/dashboard/layout.tsx` (ALTERA): troca o bloco `<Link…><UserAvatar…></Link>`
    + `<form action={logout}>` por `<AccountMenu userId={perfil.id} nome={perfil.nome}
    avatar={perfil.avatar} />`; mantém `ModeToggle` ao lado.
- **Banco de dados:** NENHUM. Zero DDL, zero query nova. Só navegação/UI.
- **Dependências:** NENHUMA nova (reusa `popover.tsx`).
- **Acessibilidade/mobile:** gatilho com `aria-label` ("Sua conta"), alvo de toque
  44px; itens com alvo 44px (`min-h-11`) e foco visível; menu alinhado ao fim
  (`align="end"`); funciona no mobile (o avatar já aparece no header mobile).
- **Testes (vitest, jsdom):** `AccountMenu.test.tsx` — os três itens presentes; o
  link de "Meu perfil de técnico" aponta para `/dashboard/ligas/tecnico/<userId>`; o
  de "Conta" para `/dashboard/conta`; o "Sair" é um `<form>` com a action de logout.
  Suíte atual permanece verde.
