# Proposal — polish-conta

## Why

A tela de Conta (`/dashboard/conta`) ficou antes do overhaul: títulos de card em
`text-lg` SEM `font-display` nem ícone (inconsistente com o `h1` e o resto do app),
avatar sem realce, e os cards `max-w-md` left-aligned dentro de um `main max-w-2xl`
(sobra à direita no desktop). Item #6 do backlog de UI ([[arena-ui-backlog]]);
mobile-first ([[feedback-mobile-pwa]]).

## What Changes

Apresentação apenas — a lógica (actions `atualizarPerfil`/`atualizarAvatar`/
`removerAvatar`/troca de senha, names dos campos, validação, `UserAvatar`) permanece
inalterada.

- **Cabeçalhos de seção consistentes**: ícone em chip (User no Perfil, KeyRound em
  Alterar senha) + título em `font-display`, no idioma de chip-de-ícone já usado.
- **Avatar com realce** (anel sutil) no `AvatarUpload`, sem tocar o `UserAvatar`.
- **Layout coerente**: cards ocupam a largura do `main` (alinha com o `h1`),
  mobile-first.

## Capabilities

Nenhuma capability nova. Adiciona um requisito de APRESENTAÇÃO da tela de conta em
`design-system` (capability que já dona `UserAvatar` e a identidade visual);
comportamento/dados/contrato inalterados.

## Impact

- **Editados**: `src/app/dashboard/conta/page.tsx` (cabeçalhos com ícone +
  font-display, largura dos cards) e `src/features/profile/components/AvatarUpload.tsx`
  (anel no avatar).
- **Sem mudança**: `UserAvatar` (+ teste), `ProfileForm`, `ChangePasswordForm`,
  actions, RLS de storage.
- **Risco**: baixo (presentational). Validar nos 2 temas + 390px (cabeçalho com
  ícone, avatar com anel, largura dos cards).
