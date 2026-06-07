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

- [x] **7.1 — Policy de UPDATE para o dono + trigger de lifecycle:**

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

- [x] **7.2 — (opcional) Conferir o caminho feliz**: como dono, encerre uma
  partida pela página do torneio e veja-a entrar na classificação; reabra e
  veja-a voltar.

- [x] **7.3 — (recomendado) Conferir as TRAVAS** (o trigger é a única barreira
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

- [x] **8.1 — Tabelas + funções + policies:**

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

- [x] **8.2 — (recomendado) Backfill**: donos atuais viram participantes dos
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

- [x] **8.3 — (opcional) Conferir o caminho feliz**: crie um torneio pela app
  (você deve nascer participante e com link de convite); abra o link numa
  janela anônima com OUTRA conta e aceite; confira que o convidado aparece na
  lista e nos selects de nova partida.

- [x] **8.4 — (recomendado) Conferir as TRAVAS** (as funções/policies são a
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

---

## 9. Supabase — formato de torneio Liga (`add-league-format`)

Formato Liga: o torneio nasce em rascunho, participantes entram pelo convite,
e o dono "inicia" — a tabela round-robin é gerada de uma vez (com rodadas) e o
torneio fica ativo. **Sem isto, criar torneio pela app FALHA** (a action passa
a enviar `formato`/`ida_e_volta`, que ainda não existem) **e a página do
torneio quebra** (o fetcher seleciona as colunas novas). Aplicar no **SQL
Editor** (idempotente; rode o bloco INTEIRO):

- [x] **9.1 — Enum + colunas + CHECK + policy + funções:**

```sql
-- Enum de formato (formatos futuros entram com ADD VALUE).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tournament_format') then
    create type public.tournament_format as enum ('avulso', 'liga');
  end if;
end$$;

-- Colunas (aditivo). Default 'avulso' preserva os torneios existentes.
alter table public.tournaments
  add column if not exists formato public.tournament_format not null default 'avulso';
alter table public.tournaments
  add column if not exists ida_e_volta boolean not null default false;

-- Rodada da liga (NULL = partida avulsa, todas as legadas).
alter table public.matches
  add column if not exists rodada integer;

alter table public.matches drop constraint if exists matches_rodada_positiva;
alter table public.matches
  add constraint matches_rodada_positiva
  check (rodada is null or rodada >= 1);

-- Barreira contra dupla geração da tabela (corrida entre duas abas): o INSERT
-- em lote perdedor falha inteiro (23505), sem estado parcial.
create unique index if not exists matches_liga_par_unico
  on public.matches (tournament_id, rodada, participante_1, participante_2)
  where rodada is not null;

-- INSERT de partida: em liga, só o caminho da geração (rodada preenchida).
drop policy if exists matches_insert_tournament_owner on public.matches;
create policy matches_insert_tournament_owner on public.matches
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
        and (t.formato = 'avulso' or matches.rodada is not null)
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

-- Trigger de relações: rodada vira imutável via anon/authenticated.
create or replace function public.lock_match_relations()
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
    if new.participante_1 is distinct from old.participante_1
       or new.participante_2 is distinct from old.participante_2
       or new.tournament_id is distinct from old.tournament_id
       or new.rodada is distinct from old.rodada
    then
      raise exception 'Não é permitido alterar participantes, torneio ou rodada da partida';
    end if;
  end if;
  return new;
end;
$$;

-- Aceite do convite: liga já iniciada não recebe ninguém.
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
  v_formato public.tournament_format;
begin
  if v_uid is null then
    raise exception 'Você precisa estar autenticado para aceitar um convite';
  end if;

  select i.tournament_id, t.status, t.formato
    into v_tournament, v_status, v_formato
    from public.tournament_invites i
    join public.tournaments t on t.id = i.tournament_id
   where i.code = codigo;

  if v_tournament is null then
    raise exception 'Convite inválido ou expirado';
  end if;
  if v_status = 'encerrado' then
    raise exception 'Este torneio está encerrado e não aceita novos participantes';
  end if;
  if v_formato = 'liga' and v_status <> 'rascunho' then
    raise exception 'Esta liga já foi iniciada e não aceita novos participantes';
  end if;

  insert into public.participants (tournament_id, user_id)
  values (v_tournament, v_uid)
  on conflict do nothing;

  return v_tournament;
end;
$$;

-- Preview do convite agora expõe o formato (a página explica liga iniciada
-- ANTES do clique). Mudar o RETURNS TABLE exige DROP + CREATE — o DROP
-- derruba os GRANTs, re-aplicados logo abaixo.
drop function if exists public.info_convite(text);
create function public.info_convite(codigo text)
returns table (
  tournament_id uuid,
  titulo text,
  status public.tournament_status,
  formato public.tournament_format,
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
    t.formato,
    exists (
      select 1 from public.participants p
      where p.tournament_id = t.id
        and p.user_id = (select auth.uid())
    ) as ja_participa
  from public.tournament_invites i
  join public.tournaments t on t.id = i.tournament_id
  where i.code = codigo;
$$;

-- GRANTs (CREATE FUNCTION dá EXECUTE a PUBLIC; o DROP acima apagou os
-- anteriores de info_convite — re-aplicar TODOS é idempotente e seguro):
revoke execute on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;
revoke execute on function public.info_convite(text) from public, anon;
grant execute on function public.info_convite(text) to authenticated;
```

- [x] **9.2 — (opcional) Conferir o caminho feliz**: crie um torneio formato
  Liga pela app (deve nascer "em rascunho"); entre com OUTRA conta pelo link
  de convite; como dono, clique "Iniciar torneio" e confira a tabela gerada
  (partidas com "R1", "R2"… na página do torneio) e o status "ativo".

- [x] **9.3 — (recomendado) Conferir as TRAVAS** (policies/funções são a única
  barreira contra POST direto — os testes unitários não as executam). Com o
  token de um usuário comum:

```sql
-- Deve FALHAR (partida manual sem rodada em liga, mesmo sendo o dono):
-- insert into public.matches (tournament_id) values ('<sua-liga>');

-- Deve FALHAR (aceitar convite de liga já iniciada):
-- select public.aceitar_convite('<codigo-de-liga-ativa>');

-- Deve FALHAR (renumerar rodada por POST direto):
-- update public.matches set rodada = 99 where id = '<partida-de-liga>';

-- Deve FALHAR (CHECK de rodada):
-- update public.matches set rodada = 0 where id = '<partida>';  -- via service_role
```

> Fonte de verdade: `supabase/schema.sql` (enum/colunas/CHECK/índice, policy
> de INSERT de matches, lock_match_relations, aceitar_convite, info_convite).
>
> Rollback: recriar `aceitar_convite`/`lock_match_relations` e
> `matches_insert_tournament_owner` nas versões da seção 8 (assinaturas
> inalteradas — CREATE OR REPLACE basta). Para `info_convite` o tipo de
> retorno MUDOU: é obrigatório `drop function if exists public.info_convite(text);`
> antes de recriar a versão da seção 8, e re-aplicar os GRANTs
> (`revoke ... from public, anon; grant ... to authenticated;`) — o DROP os
> remove. Depois:
> `drop index if exists public.matches_liga_par_unico;`
> `alter table public.matches drop constraint matches_rodada_positiva;`
> `alter table public.matches drop column rodada;`
> `alter table public.tournaments drop column formato, drop column ida_e_volta;`
> `drop type public.tournament_format;`

---

## 10. Supabase — formato de torneio Mata-mata (`add-knockout-format`)

Formato Mata-mata (eliminatórias): o torneio nasce em rascunho, participantes
entram pelo convite, o dono "inicia" escolhendo o chaveamento (sorteio, potes
ou montagem manual) — a 1ª fase é gerada com slots (`posicao`/`perna`) e o
torneio fica ativo; o dono avança fase a fase. **Sem isto, criar torneio pela
app FALHA** (a action passa a enviar `terceiro_lugar`, que ainda não existe)
**e a página do torneio quebra** (o fetcher seleciona `terceiro_lugar`,
`posicao` e `perna`). Aplicar no **SQL Editor** em **DOIS Runs separados** —
o Postgres proíbe usar um valor novo de enum na mesma transação que o criou:

- [x] **10.1 — Bloco A (rode SOZINHO e primeiro):**

```sql
-- Novo valor do enum de formato (aditivo; idempotente).
alter type public.tournament_format add value if not exists 'mata_mata';
```

- [x] **10.2 — Bloco B (colunas + CHECKs + índice + triggers + função):**

```sql
-- Disputa de 3º lugar (só significativo em mata-mata; default preserva tudo).
alter table public.tournaments
  add column if not exists terceiro_lugar boolean not null default false;

-- Slot na chave: posicao = confronto dentro da fase (pareamento da fase
-- seguinte é função dela: vencedor do slot 2i-1 × slot 2i → slot i);
-- perna = 1|2 em ida-e-volta (NULL em jogo único/bye).
alter table public.matches
  add column if not exists posicao integer;
alter table public.matches
  add column if not exists perna smallint;

alter table public.matches drop constraint if exists matches_posicao_positiva;
alter table public.matches
  add constraint matches_posicao_positiva
  check (posicao is null or posicao >= 1);

alter table public.matches drop constraint if exists matches_perna_valida;
alter table public.matches
  add constraint matches_perna_valida
  check (perna is null or perna in (1, 2));

-- Unicidade do slot: barra dupla geração de fase (corrida) e slot duplicado
-- por POST direto. NULLS NOT DISTINCT é essencial: com o default, perna NULL
-- duplicaria slots de jogo único silenciosamente.
create unique index if not exists matches_mata_mata_slot_unico
  on public.matches (tournament_id, rodada, posicao, perna)
  nulls not distinct
  where posicao is not null;

-- lock_match_relations passa a travar também posicao/perna (renumerar slot
-- reescreveria a chave). Assinatura inalterada: OR REPLACE preserva grants.
create or replace function public.lock_match_relations()
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
    if new.participante_1 is distinct from old.participante_1
       or new.participante_2 is distinct from old.participante_2
       or new.tournament_id is distinct from old.tournament_id
       or new.rodada is distinct from old.rodada
       or new.posicao is distinct from old.posicao
       or new.perna is distinct from old.perna
    then
      raise exception 'Não é permitido alterar participantes, torneio, rodada ou slot da partida';
    end if;
  end if;
  return new;
end;
$$;

-- Resultado decisivo + chave congelada após avanço (backstop de POST direto;
-- as Server Actions repetem as checagens com mensagem precisa).
create or replace function public.valida_resultado_mata_mata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_formato public.tournament_format;
  v_outra_status public.match_status;
  v_outra_placar_1 integer;
  v_outra_placar_2 integer;
  v_encerrando boolean := new.status = 'encerrada' and old.status <> 'encerrada';
  v_reabrindo boolean := old.status = 'encerrada' and new.status <> 'encerrada';
begin
  if coalesce(
       current_setting('request.jwt.claims', true)::jsonb ->> 'role',
       ''
     ) = 'service_role'
  then
    return new;
  end if;

  if new.rodada is null or not (v_encerrando or v_reabrindo) then
    return new;
  end if;

  select t.formato into v_formato
    from public.tournaments t
   where t.id = new.tournament_id;
  if v_formato is distinct from 'mata_mata'::public.tournament_format then
    return new;
  end if;

  if v_encerrando then
    if new.participante_1 is null or new.participante_2 is null then
      return new; -- bye: avanço direto, sem placar a validar
    end if;
    if new.perna is null then
      if new.placar_1 = new.placar_2 then
        raise exception 'Jogo decisivo de mata-mata não pode terminar empatado';
      end if;
    elsif new.perna = 2 then
      select m.status, m.placar_1, m.placar_2
        into v_outra_status, v_outra_placar_1, v_outra_placar_2
        from public.matches m
       where m.tournament_id = new.tournament_id
         and m.rodada = new.rodada
         and m.posicao = new.posicao
         and m.perna = 1;
      if not found or v_outra_status <> 'encerrada' then
        raise exception 'Encerre o jogo de ida antes do jogo de volta';
      end if;
      if (v_outra_placar_1 + new.placar_2) = (v_outra_placar_2 + new.placar_1) then
        raise exception 'Agregado empatado: o placar da volta deve incluir a decisão';
      end if;
    elsif new.perna = 1 then
      -- Re-encerramento da ida com a volta já fechada (reabrir→corrigir→
      -- re-encerrar): revalida o agregado completo. Aqui NEW é a ida, então
      -- agregado do mandante = new.placar_1 + volta.placar_2.
      select m.status, m.placar_1, m.placar_2
        into v_outra_status, v_outra_placar_1, v_outra_placar_2
        from public.matches m
       where m.tournament_id = new.tournament_id
         and m.rodada = new.rodada
         and m.posicao = new.posicao
         and m.perna = 2;
      if found and v_outra_status = 'encerrada'
         and (new.placar_1 + v_outra_placar_2) = (new.placar_2 + v_outra_placar_1)
      then
        raise exception 'Agregado empatado: corrija o placar antes de encerrar';
      end if;
    end if;
  end if;

  if v_reabrindo then
    if new.participante_1 is null or new.participante_2 is null then
      raise exception 'Partida de avanço direto (bye) não pode ser reaberta';
    end if;
    if exists (
      select 1 from public.matches m
      where m.tournament_id = new.tournament_id
        and m.rodada > new.rodada
    ) then
      raise exception 'A fase seguinte já foi gerada — as fases anteriores estão congeladas';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_valida_resultado_mata_mata on public.matches;
create trigger matches_valida_resultado_mata_mata
  before update on public.matches
  for each row execute function public.valida_resultado_mata_mata();

-- aceitar_convite generaliza o bloqueio de adesão tardia: qualquer formato
-- GERADO (<> 'avulso') fora de rascunho rejeita — formato futuro herda a
-- regra (falha-segura). Assinatura inalterada: OR REPLACE preserva grants.
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
  v_formato public.tournament_format;
begin
  if v_uid is null then
    raise exception 'Você precisa estar autenticado para aceitar um convite';
  end if;

  select i.tournament_id, t.status, t.formato
    into v_tournament, v_status, v_formato
    from public.tournament_invites i
    join public.tournaments t on t.id = i.tournament_id
   where i.code = codigo;

  if v_tournament is null then
    raise exception 'Convite inválido ou expirado';
  end if;
  if v_status = 'encerrado' then
    raise exception 'Este torneio está encerrado e não aceita novos participantes';
  end if;
  if v_formato <> 'avulso' and v_status <> 'rascunho' then
    raise exception 'Este torneio já foi iniciado e não aceita novos participantes';
  end if;

  insert into public.participants (tournament_id, user_id)
  values (v_tournament, v_uid)
  on conflict do nothing;

  return v_tournament;
end;
$$;

-- Mata-mata ATIVO congela a lista de participantes: a chave avança fase a
-- fase e o INSERT da fase seguinte exige cada vencedor em participants —
-- uma saída no meio travaria o "Avançar fase" PARA SEMPRE. Rascunho e
-- encerrado seguem livres. (Este é o motivo de o ALTER TYPE do bloco A
-- precisar de um Run separado: esta policy usa 'mata_mata' em DDL.)
drop policy if exists participants_delete_self_or_owner on public.participants;
create policy participants_delete_self_or_owner on public.participants
  for delete to authenticated
  using (
    (
      user_id = auth.uid()
      or exists (
        select 1 from public.tournaments t
        where t.id = tournament_id
          and t.created_by = auth.uid()
      )
    )
    and not exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.formato = 'mata_mata'
        and t.status = 'ativo'
    )
  );
```

- [x] **10.3 — (recomendado) Conferir o caminho feliz**: crie um torneio
  Mata-mata pela app (deve nascer "em rascunho"); entre com OUTRA conta pelo
  link de convite; como dono, inicie por **sorteio** e confira a chave gerada
  (página do torneio mostra a seção "Chave" com as fases); lance um placar com
  vencedor, encerre, clique **Avançar fase** e confira a fase seguinte. Com 3
  participantes, confira o bye ("Avança direto") na chave.

- [x] **10.4 — (recomendado) Conferir as TRAVAS** (triggers/índice são a única
  barreira contra POST direto — os testes unitários não os executam):

```sql
-- Deve FALHAR (encerrar jogo único de mata-mata empatado, mesmo sendo dono):
-- update public.matches set status = 'encerrada'
--   where id = '<partida-de-mata-mata-0x0>';

-- Deve FALHAR (reabrir partida com fase posterior já gerada):
-- update public.matches set status = 'em_andamento'
--   where id = '<partida-da-fase-1-apos-avancar>';

-- Deve FALHAR (renumerar slot por POST direto):
-- update public.matches set posicao = 99 where id = '<partida-de-mata-mata>';

-- Deve FALHAR (aceitar convite de mata-mata já iniciado):
-- select public.aceitar_convite('<codigo-de-mata-mata-ativo>');

-- Deve FALHAR (sair/remover de mata-mata ATIVO — 0 linhas deletadas):
-- delete from public.participants
--   where tournament_id = '<mata-mata-ativo>' and user_id = auth.uid();

-- Deve FALHAR (23505 — slot duplicado; via service_role):
-- insert into public.matches (tournament_id, rodada, posicao)
--   values ('<torneio>', 1, 1);
```

> Fonte de verdade: `supabase/schema.sql` (enum/colunas/CHECKs/índice,
> lock_match_relations, valida_resultado_mata_mata, aceitar_convite, policy
> de DELETE de participants).
>
> Rollback: recriar `aceitar_convite`/`lock_match_relations` nas versões da
> seção 9 (assinaturas inalteradas — CREATE OR REPLACE basta, grants
> preservados) e a policy `participants_delete_self_or_owner` na versão da
> seção 8 (sem a cláusula de mata-mata). Depois:
> `drop trigger if exists matches_valida_resultado_mata_mata on public.matches;`
> `drop function if exists public.valida_resultado_mata_mata();`
> `drop index if exists public.matches_mata_mata_slot_unico;`
> `alter table public.matches drop constraint matches_posicao_positiva, drop constraint matches_perna_valida;`
> `alter table public.matches drop column posicao, drop column perna;`
> `alter table public.tournaments drop column terceiro_lugar;`
> O valor `'mata_mata'` do enum NÃO é removível (limitação do Postgres) —
> fica órfão e inofensivo (nenhuma linha o usa após o rollback).

---

## 11. Supabase — congelamento estendido de participants (`add-tournament-closing`)

O encerramento/reabertura de torneio pela app não exige DDL, MAS estendeu a
regra de saída do mata-mata: com a chave GERADA, sair/remover ficam bloqueados
também em torneio `encerrado` (encerrado agora é reabrível — a sequência
encerrar → sair → reabrir travaria o avanço de fase para sempre). As actions e
a UI já aplicam a regra; **sem isto o app funciona**, mas o backstop do banco
contra POST direto fica defasado. Aplicar no **SQL Editor** (idempotente):

- [x] **11.1 — Policy de DELETE reescrita:**

```sql
drop policy if exists participants_delete_self_or_owner on public.participants;
create policy participants_delete_self_or_owner on public.participants
  for delete to authenticated
  using (
    (
      user_id = auth.uid()
      or exists (
        select 1 from public.tournaments t
        where t.id = tournament_id
          and t.created_by = auth.uid()
      )
    )
    and not exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.formato = 'mata_mata'
        and (
          t.status = 'ativo'
          or exists (
            select 1 from public.matches m
            where m.tournament_id = t.id
              and m.rodada is not null
          )
        )
    )
  );
```

- [x] **11.2 — (opcional) Conferir a trava**: num mata-mata ENCERRADO cuja
  chave foi gerada, `delete from public.participants where tournament_id =
  '<id>' and user_id = auth.uid();` deve afetar **0 linhas**; num mata-mata
  encerrado SEM chave (cancelado no rascunho), deve afetar 1.

> Fonte de verdade: `supabase/schema.sql` (policy de DELETE de participants).
>
> Rollback: recriar a policy na versão da seção 10 (cláusula só com
> `t.status = 'ativo'`).

---

## 12. Supabase — formatos Grupos + mata-mata e Fase de liga (`add-group-stage-format`)

Formatos estilo Copa (grupos → chave) e Champions (liga única → chave). **Sem
isto os formatos novos ficam indisponíveis** (o form os oferece, mas o INSERT
falha com valor de enum inexistente); os formatos existentes NÃO são afetados.
Aplicar no **SQL Editor** em **DOIS Runs separados** — o Postgres proíbe usar
valores novos de enum na mesma transação que os criou, e a policy do bloco B
os referencia em DDL:

- [x] **12.1 — Bloco A (rode SOZINHO e primeiro):**

```sql
-- Novos valores do enum de formato (aditivo; idempotente).
alter type public.tournament_format add value if not exists 'grupos_mata_mata';
alter type public.tournament_format add value if not exists 'fase_liga';
```

- [x] **12.2 — Bloco B (colunas + CHECKs + lock + trigger + policy):**

```sql
-- Classificados por grupo (K): gravado ao INICIAR um formato de grupos —
-- o "Gerar mata-mata" o consome depois. NULL nos demais formatos.
alter table public.tournaments
  add column if not exists classificados_por_grupo integer;

alter table public.tournaments drop constraint if exists tournaments_classificados_positivo;
alter table public.tournaments
  add constraint tournaments_classificados_positivo
  check (classificados_por_grupo is null or classificados_por_grupo >= 1);

-- Número do grupo: partida de GRUPO = grupo + rodada; partida de CHAVE =
-- posicao + rodada (+ perna). Mutuamente exclusivos.
alter table public.matches
  add column if not exists grupo integer;

alter table public.matches drop constraint if exists matches_grupo_positivo;
alter table public.matches
  add constraint matches_grupo_positivo
  check (grupo is null or grupo >= 1);

alter table public.matches drop constraint if exists matches_grupo_ou_posicao;
alter table public.matches
  add constraint matches_grupo_ou_posicao
  check (grupo is null or posicao is null);

-- lock_match_relations passa a travar também `grupo` (assinatura inalterada:
-- OR REPLACE preserva grants).
create or replace function public.lock_match_relations()
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
    if new.participante_1 is distinct from old.participante_1
       or new.participante_2 is distinct from old.participante_2
       or new.tournament_id is distinct from old.tournament_id
       or new.rodada is distinct from old.rodada
       or new.posicao is distinct from old.posicao
       or new.perna is distinct from old.perna
       or new.grupo is distinct from old.grupo
    then
      raise exception 'Não é permitido alterar participantes, torneio, rodada, grupo ou slot da partida';
    end if;
  end if;
  return new;
end;
$$;

-- valida_resultado_mata_mata passa a cobrir os TRÊS formatos com chave;
-- regras de resultado SÓ em partidas de chave (posicao não nula) — jogo de
-- GRUPO empata e reabre livre ATÉ a chave existir (depois a classificação
-- foi consumida pelo cruzamento).
create or replace function public.valida_resultado_mata_mata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_formato public.tournament_format;
  v_outra_status public.match_status;
  v_outra_placar_1 integer;
  v_outra_placar_2 integer;
  v_encerrando boolean := new.status = 'encerrada' and old.status <> 'encerrada';
  v_reabrindo boolean := old.status = 'encerrada' and new.status <> 'encerrada';
begin
  if coalesce(
       current_setting('request.jwt.claims', true)::jsonb ->> 'role',
       ''
     ) = 'service_role'
  then
    return new;
  end if;

  if new.rodada is null or not (v_encerrando or v_reabrindo) then
    return new;
  end if;

  select t.formato into v_formato
    from public.tournaments t
   where t.id = new.tournament_id;
  if v_formato not in ('mata_mata', 'grupos_mata_mata', 'fase_liga') then
    return new;
  end if;

  if v_encerrando and new.posicao is not null then
    if new.participante_1 is null or new.participante_2 is null then
      return new; -- bye: avanço direto, sem placar a validar
    end if;
    if new.perna is null then
      if new.placar_1 = new.placar_2 then
        raise exception 'Jogo decisivo de mata-mata não pode terminar empatado';
      end if;
    elsif new.perna = 2 then
      select m.status, m.placar_1, m.placar_2
        into v_outra_status, v_outra_placar_1, v_outra_placar_2
        from public.matches m
       where m.tournament_id = new.tournament_id
         and m.rodada = new.rodada
         and m.posicao = new.posicao
         and m.perna = 1;
      if not found or v_outra_status <> 'encerrada' then
        raise exception 'Encerre o jogo de ida antes do jogo de volta';
      end if;
      if (v_outra_placar_1 + new.placar_2) = (v_outra_placar_2 + new.placar_1) then
        raise exception 'Agregado empatado: o placar da volta deve incluir a decisão';
      end if;
    elsif new.perna = 1 then
      -- Re-encerramento da ida com a volta já fechada (reabrir→corrigir→
      -- re-encerrar): revalida o agregado completo. Aqui NEW é a ida, então
      -- agregado do mandante = new.placar_1 + volta.placar_2.
      select m.status, m.placar_1, m.placar_2
        into v_outra_status, v_outra_placar_1, v_outra_placar_2
        from public.matches m
       where m.tournament_id = new.tournament_id
         and m.rodada = new.rodada
         and m.posicao = new.posicao
         and m.perna = 2;
      if found and v_outra_status = 'encerrada'
         and (new.placar_1 + v_outra_placar_2) = (new.placar_2 + v_outra_placar_1)
      then
        raise exception 'Agregado empatado: corrija o placar antes de encerrar';
      end if;
    end if;
  end if;

  if v_reabrindo then
    if new.posicao is not null then
      if new.participante_1 is null or new.participante_2 is null then
        raise exception 'Partida de avanço direto (bye) não pode ser reaberta';
      end if;
      if exists (
        select 1 from public.matches m
        where m.tournament_id = new.tournament_id
          and m.posicao is not null
          and m.rodada > new.rodada
      ) then
        raise exception 'A fase seguinte já foi gerada — as fases anteriores estão congeladas';
      end if;
    elsif new.grupo is not null then
      if exists (
        select 1 from public.matches m
        where m.tournament_id = new.tournament_id
          and m.posicao is not null
      ) then
        raise exception 'O mata-mata já foi gerado — a classificação dos grupos está congelada';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists matches_valida_resultado_mata_mata on public.matches;
create trigger matches_valida_resultado_mata_mata
  before update on public.matches
  for each row execute function public.valida_resultado_mata_mata();

-- Congelamento de participants estendido aos formatos novos (a chave —
-- atual ou FUTURA, no caso dos grupos — exige cada semeado em participants).
drop policy if exists participants_delete_self_or_owner on public.participants;
create policy participants_delete_self_or_owner on public.participants
  for delete to authenticated
  using (
    (
      user_id = auth.uid()
      or exists (
        select 1 from public.tournaments t
        where t.id = tournament_id
          and t.created_by = auth.uid()
      )
    )
    and not exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.formato in ('mata_mata', 'grupos_mata_mata', 'fase_liga')
        and (
          t.status = 'ativo'
          or exists (
            select 1 from public.matches m
            where m.tournament_id = t.id
              and m.rodada is not null
          )
        )
    )
  );
```

- [x] **12.3 — (recomendado) Conferir o caminho feliz**: crie um torneio
  "Grupos + mata-mata" pela app; entre com outras contas pelo convite (4+);
  inicie com 2 grupos × 2 classificados; encerre os jogos dos grupos; clique
  "Gerar mata-mata" e confira a chave (semifinais com cruzamento A1×B2 /
  B1×A2); avance até o campeão. Repita rápido com "Fase de liga".

- [x] **12.4 — (recomendado) Conferir as TRAVAS**:

```sql
-- Deve FALHAR (grupo e posicao na mesma partida):
-- insert into public.matches (tournament_id, rodada, grupo, posicao)
--   values ('<torneio>', 1, 1, 1);  -- via service_role

-- Deve FALHAR (reabrir jogo de grupo com o mata-mata já gerado):
-- update public.matches set status = 'em_andamento'
--   where id = '<jogo-de-grupo-encerrado-apos-gerar-chave>';

-- Deve FALHAR (sair de torneio de grupos ATIVO — 0 linhas deletadas):
-- delete from public.participants
--   where tournament_id = '<grupos-ativo>' and user_id = auth.uid();
```

> Fonte de verdade: `supabase/schema.sql` (enum/colunas/CHECKs,
> lock_match_relations, valida_resultado_mata_mata, policy de participants).
>
> Rollback: recriar `lock_match_relations`/`valida_resultado_mata_mata` e a
> policy `participants_delete_self_or_owner` nas versões da seção 10/11
> (assinaturas inalteradas — CREATE OR REPLACE/DROP POLICY bastam). Depois:
> `alter table public.matches drop constraint matches_grupo_positivo, drop constraint matches_grupo_ou_posicao;`
> `alter table public.matches drop column grupo;`
> `alter table public.tournaments drop constraint tournaments_classificados_positivo;`
> `alter table public.tournaments drop column classificados_por_grupo;`
> Os valores novos do enum NÃO são removíveis (limitação do Postgres) —
> ficam órfãos e inofensivos.

---

## 13) Modelo clube-cêntrico — vagas de clube, convite por vaga (add-club-tournaments)

Torneios COMPETITIVOS (liga, mata-mata, grupos, fase de liga) passam a ser de
CLUBES: vagas (`tournament_slots`) com técnico anulável e convite por vaga.
`participants`/convite genérico ficam EXCLUSIVOS do formato avulso. Partidas
competitivas referenciam VAGAS (`matches.vaga_1/vaga_2`).

**Pré-requisito — limpeza dos dados de teste** (decisão de 2026-06-07: dados
descartáveis; torneios competitivos antigos não têm vagas e quebrariam a UI):

```sql
delete from public.tournaments where formato <> 'avulso';
```

- [x] **13.1 — Run único (tabelas, colunas, RPCs, trigger, policies):**

```sql
-- ---------- Tabela: tournament_slots (vaga de CLUBE no torneio) ----------
-- Modelo clube-cêntrico (2026-06-07): nos formatos COMPETITIVOS (liga,
-- mata_mata, grupos_mata_mata, fase_liga) a disputa é entre VAGAS — cada
-- vaga É um clube; o técnico (user) é metadado ANULÁVEL e substituível a
-- qualquer momento sem tocar partidas. `participants` segue EXCLUSIVO do
-- formato avulso. user_id SET NULL: apagar a conta esvazia a vaga sem
-- derrubar o torneio. team RESTRICT: explicita a dependência do cache.
create table if not exists public.tournament_slots (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  team_id       uuid not null references public.teams (id) on delete restrict,
  user_id       uuid references public.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  constraint slots_team_unico_no_torneio unique (tournament_id, team_id)
);

create index if not exists tournament_slots_tournament_idx
  on public.tournament_slots (tournament_id);
create index if not exists tournament_slots_user_idx
  on public.tournament_slots (user_id);
-- Um usuário comanda no MAIOR um clube por torneio (parcial: vagas órfãs
-- convivem aos montes).
create unique index if not exists slots_um_clube_por_tecnico
  on public.tournament_slots (tournament_id, user_id)
  where user_id is not null;

-- ---------- Tabela: slot_invites (código de convite POR VAGA, 1:1) ----------
-- Mesmo padrão do tournament_invites: o código é SEGREDO do dono e mora FORA
-- de tabela com SELECT amplo (slots são visíveis a quem vê o torneio).
-- Regenerar é UPDATE do code — o link antigo morre atomicamente.
create table if not exists public.slot_invites (
  slot_id    uuid primary key references public.tournament_slots (id) on delete cascade,
  code       text not null unique,
  created_at timestamptz not null default now()
);

-- Lados por VAGA (modelo clube-cêntrico; aditivo, idempotente). Partidas de
-- formatos COMPETITIVOS referenciam vagas; `participante_1/2` ficam SÓ para
-- o avulso. RESTRICT: a partida nunca perde o lado (vagas são imutáveis fora
-- do rascunho). Bye na chave = vaga_2 NULL com vaga_1 preenchida (espelho do
-- modelo por participante).
alter table public.matches
  add column if not exists vaga_1 uuid references public.tournament_slots (id) on delete restrict;
alter table public.matches
  add column if not exists vaga_2 uuid references public.tournament_slots (id) on delete restrict;

create index if not exists matches_vaga_1_idx on public.matches (vaga_1);
create index if not exists matches_vaga_2_idx on public.matches (vaga_2);

-- Uma partida usa UM modelo de lado: pessoas (avulso) OU vagas (competitivo).
alter table public.matches drop constraint if exists matches_lado_vaga_ou_user;
alter table public.matches
  add constraint matches_lado_vaga_ou_user
  check (
    (participante_1 is null and participante_2 is null)
    or (vaga_1 is null and vaga_2 is null)
  );

alter table public.matches drop constraint if exists matches_vagas_distintas;
alter table public.matches
  add constraint matches_vagas_distintas
  check (vaga_1 is null or vaga_2 is null or vaga_1 <> vaga_2);

-- Barreira de dupla geração da liga POR VAGA (mesma semântica do índice por
-- participante — que segue valendo para o histórico avulso/legado): pares de
-- vagas idênticos na mesma rodada colidem. Grupos seguem serializados pelo
-- promote-first (partições divergentes não colidem aqui).
create unique index if not exists matches_liga_par_unico_vaga
  on public.matches (tournament_id, rodada, vaga_1, vaga_2)
  where rodada is not null and vaga_1 is not null;

alter table public.tournament_slots   enable row level security;
alter table public.slot_invites       enable row level security;

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
  )
  or exists (
    -- Modelo clube-cêntrico: técnico de vaga também "participa" (vê torneio
    -- privado em que comanda clube).
    select 1 from public.tournament_slots s
    where s.tournament_id = t_id
      and s.user_id = (select auth.uid())
  );
$$;

create or replace function public.lock_match_relations()
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
    if new.participante_1 is distinct from old.participante_1
       or new.participante_2 is distinct from old.participante_2
       or new.vaga_1 is distinct from old.vaga_1
       or new.vaga_2 is distinct from old.vaga_2
       or new.tournament_id is distinct from old.tournament_id
       or new.rodada is distinct from old.rodada
       or new.posicao is distinct from old.posicao
       or new.perna is distinct from old.perna
       or new.grupo is distinct from old.grupo
    then
      raise exception 'Não é permitido alterar participantes, torneio, rodada, grupo ou slot da partida';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists matches_lock_relations on public.matches;
create trigger matches_lock_relations
  before update on public.matches
  for each row execute function public.lock_match_relations();

-- ---------- RPCs de convite POR VAGA (modelo clube-cêntrico) ----------
-- aceitar_convite_vaga: assume a vaga se (e só se) ela estiver VAZIA — o
-- UPDATE filtrado por user_id IS NULL é a serialização da corrida entre dois
-- aceites (0 linhas = perdeu/ocupada). DIFERENTE do convite genérico: vale
-- com o torneio ATIVO (substituição no meio do torneio é o requisito) — só
-- 'encerrado' recusa. O unique parcial slots_um_clube_por_tecnico barra quem
-- já comanda outro clube (23505 → mensagem da action).
create or replace function public.aceitar_convite_vaga(codigo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := auth.uid();
  v_slot       uuid;
  v_tournament uuid;
  v_status     public.tournament_status;
  v_linhas     integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select si.slot_id, ts.tournament_id, t.status
    into v_slot, v_tournament, v_status
    from public.slot_invites si
    join public.tournament_slots ts on ts.id = si.slot_id
    join public.tournaments t on t.id = ts.tournament_id
   where si.code = codigo;

  if v_slot is null then
    raise exception 'CONVITE_INVALIDO';
  end if;
  if v_status = 'encerrado' then
    raise exception 'TORNEIO_ENCERRADO';
  end if;

  update public.tournament_slots
     set user_id = v_uid
   where id = v_slot
     and user_id is null;
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'VAGA_OCUPADA';
  end if;

  return v_tournament;
end;
$$;

-- Preview do convite de vaga (página pública /convite/[codigo] para logados):
-- devolve o suficiente para a tela decidir o caminho, sem vazar nada além.
drop function if exists public.info_convite_vaga(text);
create function public.info_convite_vaga(codigo text)
returns table (
  tournament_id uuid,
  titulo        text,
  status        public.tournament_status,
  clube         text,
  escudo_url    text,
  vaga_ocupada  boolean,
  ja_tem_vaga   boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         t.titulo,
         t.status,
         tm.nome,
         tm.escudo_url,
         ts.user_id is not null,
         exists (
           select 1 from public.tournament_slots s2
           where s2.tournament_id = t.id
             and s2.user_id = auth.uid()
         )
    from public.slot_invites si
    join public.tournament_slots ts on ts.id = si.slot_id
    join public.teams tm on tm.id = ts.team_id
    join public.tournaments t on t.id = ts.tournament_id
   where si.code = codigo;
$$;

revoke execute on function public.aceitar_convite_vaga(text) from public, anon;
grant execute on function public.aceitar_convite_vaga(text) to authenticated;
revoke execute on function public.info_convite_vaga(text) from public, anon;
grant execute on function public.info_convite_vaga(text) to authenticated;

-- ---------- Trigger: vagas imutáveis fora do rascunho ----------
-- Clube e torneio da vaga são a GEOMETRIA da disputa: editáveis só em
-- rascunho (policies) e travados aqui como defesa extra. user_id (técnico)
-- fica de fora — trocar técnico é o ponto do modelo.
create or replace function public.lock_slot_relations()
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
    if new.tournament_id is distinct from old.tournament_id then
      raise exception 'Não é permitido mover a vaga de torneio';
    end if;
    if new.team_id is distinct from old.team_id
       and exists (
         select 1 from public.tournaments t
         where t.id = old.tournament_id
           and t.status <> 'rascunho'
       )
    then
      raise exception 'O clube da vaga não pode mudar após o início do torneio';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_slots_lock_relations on public.tournament_slots;
create trigger tournament_slots_lock_relations
  before update on public.tournament_slots
  for each row execute function public.lock_slot_relations();

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
    or exists (
      select 1 from public.tournament_slots s
      where s.id in (matches.vaga_1, matches.vaga_2)
        and s.user_id = auth.uid()
    )
  );

drop policy if exists matches_insert_tournament_owner on public.matches;
create policy matches_insert_tournament_owner on public.matches
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
        and (t.formato = 'avulso' or matches.rodada is not null)
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
    -- Lados por VAGA: cada vaga informada precisa pertencer AO torneio da
    -- partida (vaga estrangeira corromperia a disputa de terceiros).
    and (vaga_1 is null or exists (
      select 1 from public.tournament_slots s
      where s.id = matches.vaga_1
        and s.tournament_id = matches.tournament_id
    ))
    and (vaga_2 is null or exists (
      select 1 from public.tournament_slots s
      where s.id = matches.vaga_2
        and s.tournament_id = matches.tournament_id
    ))
  );

drop policy if exists matches_update_participant on public.matches;
create policy matches_update_participant on public.matches
  for update to authenticated
  using (
    auth.uid() = participante_1
    or auth.uid() = participante_2
    or exists (
      select 1 from public.tournament_slots s
      where s.id in (matches.vaga_1, matches.vaga_2)
        and s.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = participante_1
    or auth.uid() = participante_2
    or exists (
      select 1 from public.tournament_slots s
      where s.id in (matches.vaga_1, matches.vaga_2)
        and s.user_id = auth.uid()
    )
  );

-- Modelo clube-cêntrico: participants é EXCLUSIVO do formato avulso e o
-- congelamento por formato com chave MORREU (formatos competitivos usam
-- vagas — sair/expulsar é esvaziar a vaga, livre até o encerramento).
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

-- ----- tournament_invites: TUDO restrito ao dono do torneio -----
-- O código é o segredo que dá entrada — convidado não lê a tabela (valida o
-- código apenas via aceitar_convite/info_convite, security definer).

-- ---------- Policies: tournament_slots (vagas de clube) ----------
-- SELECT: quem vê o torneio vê as vagas (clube + técnico são o elenco
-- público da disputa; o CÓDIGO do convite mora em slot_invites, só do dono).
drop policy if exists slots_select_visivel on public.tournament_slots;
create policy slots_select_visivel on public.tournament_slots
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and (t.is_public
             or t.created_by = auth.uid()
             or public.eh_participante(t.id))
    )
  );

-- INSERT/DELETE: só o dono, e SÓ EM RASCUNHO — a geometria (quais clubes)
-- pertence à disputa depois de gerada. WITH CHECK do INSERT exige vaga
-- nascendo VAZIA (atribuição de técnico só pelo aceite).
drop policy if exists slots_insert_owner_rascunho on public.tournament_slots;
create policy slots_insert_owner_rascunho on public.tournament_slots
  for insert to authenticated
  with check (
    user_id is null
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status = 'rascunho'
    )
  );

drop policy if exists slots_delete_owner_rascunho on public.tournament_slots;
create policy slots_delete_owner_rascunho on public.tournament_slots
  for delete to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status = 'rascunho'
    )
  );

-- UPDATE em dois caminhos, ambos com WITH CHECK que SÓ aceita esvaziar
-- (user_id nulo) — atribuir técnico é EXCLUSIVO do RPC de aceite (consenso
-- por link; o RPC é SECURITY DEFINER e não passa por aqui):
--  1) o PRÓPRIO técnico desiste; 2) o DONO expulsa (qualquer vaga dele).
-- Torneio encerrado congela (não exists rascunho/ativo). A troca de team_id
-- pelo dono em rascunho também passa por aqui (lock_slot_relations trava
-- fora do rascunho).
drop policy if exists slots_update_tecnico_desiste on public.tournament_slots;
create policy slots_update_tecnico_desiste on public.tournament_slots
  for update to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id and t.status <> 'encerrado'
    )
  )
  with check (user_id is null);

drop policy if exists slots_update_owner on public.tournament_slots;
create policy slots_update_owner on public.tournament_slots
  for update to authenticated
  using (
    exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
    )
  )
  with check (
    user_id is null
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
        and t.created_by = auth.uid()
        and t.status <> 'encerrado'
    )
  );

-- ---------- Policies: slot_invites (código por vaga — segredo do dono) ----------
drop policy if exists slot_invites_select_owner on public.slot_invites;
create policy slot_invites_select_owner on public.slot_invites
  for select to authenticated
  using (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists slot_invites_insert_owner on public.slot_invites;
create policy slot_invites_insert_owner on public.slot_invites
  for insert to authenticated
  with check (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists slot_invites_update_owner on public.slot_invites;
create policy slot_invites_update_owner on public.slot_invites
  for update to authenticated
  using (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
    )
  );

drop policy if exists slot_invites_delete_owner on public.slot_invites;
create policy slot_invites_delete_owner on public.slot_invites
  for delete to authenticated
  using (
    exists (
      select 1 from public.tournament_slots s
      join public.tournaments t on t.id = s.tournament_id
      where s.id = slot_id
        and t.created_by = auth.uid()
    )
  );
```

- [x] **13.2 — (recomendado) Conferir o caminho feliz**: crie um torneio
      competitivo pela app (com 2+ clubes), copie o convite de UMA vaga,
      assuma com outra conta, inicie o torneio SEM técnicos nas demais
      vagas e confira a classificação por clube. Desista da vaga e
      reassuma pelo mesmo link (substituição no meio do torneio).

- [x] **13.3 — (recomendado) Conferir as TRAVAS**: tentar UPDATE direto de
      `tournament_slots.user_id` para um uuid de terceiro (deve falhar no
      WITH CHECK — só esvaziar passa); tentar trocar `team_id` com torneio
      ativo (deve falhar no trigger); SELECT em `slot_invites` com conta
      não-dona (0 linhas).

**Rollback**: `drop table public.slot_invites; drop table
public.tournament_slots cascade;` + remover as colunas `vaga_1/vaga_2`, o
CHECK `matches_lado_vaga_ou_user` e o índice `matches_liga_par_unico_vaga`
de matches + restaurar as versões anteriores de `eh_participante`,
`lock_match_relations` e das policies (git do schema.sql).
