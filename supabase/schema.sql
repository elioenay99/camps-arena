-- =====================================================================
-- Arena — schema do banco (PostgreSQL / Supabase)
-- Fonte de verdade do modelo de dados. Aplicar manualmente no Supabase
-- (SQL Editor) — DDL não é executada automaticamente pelos agentes.
-- Idempotente onde possível (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- =====================================================================

-- ---------- Enums ----------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'tournament_status') then
    create type public.tournament_status as enum ('rascunho', 'ativo', 'encerrado');
  end if;
  if not exists (select 1 from pg_type where typname = 'match_status') then
    create type public.match_status as enum ('agendada', 'em_andamento', 'encerrada');
  end if;
  -- Formato do torneio: 'avulso' (partidas manuais, modelo original), 'liga'
  -- (tabela round-robin gerada ao iniciar), 'mata_mata' (chave eliminatória,
  -- avanço fase a fase), 'grupos_mata_mata' (fase de grupos round-robin →
  -- chave dos classificados, estilo Copa) e 'fase_liga' (grupo único
  -- classificando para a chave, estilo Champions).
  if not exists (select 1 from pg_type where typname = 'tournament_format') then
    create type public.tournament_format as enum
      ('avulso', 'liga', 'mata_mata', 'grupos_mata_mata', 'fase_liga');
  end if;
end$$;

-- Instalações que criaram o enum ANTES destes formatos (aditivo; idempotente).
-- ATENÇÃO: o Postgres proíbe USAR um valor de enum na MESMA transação que o
-- adicionou — e a policy participants_delete_self_or_owner (abaixo) referencia
-- estes literais em DDL. Num banco pré-existente, rode estes ALTER TYPE num
-- Run SEPARADO do restante (instalação nova não sofre: o CREATE TYPE acima já
-- nasce com os valores).
alter type public.tournament_format add value if not exists 'mata_mata';
alter type public.tournament_format add value if not exists 'grupos_mata_mata';
alter type public.tournament_format add value if not exists 'fase_liga';

-- ---------- Tabela: users (perfil público, 1:1 com auth.users) ----------
create table if not exists public.users (
  id         uuid primary key references auth.users (id) on delete cascade,
  nome       text,
  celular    text,
  avatar     text,
  created_at timestamptz not null default now()
);

-- ---------- Tabela: tournaments ----------
create table if not exists public.tournaments (
  id         uuid primary key default gen_random_uuid(),
  titulo     text not null,
  status     public.tournament_status not null default 'ativo',
  created_at timestamptz not null default now()
);

-- Ownership e visibilidade (aditivo; idempotente).
-- created_by anulável + ON DELETE SET NULL: torneios de sistema/legados não têm
-- dono e apagar o usuário não deve levar junto torneios com histórico.
-- is_public default true: preserva a visibilidade dos torneios já semeados.
alter table public.tournaments
  add column if not exists created_by uuid references public.users (id) on delete set null;
alter table public.tournaments
  add column if not exists is_public boolean not null default true;

create index if not exists tournaments_created_by_idx on public.tournaments (created_by);

-- Regras de pontuação por torneio (aditivo; idempotente). Defaults 3/1/0:
-- torneios legados herdam a convenção do futebol sem migração de dados.
alter table public.tournaments
  add column if not exists pontos_vitoria integer not null default 3;
alter table public.tournaments
  add column if not exists pontos_empate integer not null default 1;
alter table public.tournaments
  add column if not exists pontos_derrota integer not null default 0;

-- Formato (aditivo; idempotente). Default 'avulso': legados preservam o
-- comportamento original sem migração. 'ida_e_volta' só é significativo em
-- liga (espelho do segundo turno com lados invertidos); fica false nos demais.
alter table public.tournaments
  add column if not exists formato public.tournament_format not null default 'avulso';
alter table public.tournaments
  add column if not exists ida_e_volta boolean not null default false;

-- Disputa de 3º lugar (aditivo; idempotente). Significativo nos formatos com
-- CHAVE (mata-mata, grupos, fase de liga): os perdedores das semifinais jogam
-- uma partida extra junto com a final. Default false preserva os legados.
alter table public.tournaments
  add column if not exists terceiro_lugar boolean not null default false;

