# Pendências manuais — Arena

Tarefas que **só você** pode executar. Os agentes não tocam banco (DDL/migrations),
configurações do GitHub nem o dashboard do Supabase — por decisão de segurança
(REGRA 4/5 do seu protocolo). Aqui fica tudo pronto pra copiar e colar.

Marque com `[x]` conforme concluir.

---

## 1. GitHub — exigir o check de CI no `main`

- [ ] Proteger o branch `main` para exigir o check `quality` antes de merge.

**Via interface:** GitHub → repositório → **Settings → Branches → Add branch ruleset
(ou Branch protection rule)** → branch name pattern `main` → marque **Require status
checks to pass before merging** → adicione o check **`quality`**.

**Via CLI** (cole no chat do Claude Code com o prefixo `!` para rodar você mesmo —
o agente não pode, pois `gh api -X PUT` está em `deny`):

```bash
gh api -X PUT repos/elioenay99/camps-arena/branches/main/protection \
  -H "Accept: application/vnd.github+json" \
  -f 'required_status_checks[strict]=true' \
  -f 'required_status_checks[contexts][]=quality' \
  -f 'enforce_admins=false' \
  -f 'required_pull_request_reviews[required_approving_review_count]=0' \
  -f 'restrictions=' 
```

---

## 2. Supabase — CHECK constraints do `harden-team-cache`

Defesa em profundidade no banco (espelha a validação das Server Actions). Aplicar no
**SQL Editor** do Supabase.

- [ ] **2.1 — Conferir dados legados ANTES** (a constraint de escudo falha se houver
  URL fora do domínio confiável). Rode e confirme que o resultado é `0`:

```sql
select count(*) from public.teams
where escudo_url is not null
  and escudo_url not like 'https://media.api-sports.io/%';
```

- [ ] **2.2 — Aplicar as duas CHECK** (idempotente — pode rodar de novo sem erro):

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

- [ ] **3.1 — Templates de e-mail** (Supabase → **Authentication → Email Templates**):

  **Confirm signup** — troque o link por:
  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard
  ```

  **Reset password** — troque o link por:
  ```
  {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/atualizar-senha
  ```

- [ ] **3.2 — URL Configuration** (Supabase → **Authentication → URL Configuration**):
  - **Site URL**: o domínio canônico de produção.
  - **Redirect URLs** (adicione todas que usar):
    - `http://localhost:3000/auth/confirm` (dev)
    - `https://<seu-dominio>/auth/confirm` (produção)
    - `https://*-<projeto>.vercel.app/auth/confirm` (previews da Vercel — `NEXT_PUBLIC_SITE_URL`
      é fixada em build, então sem o wildcard os previews apontariam para produção)

- [ ] **3.3 — (opcional) Secure password change (AAL2)**: Authentication → Providers →
  Email → habilite *Secure password change* para exigir reautenticação na troca de senha.

---

## 4. Supabase — ownership de torneio (`add-tournament-ownership`)

Adiciona dono (`created_by`) e visibilidade (`is_public`) a `tournaments` e reescreve
a RLS para escrita restrita ao dono. **Sem isto, criar torneio pela app falha** (a RLS
antiga nega escrita). Aplicar no **SQL Editor** do Supabase (idempotente):

- [ ] **4.1 — Colunas, índice e RLS:**

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

- [ ] **4.2 — (opcional) Conferir** que os torneios já existentes ficaram `is_public = true`
  (default) e, se quiser, atribuir dono a algum deles:

```sql
select id, titulo, is_public, created_by from public.tournaments order by created_at;
```

> Fonte de verdade: `supabase/schema.sql` (seção `tournaments` + RLS).
