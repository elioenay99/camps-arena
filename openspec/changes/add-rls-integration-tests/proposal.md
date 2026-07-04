## Why

Quarta e última frente de HARDENING (a mais pesada). Hoje TODOS os ~100 arquivos
de teste são HERMÉTICOS: mockam o cliente Supabase (`vi.mock`) e fingem o retorno
do PostgREST. Eles NUNCA exercem as ~101 policies RLS reais nem os SECURITY
DEFINER do `supabase/schema.sql`. Isso é um FALSO-VERDE ESTRUTURAL: um teste pode
passar afirmando exatamente o que a policy real NEGA (ou vice-versa) — a segurança
em profundidade (RLS no banco) não tem nenhuma cobertura automatizada. As duas
auditorias registraram o gap: "ZERO testes de RLS reais".

A change fecha o gap com uma suíte de INTEGRAÇÃO que roda contra um PostgreSQL de
VERDADE (pgTAP), com um `auth.uid()` realista que lê o JWT — as policies reagem ao
"usuário logado" simulado, exatamente como em produção. É tudo ADITIVO e SEM
segredo do dono:

1. **Falso-verde do `vi.mock`.** Os testes herméticos não conseguem, por
   construção, exercer uma policy — não há banco. Uma regressão numa policy
   (ex.: alguém alarga `matches_select_visivel` e vaza partida oculta) passaria
   por todos os gates atuais.
2. **Itens de maior risco sem prova.** Vazamento de rascunho de torneio/pirâmide,
   `matches_update_participant` (só participante escreve), a invariante de vaga
   POR-NOME (forja latente da Auditoria 2), o `foto_path` amarrado à pasta do
   autor (hardening #3) e a PII `celular` (grant de coluna) só têm defesa no
   banco — nenhuma é verificada por teste.

## What Changes

- **Suíte pgTAP nova (`supabase/tests/`), SEPARADA do run hermético.** Arquivos
  `.sql` por área, executados contra um `postgres:17` com o schema real aplicado.
  Cada teste seta o papel (`anon`/`authenticated`) e injeta o JWT
  (`set local request.jwt.claims`), e as policies decidem. NÃO entra no
  `pnpm test` hermético (que roda em CI sem banco) — é `pnpm test:rls`.
- **`auth.uid()` REALISTA no setup de teste.** Sobrescreve o stub NULL do
  `ci-bootstrap.sql` (que existe só para o schema COMPILAR) por uma versão que lê
  `request.jwt.claims ->> 'sub'`, espelhando a plataforma Supabase.
- **pgTAP VENDORIZADO (`supabase/tests/pgtap-1.3.3.sql`).** pgTAP 1.3.3 é PL/pgSQL
  puro (sem código C, sem `@extschema@`); vendorizá-lo e carregá-lo com `psql -f`
  dispensa `CREATE EXTENSION`, download e imagem gorda — roda offline no mesmo
  `postgres:17` do job de schema (padrão reusado do hardening #2).
- **Seed determinístico** (UUIDs fixos, como superuser, que bypassa RLS) com o
  mínimo por cenário: usuários (dono, dois técnicos, um terceiro), torneio
  público e privado, pirâmide ativa e arquivada, vagas team-based e POR-NOME,
  partidas liberada/oculta/por-vaga.
- **Runner `supabase/tests/run.sh` + script `pnpm test:rls`.** Local: sobe um
  `postgres:17` efêmero via docker, aplica bootstrap → schema (2 passes) → grants
  → pgTAP → seed, roda os testes e derruba o container. CI: modo externo, usa o
  service container.
- **Job de CI DEDICADO `rls-tests`.** Novo job em `.github/workflows/ci.yml`, com
  `services.postgres:17`, separado do job `quality` hermético (que NÃO muda).

## Capabilities

### Modified Capabilities
<!-- Nenhuma requisição existente muda de comportamento. -->

### New Capabilities
- `row-level-security`: passa a declarar uma cobertura de TESTES DE INTEGRAÇÃO das
  policies e triggers de segurança, exercitadas por papel num Postgres real
  (pgTAP), fechando o falso-verde dos testes herméticos.
- `continuous-integration`: o CI passa a incluir um job DEDICADO que roda a suíte
  RLS de integração num `postgres:17` efêmero, separado do gate hermético.

## Impact

- **Testes/infra (NOVO):** `supabase/tests/` — `run.sh` (runner),
  `pgtap-1.3.3.sql` (pgTAP vendorizado), `_setup.sql` (auth.uid real + seed),
  `rls_matches.sql`, `rls_tournaments.sql`, `rls_slots.sql`, `rls_storage.sql`,
  `rls_users.sql`. `package.json` — script `test:rls`.
- **CI:** `.github/workflows/ci.yml` — job `rls-tests` novo (service `postgres:17`).
  O job `quality` (hermético) permanece intacto.
- **Banco de dados:** ZERO DDL para o dono aplicar. NADA toca produção — a suíte
  só cria dados fictícios num Postgres efêmero. O `supabase/schema.sql`,
  `ci-bootstrap.sql` e `local-grants.sql` NÃO mudam (são reusados como estão).
- **Segredos:** nenhum. O Postgres é local ao runner; nada aponta para produção.
- **Dependências:** nenhuma nova em `package.json` (pgTAP é vendorizado; usa
  `psql`/`docker`, já disponíveis).
- **Run hermético:** `pnpm typecheck && pnpm lint && pnpm test` seguem verdes
  (nenhuma mudança de runtime nem no job hermético).