-- Classificados por grupo (aditivo; idempotente). Gravado AO INICIAR um
-- formato de grupos (G é derivável das partidas; K não) — o "Gerar mata-mata"
-- o consome depois. NULL fora dos formatos de grupos.
alter table public.tournaments
  add column if not exists classificados_por_grupo integer;

alter table public.tournaments drop constraint if exists tournaments_classificados_positivo;
alter table public.tournaments
  add constraint tournaments_classificados_positivo
  check (classificados_por_grupo is null or classificados_por_grupo >= 1);

-- Coerência: derrota valendo mais que vitória corromperia toda classificação.
-- Segunda barreira além do Zod (POST direto/edições futuras). Teto 100 = sanidade.
alter table public.tournaments drop constraint if exists tournaments_pontuacao_coerente;
alter table public.tournaments
  add constraint tournaments_pontuacao_coerente
  check (
    pontos_derrota >= 0
    and pontos_derrota <= pontos_empate
    and pontos_empate <= pontos_vitoria
    and pontos_vitoria <= 100
  );

-- ---------- Tabela: teams (cache de clubes reais buscados via API) ----------
-- Dados públicos de clube (nome + escudo). 'external_id' + 'provider' permitem
-- reusar/atualizar o clube sem duplicar. Aditivo: NÃO substitui o participante.
create table if not exists public.teams (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  escudo_url  text,
  external_id text,
  provider    text not null default 'api-football',
  created_at  timestamptz not null default now(),
  constraint teams_provider_external_unico unique (provider, external_id)
);

-- ---------- Tabela: participants (participação CONFIRMADA em torneio) ----------
-- Linha = participante confirmado; não existe convite "pendente" persistido
-- (o aceite É a ação de entrar pelo link). PK composta evita duplicata;
-- cascade: participação não sobrevive ao torneio nem ao usuário.
create table if not exists public.participants (
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  user_id       uuid not null references public.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  primary key (tournament_id, user_id)
);

create index if not exists participants_user_id_idx on public.participants (user_id);

-- ---------- Tabela: tournament_invites (código de convite, 1:1) ----------
-- O código é SEGREDO do dono e por isso mora FORA de `tournaments`: a policy
-- de SELECT público do torneio vazaria a coluna para qualquer visitante.
-- PK = tournament_id: regenerar é UPDATE do code (o link antigo morre
-- atomicamente; o torneio nunca tem dois códigos válidos).
create table if not exists public.tournament_invites (
  tournament_id uuid primary key references public.tournaments (id) on delete cascade,
  code          text not null unique,
  created_at    timestamptz not null default now()
);

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

-- ---------- Tabela: matches ----------
create table if not exists public.matches (
  id             uuid primary key default gen_random_uuid(),
  tournament_id  uuid not null references public.tournaments (id) on delete cascade,
  participante_1 uuid references public.users (id) on delete set null,
  participante_2 uuid references public.users (id) on delete set null,
  placar_1       integer not null default 0 check (placar_1 >= 0),
  placar_2       integer not null default 0 check (placar_2 >= 0),
  status         public.match_status not null default 'agendada',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint matches_participantes_distintos
    check (participante_1 is null or participante_2 is null
           or participante_1 <> participante_2)
);

create index if not exists matches_tournament_id_idx on public.matches (tournament_id);
create index if not exists matches_status_idx on public.matches (status);
create index if not exists matches_participante_1_idx on public.matches (participante_1);
create index if not exists matches_participante_2_idx on public.matches (participante_2);

-- ---------- Clube que cada lado representa (aditivo; participante segue sendo o user) ----------
-- NÃO travado no lock_match_relations de propósito: o clube é identidade cosmética
-- (a autorização de placar continua baseada no usuário), e deve poder ser ajustado
-- pelo participante. A RLS matches_update_participant já restringe o UPDATE.
alter table public.matches
  add column if not exists time_1 uuid references public.teams (id) on delete set null;
