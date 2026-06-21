-- ============================================================================
-- add-equipe-campeonato — DDL (PROD bfxmdypdxbbfedtqsqik)
-- Equipe de campeonato: papéis admin/arbitro/moderador em torneios e ligas.
-- Dono-only: apagar (todos os níveis), reabrir/rebaixar, virar temporada,
-- promover admin, transferir posse.
-- ============================================================================

-- ---------- 1. Tabelas ----------
create table if not exists public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id       uuid not null references public.users(id)       on delete cascade,
  papel         text not null check (papel in ('admin','arbitro','moderador')),
  created_at    timestamptz not null default now(),
  created_by    uuid references public.users(id) on delete set null,
  primary key (tournament_id, user_id)
);

create table if not exists public.league_members (
  competition_id uuid not null references public.league_competitions(id) on delete cascade,
  user_id        uuid not null references public.users(id)               on delete cascade,
  papel          text not null check (papel in ('admin','arbitro','moderador')),
  created_at     timestamptz not null default now(),
  created_by     uuid references public.users(id) on delete set null,
  primary key (competition_id, user_id)
);

-- member_invites: link de convite por papel — SÓ árbitro/moderador (admin nunca
-- tem link; entra só por adição direta do dono). Sem UPDATE de papel (regenerar
-- = DELETE+INSERT) → papel imutável por construção.
create table if not exists public.member_invites (
  id             uuid primary key default gen_random_uuid(),
  escopo         text not null check (escopo in ('tournament','league')),
  tournament_id  uuid references public.tournaments(id) on delete cascade,
  competition_id uuid references public.league_competitions(id) on delete cascade,
  papel          text not null check (papel in ('arbitro','moderador')),
  code           text not null unique,
  created_by     uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint member_invites_escopo_xor check (
    (escopo='tournament' and tournament_id is not null and competition_id is null)
    or (escopo='league'  and competition_id is not null and tournament_id is null)
  )
);
create unique index if not exists member_invites_torneio_papel
  on public.member_invites (tournament_id, papel) where tournament_id is not null;
create unique index if not exists member_invites_liga_papel
  on public.member_invites (competition_id, papel) where competition_id is not null;

alter table public.tournament_members enable row level security;
alter table public.league_members     enable row level security;
alter table public.member_invites     enable row level security;

