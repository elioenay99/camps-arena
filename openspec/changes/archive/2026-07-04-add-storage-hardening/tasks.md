## 0. Baseline primeiro

- [x] 0.1 Baseline HEAD `e80158c`: `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test`
  ✓, `pnpm build` ✓. Zero falhas pré-existentes (verde final = igual ao baseline).

## 1. `foto_path` amarrado à pasta do autor na RLS de INSERT (DDL)

- [x] 1.1 Confirmar por leitura do schema os nomes de coluna: `match_score_proposals`
  tem `submetido_por` e `match_id` (`foto_path` `NOT NULL`); `match_wo_requests` tem
  `solicitante_slot` (→ `tournament_slots.user_id`) e `match_id` (`foto_path` opcional).
- [x] 1.2 `match_score_proposals_insert_tecnico`: ACRESCENTAR ao `with check`
  `(storage.foldername(foto_path))[1] = (select auth.uid())::text` e
  `[2] = match_id::text`, preservando `submetido_por = (select auth.uid())` e o bloco
  de elegibilidade.
- [x] 1.3 `match_wo_requests_insert_tecnico`: ACRESCENTAR ao `with check`
  `foto_path is null OR (segmentos [1]=uid, [2]=match_id amarrados)`, preservando a
  checagem de slot/partida/torneio ativo.
- [x] 1.4 Confirmar que o path que a action emite (`src/lib/evidence.ts:35`,
  `<uid>/<matchId>/<uuid>.<ext>`) satisfaz os dois segmentos — nenhum insert legítimo
  quebra.

## 2. Limites do bucket `avatars` (DDL)

- [x] 2.1 Trocar o `insert into storage.buckets ('avatars', …) on conflict (id) do
  nothing` por `on conflict (id) do update`, adicionando `file_size_limit = 2097152`
  e `allowed_mime_types = {image/jpeg, image/png, image/webp, image/gif}`.
- [x] 2.2 Manter `public = true`. Confirmar que 2097152 = 2MB bate com `MAX_BYTES` de
  `src/actions/profile.ts` e que os MIMEs batem com `AvatarUpload.accept` (inclui gif).

## 3. Defesa em profundidade nas actions (sem DDL)

- [x] 3.1 `proporPlacar` (`src/actions/scoreProposals.ts`): após `subirEvidencia`,
  assert `up.path.startsWith(`${user.id}/${matchId}/`)` com rollback da foto órfã.
- [x] 3.2 `solicitarWO` (`src/actions/wo.ts`): idem, `up.path.startsWith(`${user.id}/${m.data}/`)`
  dentro do bloco que só roda quando há foto.

## 4. Pré-check p/ o orquestrador (documentar; NÃO rodar em prod)

- [x] 4.1 Escrever em `design.md` a query read-only de pré-check para as duas tabelas
  (autor de `match_wo_requests` = `user_id` do slot solicitante), a ser rodada pelo dono
  ANTES de aplicar a DDL do INSERT (deve retornar `0`).

## 5. Validação no Postgres efêmero (docker) + gate

- [x] 5.1 Aplicar `supabase/schema.sql` no `postgres:17` via docker pelo MESMO fluxo do
  job `schema` do CI (`ci-bootstrap.sql` + passe 1 tolerante + passe 2 estrito +
  `local-grants.sql`) — confirma sintaxe + idempotência das policies/bucket novos.
  Derrubar o container.
- [x] 5.2 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` — VERDE do lado do
  specialist (igual ao baseline 0.1). O orquestrador roda o gate autoritativo.
- [ ] 5.3 Revisão adversarial do diff. (ORQUESTRADOR)
- [x] 5.4 `openspec validate add-storage-hardening --strict` = valid.

## 6. Aplicação da DDL (DONO — fora desta change)

- [ ] 6.1 Rodar o pré-check (task 4.1) em prod; confirmar `0` em ambas as queries.
- [ ] 6.2 Aplicar o BLOCO SQL (2 policies DROP+CREATE + insert do bucket) em prod via
  MCP após aprovação. NÃO é feito por esta change (REGRA 4).