alter table public.matches
  add column if not exists time_2 uuid references public.teams (id) on delete set null;

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

create index if not exists matches_time_1_idx on public.matches (time_1);
create index if not exists matches_time_2_idx on public.matches (time_2);

-- ---------- Rodada (aditivo; idempotente) ----------
-- NULL = partida avulsa (todas as legadas). Em liga, número da rodada gerada
-- pela tabela round-robin. Imutável via anon/authenticated (trigger
-- lock_match_relations) — renumerar rodada reescreveria a ordem da liga.
alter table public.matches
  add column if not exists rodada integer;

alter table public.matches drop constraint if exists matches_rodada_positiva;
alter table public.matches
  add constraint matches_rodada_positiva
  check (rodada is null or rodada >= 1);

-- Barreira contra DUPLA GERAÇÃO da tabela (check-then-act da action não é
-- atômico: duas abas podem passar a checagem e inserir duas tabelas). Como o
-- INSERT em lote é um statement único, o perdedor da corrida falha INTEIRO
-- (23505) sem estado parcial — o retry idempotente só promove o status.
-- Parcial (rodada not null): partidas avulsas seguem livres para repetir pares.
-- ATENÇÃO — esta barreira vale para LIGA (ordem canônica fixa → pares
-- idênticos colidem) e para a CHAVE (índice de slot abaixo, por coordenada).
-- NÃO vale para a fase de GRUPOS: sorteios concorrentes produzem partições
-- diferentes → pares diferentes que NÃO colidem. A serialização dos grupos é
-- a PROMOÇÃO atômica antes do INSERT (iniciarTorneioGrupos, promote-first).
create unique index if not exists matches_liga_par_unico
  on public.matches (tournament_id, rodada, participante_1, participante_2)
  where rodada is not null;

-- ---------- Mata-mata: slot na chave (aditivo; idempotente) ----------
-- `posicao` = slot do confronto dentro da fase (1-based). O pareamento da
-- fase seguinte é FUNÇÃO da posição: vencedor do slot 2i-1 × vencedor do
-- slot 2i → slot i. `perna` = 1|2 num confronto ida-e-volta (NULL em jogo
-- único/bye). Ambas NULL fora do mata-mata. Imutáveis via anon/authenticated
-- (lock_match_relations) — renumerar slot reescreveria a chave.
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

-- ---------- Fase de grupos: número do grupo (aditivo; idempotente) ----------
-- Partida de GRUPO = `grupo` + `rodada` (round-robin interno); partida de
-- CHAVE = `posicao` + `rodada` (+ `perna`). Mutuamente exclusivos (CHECK
-- abaixo): uma partida pertence a UMA fase. Imutável via lock_match_relations.
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

-- Unicidade do slot: barra dupla geração de fase (avancarFase em corrida) e
-- slot duplicado por POST direto. NULLS NOT DISTINCT (PG15+) é essencial:
-- com o default (nulls distinct), `perna` NULL duplicaria slots de jogo
-- único silenciosamente. Parcial (posicao not null): liga e avulso fora.
-- LIMITE CONHECIDO: o banco garante unicidade da COORDENADA do slot, não do
-- PARTICIPANTE entre slots da mesma fase — o dono forjando o mesmo jogador
-- em dois slots via POST direto é auto-sabotagem sem vítima terceira (risco
-- aceito no design, D10); a partição exata é validada pela action/motor.
-- O mesmo regime de risco aceito vale para `grupo` forjado via POST direto
-- (a policy de INSERT não amarra grupo/posicao ao formato).
create unique index if not exists matches_mata_mata_slot_unico
  on public.matches (tournament_id, rodada, posicao, perna)
  nulls not distinct
  where posicao is not null;

-- ---------- W.O. / Walkover (aditivo; idempotente) ----------
-- W.O. NÃO é um status novo: é uma partida `encerrada` com `wo = true`, placar
-- 0x0 (decisão de produto: ZERO gols) e o slot vencedor EXPLÍCITO. O vencedor
-- explícito cobre os dois casos (clube órfão E não-comparecimento com ambos os
-- técnicos) sem heurística de placar — o 0x0 enganaria os motores. Vale só nos
-- formatos competitivos (lados por vaga); o avulso nunca recebe W.O.
alter table public.matches
  add column if not exists wo boolean not null default false;