-- ---------- 2. Mapa torneio→liga + helpers de capacidade ----------
-- Resolve a pirâmide-mãe de um torneio (apertura/clausura/final + playoff/barragem).
create or replace function public.liga_do_torneio(p_tid uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select ls.competition_id
    from public.league_division_seasons lds
    join public.league_seasons ls on ls.id = lds.season_id
   where p_tid in (lds.tournament_id, lds.tournament_id_clausura, lds.final_tournament_id)
  union
  select ls.competition_id
    from public.league_boundaries lb
    join public.league_seasons ls on ls.id = lb.season_id
   where lb.playoff_tournament_id = p_tid
  limit 1;
$$;

-- gerir = dono | admin (direto ou herdado da liga)
create or replace function public.pode_gerir_torneio(p_tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.tournaments t where t.id = p_tid and t.created_by = (select auth.uid()))
    or exists (select 1 from public.tournament_members m
                where m.tournament_id = p_tid and m.user_id = (select auth.uid()) and m.papel = 'admin')
    or exists (
      select 1 from public.league_competitions lc
       where lc.id = public.liga_do_torneio(p_tid)
         and ( lc.created_by = (select auth.uid())
            or exists (select 1 from public.league_members lm
                        where lm.competition_id = lc.id and lm.user_id = (select auth.uid()) and lm.papel = 'admin')));
$$;

-- arbitrar = dono | admin | arbitro
create or replace function public.pode_arbitrar_torneio(p_tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.tournaments t where t.id = p_tid and t.created_by = (select auth.uid()))
    or exists (select 1 from public.tournament_members m
                where m.tournament_id = p_tid and m.user_id = (select auth.uid()) and m.papel in ('admin','arbitro'))
    or exists (
      select 1 from public.league_competitions lc
       where lc.id = public.liga_do_torneio(p_tid)
         and ( lc.created_by = (select auth.uid())
            or exists (select 1 from public.league_members lm
                        where lm.competition_id = lc.id and lm.user_id = (select auth.uid()) and lm.papel in ('admin','arbitro'))));
$$;

-- moderar = dono | admin | moderador
create or replace function public.pode_moderar_torneio(p_tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.tournaments t where t.id = p_tid and t.created_by = (select auth.uid()))
    or exists (select 1 from public.tournament_members m
                where m.tournament_id = p_tid and m.user_id = (select auth.uid()) and m.papel in ('admin','moderador'))
    or exists (
      select 1 from public.league_competitions lc
       where lc.id = public.liga_do_torneio(p_tid)
         and ( lc.created_by = (select auth.uid())
            or exists (select 1 from public.league_members lm
                        where lm.competition_id = lc.id and lm.user_id = (select auth.uid()) and lm.papel in ('admin','moderador'))));
$$;

-- ver bastidores = dono | QUALQUER membro (visibilidade acompanha qualquer capacidade)
create or replace function public.pode_ver_bastidores_torneio(p_tid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.tournaments t where t.id = p_tid and t.created_by = (select auth.uid()))
    or exists (select 1 from public.tournament_members m
                where m.tournament_id = p_tid and m.user_id = (select auth.uid()))
    or exists (
      select 1 from public.league_competitions lc
       where lc.id = public.liga_do_torneio(p_tid)
         and ( lc.created_by = (select auth.uid())
            or exists (select 1 from public.league_members lm
                        where lm.competition_id = lc.id and lm.user_id = (select auth.uid()))));
$$;

-- Competition (escopo direto, sem o mapa)
create or replace function public.pode_gerir_competition(p_cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.league_competitions lc where lc.id = p_cid and lc.created_by = (select auth.uid()))
    or exists (select 1 from public.league_members lm where lm.competition_id = p_cid and lm.user_id = (select auth.uid()) and lm.papel = 'admin');
$$;
create or replace function public.pode_arbitrar_competition(p_cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.league_competitions lc where lc.id = p_cid and lc.created_by = (select auth.uid()))
    or exists (select 1 from public.league_members lm where lm.competition_id = p_cid and lm.user_id = (select auth.uid()) and lm.papel in ('admin','arbitro'));
$$;
create or replace function public.pode_moderar_competition(p_cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.league_competitions lc where lc.id = p_cid and lc.created_by = (select auth.uid()))
    or exists (select 1 from public.league_members lm where lm.competition_id = p_cid and lm.user_id = (select auth.uid()) and lm.papel in ('admin','moderador'));
$$;
create or replace function public.pode_ver_bastidores_competition(p_cid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    exists (select 1 from public.league_competitions lc where lc.id = p_cid and lc.created_by = (select auth.uid()))
    or exists (select 1 from public.league_members lm where lm.competition_id = p_cid and lm.user_id = (select auth.uid()));
$$;

-- Grants: as policies invocam COM O ROLE DA QUERY → revoga PUBLIC, concede aos 2
-- roles (revogar deles quebra a RLS — lição do hardening). NÃO vão em local-grants.sql.
revoke execute on function public.liga_do_torneio(uuid) from public;
revoke execute on function public.pode_gerir_torneio(uuid) from public;
revoke execute on function public.pode_arbitrar_torneio(uuid) from public;
revoke execute on function public.pode_moderar_torneio(uuid) from public;
revoke execute on function public.pode_ver_bastidores_torneio(uuid) from public;
revoke execute on function public.pode_gerir_competition(uuid) from public;
revoke execute on function public.pode_arbitrar_competition(uuid) from public;
revoke execute on function public.pode_moderar_competition(uuid) from public;
revoke execute on function public.pode_ver_bastidores_competition(uuid) from public;
grant execute on function public.liga_do_torneio(uuid) to anon, authenticated;
grant execute on function public.pode_gerir_torneio(uuid) to anon, authenticated;
grant execute on function public.pode_arbitrar_torneio(uuid) to anon, authenticated;
grant execute on function public.pode_moderar_torneio(uuid) to anon, authenticated;
grant execute on function public.pode_ver_bastidores_torneio(uuid) to anon, authenticated;
grant execute on function public.pode_gerir_competition(uuid) to anon, authenticated;
grant execute on function public.pode_arbitrar_competition(uuid) to anon, authenticated;
grant execute on function public.pode_moderar_competition(uuid) to anon, authenticated;
grant execute on function public.pode_ver_bastidores_competition(uuid) to anon, authenticated;

-- ---------- 3. Triggers ----------
-- 3.1 lock_match_lifecycle: mudança de status de partida agora por pode_arbitrar
-- (antes: só created_by). Defesa de coluna e bypass service_role mantidos.
create or replace function public.lock_match_lifecycle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
  then
    if new.status is distinct from old.status then
      if not public.pode_arbitrar_torneio(new.tournament_id) then
        raise exception 'Só a organização do torneio altera o status da partida';
      end if;
    end if;

    if old.status = 'encerrada' and new.status = 'encerrada'
       and (new.placar_1 is distinct from old.placar_1
            or new.placar_2 is distinct from old.placar_2
            or new.time_1 is distinct from old.time_1
            or new.time_2 is distinct from old.time_2
            or new.wo is distinct from old.wo
            or new.wo_vencedor is distinct from old.wo_vencedor)
    then
      raise exception 'Partida encerrada não aceita alteração de placar, clube ou W.O.';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.lock_match_lifecycle() from anon, authenticated, public;

-- 3.2 lock_tournament_reopen (novo): posse imutável + reverter status (reabrir
-- encerrado→aberto OU rebaixar ativo→rascunho) é só do dono. BEFORE UPDATE geral
-- (não só de status) para travar também a transferência de created_by.
create or replace function public.lock_tournament_reopen()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'A posse do torneio não pode ser transferida';
  end if;
  if old.status is distinct from new.status
     and ( old.status = 'encerrado'
        or (old.status = 'ativo' and new.status = 'rascunho') )
     and old.created_by is distinct from (select auth.uid()) then
    raise exception 'Só o dono do torneio pode reabrir ou reiniciar o campeonato';
  end if;
  return new;
end;
$$;
drop trigger if exists tournaments_lock_reopen on public.tournaments;
create trigger tournaments_lock_reopen
  before update on public.tournaments
  for each row execute function public.lock_tournament_reopen();
revoke execute on function public.lock_tournament_reopen() from anon, authenticated, public;

-- 3.3 lock_league_competition_owner (novo): posse da pirâmide imutável pela API.
create or replace function public.lock_league_competition_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') = 'service_role' then
    return new;
  end if;
  if new.created_by is distinct from old.created_by then
    raise exception 'A posse da pirâmide não pode ser transferida';
  end if;
  return new;
end;
$$;
drop trigger if exists league_competitions_lock_owner on public.league_competitions;
create trigger league_competitions_lock_owner
  before update on public.league_competitions
  for each row execute function public.lock_league_competition_owner();
revoke execute on function public.lock_league_competition_owner() from anon, authenticated, public;

-- ---------- 4. RPCs de equipe ----------
-- Preview seguro do convite (campeonato pode ser privado; espelha info_convite).
create or replace function public.info_convite_membro(p_code text)
returns table (escopo text, alvo_id uuid, titulo text, papel text, ja_membro boolean)
language sql stable security definer set search_path = '' as $$
  select
    mi.escopo,
    coalesce(mi.tournament_id, mi.competition_id) as alvo_id,
    coalesce(t.titulo, lc.nome) as titulo,
    mi.papel,
    case when mi.escopo = 'tournament'
      then exists (select 1 from public.tournament_members m where m.tournament_id = mi.tournament_id and m.user_id = (select auth.uid()))
      else exists (select 1 from public.league_members   m where m.competition_id = mi.competition_id and m.user_id = (select auth.uid()))
    end as ja_membro
  from public.member_invites mi
  left join public.tournaments t on t.id = mi.tournament_id
  left join public.league_competitions lc on lc.id = mi.competition_id
  where mi.code = p_code;
$$;

-- Aceite: upsert do papel (árbitro/moderador). No-op se já dono. Não rebaixa admin.
create or replace function public.aceitar_convite_membro(p_code text)
returns table (escopo text, alvo_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.member_invites;
begin
  if v_uid is null then raise exception 'Você precisa estar autenticado para aceitar um convite'; end if;
  select * into v_inv from public.member_invites where code = p_code;
  if v_inv.id is null then raise exception 'Convite inválido ou expirado'; end if;

  if v_inv.escopo = 'tournament' then
    if exists (select 1 from public.tournaments t where t.id = v_inv.tournament_id and t.created_by = v_uid) then
      return query select 'tournament'::text, v_inv.tournament_id; return;
    end if;
    insert into public.tournament_members (tournament_id, user_id, papel, created_by)
    values (v_inv.tournament_id, v_uid, v_inv.papel, v_inv.created_by)
    on conflict (tournament_id, user_id) do update set papel = excluded.papel
      where public.tournament_members.papel <> 'admin';
    return query select 'tournament'::text, v_inv.tournament_id;
  else
    if exists (select 1 from public.league_competitions lc where lc.id = v_inv.competition_id and lc.created_by = v_uid) then
      return query select 'league'::text, v_inv.competition_id; return;
    end if;
    insert into public.league_members (competition_id, user_id, papel, created_by)
    values (v_inv.competition_id, v_uid, v_inv.papel, v_inv.created_by)
    on conflict (competition_id, user_id) do update set papel = excluded.papel
      where public.league_members.papel <> 'admin';
    return query select 'league'::text, v_inv.competition_id;
  end if;
end;
$$;

-- Subs de um novo membro p/ a notificação de nomeação. Gate pelo CALLER:
-- pode_gerir o escopo E o alvo é membro do escopo. Não toca eh_co_participante.
create or replace function public.subscriptions_para_nomeacao(p_user_id uuid, p_escopo text, p_id uuid)
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.user_id = p_user_id
    and (
      (p_escopo = 'tournament' and public.pode_gerir_torneio(p_id)
        and exists (select 1 from public.tournament_members m where m.tournament_id = p_id and m.user_id = p_user_id))
      or
      (p_escopo = 'league' and public.pode_gerir_competition(p_id)
        and exists (select 1 from public.league_members m where m.competition_id = p_id and m.user_id = p_user_id))
    );
$$;

revoke execute on function public.info_convite_membro(text) from public;
revoke execute on function public.aceitar_convite_membro(text) from public;
revoke execute on function public.subscriptions_para_nomeacao(uuid,text,uuid) from public;
grant execute on function public.info_convite_membro(text) to authenticated;
grant execute on function public.aceitar_convite_membro(text) to authenticated;
grant execute on function public.subscriptions_para_nomeacao(uuid,text,uuid) to authenticated;

-- ---------- 5. Policies das tabelas novas ----------
-- tournament_members: SELECT gestor OU próprio; IUD gestor; admin = dono-only; sair = próprio.
create policy tournament_members_select on public.tournament_members
  for select to authenticated
  using (public.pode_gerir_torneio(tournament_id) or user_id = (select auth.uid()));
create policy tournament_members_insert on public.tournament_members
  for insert to authenticated
  with check (
    public.pode_gerir_torneio(tournament_id)
    and (papel <> 'admin'
         or exists (select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid())))
  );
create policy tournament_members_update on public.tournament_members
  for update to authenticated
  using (
    public.pode_gerir_torneio(tournament_id)
    and (papel <> 'admin'
         or exists (select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid())))
  )
  with check (
    public.pode_gerir_torneio(tournament_id)
    and (papel <> 'admin'
         or exists (select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid())))
  );
