# auth — Delta Spec

## ADDED Requirements

### Requirement: Edição do próprio perfil

O usuário AUTENTICADO SHALL editar o próprio nome e celular em
`/dashboard/conta`. A action `atualizarPerfil` SHALL validar (nome ≥ 2, celular
no formato brasileiro) e gravar apenas sobre a linha de `public.users` do
próprio usuário (`id = auth.uid()`); nunca a de outro.

#### Scenario: Atualiza nome e celular

- **WHEN** o usuário salva nome e celular válidos
- **THEN** `public.users` do próprio usuário é atualizado e o app confirma

#### Scenario: Celular inválido é rejeitado

- **WHEN** o celular não está no formato brasileiro
- **THEN** a validação rejeita sem gravar

### Requirement: Foto de perfil do usuário

O usuário AUTENTICADO SHALL enviar, trocar e remover a própria foto de perfil.
A action `atualizarAvatar` SHALL aceitar apenas imagem dentro do limite de
tamanho, enviá-la ao bucket `avatars` na pasta do próprio usuário e gravar a URL
pública em `public.users.avatar`; `removerAvatar` SHALL apagar o arquivo e zerar
a coluna. Uploads SHALL respeitar a RLS de storage (cada um só na própria pasta).

#### Scenario: Envia uma foto válida

- **WHEN** o usuário envia uma imagem dentro do limite
- **THEN** a foto vai para `avatars/<uid>/…` e `users.avatar` recebe a URL

#### Scenario: Arquivo não-imagem ou grande demais

- **WHEN** o arquivo não é imagem ou excede o limite
- **THEN** o upload é recusado e `users.avatar` não muda