alter table public.matches
  add column if not exists wo_vencedor uuid
    references public.tournament_slots (id) on delete restrict;

-- Coerência do W.O.: fora dele, wo_vencedor é nulo; nele, partida ENCERRADA,
-- vencedor não-nulo, placar zerado e o vencedor é UM DOS LADOS (vaga). O
-- `status = 'encerrada'` fecha o POST direto de um participante gravando
-- wo=true numa partida AINDA aberta (a RLS matches_update_participant permite
-- o UPDATE da linha; o lock_match_lifecycle só trava wo em encerrada→encerrada,
-- não em aberta). marcarWO/varredura setam wo E status no mesmo statement, e a
-- reabertura limpa wo=false — ambos satisfazem a CHECK.
alter table public.matches drop constraint if exists matches_wo_coerente;
alter table public.matches
  add constraint matches_wo_coerente
  check (
    (wo = false and wo_vencedor is null)
    or (wo = true and status = 'encerrada' and wo_vencedor is not null
        and placar_1 = 0 and placar_2 = 0
        and (wo_vencedor = vaga_1 or wo_vencedor = vaga_2))
  );

create index if not exists matches_wo_vencedor_idx on public.matches (wo_vencedor);

-- ---------- Tabela: match_wo_requests (solicitação de W.O. pelo adversário) --
-- Decisão 8: o adversário SOLICITA o W.O. e o dono aceita/recusa. Padrão do
-- slot_invites (tabela própria, fora de matches). O vencedor pretendido é o
-- PRÓPRIO slot do solicitante ("o adversário não veio, eu ganho"); o aceite
-- reusa marcarWO com esse vencedor. Índice único parcial: 1 pendente/partida.
create table if not exists public.match_wo_requests (
  id               uuid primary key default gen_random_uuid(),
  match_id         uuid not null references public.matches (id) on delete cascade,
  solicitante_slot uuid not null references public.tournament_slots (id) on delete cascade,
  motivo           text,
  status           text not null default 'pendente'
                     check (status in ('pendente', 'aceito', 'recusado')),
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create index if not exists match_wo_requests_match_idx
  on public.match_wo_requests (match_id);
create unique index if not exists match_wo_requests_uma_pendente
  on public.match_wo_requests (match_id)
  where status = 'pendente';

-- ---------- Hardening: integridade dos clubes (defesa em profundidade) ----------
-- Segunda barreira além da validação nas Server Actions (searchTeams/selectTeam/
-- updateMatchTeams). Idempotente via DROP + ADD (Postgres não tem ADD IF NOT EXISTS).

-- Os dois lados da partida não podem referenciar o MESMO clube.
alter table public.matches drop constraint if exists matches_times_distintos;
alter table public.matches
  add constraint matches_times_distintos
  check (time_1 is null or time_2 is null or time_1 <> time_2);

-- Escudo só do CDN confiável da API-Football (espelha next.config.ts) ou nulo.
-- ATENÇÃO: se houver registros legados com escudo_url fora desse domínio, o ADD
-- falha. Conferir ANTES de aplicar:
--   select count(*) from public.teams
--   where escudo_url is not null
--     and escudo_url not like 'https://media.api-sports.io/%';
alter table public.teams drop constraint if exists teams_escudo_url_dominio;
alter table public.teams
  add constraint teams_escudo_url_dominio
  check (escudo_url is null or escudo_url like 'https://media.api-sports.io/%');

-- ---------- updated_at automático em matches ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists matches_set_updated_at on public.matches;
create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

-- ---------- Trava colunas de relação da partida contra reatribuição ----------
-- Via anon/authenticated key, participante_1/participante_2/tournament_id não
-- podem ser alterados (fecha a brecha de reatribuir adversário/torneio).
-- service_role (admin/migrations) permanece livre para corrigir atribuições.
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

-- ---------- Lifecycle: status só pelo dono; placar/clube de encerrada imutáveis --
-- A RLS de UPDATE é por LINHA: sem este trigger, um participante mudaria o
-- próprio status (encerrando/reabrindo a partida por POST direto), o placar e
-- até o CLUBE de partida já encerrada (reescrevendo a classificação de clubes
-- silenciosamente). Regras:
--   1. `status` só muda quando auth.uid() é o dono do torneio.
--   2. Partida `encerrada` não aceita mudança de placar NEM de clube (o fluxo
--      de correção é: dono reabre → participante corrige → dono re-encerra).
-- service_role (admin/migrations) permanece livre.
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

    -- Partida que CONTINUA encerrada (não está reabrindo): placar, clube e
    -- W.O. são imutáveis. `wo`/`wo_vencedor` entram aqui para fechar o furo de
    -- o técnico do lado perdedor trocar o vencedor de um W.O. já gravado (a RLS
    -- matches_update_participant permite o UPDATE da linha; o lock é a defesa
    -- de COLUNA). O `new.status = 'encerrada'` permite a REABERTURA (status sai
    -- de encerrada, gated ao dono acima) limpar o W.O. no mesmo UPDATE.
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

drop trigger if exists matches_lock_lifecycle on public.matches;
create trigger matches_lock_lifecycle
  before update on public.matches
  for each row execute function public.lock_match_lifecycle();

-- ---------- Formatos com chave: resultado decisivo e fases congeladas ------
-- Eliminatória exige VENCEDOR e a chave gerada é função dos resultados —
-- regras que a RLS (por linha) não expressa. Vale para os TRÊS formatos com
-- chave (mata_mata, grupos_mata_mata, fase_liga); as regras de resultado se
-- aplicam SÓ a partidas de CHAVE (posicao não nula) — partida de GRUPO empata
-- e reabre livre como na liga, ATÉ a chave existir. Backstop contra POST
-- direto (as Server Actions repetem as checagens com mensagem precisa):
--   ENCERRANDO (status → encerrada) partida de CHAVE:
--     - bye (um lado nulo): passa (nasce encerrado; não há placar a validar);
--     - jogo único (perna NULL): placar não pode empatar;
--     - perna 1: livre QUANDO a volta ainda não encerrou (o agregado decide
--       na volta); se a perna 2 JÁ está encerrada (fluxo reabrir→corrigir→
--       re-encerrar a ida), o agregado completo é revalidado — sem isso o
--       slot persistiria "fechado" com agregado empatado;
--     - perna 2: exige a perna 1 encerrada E agregado desempatado (a volta
--       tem lados invertidos: agregado A = ida.placar_1 + volta.placar_2).
--   REABRINDO (encerrada → outro):
--     - partida de CHAVE: bye nunca reabre; fase de chave posterior gerada
--       congela as anteriores (vencedor semeado adiante);
--     - partida de GRUPO: livre enquanto a chave não existe; depois dela, a
--       classificação já foi CONSUMIDA pelo cruzamento — reabrir tornaria a
--       chave incoerente.
-- service_role (admin/migrations) permanece livre.
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
    if new.wo then
      return new; -- W.O.: decisão explícita (wo_vencedor), sem placar a validar
    end if;
    -- Bye = um lado nulo, considerando os DOIS modelos (participante no
    -- avulso/legado, VAGA no competitivo clube-cêntrico). O coalesce é
    -- essencial: sem ele, a chave competitiva (participante_* sempre null,
    -- lados em vaga_*) seria SEMPRE tratada como bye e a validação de
    -- empate/agregado abaixo nunca rodaria — o backstop de decisividade ficaria
    -- morto para os formatos com chave de clube (fechado junto com o W.O.).
    if coalesce(new.participante_1, new.vaga_1) is null
       or coalesce(new.participante_2, new.vaga_2) is null then
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
      -- Bye = um lado nulo nos DOIS modelos (coalesce participante/vaga); sem
      -- o coalesce, a chave COMPETITIVA (participante_* sempre null) seria
      -- tratada como bye e NUNCA reabriria. Espelha o ramo de encerramento.
      if coalesce(new.participante_1, new.vaga_1) is null
         or coalesce(new.participante_2, new.vaga_2) is null then
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

-- ---------- Cria o perfil público ao registrar no Auth ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, nome, celular, avatar)
  values (
    new.id,
    new.raw_user_meta_data ->> 'nome',
    new.raw_user_meta_data ->> 'celular',
    new.raw_user_meta_data ->> 'avatar'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Participação: helper anti-recursão de RLS ----------
-- Usada DENTRO das policies de tournaments/matches. SECURITY DEFINER é
-- obrigatório: policy de tournaments lendo participants (cuja policy lê
-- tournaments de volta) dispara "infinite recursion detected in policy" —
-- como definer (owner), a leitura de participants não reentra nas policies.
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

-- ---------- Convite: aceite e preview via SECURITY DEFINER ----------
-- A RLS de INSERT de participants não consegue validar um segredo que não
-- está na linha inserida, e o convidado não pode ler tournament_invites.
-- Estas funções são o ÚNICO caminho do convidado: validam o código e agem
-- em nome do próprio auth.uid(), nada além.

-- Aceita o convite: exige sessão, código válido, torneio não-encerrado e —
-- em formato GERADO (liga, mata-mata) — torneio ainda em rascunho (tabela/
-- chave são geradas ao iniciar; quem entra depois ficaria órfão de partidas).
-- `<> 'avulso'` em vez de listar formatos: falha-segura — um formato futuro
-- gerado herda o bloqueio em vez de furar a regra silenciosamente.
-- Idempotente (on conflict do nothing): reabrir o link não duplica nem falha.
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

  -- Mensagem única: não distingue código inexistente de revogado.
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

-- Preview do convite para a página /convite/[codigo]: o torneio pode ser
-- privado e invisível ao convidado até o aceite — o CÓDIGO é a credencial.
-- Expõe apenas o mínimo (id, título, status, formato, se já participa);
-- código inválido devolve zero linhas (mesma resposta que revogado).
-- DROP antes do CREATE: mudar o RETURNS TABLE (coluna `formato` adicionada
-- nesta change) não é permitido via CREATE OR REPLACE. O DROP derruba os
-- GRANTs — eles são re-aplicados logo abaixo.
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

-- ---------- GRANTs das funções (CREATE FUNCTION dá EXECUTE a PUBLIC) ----------
-- eh_participante: as policies de tournaments/matches a avaliam COM O ROLE DA
-- QUERY (anon/authenticated) — revogar deles quebraria todo SELECT. Revoga-se
-- PUBLIC e concede-se explicitamente aos dois roles; a exposição via
-- /rest/v1/rpc resultante é inócua (só responde sobre o PRÓPRIO auth.uid()).
revoke execute on function public.eh_participante(uuid) from public;
grant execute on function public.eh_participante(uuid) to anon, authenticated;

-- Convite: só logado (espelha o design — deslogado não vê preview nem aceita;
-- aceitar_convite já exige auth.uid(), o revoke de anon é defesa em camada).
revoke execute on function public.aceitar_convite(text) from public, anon;
grant execute on function public.aceitar_convite(text) to authenticated;
revoke execute on function public.info_convite(text) from public, anon;
grant execute on function public.info_convite(text) to authenticated;

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

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.users              enable row level security;
alter table public.tournaments        enable row level security;
alter table public.matches            enable row level security;
alter table public.teams              enable row level security;
alter table public.participants       enable row level security;
alter table public.tournament_invites enable row level security;
alter table public.tournament_slots   enable row level security;
alter table public.slot_invites       enable row level security;
alter table public.match_wo_requests  enable row level security;

-- ----- users: leitura completa só para logados (protege PII como celular) -----
drop policy if exists users_select_public on public.users;
drop policy if exists users_select_authenticated on public.users;
create policy users_select_authenticated on public.users
  for select to authenticated
  using (true);

drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert to authenticated
  with check (auth.uid() = id);

drop policy if exists users_update_self on public.users;
create policy users_update_self on public.users
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- View pública SEM PII: anônimos enxergam só id/nome/avatar (nunca o celular).
-- security_invoker = false (definer) é proposital: a view roda como dona e
-- projeta apenas colunas não-sensíveis, já que anon não tem acesso à tabela.
create or replace view public.users_public
  with (security_invoker = false)
  as select id, nome, avatar from public.users;

grant select on public.users_public to anon, authenticated;

-- ----- tournaments: visibilidade por dono/público/participante; escrita do dono -----
-- SELECT: público vê os públicos; o dono vê os seus privados; o PARTICIPANTE
-- confirmado vê o torneio mesmo privado (descoberta pós-convite). A checagem
-- de participação usa eh_participante() (security definer) — ver o comentário
-- da função: referência direta a participants aqui criaria recursão de policy.
-- (anon tem auth.uid() nulo → enxerga apenas is_public.)
drop policy if exists tournaments_select_public on public.tournaments;
drop policy if exists tournaments_select_visivel on public.tournaments;
create policy tournaments_select_visivel on public.tournaments
  for select to anon, authenticated
  using (is_public or created_by = auth.uid() or public.eh_participante(id));

-- INSERT/UPDATE/DELETE: só o dono. with check impede criar em nome de outro
-- e transferir a posse num UPDATE.
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

-- ----- teams: SELECT público (dados públicos de clube); INSERT por logado (cache) -----
-- Sem UPDATE/DELETE (negados por padrão): o cache usa INSERT idempotente
-- (on conflict do nothing) por provider+external_id.
drop policy if exists teams_select_public on public.teams;
create policy teams_select_public on public.teams
  for select to anon, authenticated
  using (true);

drop policy if exists teams_insert_authenticated on public.teams;
create policy teams_insert_authenticated on public.teams
  for insert to authenticated
  with check (true);

-- ----- matches: SELECT segue a visibilidade do torneio; INSERT só do dono -----
-- A partida é visível quando o torneio dela é visível (público, ou privado do
-- próprio solicitante) OU quando o solicitante participa da partida — sem essa
-- cláusula, participante convidado em torneio privado de terceiro não veria a
-- própria partida (e o modal de placar quebraria). A subquery contra
-- `tournaments` espelha a policy tournaments_select_visivel: camadas consistentes.
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
    or exists (
      select 1 from public.tournament_slots s
      where s.id in (matches.vaga_1, matches.vaga_2)
        and s.user_id = auth.uid()
    )
  );