create policy tournament_members_delete on public.tournament_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.pode_gerir_torneio(tournament_id)
        and (papel <> 'admin'
             or exists (select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid()))))
  );

-- league_members: idem com competition
create policy league_members_select on public.league_members
  for select to authenticated
  using (public.pode_gerir_competition(competition_id) or user_id = (select auth.uid()));
create policy league_members_insert on public.league_members
  for insert to authenticated
  with check (
    public.pode_gerir_competition(competition_id)
    and (papel <> 'admin'
         or exists (select 1 from public.league_competitions lc where lc.id = competition_id and lc.created_by = (select auth.uid())))
  );
create policy league_members_update on public.league_members
  for update to authenticated
  using (
    public.pode_gerir_competition(competition_id)
    and (papel <> 'admin'
         or exists (select 1 from public.league_competitions lc where lc.id = competition_id and lc.created_by = (select auth.uid())))
  )
  with check (
    public.pode_gerir_competition(competition_id)
    and (papel <> 'admin'
         or exists (select 1 from public.league_competitions lc where lc.id = competition_id and lc.created_by = (select auth.uid())))
  );
create policy league_members_delete on public.league_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.pode_gerir_competition(competition_id)
        and (papel <> 'admin'
             or exists (select 1 from public.league_competitions lc where lc.id = competition_id and lc.created_by = (select auth.uid()))))
  );

