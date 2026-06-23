-- =====================================================================
-- add-proposta-resultado-foto
-- Proposta de placar (com foto obrigatória) + foto opcional no W.O. +
-- aprovação atômica por RPC + evidência privada por policy de storage.
-- Aplicar no PROD via MCP (mostrado ao dono antes) e no LOCAL via psql.
-- =====================================================================

-- 1) Tabela de propostas de placar (espelha match_wo_requests) --------------
create table if not exists public.match_score_proposals (
  id            uuid primary key default gen_random_uuid(),
  match_id      uuid not null references public.matches (id) on delete cascade,
  submetido_por uuid not null references public.users (id) on delete cascade,
  placar_1      integer not null check (placar_1 >= 0),
  placar_2      integer not null check (placar_2 >= 0),
  foto_path     text not null,
  status        text not null default 'pendente'
                  check (status in ('pendente','aprovada','rejeitada')),
  motivo        text,
  created_at    timestamptz not null default now(),
  resolvido_em  timestamptz,
  resolvido_por uuid references public.users (id)
);
create index if not exists match_score_proposals_match_idx
  on public.match_score_proposals (match_id);
-- 1 proposta PENDENTE por técnico/partida (reenviar substitui a própria).
create unique index if not exists match_score_proposals_uma_pendente
  on public.match_score_proposals (match_id, submetido_por) where status = 'pendente';

alter table public.match_score_proposals enable row level security;

-- 2) Foto OPCIONAL na solicitação de W.O. -----------------------------------
alter table public.match_wo_requests add column if not exists foto_path text;

-- 3) RLS de match_score_proposals -------------------------------------------
-- INSERT: o PRÓPRIO técnico de uma vaga da partida (competitiva), liberada e não encerrada.
drop policy if exists match_score_proposals_insert_tecnico on public.match_score_proposals;
create policy match_score_proposals_insert_tecnico on public.match_score_proposals
  for insert to authenticated
  with check (
    submetido_por = (select auth.uid())
    and exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.liberada_em is not null and m.liberada_em <= now()
        and m.status <> 'encerrada'
        and exists (
          select 1 from public.tournament_slots s
          where s.id in (m.vaga_1, m.vaga_2) and s.user_id = (select auth.uid())
        )
    )
  );

-- SELECT: quem ARBITRA o torneio OU é jogador (técnico de vaga) da partida.
drop policy if exists match_score_proposals_select on public.match_score_proposals;
create policy match_score_proposals_select on public.match_score_proposals
  for select to authenticated
  using (
    exists (select 1 from public.matches m
             where m.id = match_id and public.pode_arbitrar_torneio(m.tournament_id))
    or exists (
      select 1 from public.matches m
      join public.tournament_slots s on s.id in (m.vaga_1, m.vaga_2)
      where m.id = match_id and s.user_id = (select auth.uid())
    )
  );
-- UPDATE: sem policy (negado à sessão) — aprovar/rejeitar só via RPC (abaixo).
-- DELETE: só a PRÓPRIA pendente (reenvio substitui; veredito é imutável).
drop policy if exists match_score_proposals_delete_own_pendente on public.match_score_proposals;
create policy match_score_proposals_delete_own_pendente on public.match_score_proposals
  for delete to authenticated
  using (submetido_por = (select auth.uid()) and status = 'pendente');

-- 4) Bucket privado de evidências + policies de storage ----------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('match_evidence','match_evidence', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Escrita: só o DONO DA PASTA (1º segmento do path = auth.uid()), como avatars.
drop policy if exists match_evidence_insert on storage.objects;
create policy match_evidence_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'match_evidence'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists match_evidence_update on storage.objects;
create policy match_evidence_update on storage.objects
  for update to authenticated
  using (bucket_id = 'match_evidence'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'match_evidence'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists match_evidence_delete on storage.objects;
create policy match_evidence_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'match_evidence'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Leitura (defesa em profundidade; a rota usa o client da SESSÃO, sem service_role):
-- dono-da-pasta (o técnico que subiu) OU autorizado pela LINHA DE ORIGEM casada por
-- foto_path — placar: aprovador ou jogador (técnico de qualquer vaga); W.O.: aprovador
-- ou o SOLICITANTE (nunca o adversário). Autorizar pela origem (e não parseando o path)
-- aplica a regra exata de cada tipo e dispensa validar o uuid do caminho.
drop policy if exists match_evidence_select on storage.objects;
create policy match_evidence_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'match_evidence'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.match_score_proposals sp
        join public.matches m on m.id = sp.match_id
        where sp.foto_path = storage.objects.name
          and (
            public.pode_arbitrar_torneio(m.tournament_id)
            or exists (select 1 from public.tournament_slots s
                        where s.id in (m.vaga_1, m.vaga_2)
                          and s.user_id = (select auth.uid()))
          )
      )
      or exists (
        select 1 from public.match_wo_requests wr
        join public.matches m on m.id = wr.match_id
        join public.tournament_slots s on s.id = wr.solicitante_slot
        where wr.foto_path = storage.objects.name
          and (public.pode_arbitrar_torneio(m.tournament_id)
               or s.user_id = (select auth.uid()))
      )
    )
  );

