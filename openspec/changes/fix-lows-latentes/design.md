# Design — fix-lows-latentes

Verificado por workflow (run `wf_339b1467-e29`) contra o código atual. Cada item tem
evidência de código; abaixo as decisões de fix.

## D1 — `teams`: sanidade no banco (DDL) + policy
`teams_insert_authenticated` é `with_check(true)` (schema.sql ~1268) e `teams.nome` não tem
CHECK (schema.sql ~133). selectTeam (`src/actions/teams.ts`) é o único caller do app e já
valida via Zod, mas o PostgREST aceita POST direto com a anon key (ignora o Zod).
- **CHECK no banco** (defesa real, vale p/ qualquer caminho): `char_length(btrim(nome))
  between 1 and 80`; `external_id is null or external_id ~ '^[0-9]+$'`.
- **policy** `with_check` espelha os mesmos predicados (em vez de `true`).
- NÃO restringir QUEM insere (cache global é by-design). Verificar antes na coluna do PROD:
  o `nome`/`external_id` já gravados satisfazem os CHECKs (espelha a auditoria de `escudo_url`
  em schema.sql). Confirmar o limite do Zod do nome p/ casar o `80` (ajustar se o Zod usar outro teto).

## D2 — `montarProximaTemporada` interna
Único caller é `confirmarFluxoTemporada` no MESMO módulo (`src/actions/leaguePyramid.ts`).
Remover o `export` → a função some da superfície de Server Actions (endpoint redundante
fechado). Sem mudança de comportamento. (RLS + RPC `montar_temporada` DEFINER já barram o
abuso de dados; isto é defesa-em-profundidade + higiene.)

## D3 — Sentry redige e-mail
`src/lib/observability/scrub.ts`: adicionar `const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g`
e aplicá-la em `scrubString` junto de WA_ME/TELEFONE_BR (e-mail → `[REDACTED]`). Atualizar o
comentário do cabeçalho. Teste novo em `scrub.test.ts` (e-mail em message/extra/breadcrumb).

## D4 — Podar celular não-convocável no Flight
`src/features/match/components/MatchCard.tsx`: após decidir `convocavel` por lado (~189-190),
zerar `celular`/`mensagemWhatsApp` do lado NÃO-convocável antes de passar ao
`MatchScoreModalConnected` (client). Só o lado convocável (o único que o modal usa p/ o link)
leva o número ao client. Teste assertando `celular === null` no lado não-convocável.

## D5 — Unicidade cross-divisão na pirâmide
O índice do banco é por COMPETIÇÃO (`league_competitors (competition_id, team_id)` e
`(competition_id, lower(trim(rotulo)))`, schema.sql ~1990), mas o `superRefine` de
`leaguePyramidSchema.ts` (~523) e os guards do `LeagueWizard` validam só por divisão.
- **Zod**: após o loop por-divisão, acumular identidades de TODAS as divisões — clube
  `t:<teamId>`, nome `r:<lower(trim(rotulo))>` — e emitir issue na 2ª ocorrência (path na
  divisão/competidor repetido) com mensagem clara ("já está em outra divisão da temporada").
- **Wizard**: o guard de adicionar clube/nome varre `divisoes` inteiras (não só a divisão atual).
- Corrigir o comentário enganoso (schema.ts ~523 "espelha os índices de league_competitors").
- **Backstop**: mapear 23505 de `league_competitors` em `createCompetition` (~275) p/ mensagem
  específica (corrida).

## D6 — Promédio: leitura completa e determinística
`src/features/league/promedios.ts` (~67): a query do histórico (`league_division_entries`,
`.in(competitor_id)`, `posicao_final not null`) alimenta a soma de VIDA TODA (Σpontos/Σjogos).
Um `.limit()` simples CORROMPERIA a soma. Fix: **paginar** com `.order("id")` +
`.range(off, off+size-1)` em laço, acumulando até a página vir incompleta (size 1000) — a
soma final é idêntica à atual, só imune ao cap de linhas do servidor. Sem mudança de matemática.

## Fora do escopo (deferido) — `liberada_em`
Verificado LATENTE/inerte: o `with_check` da policy (já estreitada p/ avulso) confina a
escrita do participante a `liberada_em is not null and <= now()` (não dá p/ ocultar nem
agendar); o trigger lê a coluna como booleano. `liberarRodadas` usa `.is(null)` e
`recolherRodadas` usa `.lte(now)` — corretos p/ o v1 sem agendamento. O fix (guarda de coluna
no `lock_match_lifecycle` + `liberarRodadas` cobrir agendadas) só agrega valor QUANDO existir
UI de agendamento futuro, e toca o trigger crítico — fica documentado p/ aquela feature.

## Testes
- `scrub.test.ts`: e-mail redigido em message/extra/breadcrumb; telefone/wa.me seguem.
- `teams` / selectTeam: nome vazio/grande recusado (Zod) — e CHECK validado ao vivo (psql).
- `MatchCard.test.tsx`: celular do lado não-convocável = null no payload do modal.
- `leaguePyramidSchema` (ou wizard): nome/clube repetido entre divisões → issue de validação.
- `promedios`: paginação acumula todas as páginas (mock de 2 páginas) — soma completa.
- `leaguePyramid`: `montarProximaTemporada` não é mais exportada (o caller interno segue ok).

## Refinamentos do gate (incorporados, run wf_dcc13812-8e3 — aprovado, 0 blockers)
- **D1 pré-check EXATO** (antes de aplicar LOCAL e PROD; mostrar ao dono, REGRA 4): `select count(*)
  from public.teams where char_length(btrim(nome)) not between 1 and 80;` e `... where external_id
  is not null and external_id !~ '^[0-9]+$';`. Só aplicar se ambos = 0 (senão sanear com o dono).
  Comentar o bloco ALTER no schema.sql como o precedente `teams_escudo_url_dominio`.
- **D1 Zod**: adicionar `.trim()` ao `nome` de `teamResultSchema` (teamSchema.ts) p/ espelhar o `btrim`
  do CHECK (Zod e banco rejeitam o mesmo conjunto; nome só-de-espaços recusado nas duas camadas).
- **D4 celular**: a poda é gated por `!convocavel` (zera só o lado não-convocável). O botão "Chamar" do
  CARD usa `celularConvocacao` (campo distinto), não `participante.celular` — então a poda não o afeta;
  o que a poda protege é o `celular`/`mensagemWhatsApp` que o MODAL usa (só quando convocavel). O teste
  DEVE assertar AMBOS: lado não-convocável `celular===null` E lado convocável `celular` preservado.
- **D6 laço**: `let off=0; const SIZE=1000; while(true){ const {data,error}=await base().range(off,off+SIZE-1);
  if(error) return null; acumula(data); if(!data||data.length<SIZE) break; off+=SIZE }`. Parar por
  `length<SIZE` (NÃO por vazio); propagar erro de QUALQUER página; `base()` reconstrói select+in+not+
  `.order("id",{ascending:true})` em CADA página (order antes do range torna o range determinístico
  sobre a PK). NUNCA `.limit()`. Atualizar o mock de `promedios.test.ts` (chain termina em `.not()` hoje;
  add `.order`→chain e `.range`→páginas) + caso de 2 páginas conferindo soma completa.

## Gates
typecheck/lint/test/build verdes; revisão adversarial do diff por workflow; validação ao vivo
do CHECK de `teams` (psql) + DDL no PROD (MCP, mostrando SQL; pré-checagem de dados).