-- member_invites: SELECT/INSERT/DELETE por gestor (sem UPDATE → papel imutável).
create policy member_invites_select on public.member_invites
  for select to authenticated
  using (
    (escopo='tournament' and public.pode_gerir_torneio(tournament_id))
    or (escopo='league'  and public.pode_gerir_competition(competition_id))
  );
create policy member_invites_insert on public.member_invites
  for insert to authenticated
  with check (
    (escopo='tournament' and public.pode_gerir_torneio(tournament_id))
    or (escopo='league'  and public.pode_gerir_competition(competition_id))
  );
create policy member_invites_delete on public.member_invites
  for delete to authenticated
  using (
    (escopo='tournament' and public.pode_gerir_torneio(tournament_id))
    or (escopo='league'  and public.pode_gerir_competition(competition_id))
  );

-- ---------- 6. Refactor das policies existentes (dono → capacidade) ----------
-- tournaments: SELECT amplia (bastidores); UPDATE gerir; DELETE dono-only (intacta).
drop policy if exists tournaments_select_visivel on public.tournaments;
create policy tournaments_select_visivel on public.tournaments
  for select to anon, authenticated
  using (is_public or created_by = auth.uid() or public.eh_participante(id) or public.pode_ver_bastidores_torneio(id));

drop policy if exists tournaments_update_owner on public.tournaments;
create policy tournaments_update_owner on public.tournaments
  for update to authenticated
  using (public.pode_gerir_torneio(id))
  with check (public.pode_gerir_torneio(id));

