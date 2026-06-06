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

---

## 7. Supabase — lifecycle de partida (`add-match-lifecycle`)

Encerramento/reabertura pelo DONO do torneio + trava de integridade. **Sem isto,
encerrar/reabrir pela app falha** (a RLS nega UPDATE ao dono) e **fica aberto o
buraco** de participante mudar status/placar-de-encerrada por POST direto (a RLS
de UPDATE é por linha, não por coluna). Aplicar no **SQL Editor** (idempotente):

- [ ] **7.1 — Policy de UPDATE para o dono + trigger de lifecycle:**

```sql
-- UPDATE também para o DONO do torneio (policies são OR).
drop policy if exists matches_update_tournament_owner on public.matches;
create policy matches_update_tournament_owner on public.matches
  for update to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

-- Lifecycle: status só pelo dono; placar/clube travados em partida encerrada.
create or replace function public.lock_match_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(
       current_setting('request.jwt.claims', true)::jsonb ->> 'role',
       ''
     ) <> 'service_role'
  then
    if new.status is distinct from old.status then
      if not exists (
        select 1 from public.tournaments t
        where t.id = new.tournament_id
          and t.created_by = (select auth.uid())
      ) then
        raise exception 'Só o dono do torneio altera o status da partida';
      end if;
    end if;

    if old.status = 'encerrada'
       and (new.placar_1 is distinct from old.placar_1
            or new.placar_2 is distinct from old.placar_2
            or new.time_1 is distinct from old.time_1
            or new.time_2 is distinct from old.time_2)
    then
      raise exception 'Partida encerrada não aceita alteração de placar ou clube';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_lock_lifecycle on public.matches;
create trigger matches_lock_lifecycle
  before update on public.matches
  for each row execute function public.lock_match_lifecycle();
```

- [ ] **7.2 — (opcional) Conferir o caminho feliz**: como dono, encerre uma
  partida pela página do torneio e veja-a entrar na classificação; reabra e
  veja-a voltar.

- [ ] **7.3 — (recomendado) Conferir as TRAVAS** (o trigger é a única barreira
  contra POST direto — os testes unitários não o executam). No SQL Editor,
  rode como usuário comum (role `authenticated`, não `postgres`) — ou
  simplesmente confira que estes UPDATEs FALHAM via API REST com o token de um
  participante que não é dono:

```sql
-- Deve FALHAR (participante não muda status):
-- update public.matches set status = 'encerrada' where id = '<partida-em-aberto>';

-- Deve FALHAR (placar de encerrada é imutável):
-- update public.matches set placar_1 = 9 where id = '<partida-encerrada>';

-- Deve FALHAR (clube de encerrada é imutável):
-- update public.matches set time_1 = null where id = '<partida-encerrada>';
```

> Fonte de verdade: `supabase/schema.sql` (policy + função/trigger de lifecycle).

---

## 8. Supabase — participantes e convite (`add-tournament-participants`)

Participação por torneio com convite por link. **Sem isto, criar torneio pela
app falha** (a action insere em `participants`/`tournament_invites`, que ainda
não existem) **e a página do torneio quebra** (lista de participantes). Aplicar
no **SQL Editor** (idempotente):

- [ ] **8.1 — Tabelas + funções + policies:**

