## Context

Capability `team-search`: `selectTeam` (`src/actions/teams.ts`) cacheia o clube na
tabela global `public.teams` (idempotente por `provider+external_id`); o render
(classificação/pirâmide/partida) lê `teams.escudo_url` do banco. Hoje esse valor é a
URL do CDN da api-sports (a CHECK `teams_escudo_url_dominio` força o host
`media.api-sports.io`), então a IMAGEM do escudo é hotlinkada de terceiro em todo
carregamento. Restrições do projeto: DDL é manual (`supabase/schema.sql` é a fonte;
o dono aplica), segredos só server-side, RLS estrita. O bucket público `avatars`
(`schema.sql`) é o precedente de Storage self-hostado, com hardening (sem SELECT
ampla, escrita por RLS). `next.config.ts` já libera o host do Storage em
`remotePatterns`; a CSP `img-src` já cobre `supabaseHttps`.

## Goals / Non-Goals

**Goals:**
- Servir o escudo do NOSSO Storage: cortar o hotlink do CDN de terceiro no render.
- Migrar novos (via `selectTeam`) e legados (via backfill) sem regressão.
- Non-fatal: falha de rehost nunca bloqueia o cache do clube.
- Defesa em profundidade: bucket com limites + CHECK no banco alinhada.

**Non-Goals:**
- Cores do clube (não vêm da API; `normalizar` só lê id/name/logo).
- Remover o ramo api-sports da CHECK/CSP/next.config (follow-up pós-backfill 100%).
- Mexer em `searchTeams` (a busca segue lendo o logo do CDN; só a MATERIALIZAÇÃO
  muda).

## Decisions

### D1 — Rehost no `selectTeam` ANTES do INSERT (não UPDATE pós-insert)
`public.teams` só tem policy de INSERT via RLS (o cache é INSERT idempotente; sem
UPDATE/DELETE). Um UPDATE pós-insert para trocar a URL seria negado a
anon/authenticated. Logo, o rehost roda ANTES do INSERT e a URL final entra já na
inserção. Só para clube NOVO (o guard `existente` retorna cedo), garantindo
idempotência — clube já cacheado não re-baixa/re-hospeda.

### D2 — Helper `rehospedarEscudo` NON-FATAL, testável
Extraído em `src/lib/escudos.ts` (`(supabase, externalId, origemUrl) => Promise<string>`):
baixa a origem com timeout 8s (espelha `searchTeams`), valida content-type de imagem
e tamanho ≤256KB (teto do bucket), sobe em `escudos/<external_id>.png`
(`contentType: image/png`, `cacheControl: 31536000`, `upsert: true`) e devolve
`getPublicUrl`. QUALQUER falha (download não-ok/timeout, não-imagem, grande demais,
erro de upload) devolve `origemUrl` inalterada — o INSERT segue com a URL do CDN
(que a CHECK de transição aceita). Nunca lança. Reusado pelo backfill (o
`service_role` tem `.storage`), evitando duplicar lógica.

### D3 — Chave determinística `escudos/<external_id>.png` + WRITE-ONCE na app
A chave por `external_id` faz o objeto ser compartilhado por todos e escrito uma vez
(o `selectTeam` só re-hospeda clube novo). A policy de Storage libera só INSERT a
`authenticated` (sem UPDATE/DELETE amplas) → o escudo vira imutável via anon/auth
(hardening: um autenticado malicioso não sobrescreve o escudo de outro clube já
gravado). O `upsert: true` no helper serve ao BACKFILL (`service_role` ignora a RLS
e pode reprocessar); na app, um objeto pré-existente cai no fallback non-fatal.
Content-type fixo `image/png`: escudos da api-sports são sempre PNG
(`/football/teams/<id>.png`); o allowlist do bucket inclui webp/svg por robustez.