-- matches: SELECT bastidores vê tudo (inclusive oculto); INSERT gerir (estrutura);
-- UPDATE-owner arbitra.
drop policy if exists matches_select_visivel on public.matches;
create policy matches_select_visivel on public.matches
  for select to anon, authenticated
  using (
    public.pode_ver_bastidores_torneio(tournament_id)
    or (
      liberada_em is not null and liberada_em <= now()
      and (
        exists (select 1 from public.tournaments t
                where t.id = tournament_id and (t.is_public or public.eh_participante(t.id)))
        or auth.uid() = participante_1
        or auth.uid() = participante_2
        or exists (select 1 from public.tournament_slots s
                   where s.id in (matches.vaga_1, matches.vaga_2) and s.user_id = auth.uid())
      )
    )
  );

drop policy if exists matches_insert_tournament_owner on public.matches;
create policy matches_insert_tournament_owner on public.matches
  for insert to authenticated
  with check (
    public.pode_gerir_torneio(tournament_id)
    and exists (select 1 from public.tournaments t
                where t.id = tournament_id
                  and t.status <> 'encerrado'
                  and (t.formato = 'avulso' or matches.rodada is not null))
    and (participante_1 is null or exists (select 1 from public.participants p
          where p.tournament_id = matches.tournament_id and p.user_id = matches.participante_1))
    and (participante_2 is null or exists (select 1 from public.participants p
          where p.tournament_id = matches.tournament_id and p.user_id = matches.participante_2))
    and (vaga_1 is null or exists (select 1 from public.tournament_slots s
          where s.id = matches.vaga_1 and s.tournament_id = matches.tournament_id))
    and (vaga_2 is null or exists (select 1 from public.tournament_slots s
          where s.id = matches.vaga_2 and s.tournament_id = matches.tournament_id))
  );