```sql
-- Participante CONFIRMADO (linha = aceitou; sem estado pendente).
create table if not exists public.participants (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id       uuid not null references public.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create index if not exists participants_user_id_idx on public.participants (user_id);

-- Código de convite (SEGREDO do dono — fora de tournaments de propósito:
-- a RLS de SELECT público do torneio vazaria a coluna).
create table if not exists public.tournament_invites (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  code          text not null unique,
  created_at    timestamptz not null default now()
);

alter table public.participants       enable row level security;
alter table public.tournament_invites enable row level security;

-- Helper anti-recursão (policy de tournaments lendo participants cuja policy
-- lê tournaments dispararia "infinite recursion detected in policy").
create or replace function public.eh_participante(t_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.participants p
    where p.tournament_id = t_id
      and p.user_id = (select auth.uid())
  );
$$;

-- Aceite do convite: valida o código secreto e insere SÓ o próprio auth.uid().
create or replace function public.aceitar_convite(codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tournament uuid;
  v_status public.tournament_status;
begin
  if v_uid is null then
    raise exception 'Você precisa estar autenticado para aceitar um convite';
  end if;

  select i.tournament_id, t.status
    into v_tournament, v_status
    from public.tournament_invites i
    join public.tournaments t on t.id = i.tournament_id
   where i.code = codigo;

  if v_tournament is null then
    raise exception 'Convite inválido ou expirado';
  end if;
  if v_status = 'encerrado' then
    raise exception 'Este torneio está encerrado e não aceita novos participantes';
  end if;

  insert into public.participants (tournament_id, user_id)
  values (v_tournament, v_uid)
  on conflict do nothing;

  return v_tournament;
end;
$$;

-- Preview do convite (página /convite/[codigo]): o código é a credencial.
create or replace function public.info_convite(codigo text)
returns table (
  tournament_id uuid,
  titulo text,
  status public.tournament_status,
  ja_participa boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id,
    t.titulo,
    t.status,
    exists (
      select 1 from public.participants p
      where p.tournament_id = t.id
        and p.user_id = (select auth.uid())
    ) as ja_participa
  from public.tournament_invites i
  join public.tournaments t on t.id = i.tournament_id
  where i.code = codigo;
$$;

-- GRANTs (CREATE FUNCTION dá EXECUTE a PUBLIC por padrão):
-- eh_participante fica com anon+authenticated (as policies a avaliam com o
-- role da query — revogar deles quebraria todo SELECT de tournaments/matches);
-- as funções de convite ficam só com authenticated.
revoke execute on function public.eh_participante(uuid) from public;
grant execute on function public.eh_participante(uuid) to anon, authenticated;
revoke execute on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;
revoke execute on function public.info_convite(text) from public, anon;
grant execute on function public.info_convite(text) to authenticated;

-- tournaments/matches: visibilidade também para o PARTICIPANTE.
drop policy if exists tournaments_select_public on public.tournaments;
drop policy if exists tournaments_select_visivel on public.tournaments;
create policy tournaments_select_visivel on public.tournaments
  for select to anon, authenticated
  using (is_public or created_by = auth.uid() or public.eh_participante(id));

drop policy if exists matches_select_public on public.matches;
drop policy if exists matches_select_visivel on public.matches;
create policy matches_select_visivel on public.matches
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.is_public
             or t.created_by = auth.uid()
             or public.eh_participante(t.id))
    )
    or auth.uid() = participante_1
    or auth.uid() = participante_2
  );

-- INSERT de partida: participantes informados precisam estar CONFIRMADOS.
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
    and (participante_1 is null or exists (
      select 1 from public.participants p
      where p.tournament_id = matches.tournament_id
        and p.user_id = matches.participante_1
    ))
    and (participante_2 is null or exists (
      select 1 from public.participants p
      where p.tournament_id = matches.tournament_id
        and p.user_id = matches.participante_2
    ))
  );

-- participants: leitura acompanha o torneio; INSERT direto só dono-si-mesmo
-- (convidado entra SÓ pela função); DELETE = sair (próprio) ou remover (dono).
drop policy if exists participants_select_visivel on public.participants;
create policy participants_select_visivel on public.participants
  for select to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.is_public
             or t.created_by = auth.uid()
             or public.eh_participante(t.id))
    )
  );

drop policy if exists participants_insert_owner_self on public.participants;
create policy participants_insert_owner_self on public.participants
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
    )
  );

drop policy if exists participants_delete_self_or_owner on public.participants;
create policy participants_delete_self_or_owner on public.participants
  for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

-- tournament_invites: TUDO restrito ao dono do torneio.
drop policy if exists tournament_invites_select_owner on public.tournament_invites;
create policy tournament_invites_select_owner on public.tournament_invites
  for select to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists tournament_invites_insert_owner on public.tournament_invites;
create policy tournament_invites_insert_owner on public.tournament_invites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists tournament_invites_update_owner on public.tournament_invites;
create policy tournament_invites_update_owner on public.tournament_invites
  for update to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists tournament_invites_delete_owner on public.tournament_invites;
create policy tournament_invites_delete_owner on public.tournament_invites
  for delete to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
    )
  );
```

- [ ] **8.2 — (recomendado) Backfill**: donos atuais viram participantes dos
  próprios torneios (a entrada automática só vale para torneios novos):

```sql
insert into public.participants (tournament_id, user_id)
select t.id, t.created_by
  from public.tournaments t
 where t.created_by is not null
on conflict do nothing;
```

  (Convites de torneios existentes não precisam de backfill: o dono gera o
  primeiro link pelo botão "Gerar link de convite" na página do torneio.)

- [ ] **8.3 — (opcional) Conferir o caminho feliz**: crie um torneio pela app
  (você deve nascer participante e com link de convite); abra o link numa
  janela anônima com OUTRA conta e aceite; confira que o convidado aparece na
  lista e nos selects de nova partida.

- [ ] **8.4 — (recomendado) Conferir as TRAVAS** (as funções/policies são a
  única barreira contra POST direto — os testes unitários não as executam).
  Com o token de um usuário comum (não dono):

```sql
-- Deve FALHAR/0 linhas (entrar sem convite por INSERT direto):
-- insert into public.participants (tournament_id, user_id) values ('<torneio-alheio>', auth.uid());

-- Deve devolver VAZIO (enumerar códigos de convite):
-- select * from public.tournament_invites;

-- Deve FALHAR (aceitar código inexistente):
-- select public.aceitar_convite('codigo-que-nao-existe');

-- Deve FALHAR com permission denied (anon não chama as RPCs de convite —
-- testar SEM token, via /rest/v1/rpc/info_convite):
-- select public.info_convite('<codigo-valido>');

-- Deve FALHAR (partida com participante NÃO confirmado, como dono):
-- insert into public.matches (tournament_id, participante_1) values ('<seu-torneio>', '<user-fora-da-lista>');
```

> Fonte de verdade: `supabase/schema.sql` (tabelas, funções e RLS de
> participants/tournament_invites).
>
> Rollback: `drop table public.tournament_invites; drop table public.participants;`
> `drop function public.aceitar_convite(text), public.info_convite(text);` e
> recriar `tournaments_select_visivel` / `matches_select_visivel` /
> `matches_insert_tournament_owner` sem as cláusulas de participante (versões
> nas seções 4 e 5 acima); por fim `drop function public.eh_participante(uuid);`.