-- INSERT: só o dono do torneio cria partidas nele, e nunca em torneio
-- encerrado. `<> 'encerrado'` (em vez de `= 'ativo'`) é falha-segura: rascunho
-- recebe partidas (montagem antes de ativar) e um status futuro não bloqueia
-- silenciosamente. Cada participante informado precisa ser participante
-- CONFIRMADO do torneio (consentiu via convite) — partidas legadas não são
-- afetadas (a policy só vale para INSERTs novos). Formato: em torneio 'liga'
-- só entra partida COM rodada (o caminho da geração da tabela) — partida
-- manual sem rodada é barrada; o dono forjar rodada via POST direto é
-- auto-sabotagem sem vítima terceira (risco aceito no design). A Server
-- Action createMatch repete as checagens (mensagem precisa); esta policy é a
-- segunda barreira contra POST direto.
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

-- UPDATE também para o DONO do torneio (policies são OR): é ele quem encerra
-- e reabre partidas (modelo árbitro). A semântica de COLUNA (status só dono;
-- placar travado em encerrada) fica no trigger lock_match_lifecycle — RLS é
-- por linha e não distingue colunas.
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

-- ----- participants: leitura acompanha o torneio; entrada controlada -----
-- SELECT: quem enxerga o torneio enxerga a lista (página do torneio, selects
-- de nova partida). A subquery espelha tournaments_select_visivel; a cláusula
-- de participação usa eh_participante() (definer) — sem recursão.
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

