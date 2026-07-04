## Why

Frente de HARDENING, terceira change (a que EXIGE DDL + ação do dono). Fecha
duas brechas latentes de Storage apontadas na Auditoria 2 (2026-06-23), ambas
de **confused deputy**: o browser usa a `anon` key e pode PULAR a Server Action
e falar direto com o PostgREST, então qualquer invariante que só a action
garante é burlável. As duas correções movem o invariante para a RLS de INSERT
(a fonte de verdade) e para os limites do bucket; a defesa em profundidade na
action fica como documentação do invariante.

1. **`foto_path` da evidência NÃO amarrado à pasta do autor no INSERT.** O upload
   em si já é restrito — `subirEvidencia` (`src/lib/evidence.ts:35`) constrói o
   path `<uid>/<matchId>/<uuid>.<ext>` e a policy `match_evidence_insert` de
   `storage.objects` amarra a pasta ao `auth.uid()`. Mas a COLUNA `foto_path`
   das linhas de `match_score_proposals`/`match_wo_requests` NÃO é validada na
   RLS de INSERT: um cliente que pule a action pode inserir uma linha com
   `foto_path` apontando pra pasta de OUTRO usuário. A SELECT policy do Storage
   (`match_evidence`) então concede leitura àquele objeto para quem enxerga a
   proposta/solicitação — vazando evidência cross-pasta. Achado da Auditoria 2
   ("`foto_path` do match_evidence não amarrado à pasta — forja latente").

2. **Bucket `avatars` sem `file_size_limit`/`allowed_mime_types`.** O bucket
   (`supabase/schema.sql`, seção Storage) é criado só com `(id, name,
   public=true)`. A action `atualizarAvatar` (`src/actions/profile.ts`) já valida
   tipo e tamanho (2MB; png/jpeg/webp/gif), mas — de novo — um cliente que pule a
   action pode subir arquivo arbitrário direto no Storage (qualquer MIME, qualquer
   tamanho). O bucket privado `match_evidence` já espelha esses limites no próprio
   bucket; o `avatars` não. Achado da Auditoria 2 ("avatars sem mime/size limit").

Nenhuma das duas muda o comportamento de um cliente LEGÍTIMO (a action já produz
paths no formato certo e arquivos dentro dos limites) — apenas fecha o caminho de
burla via PostgREST/Storage direto.

## What Changes

- **Amarrar `foto_path` à pasta do autor na RLS de INSERT (DDL).** Endurecer o
  `with check` de duas policies em `supabase/schema.sql`:
  - `match_score_proposals_insert_tecnico` — `foto_path` é `NOT NULL`; ACRESCENTAR
    `(storage.foldername(foto_path))[1] = (select auth.uid())::text` e
    `[2] = match_id::text`, preservando `submetido_por = (select auth.uid())` e o
    bloco de elegibilidade (partida liberada, aberta, jogador da vaga).
  - `match_wo_requests_insert_tecnico` — a foto é OPCIONAL; permitir `foto_path is
    null` OU o par de segmentos amarrado (`[1]=uid`, `[2]=match_id`), preservando a
    checagem de slot/partida/torneio ativo existente.
  O segmento `[1]` é a pasta do autor e `[2]` é o `match_id` (o path é
  `<uid>/<matchId>/<uuid>.<ext>`). NENHUM insert legítimo quebra — a action já
  emite o path nesse formato.
- **Limites do bucket `avatars` (DDL).** Trocar o `insert … on conflict (id) do
  nothing` por `on conflict (id) do update`, adicionando `file_size_limit =
  2097152` (2MB, bate com o `MAX_BYTES` da action) e `allowed_mime_types =
  {image/jpeg, image/png, image/webp, image/gif}`. `do update` (não `do nothing`)
  porque o bucket JÁ existe em prod — `do nothing` não aplicaria os limites.
  `public=true` é mantido (intencional: avatar servido por URL pública). O GIF é
  incluído porque a app aceita `image/gif` (`AvatarUpload.accept`); omiti-lo
  quebraria upload legítimo de gif.
- **Defesa em profundidade na action (sem DDL, documenta o invariante).** Em
  `proporPlacar` (`src/actions/scoreProposals.ts`) e `solicitarWO`
  (`src/actions/wo.ts`), após `subirEvidencia`, um assert
  `up.path.startsWith(<uid>/<matchId>/)` com rollback da foto órfã — o peso do fix
  está na RLS; a action já constrói o path, então o assert é guarda-corpo/doc.

## Capabilities

### Modified Capabilities
- `row-level-security`: a RLS de INSERT de `match_score_proposals` e
  `match_wo_requests` passa a amarrar `foto_path` à pasta `<uid>/<match_id>/` do
  autor (fecha o confused deputy de leitura cross-pasta); buckets públicos de
  Storage (ex.: `avatars`) passam a declarar `file_size_limit`/`allowed_mime_types`
  no próprio bucket.

### New Capabilities
<!-- Nenhuma. -->

## Impact

- **Código de aplicação:**
  - `src/actions/scoreProposals.ts` e `src/actions/wo.ts` — assert de invariante do
    path após o upload (com rollback da foto órfã em caso de violação).
- **Banco de dados:** `supabase/schema.sql` (fonte de verdade) — DDL a aplicar pelo
  dono via MCP APÓS um pré-check read-only (ver `design.md`): DROP+CREATE das duas
  policies de INSERT endurecidas + `insert … on conflict do update` do bucket
  `avatars`. A DDL NÃO é aplicada por esta change (o dono aplica; REGRA 4).
- **Segurança/autorização:** fecha dois caminhos de burla via PostgREST/Storage
  direto (forja de `foto_path` cross-pasta; upload arbitrário no `avatars`). Cliente
  legítimo não é afetado.
- **Pré-check obrigatório (bloqueia a aplicação do INSERT):** antes de endurecer as
  policies, o dono roda a query read-only de `design.md` para confirmar que NÃO há
  linha com `foto_path` fora do formato `<uid>/<match_id>/…`; se houver (`count > 0`),
  aquelas linhas bloqueariam reenvio legítimo e precisam ser tratadas antes.
- **Testes:** a suíte atual permanece integralmente VERDE. Os asserts de defesa em
  profundidade seguem o caminho feliz existente (path sempre no formato certo);
  cobertura adicional é opcional. Gate: typecheck + lint + test + build, igual ao
  baseline.
