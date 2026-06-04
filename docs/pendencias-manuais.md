# Pendências manuais — Arena

Tarefas que **só você** pode executar. Os agentes não tocam banco (DDL/migrations),
configurações do GitHub nem o dashboard do Supabase — por decisão de segurança
(REGRA 4/5 do seu protocolo). Aqui fica tudo pronto pra copiar e colar.

Marque com `[x]` conforme concluir.

---

## 1. GitHub — exigir o check de CI no `main`

- [x] Proteger o branch `main` para exigir o check `quality` antes de merge.
  **Concluído em 2026-06-04** via `gh api -X PUT .../branches/main/protection --input <json>`
  (`strict: true`, check `quality`, `enforce_admins: false` — push direto do admin segue
  funcionando; force push e deleção do branch bloqueados).

> Nota: o endpoint exige JSON tipado — flags `-f` enviam strings e dão HTTP 422.
> Para alterar no futuro, use `--input arquivo.json`.

---

## 2. Supabase — CHECK constraints do `harden-team-cache`

Defesa em profundidade no banco (espelha a validação das Server Actions). Aplicar no
**SQL Editor** do Supabase.

- [x] **2.1 — Conferir dados legados ANTES** (a constraint de escudo falha se houver
  URL fora do domínio confiável). Rode e confirme que o resultado é `0`:

```sql
select count(*) from public.teams
where escudo_url is not null
  and escudo_url not like 'https://media.api-sports.io/%';
```

- [x] **2.2 — Aplicar as duas CHECK** (idempotente — pode rodar de novo sem erro):

```sql
-- Os dois lados da partida não podem referenciar o MESMO clube.
alter table public.matches drop constraint if exists matches_times_distintos;
alter table public.matches
  add constraint matches_times_distintos
  check (time_1 is null or time_2 is null or time_1 <> time_2);

-- Escudo só do CDN confiável da API-Football (ou nulo).
alter table public.teams drop constraint if exists teams_escudo_url_dominio;
alter table public.teams
  add constraint teams_escudo_url_dominio
  check (escudo_url is null or escudo_url like 'https://media.api-sports.io/%');
```

> Fonte de verdade: `supabase/schema.sql` (linhas 82–101). Já está versionado.

---

## 3. Supabase — e-mails de cadastro e recuperação de senha

Sem isto, o link de confirmação/recuperação só funciona no **mesmo navegador** que
iniciou o fluxo (fallback `?code=`). Com isto, funciona em qualquer dispositivo.

- [x] **3.1 — Templates de e-mail** (Supabase → **Authentication → Email Templates**):

  **Confirm signup** — troque o link por:
  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
  ```

  **Reset password** — troque o link por:
  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/atualizar-senha
  ```

- [x] **3.2 — URL Configuration** (Supabase → **Authentication → URL Configuration**):
  - **Site URL**: o domínio canônico de produção.
  - **Redirect URLs** (adicione todas que usar):
    - `http://localhost:3000/auth/confirm` (dev)
    - `https://<seu-dominio>/auth/confirm` (produção)
    - `https://*-<projeto>.vercel.app/auth/confirm` (previews da Vercel — `NEXT_PUBLIC_SITE_URL`
      é fixada em build, então sem o wildcard os previews apontariam para produção)

- [x] **3.3 — (opcional) Secure password change (AAL2)**: Authentication → Providers →
  Email → habilite *Secure password change* para exigir reautenticação na troca de senha.

---

## 4. Supabase — ownership de torneio (`add-tournament-ownership`)

Adiciona dono (`created_by`) e visibilidade (`is_public`) a `tournaments` e reescreve
a RLS para escrita restrita ao dono. **Sem isto, criar torneio pela app falha** (a RLS
antiga nega escrita). Aplicar no **SQL Editor** do Supabase (idempotente):

- [x] **4.1 — Colunas, índice e RLS:**

