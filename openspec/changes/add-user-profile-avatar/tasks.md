# Tasks — add-user-profile-avatar

## 1. Storage e config (fonte de verdade + pendências)

- [ ] 1.1 `supabase/schema.sql`: seção Storage — bucket `avatars` (público) +
      policies de `storage.objects` (SELECT público; INSERT/UPDATE/DELETE só na
      pasta `<auth.uid()>/`).
- [ ] 1.2 `docs/pendencias-manuais.md`: nova seção (Run único do bucket+policies).
- [ ] 1.3 `next.config.ts`: `images.remotePatterns` libera o Supabase Storage;
      `experimental.serverActions.bodySizeLimit`.

## 2. Schema, actions e fetcher

- [ ] 2.1 `authSchema.ts`: `profileSchema` (nome ≥2, celular `celularBR`).
- [ ] 2.2 `src/actions/profile.ts`: `atualizarPerfil` (nome/celular),
      `atualizarAvatar` (upload validado → `users.avatar`), `removerAvatar`.
- [ ] 2.3 `src/features/profile/data/getPerfil.ts`: lê id/nome/celular/avatar do
      usuário logado.

## 3. Componente reutilizável

- [ ] 3.1 `UserAvatar` (foto via next/image + fallback iniciais/cor estável).

## 4. Página de Conta — seção Perfil

- [ ] 4.1 `ProfileForm` (nome/celular) + `AvatarUpload` (preview + enviar/remover).
- [ ] 4.2 `/dashboard/conta`: seção Perfil acima da seção Senha.

## 5. Avatar nas superfícies (varredura completa)

- [ ] 5.1 Header (`dashboard/layout.tsx`): avatar do usuário → `/dashboard/conta`.
- [ ] 5.2 Fetchers projetam `avatar`: participantes, vagas (técnico),
      classificação (avulso).
- [ ] 5.3 Render `UserAvatar`: ParticipantsSection, StandingsTable (avulso),
      VagasSection (técnico), MatchCard + MatchScoreModal.

## 6. Testes e validação

- [ ] 6.1 `authSchema.test.ts`: profileSchema (válido, nome curto, celular inválido).
- [ ] 6.2 `profile.test.ts`: atualizarPerfil (gate dono, validação), atualizarAvatar
      (tipo/tamanho/sucesso), removerAvatar.
- [ ] 6.3 `UserAvatar` (foto vs fallback) + render nas superfícies.
- [ ] 6.4 Gates: typecheck/lint/test/build.
- [ ] 6.5 Validação visual no app (perfil: trocar nome + enviar foto; avatar no
      header e nas listas).
- [ ] 6.6 Commit + push + CI + archive + AVISAR seção de DDL manual.
