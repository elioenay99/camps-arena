# Proposal — add-user-profile-avatar

## Why

A coluna `public.users.avatar` existe e a view `users_public` já a expõe, mas
NADA no app deixa o usuário editar o próprio perfil (nome, celular) nem definir
uma foto — `avatar` nasce nulo (o cadastro não envia) e fica assim para sempre.
As superfícies que mostram pessoas (participantes, classificação, técnico das
vagas, cards/modal de partida) exibem só texto, sem identidade visual.

## What Changes

- **Foto de perfil (Supabase Storage)**: bucket público `avatars`; cada usuário
  envia/troca/remove a própria foto numa pasta `<uid>/` (RLS por pasta). Upload
  via Server Action (arquivo no FormData → `supabase.storage`), com
  `serverActions.bodySizeLimit` e validação de tipo/tamanho.
- **Edição de perfil**: action `atualizarPerfil` (nome, celular) sobre
  `public.users` do próprio usuário; `atualizarAvatar`/`removerAvatar` para a
  foto. `profileSchema` (Zod) reusa o `celularBR`.
- **Página `/dashboard/conta`** ganha a seção **Perfil** (foto + nome + celular)
  acima da seção **Senha** já existente — uma única área de conta.
- **`UserAvatar`** (componente reutilizável, espelha o `TeamCrest`): foto via
  `next/image` com fallback de iniciais + cor estável.
- **Avatar em toda superfície**: header (avatar do usuário logado linkando para
  `/dashboard/conta`), lista de participantes, classificação (avulso), técnico
  das vagas, cards e modal de partida. Os fetchers passam a projetar `avatar`.
- **next.config**: libera o host do Supabase Storage em `images.remotePatterns`
  e define `serverActions.bodySizeLimit`.
- **DDL manual**: nova seção nas pendências (bucket `avatars` + policies de
  `storage.objects`).

## Capabilities

### Modified Capabilities

- `auth`: edição do próprio perfil (nome/celular) e da foto (upload/remoção)
  pelo usuário autenticado.
- `data-model`: bucket de storage `avatars` e suas policies por pasta de dono.
- `design-system`: componente `UserAvatar` (foto + fallback de iniciais).
- `dashboard`: seção Perfil na página de Conta; avatar do usuário no header.

## Impact

- **Storage**: 1 bucket novo (+policies). `users.avatar` já existe — sem mudança
  de tabela. Nenhuma alteração em RLS de tabelas existentes.
- **Config**: `next.config` (1 remotePattern + bodySizeLimit).
- **Código**: `profileSchema`, `profile.ts` (3 actions), `getPerfil`,
  `UserAvatar`, `ProfileForm`/`AvatarUpload`; fetchers de participantes/vagas/
  classificação projetam `avatar`; 6 superfícies passam a exibir `UserAvatar`.
- **Não muda**: login, cadastro, recuperação/troca de senha, motores, W.O.