```sql
-- Colunas (aditivo).
alter table public.tournaments
  add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.tournaments
  add column if not exists is_public boolean not null default true;

create index if not exists tournaments_created_by_idx on public.tournaments (created_by);

-- RLS: visibilidade por dono/público; escrita só do dono.
drop policy if exists tournaments_select_public on public.tournaments;
drop policy if exists tournaments_select_visivel on public.tournaments;
create policy tournaments_select_visivel on public.tournaments
  for select to anon, authenticated
  using (is_public or created_by = auth.uid());

drop policy if exists tournaments_insert_owner on public.tournaments;
create policy tournaments_insert_owner on public.tournaments
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists tournaments_update_owner on public.tournaments;
create policy tournaments_update_owner on public.tournaments
  for update to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

drop policy if exists tournaments_delete_owner on public.tournaments;
create policy tournaments_delete_owner on public.tournaments
  for delete to authenticated
  using (created_by = auth.uid());
```

- [x] **4.2 — (opcional) Conferir** que os torneios já existentes ficaram `is_public = true`
  (default) e, se quiser, atribuir dono a algum deles:

```sql
select id, titulo, is_public, created_by from public.tournaments order by created_at;
```

> Fonte de verdade: `supabase/schema.sql` (seção `tournaments` + RLS).

---

## 5. Supabase — criação de partida (`add-match-creation`)

Fecha a dívida do Tier 1b (`matches_select_public` era `using (true)` — partida de
torneio privado ficava legível por consulta direta) e abre INSERT em `matches` só
para o **dono do torneio**. **Sem isto, criar partida pela app falha** (não há INSERT
policy). Aplicar no **SQL Editor** do Supabase (idempotente; rode o bloco INTEIRO —
o SELECT estreitado deve entrar junto/antes do INSERT):

- [x] **5.1 — Policies de `matches`:**

```sql
-- SELECT: a partida é visível quando o torneio dela é visível (público, ou
-- privado do próprio solicitante) OU quando o solicitante participa dela.
drop policy if exists matches_select_public on public.matches;
drop policy if exists matches_select_visivel on public.matches;
create policy matches_select_visivel on public.matches
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.is_public or t.created_by = auth.uid())
    )
    or auth.uid() = participante_1
    or auth.uid() = participante_2
  );

-- INSERT: só o dono do torneio, e nunca em torneio encerrado.
drop policy if exists matches_insert_tournament_owner on public.matches;
create policy matches_insert_tournament_owner on public.matches
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
    )
  );
```

- [x] **5.2 — (opcional) Conferir** que as partidas semeadas continuam visíveis
  (torneios semeados são públicos):

```sql
select count(*) from public.matches;
```

> Fonte de verdade: `supabase/schema.sql` (seção `matches` + RLS).
> Dica: como o "Torneio de Teste" tem `created_by = NULL`, ninguém pode criar
> partida NELE pela app — crie um torneio novo pela app (ele nasce seu) ou
> atribua-se como dono: `update public.tournaments set created_by = '<seu-user-id>' where titulo = 'Torneio de Teste';`

---

## 6. Supabase — regras de pontuação (`add-scoring-rules`)

Pontuação configurável por torneio (vitória/empate/derrota, defaults 3/1/0) +
CHECK de coerência. Torneios existentes herdam 3/1/0 pelos defaults — sem
migração de dados. **Sem isto, criar torneio pela app falha** (a action passa a
enviar as 3 colunas, que ainda não existem no banco). Aplicar no **SQL Editor**
(idempotente):

- [x] **6.1 — Colunas + CHECK:**

```sql
-- Regras de pontuação por torneio (aditivo).
alter table public.tournaments
  add column if not exists pontos_vitoria integer not null default 3;
alter table public.tournaments
  add column if not exists pontos_empate integer not null default 1;
alter table public.tournaments
  add column if not exists pontos_derrota integer not null default 0;

-- Coerência: 0 <= derrota <= empate <= vitoria <= 100.
alter table public.tournaments drop constraint if exists tournaments_pontuacao_coerente;
alter table public.tournaments
  add constraint tournaments_pontuacao_coerente
  check (
    pontos_derrota >= 0
    and pontos_derrota <= pontos_empate
    and pontos_empate <= pontos_vitoria
    and pontos_vitoria <= 100
  );
```

- [x] **6.2 — (opcional) Conferir** os defaults nos torneios existentes:

```sql
select titulo, pontos_vitoria, pontos_empate, pontos_derrota from public.tournaments;
```

> Fonte de verdade: `supabase/schema.sql` (seção `tournaments`).
