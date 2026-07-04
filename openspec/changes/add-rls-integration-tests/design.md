## Contexto

O `supabase/schema.sql` (fonte de verdade, ~237k) tem ~101 policies RLS e ~22
funções SECURITY DEFINER. A segurança do app é em profundidade: RLS no banco +
checagem de propriedade nas Server Actions. Só a camada de Server Action tem
testes — e ainda assim herméticos (`vi.mock` do Supabase), que fingem o retorno do
PostgREST. A camada RLS não tem cobertura automatizada nenhuma.

## Objetivo e não-objetivo

- **Objetivo:** exercitar as policies e triggers de segurança de MAIOR RISCO
  contra um Postgres real, provando ALLOW e DENY por papel, e travar isso num job
  de CI dedicado.
- **Não-objetivo:** cobrir as 25 tabelas exaustivamente; substituir os testes
  herméticos; testar paridade com o schema de produção (drift real é outra
  frente, exige segredo). A suíte cobre os itens prioritários — o suficiente para
  fechar o falso-verde estrutural.

## Decisão 1 — pgTAP num `postgres:17` cru (não `supabase test db`, não vitest-by-role)

Reusa o padrão do hardening #2 (job `schema`): um `postgres:17` efêmero com
`ci-bootstrap.sql` → `schema.sql` (2 passes) → `local-grants.sql`. Sobre isso,
pgTAP dá asserções declarativas por papel (`results_eq`, `is_empty`, `throws_ok`,
`lives_ok`) com saída TAP.

- **`supabase test db` (alternativa):** o projeto NÃO usa `supabase/migrations/`
  (o schema é um único `schema.sql`), então o fluxo nativo do CLI não encaixa sem
  reestruturar o repo. Rejeitado.
- **vitest-by-role via PostgREST (alternativa):** exigiria subir GoTrue+PostgREST
  e forjar JWTs assinados — fixture frágil e pesada, o ponto de quebra apontado no
  briefing. Rejeitado; o caminho docker+psql é direto.

## Decisão 2 — pgTAP VENDORIZADO como SQL puro (sem `CREATE EXTENSION`)

O `postgres:17` oficial NÃO traz pgTAP, e um service container de CI não permite
instalar pacote no banco antes dos steps. A imagem `supabase/postgres` traz pgTAP
1.3.3, mas é gorda (~1.2 GB) e tem entrypoint complexo. A saída: pgTAP 1.3.3 é
PL/pgSQL PURO — sem código C (`MODULE_PATHNAME`), sem placeholder `@extschema@`
(ambos verificados: 0 ocorrências). O arquivo base `pgtap--1.3.3.sql` (368 KB) é
vendorizado em `supabase/tests/pgtap-1.3.3.sql` e carregado com `psql -f`,
instalando as funções no schema `public`. Resultado: roda OFFLINE no mesmo
`postgres:17` cru — zero download, zero `CREATE EXTENSION`, zero imagem nova.

## Decisão 3 — `auth.uid()` realista + claims por teste

O `ci-bootstrap.sql` define `auth.uid()` como stub NULL (basta para o schema
COMPILAR). O `_setup.sql` o SOBRESCREVE por uma versão que lê o JWT da sessão:

```sql
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'sub','')::uuid
$$;
```

Cada teste roda numa transação (`begin … rollback`) e, por asserção, faz:

```sql
set local role authenticated;                       -- RLS é enforçada (não-owner)
set local request.jwt.claims to '{"sub":"<uuid>","role":"authenticated"}';
```

`set local role` faz o Postgres enforçar RLS (o papel não é owner nem tem
`bypassrls`); a claim alimenta `auth.uid()` e, por ele, os SECURITY DEFINER
(`eh_participante`, `pode_arbitrar_torneio`, …). O `rollback` ao fim descarta
qualquer escrita, mantendo os testes independentes.

## Decisão 4 — seed como superuser com `session_replication_role = replica`

O seed usa UUIDs fixos e roda como o superuser da conexão (bypassa RLS — o
"service_role" do briefing). Um INSERT em `auth.users` dispara o trigger
`handle_new_user`, que lê `new.raw_user_meta_data` — coluna que o stub de
`auth.users` do bootstrap não tem. Em vez de replicar o schema do GoTrue, o seed
liga `session_replication_role = replica` (modo canônico de seed por superuser):
desliga triggers de usuário e RI durante a carga. A ordem de DELETE/INSERT respeita
as FKs manualmente. Ao fim, `reset session_replication_role`.

## Decisão 5 — detecção de falha por parsing de TAP (sem `pg_prove`)

`pg_prove` não é garantido no runner. O `run.sh` roda cada `.sql` com
`psql -tA -v ON_ERROR_STOP=1`: um erro SQL CRU (fora de um `throws_ok`) aborta o
arquivo e o runner o marca como falho; asserções pgTAP que falham emitem `not ok`
— o runner conta `^ok`/`^not ok` e sai não-zero se houver qualquer `not ok`. Por
isso toda expectativa de DENY que levanta exceção (INSERT com `with check` falso →
42501; trigger → P0001) usa `throws_ok`, que captura internamente; DENY de
SELECT/UPDATE (a policy filtra a linha, sem erro) usa `is_empty`.

## Cobertura (itens prioritários)

- **matches** — `matches_select_visivel` (liberada+pública visível a anon; oculta
  invisível a terceiro), `matches_update_participant` (participante escreve em
  partida liberada; terceiro e partida não-liberada negados),
  `matches_update_tournament_owner` (dono arbitra).
- **tournaments / league_competitions** — `*_select_visivel` com foco em VAZAMENTO
  DE RASCUNHO (privado/arquivada de A invisível a terceiro; público/ativa visível
  a anon; dono e participante enxergam o privado) + `*_update/delete_owner`.
- **slot_invites (POR-NOME)** — trigger `block_slot_invite_por_nome` (nem o dono
  cria convite para vaga por-nome → `SLOT_POR_NOME`) + ALLOW para vaga team-based
  + DENY de RLS a terceiro.
- **match_score_proposals (foto_path)** — ALLOW na própria pasta; DENY com
  `foto_path` forjado na pasta de outro; DENY com `submetido_por` forjado.
- **users (PII)** — `celular` fechado a anon/authenticated (grant de coluna →
  42501); `nome` permitido.

## Riscos e mitigação

- **pgTAP vendorizado desatualiza.** Mitigado: 1.3.3 é estável e o arquivo é
  autocontido; a versão fica no nome do arquivo.
- **Falso-verde do próprio harness** (um teste que passa sem RLS enforçada).
  Mitigado: pares ALLOW/DENY rodam a MESMA query com `sub` diferente (ex.:
  torneio privado — dono vê, terceiro não). Se a RLS não fosse enforçada, o DENY
  retornaria linha e falharia.
- **CI sem `psql`.** O runner `ubuntu-latest` já traz `psql` (mesmo pressuposto do
  job `schema`, que passa hoje).