### D4 — CHECK `teams_escudo_url_dominio` relaxada (aditiva)
Amplia a CHECK para aceitar 3 ramos: `null`, `like 'https://media.api-sports.io/%'`
(transição), `like '%/storage/v1/object/public/escudos/%'` (Storage próprio). O ramo
do Storage casa pelo PATH (não pelo host), sobrevivendo a prod-ref
(`<ref>.supabase.co`) vs local (`127.0.0.1:54321`) sem hardcodar. Preserva a intenção
anti-injeção (só hosts confiáveis, defende o cache global contra POST direto via anon
key). Aditiva: não rejeita nada que a CHECK anterior aceitava → sem risco de quebrar
registros existentes ao aplicar.

### D5 — Zod inalterado (input vs output)
`selectTeamSchema` valida a ENTRADA de `selectTeam` — sempre a URL do CDN vinda de
`searchTeams`. A URL do Storage é GERADA server-side (nunca é input do usuário), então
não precisa relaxar o Zod: ele segue exigindo `media.api-sports.io/football/teams/`
na entrada, e o rehost transforma antes do INSERT. Só a CHECK do banco (que vê o valor
FINAL) é relaxada.

### D6 — Backfill como script `service_role`, reusando o helper
`scripts/backfill-escudos.ts` lista `teams` com escudo no CDN ou nulo, reconstrói a
origem (o próprio `escudo_url`, ou `media.api-sports.io/football/teams/<external_id>.png`),
chama `rehospedarEscudo` e faz `UPDATE` (permitido ao `service_role`, que ignora a
RLS). Idempotente (só toca não-migrados; os já no Storage não casam o filtro),
resiliente (pula falhas isoladas), com `--dry-run`. PRÉ-REQUISITO: DDL aplicada antes
(a CHECK precisa aceitar a URL do Storage). O dono roda; não entra no CI/deploy.

## Risks / Trade-offs

- **CHECK relaxada vs poison** → o ramo do Storage casa por path (`/storage/v1/object/public/escudos/`),
  não host. Um atacante com anon key precisaria escrever num host que sirva esse path
  público — o mesmo padrão já usado por avatars; risco equivalente ao existente,
  mitigado por ser aditivo e pela RLS de `teams` (INSERT valida nome/external_id).
- **Rehost inline no `selectTeam`** → adiciona um download+upload à latência de
  cachear clube NOVO (uma vez por clube). Timeout curto (8s) e non-fatal limitam o
  custo; clubes já cacheados não pagam nada.
- **Objeto pré-existente sem UPDATE policy (app)** → se `escudos/<id>.png` já existir
  mas o clube ainda não estiver em `teams` (ex.: insert anterior falhou pós-upload),
  o upsert cai no fallback non-fatal → grava a URL do CDN. Aceito (raro; a CHECK
  aceita o CDN).
- **DDL/backfill manuais** → até o dono aplicar a DDL e rodar o backfill, o novo
  fluxo self-hosta só clubes novos e os legados seguem no CDN (aceito pela CHECK).
  Sem a DDL, o UPDATE do backfill é rejeitado — por isso a ordem é DDL → backfill.

## Migration Plan

1. Código (helper + `selectTeam` + testes) já funciona sem DDL para clubes novos:
   o rehost grava a URL do Storage, que a CHECK RELAXADA aceita. **Sem a CHECK
   relaxada aplicada, um INSERT com URL do Storage seria rejeitado** — então a DDL
   deve ir junto/antes de o fluxo novo materializar clubes.
2. **Ação do dono (DDL)**: conferir os `count(*)` de pré-checagem no
   `ddl.sql`; aplicar bucket `escudos` + policies + CHECK relaxada no Supabase.
3. **Ação do dono (backfill)**: rodar `scripts/backfill-escudos.ts` com
   `service_role` (após a DDL) para migrar os legados. `--dry-run` primeiro.
4. **Follow-up (pós-backfill 100%)**: remover o ramo `media.api-sports.io` da CHECK,
   da CSP e do `next.config.ts`.
5. Rollback: reverter o código restaura o comportamento anterior (grava a URL do
   CDN); a CHECK relaxada é aditiva (não precisa reverter). Objetos no bucket
   `escudos` ficam órfãos, inofensivos.
