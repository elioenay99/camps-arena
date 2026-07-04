# Design — add-storage-hardening

## Contexto

O app fala com o Supabase pelo browser usando a `anon` key. Toda mutação passa
por Server Actions, mas o cliente pode PULAR a action e chamar o PostgREST/Storage
diretamente com a `anon` key. Logo, qualquer invariante que só a action garante é
burlável; a barreira real é a RLS (`storage.objects` + as tabelas) e os limites do
bucket. Esta change move dois invariantes de Storage para essa barreira.

## Decisão 1 — `foto_path` amarrado à pasta do autor na RLS de INSERT

`storage.foldername(path)` devolve os segmentos de PASTA (o path sem o nome do
arquivo). Para `<uid>/<matchId>/<uuid>.<ext>`: `[1] = uid`, `[2] = matchId`. O
upload já é restrito pela policy `match_evidence_insert` (a pasta `[1]` tem de ser
`auth.uid()`), mas a COLUNA `foto_path` da linha inserida em
`match_score_proposals`/`match_wo_requests` não era validada — o furo.

- **`match_score_proposals_insert_tecnico`**: `foto_path` é `NOT NULL`, então o
  `with check` sempre valida os dois segmentos:
  `(storage.foldername(foto_path))[1] = (select auth.uid())::text and
   (storage.foldername(foto_path))[2] = match_id::text`.
- **`match_wo_requests_insert_tecnico`**: a foto é OPCIONAL, então
  `foto_path is null OR (segmentos amarrados)`.

O autor de uma linha de `match_wo_requests` NÃO tem coluna própria de uid: é o
`user_id` do `tournament_slots` referenciado por `solicitante_slot`. A policy de
INSERT já exige `s.user_id = auth.uid()` para o `solicitante_slot`, então
`[1] = (select auth.uid())::text` é o critério correto e coerente (a pasta é a do
usuário logado, que é o dono do slot solicitante). Isso importa para o pré-check
abaixo (a query junta `tournament_slots` para achar o autor).

Por que na RLS e não só na action: a action é burlável via PostgREST direto; a RLS
não. O assert na action (Decisão 3) é apenas documentação do invariante.

## Decisão 2 — Limites do bucket `avatars`

Espelhar o bucket privado `match_evidence`, que já declara
`file_size_limit`/`allowed_mime_types` no próprio bucket. O `avatars` é PÚBLICO
(mantido — o avatar é servido por URL pública), mas ganha:

- `file_size_limit = 2097152` (2 MiB), batendo com `MAX_BYTES = 2 * 1024 * 1024`
  em `src/actions/profile.ts`.
- `allowed_mime_types = {image/jpeg, image/png, image/webp, image/gif}`, batendo
  com `EXTENSAO_POR_TIPO` da action e o `accept` de `AvatarUpload.tsx`.

`on conflict (id) do update` (não `do nothing`): o bucket já existe em prod desde a
feature de avatar, então `do nothing` NÃO aplicaria os limites a uma linha
pré-existente.

## Decisão 3 — Defesa em profundidade na action

`subirEvidencia` já constrói o path `<uid>/<matchId>/<uuid>.<ext>`, então o assert
`up.path.startsWith(`${user.id}/${matchId}/`)` nunca falha no caminho feliz. Serve
para: (a) documentar o invariante no ponto de uso; (b) falhar cedo (com rollback da
foto órfã) se `subirEvidencia` mudar no futuro. É barato e idiomático (segue o
padrão de rollback já presente nas duas actions). Não substitui a RLS.

## Pré-check ANTES de aplicar o INSERT endurecido (read-only)

Endurecer o `with check` do INSERT rejeitaria qualquer INSERT futuro cujo
`foto_path` não bata com `<uid>/<match_id>/…`. Um reenvio legítimo re-insere com um
path novo (sempre no formato certo), então clientes legítimos não quebram. Ainda
assim, confirmar que NÃO há hoje linha fora do formato (que indicaria dado legado
inesperado) — rodar em prod ANTES de aplicar a DDL do INSERT:

```sql
-- match_score_proposals: autor = coluna submetido_por
select count(*) from public.match_score_proposals
  where foto_path is not null and (
    (storage.foldername(foto_path))[1] is distinct from submetido_por::text
    or (storage.foldername(foto_path))[2] is distinct from match_id::text);

-- match_wo_requests: autor = user_id do slot solicitante (sem coluna de autor própria)
select count(*) from public.match_wo_requests r
  join public.tournament_slots s on s.id = r.solicitante_slot
  where r.foto_path is not null and (
    (storage.foldername(r.foto_path))[1] is distinct from s.user_id::text
    or (storage.foldername(r.foto_path))[2] is distinct from r.match_id::text);
```

Ambas devem retornar `0`. Se `> 0`, tratar aquelas linhas (ou aceitar que o reenvio
as substitui) ANTES de aplicar a policy — do contrário o dono daquelas linhas não
consegue reenviar. O bucket `avatars` não precisa de pré-check (o `do update` só
seta limites; objetos existentes não são revalidados retroativamente pelo Storage).

## Validação

Aplicar `supabase/schema.sql` num Postgres cru e efêmero pelo MESMO fluxo do job
`schema` do CI (`docker run --rm postgres:17` + `ci-bootstrap.sql` + passe 1
tolerante + passe 2 estrito + `local-grants.sql`) confirma sintaxe e idempotência
das policies e do bucket novos. Gate mecânico: `pnpm typecheck && pnpm lint &&
pnpm test && pnpm build` verde, igual ao baseline do HEAD.