drop policy if exists matches_update_tournament_owner on public.matches;
create policy matches_update_tournament_owner on public.matches
  for update to authenticated
  using (public.pode_arbitrar_torneio(tournament_id))
  with check (public.pode_arbitrar_torneio(tournament_id));

-- tournament_slots: SELECT bastidores; INSERT/DELETE (geometria, rascunho) gerir;
-- UPDATE-owner (expulsar/esvaziar) moderar; técnico-desiste intacta (self).
drop policy if exists slots_select_visivel on public.tournament_slots;
create policy slots_select_visivel on public.tournament_slots
  for select to anon, authenticated
  using (
    exists (select 1 from public.tournaments t
            where t.id = tournament_id
              and (t.is_public or t.created_by = auth.uid() or public.eh_participante(t.id)))
    or public.pode_ver_bastidores_torneio(tournament_id)
  );

drop policy if exists slots_insert_owner_rascunho on public.tournament_slots;
create policy slots_insert_owner_rascunho on public.tournament_slots
  for insert to authenticated
  with check (
    user_id is null
    and public.pode_gerir_torneio(tournament_id)
    and exists (select 1 from public.tournaments t where t.id = tournament_id and t.status = 'rascunho')
  );

drop policy if exists slots_delete_owner_rascunho on public.tournament_slots;
create policy slots_delete_owner_rascunho on public.tournament_slots
  for delete to authenticated
  using (
    public.pode_gerir_torneio(tournament_id)
    and exists (select 1 from public.tournaments t where t.id = tournament_id and t.status = 'rascunho')
  );

drop policy if exists slots_update_owner on public.tournament_slots;
create policy slots_update_owner on public.tournament_slots
  for update to authenticated
  using (
    public.pode_moderar_torneio(tournament_id)
    and exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'encerrado')
  )
  with check (
    user_id is null
    and public.pode_moderar_torneio(tournament_id)
    and exists (select 1 from public.tournaments t where t.id = tournament_id and t.status <> 'encerrado')
  );

-- participants: insert-owner-self INTACTA (auto-inscrição, self/dono); delete → moderar.
drop policy if exists participants_select_visivel on public.participants;
create policy participants_select_visivel on public.participants
  for select to authenticated
  using (
    exists (select 1 from public.tournaments t
            where t.id = tournament_id
              and (t.is_public or t.created_by = auth.uid() or public.eh_participante(t.id)))
    or public.pode_ver_bastidores_torneio(tournament_id)
  );

drop policy if exists participants_delete_self_or_owner on public.participants;
create policy participants_delete_self_or_owner on public.participants
  for delete to authenticated
  using (user_id = auth.uid() or public.pode_moderar_torneio(tournament_id));

-- tournament_invites: tudo → moderar.
drop policy if exists tournament_invites_select_owner on public.tournament_invites;
create policy tournament_invites_select_owner on public.tournament_invites
  for select to authenticated using (public.pode_moderar_torneio(tournament_id));
drop policy if exists tournament_invites_insert_owner on public.tournament_invites;
create policy tournament_invites_insert_owner on public.tournament_invites
  for insert to authenticated with check (public.pode_moderar_torneio(tournament_id));
drop policy if exists tournament_invites_update_owner on public.tournament_invites;
create policy tournament_invites_update_owner on public.tournament_invites
  for update to authenticated
  using (public.pode_moderar_torneio(tournament_id))
  with check (public.pode_moderar_torneio(tournament_id));
drop policy if exists tournament_invites_delete_owner on public.tournament_invites;
create policy tournament_invites_delete_owner on public.tournament_invites
  for delete to authenticated using (public.pode_moderar_torneio(tournament_id));