-- INSERT direto: SÓ o dono inserindo A SI MESMO (entrada automática ao criar
-- o torneio / botão "Participar"). Convidado NUNCA insere direto — entra pela
-- função aceitar_convite (security definer), que valida o código secreto.
-- Torneio encerrado não recebe ninguém (espelha a regra do aceite).
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

-- DELETE: o próprio participante sai; o dono remove qualquer um. Partidas já
-- criadas NÃO são tocadas (histórico) — o removido só deixa de ser elegível
-- para novas partidas. EXCETO formatos COM CHAVE (mata_mata, grupos, fase de
-- liga) em estado congelado (ativo, ou com partidas geradas fora do
-- rascunho): o INSERT da chave — atual ou FUTURA, no caso dos grupos — exige
-- cada semeado em participants (cláusula da policy de INSERT de matches);
-- uma saída no meio travaria o avanço/geração PARA SEMPRE. Encerrado entra
-- na regra porque o torneio é REABRÍVEL (add-tournament-closing). Rascunho
-- segue livre; liga e avulso seguem livres (todas as partidas nascem no
-- Iniciar). Sem policy de UPDATE: não há coluna mutável.
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

-- ----- match_wo_requests: técnico solicita, dono resolve -----
-- INSERT: só o TÉCNICO de um dos lados da partida, com o slot solicitante
-- sendo o SEU (o vencedor pretendido é o próprio clube), torneio ATIVO e
-- partida ABERTA. matches/tournaments/tournament_slots são legíveis a quem vê
-- o torneio (o solicitante participa, então enxerga) — sem recursão (esta
-- policy não relê match_wo_requests). A unicidade de pendente é do índice.
drop policy if exists match_wo_requests_insert_tecnico on public.match_wo_requests;
create policy match_wo_requests_insert_tecnico on public.match_wo_requests
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = match_id
        and t.status = 'ativo'
        and m.status <> 'encerrada'
        and (solicitante_slot = m.vaga_1 or solicitante_slot = m.vaga_2)
        and exists (
          select 1 from public.tournament_slots s
          where s.id = solicitante_slot
            and s.user_id = auth.uid()
        )
    )
  );

