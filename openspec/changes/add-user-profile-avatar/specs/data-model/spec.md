# data-model — Delta Spec

## ADDED Requirements

### Requirement: Bucket de avatares com RLS por dono

O storage SHALL ter um bucket `avatars` com leitura pública e escrita restrita:
INSERT/UPDATE/DELETE de um objeto SHALL ser permitido apenas ao usuário
autenticado cuja pasta-raiz do caminho é o seu próprio id
(`(storage.foldername(name))[1] = auth.uid()::text`). A URL pública resultante é
gravada em `public.users.avatar` (coluna já existente; sem mudança de tabela).

#### Scenario: Dono envia na própria pasta

- **WHEN** um usuário autenticado envia um objeto em `avatars/<seu-id>/…`
- **THEN** a policy de INSERT permite

#### Scenario: Envio na pasta de outro é negado

- **WHEN** um usuário tenta enviar em `avatars/<id-de-outro>/…`
- **THEN** a RLS de storage nega
