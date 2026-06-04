## Why

Pedido direto do usuário (2026-06-04): "por que eu ainda tenho que ir pela URL?". Hoje a navegação entre páginas autenticadas depende de digitar URL ou de botões avulsos espalhados; e a raiz `/` ainda mostra a página-demo "Fundação pronta" da fase 0 — um visitante não autenticado não tem apresentação do produto nem caminho para cadastro/login.

## What Changes

- **Shell autenticado** (`src/app/dashboard/layout.tsx`, novo): header persistente em TODAS as páginas do segmento `/dashboard` — marca ARENA (link ao painel), navegação (Painel / Novo torneio / Nova partida) com estado ativo (`aria-current`), alternador de tema e botão Sair (Server Action `logout`). Páginas e boundaries do segmento perdem seus headers próprios (a marca/logout saem de `dashboard/page.tsx`; os spans "ARENA" saem de loading/error/not-found — com o layout persistente eles duplicariam).
- **Landing page** (`/`): substitui a página-demo. Visitante vê hero de apresentação do sistema + destaques (torneios com pontuação própria, partidas com placar ao vivo, classificação com desempate automático) + CTAs "Criar conta" e "Entrar". **Usuário logado em `/` é redirecionado ao `/dashboard`** (a landing é só para visitantes).
- **`NavLinks`** (folha client mínima): `usePathname` para `aria-current="page"` no link ativo — única interatividade do shell; o restante permanece RSC.

## Capabilities

### New Capabilities
- `app-shell`: navegação autenticada persistente + landing pública.

## Impact

- **Código**: `src/app/dashboard/layout.tsx` (novo), `src/features/nav/components/NavLinks.tsx` (novo, client), `src/app/page.tsx` (reescrita), e remoção dos headers duplicados em `dashboard/page.tsx`, `dashboard/loading.tsx`, `dashboard/error.tsx`, `dashboard/not-found.tsx`, `torneios/[id]/page.tsx`, `torneios/[id]/loading.tsx`, `torneios/[id]/error.tsx`.
- **Banco**: NENHUMA mudança. Sem pendência manual.
- **Comportamento preservado**: middleware continua mandando não-logado de rota protegida para `/login?redirectTo=...` (sem fricção extra — a landing é a porta de quem chega em `/`); páginas de auth e `/atualizar-senha` ficam fora do shell (fluxos focados).
- **Removido**: modal-demo da raiz (era da fase de fundação; o golden path real existe desde o Tier 1).
- **Fora de escopo**: menu hambúrguer/drawer mobile (o nav é compacto o bastante para flex-wrap); avatar/perfil no header (Tier 3); breadcrumbs.