-- slot_invites: tudo → moderar (via vaga→torneio). WITH CHECK preserva team_id not null.
drop policy if exists slot_invites_select_owner on public.slot_invites;
create policy slot_invites_select_owner on public.slot_invites
  for select to authenticated
  using (exists (select 1 from public.tournament_slots s where s.id = slot_id and public.pode_moderar_torneio(s.tournament_id)));
drop policy if exists slot_invites_insert_owner on public.slot_invites;
create policy slot_invites_insert_owner on public.slot_invites
  for insert to authenticated
  with check (exists (select 1 from public.tournament_slots s where s.id = slot_id and s.team_id is not null and public.pode_moderar_torneio(s.tournament_id)));
drop policy if exists slot_invites_update_owner on public.slot_invites;
create policy slot_invites_update_owner on public.slot_invites
  for update to authenticated
  using (exists (select 1 from public.tournament_slots s where s.id = slot_id and public.pode_moderar_torneio(s.tournament_id)))
  with check (exists (select 1 from public.tournament_slots s where s.id = slot_id and s.team_id is not null and public.pode_moderar_torneio(s.tournament_id)));
drop policy if exists slot_invites_delete_owner on public.slot_invites;
create policy slot_invites_delete_owner on public.slot_invites
  for delete to authenticated
  using (exists (select 1 from public.tournament_slots s where s.id = slot_id and public.pode_moderar_torneio(s.tournament_id)));

-- match_wo_requests: SELECT/UPDATE veredito → arbitrar (INSERT do técnico intacto).
drop policy if exists match_wo_requests_select on public.match_wo_requests;
create policy match_wo_requests_select on public.match_wo_requests
  for select to authenticated
  using (
    exists (select 1 from public.tournament_slots s where s.id = solicitante_slot and s.user_id = auth.uid())
    or exists (select 1 from public.matches m where m.id = match_id and public.pode_arbitrar_torneio(m.tournament_id))
  );
drop policy if exists match_wo_requests_update_owner on public.match_wo_requests;
create policy match_wo_requests_update_owner on public.match_wo_requests
  for update to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and public.pode_arbitrar_torneio(m.tournament_id)))
  with check (exists (select 1 from public.matches m where m.id = match_id and public.pode_arbitrar_torneio(m.tournament_id)));

-- ---------- 7. Refactor das policies de liga (dono → capacidade) ----------
-- SELECT += bastidores; INSERT/UPDATE → pode_gerir_competition; DELETE dono-only (INTACTO).
drop policy if exists league_competitions_select_visivel on public.league_competitions;
create policy league_competitions_select_visivel on public.league_competitions
  for select to anon, authenticated
  using (status = 'ativa' or created_by = auth.uid() or public.pode_ver_bastidores_competition(id));
drop policy if exists league_competitions_update_owner on public.league_competitions;
create policy league_competitions_update_owner on public.league_competitions
  for update to authenticated
  using (public.pode_gerir_competition(id))
  with check (public.pode_gerir_competition(id));

drop policy if exists league_seasons_select_visivel on public.league_seasons;
create policy league_seasons_select_visivel on public.league_seasons
  for select to anon, authenticated
  using (exists (select 1 from public.league_competitions c
          where c.id = competition_id and (c.status = 'ativa' or c.created_by = auth.uid() or public.pode_ver_bastidores_competition(c.id))));
drop policy if exists league_seasons_insert_owner on public.league_seasons;
create policy league_seasons_insert_owner on public.league_seasons
  for insert to authenticated with check (public.pode_gerir_competition(competition_id));
drop policy if exists league_seasons_update_owner on public.league_seasons;
create policy league_seasons_update_owner on public.league_seasons
  for update to authenticated
  using (public.pode_gerir_competition(competition_id))
  with check (public.pode_gerir_competition(competition_id));