-- SELECT: o técnico solicitante vê a própria; o dono do torneio vê todas.
drop policy if exists match_wo_requests_select on public.match_wo_requests;
create policy match_wo_requests_select on public.match_wo_requests
  for select to authenticated
  using (
    exists (
      select 1 from public.tournament_slots s
      where s.id = solicitante_slot
        and s.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = match_id
        and t.created_by = auth.uid()
    )
  );

-- UPDATE do veredito (status/resolved_at): SÓ o dono do torneio. O técnico
-- nunca resolve a própria solicitação. (DELETE: sem policy = negado a todos;
-- service_role livre. O registro é histórico imutável.)
drop policy if exists match_wo_requests_update_owner on public.match_wo_requests;
create policy match_wo_requests_update_owner on public.match_wo_requests
  for update to authenticated
  using (
    exists (
      select 1
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = match_id
        and t.created_by = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.matches m
      join public.tournaments t on t.id = m.tournament_id
      where m.id = match_id
        and t.created_by = auth.uid()
    )
  );

-- Segurança/PII: a tabela `users` (com `celular`) é legível só por authenticated.
-- Anônimos leem apenas `users_public` (id, nome, avatar) — sem telefone.
-- O atalho de WhatsApp usa `celular`, disponível somente na área autenticada.

-- ============================================================
-- Storage: bucket `avatars` (fotos de perfil)
-- ============================================================
-- Bucket PÚBLICO (leitura por URL pública; a URL vai em public.users.avatar).
-- Escrita restrita por RLS de storage.objects: cada usuário só mexe na PRÓPRIA
-- pasta `<auth.uid()>/…` (o app sobe em `<uid>/<uuid>.<ext>`). Aplicar
-- MANUALMENTE no Supabase (mesma política de DDL do projeto).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars leitura publica" on storage.objects;
create policy "avatars leitura publica" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

drop policy if exists "avatars insert do dono" on storage.objects;
create policy "avatars insert do dono" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars update do dono" on storage.objects;
create policy "avatars update do dono" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars delete do dono" on storage.objects;
create policy "avatars delete do dono" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