-- 5) RPC: aprovar proposta — ATÔMICO (aplica placar + encerra; trigger valida) -
create or replace function public.aprovar_proposta_placar(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_match  uuid;
  v_p1     integer;
  v_p2     integer;
  v_tid    uuid;
  v_linhas integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select sp.match_id, sp.placar_1, sp.placar_2, m.tournament_id
    into v_match, v_p1, v_p2, v_tid
    from public.match_score_proposals sp
    join public.matches m on m.id = sp.match_id
   where sp.id = p_proposal_id and sp.status = 'pendente'
   for update of sp;

  if v_match is null then
    raise exception 'PROPOSTA_INVALIDA';
  end if;
  if not public.pode_arbitrar_torneio(v_tid) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  -- UM único UPDATE: o trigger valida_resultado_mata_mata valida placar+status
  -- como CONJUNTO e dá rollback (raise) se inválido (empate em mata-mata) — sem
  -- "placar fantasma". lock_match_lifecycle confere pode_arbitrar (auth.uid()).
  update public.matches
     set placar_1 = v_p1, placar_2 = v_p2, status = 'encerrada'
   where id = v_match and status <> 'encerrada';
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'PARTIDA_INDISPONIVEL';
  end if;

  update public.match_score_proposals
     set status = 'aprovada', resolvido_em = now(), resolvido_por = v_uid
   where id = p_proposal_id;

  -- Demais pendentes da partida ficam obsoletas (set-based: fecha a corrida de
  -- reenvio concorrente e de 2 aprovadores).
  update public.match_score_proposals
     set status = 'rejeitada', motivo = 'substituída (partida encerrada)',
         resolvido_em = now(), resolvido_por = v_uid
   where match_id = v_match and status = 'pendente' and id <> p_proposal_id;

  return v_match;
end;
$$;

-- RPC: rejeitar proposta ----------------------------------------------------
create or replace function public.rejeitar_proposta_placar(p_proposal_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_match  uuid;
  v_tid    uuid;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select sp.match_id, m.tournament_id into v_match, v_tid
    from public.match_score_proposals sp
    join public.matches m on m.id = sp.match_id
   where sp.id = p_proposal_id and sp.status = 'pendente'
   for update of sp;

  if v_match is null then
    raise exception 'PROPOSTA_INVALIDA';
  end if;
  if not public.pode_arbitrar_torneio(v_tid) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  update public.match_score_proposals
     set status = 'rejeitada', motivo = nullif(btrim(p_motivo), ''),
         resolvido_em = now(), resolvido_por = v_uid
   where id = p_proposal_id;
  return v_match;
end;
$$;

-- 6) Estreitar matches_update_participant para AVULSO ------------------------
-- O técnico de vaga (competitivo) deixa de escrever a partida direto: usa a
-- proposta. O DONO/ÁRBITRO segue por matches_update_tournament_owner (intacta).
drop policy if exists matches_update_participant on public.matches;
create policy matches_update_participant on public.matches
  for update to authenticated
  using (
    liberada_em is not null and liberada_em <= now()
    and (auth.uid() = participante_1 or auth.uid() = participante_2)
  )
  with check (
    liberada_em is not null and liberada_em <= now()
    and (auth.uid() = participante_1 or auth.uid() = participante_2)
  );

-- 7) Grants (RLS controla as linhas; sem grant o PostgREST nega) -------------
grant select, insert, delete on public.match_score_proposals to authenticated;
-- sem UPDATE para a sessão: aprovar/rejeitar é via RPC. DELETE só a própria pendente (policy).
revoke execute on function public.aprovar_proposta_placar(uuid) from public, anon;
revoke execute on function public.rejeitar_proposta_placar(uuid, text) from public, anon;
grant execute on function public.aprovar_proposta_placar(uuid) to authenticated;
grant execute on function public.rejeitar_proposta_placar(uuid, text) to authenticated;

-- LOCAL: após aplicar, recarregar o cache do PostgREST:
--   notify pgrst, 'reload schema';