drop policy if exists league_division_seasons_select_visivel on public.league_division_seasons;
create policy league_division_seasons_select_visivel on public.league_division_seasons
  for select to anon, authenticated
  using (exists (select 1 from public.league_seasons ls
          join public.league_competitions c on c.id = ls.competition_id
          where ls.id = season_id and (c.status = 'ativa' or c.created_by = auth.uid() or public.pode_ver_bastidores_competition(c.id))));
drop policy if exists league_division_seasons_insert_owner on public.league_division_seasons;
create policy league_division_seasons_insert_owner on public.league_division_seasons
  for insert to authenticated
  with check (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)));
drop policy if exists league_division_seasons_update_owner on public.league_division_seasons;
create policy league_division_seasons_update_owner on public.league_division_seasons
  for update to authenticated
  using (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)))
  with check (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)));

drop policy if exists league_boundaries_select_visivel on public.league_boundaries;
create policy league_boundaries_select_visivel on public.league_boundaries
  for select to anon, authenticated
  using (exists (select 1 from public.league_seasons ls
          join public.league_competitions c on c.id = ls.competition_id
          where ls.id = season_id and (c.status = 'ativa' or c.created_by = auth.uid() or public.pode_ver_bastidores_competition(c.id))));
drop policy if exists league_boundaries_insert_owner on public.league_boundaries;
create policy league_boundaries_insert_owner on public.league_boundaries
  for insert to authenticated
  with check (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)));
drop policy if exists league_boundaries_update_owner on public.league_boundaries;
create policy league_boundaries_update_owner on public.league_boundaries
  for update to authenticated
  using (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)))
  with check (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)));

drop policy if exists league_competitors_select_visivel on public.league_competitors;
create policy league_competitors_select_visivel on public.league_competitors
  for select to anon, authenticated
  using (exists (select 1 from public.league_competitions c
          where c.id = competition_id and (c.status = 'ativa' or c.created_by = auth.uid() or public.pode_ver_bastidores_competition(c.id))));
drop policy if exists league_competitors_insert_owner on public.league_competitors;
create policy league_competitors_insert_owner on public.league_competitors
  for insert to authenticated with check (public.pode_gerir_competition(competition_id));
drop policy if exists league_competitors_update_owner on public.league_competitors;
create policy league_competitors_update_owner on public.league_competitors
  for update to authenticated
  using (public.pode_gerir_competition(competition_id))
  with check (public.pode_gerir_competition(competition_id));

drop policy if exists league_division_entries_select_visivel on public.league_division_entries;
create policy league_division_entries_select_visivel on public.league_division_entries
  for select to anon, authenticated
  using (exists (select 1 from public.league_division_seasons lds
          join public.league_seasons ls on ls.id = lds.season_id
          join public.league_competitions c on c.id = ls.competition_id
          where lds.id = division_season_id and (c.status = 'ativa' or c.created_by = auth.uid() or public.pode_ver_bastidores_competition(c.id))));
drop policy if exists league_division_entries_insert_owner on public.league_division_entries;
create policy league_division_entries_insert_owner on public.league_division_entries
  for insert to authenticated
  with check (exists (select 1 from public.league_division_seasons lds
          join public.league_seasons ls on ls.id = lds.season_id
          join public.league_competitors lc on lc.id = competitor_id
          where lds.id = division_season_id and public.pode_gerir_competition(ls.competition_id) and lc.competition_id = ls.competition_id));
drop policy if exists league_division_entries_update_owner on public.league_division_entries;
create policy league_division_entries_update_owner on public.league_division_entries
  for update to authenticated
  using (exists (select 1 from public.league_division_seasons lds
          join public.league_seasons ls on ls.id = lds.season_id
          where lds.id = division_season_id and public.pode_gerir_competition(ls.competition_id)))
  with check (exists (select 1 from public.league_division_seasons lds
          join public.league_seasons ls on ls.id = lds.season_id
          join public.league_competitors lc on lc.id = competitor_id
          where lds.id = division_season_id and public.pode_gerir_competition(ls.competition_id) and lc.competition_id = ls.competition_id));
-- DELETEs de league_seasons/_division_seasons/_boundaries/_competitors/_division_entries
-- PERMANECEM eh_dono_competition (dono-only) — NÃO refatorados.
