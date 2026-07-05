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

-- Vitrine pública (change add-vitrine-publica-e-compartilhar): opt-in do dono para
-- LISTAR o torneio de topo na aba Explorar. default false (opt-in real, diferente
-- de is_public que é default true). Divisões de pirâmide herdam is_public mas nunca
-- recebem listada=true (sem UI; a liga-mãe é quem se lista).
alter table public.tournaments
  add column if not exists listada boolean not null default false;

create index if not exists tournaments_created_by_idx on public.tournaments (created_by);

-- Índice parcial: a vitrine filtra listada=true e ordena por created_at desc.
-- Cobre só as poucas linhas listadas.
create index if not exists tournaments_listada_idx
  on public.tournaments (created_at desc)
  where listada;

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

-- Competidores por NOME (aditivo; idempotente — change add-competidores-por-nome).
-- true = torneio competitivo cujas vagas são NOMES livres (sem clube). Default
-- false preserva os legados (todos por clube). A criação bifurca o INSERT de vaga.
alter table public.tournaments
  add column if not exists por_nome boolean not null default false;

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

-- Cores de identidade (aditivo; idempotente — change add-cores-campeonato). Hex
-- #rrggbb minúsculo OU NULL (NULL = usa o tema base do app). O Zod normaliza p/
-- minúsculo antes de gravar. ADD CONSTRAINT não aceita IF NOT EXISTS → drop-then-add.
alter table public.tournaments add column if not exists cor_primaria  text;
alter table public.tournaments add column if not exists cor_secundaria text;
alter table public.tournaments drop constraint if exists tournaments_cor_primaria_hex;
alter table public.tournaments add  constraint tournaments_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$');
alter table public.tournaments drop constraint if exists tournaments_cor_secundaria_hex;
alter table public.tournaments add  constraint tournaments_cor_secundaria_hex
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$');

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

-- Sanidade do cache de clubes (defesa no banco — vale p/ POST direto via anon key,
-- que ignora o Zod do app). nome dentro de 1..80 chars (após btrim) e external_id
-- só dígitos ou nulo. ATENÇÃO: se houver registros legados fora desses limites, o
-- ADD falha. Conferir ANTES de aplicar (só aplicar se ambos = 0):
--   select count(*) from public.teams
--   where char_length(btrim(nome)) not between 1 and 80;
--   select count(*) from public.teams
--   where external_id is not null and external_id !~ '^[0-9]+$';
alter table public.teams drop constraint if exists teams_nome_tam;
alter table public.teams
  add constraint teams_nome_tam
  check (char_length(btrim(nome)) between 1 and 80);
alter table public.teams drop constraint if exists teams_external_id_num;
alter table public.teams
  add constraint teams_external_id_num
  check (external_id is null or external_id ~ '^[0-9]+$');

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

-- ---------- Vaga por NOME (aditivo; idempotente — change add-competidores-por-nome) ----------
-- Toggle por torneio: um torneio competitivo é TODO de clubes reais OU TODO de
-- NOMES livres (rótulo). Vaga por nome = team_id NULL + rotulo preenchido; SEM
-- técnico, SEM convite (slot_invites), SEM dono — o organizador lança os placares.
-- Sem backfill: todo slot legado tem team_id (o XOR passa: team_id not null, rotulo null).
alter table public.tournament_slots alter column team_id drop not null;
alter table public.tournament_slots add column if not exists rotulo text;

alter table public.tournament_slots drop constraint if exists slots_clube_xor_rotulo;
alter table public.tournament_slots
  add constraint slots_clube_xor_rotulo check ((team_id is null) <> (rotulo is null));
alter table public.tournament_slots drop constraint if exists slots_rotulo_nao_vazio;
alter table public.tournament_slots
  add constraint slots_rotulo_nao_vazio check (rotulo is null or length(trim(rotulo)) > 0);

-- A UNIQUE inline (tournament_id, team_id) vira índice PARCIAL (constraint não
-- aceita predicado); + rótulo único por torneio (case-insensitive).
alter table public.tournament_slots drop constraint if exists slots_team_unico_no_torneio;
create unique index if not exists slots_team_unico_no_torneio
  on public.tournament_slots (tournament_id, team_id) where team_id is not null;
create unique index if not exists slots_rotulo_unico_no_torneio
  on public.tournament_slots (tournament_id, lower(trim(rotulo))) where rotulo is not null;

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

-- ---------- Liberação de rodada (aditivo; idempotente) ----------
-- Gating de visibilidade/jogabilidade por rodada (estilo Brasileirão):
--   NULL     = oculta (só o dono do torneio vê);
--   <= now() = liberada (visível e jogável pelos demais ramos de visibilidade);
--   > now()  = agendada (suportada pelo tipo; sem UI no v1).
-- DEFAULT now() faz toda inserção futura nascer liberada, salvo quando a action
-- de geração passar liberada_em = null explicitamente (cadência manual). NÃO
-- entra em lock_match_relations (a liberação precisa poder mudar após criada).
alter table public.matches
  add column if not exists liberada_em timestamptz;
alter table public.matches alter column liberada_em set default now();
comment on column public.matches.liberada_em is
  'Liberacao da partida. NULL = oculta (so o dono ve); <= now() = liberada (visivel/jogavel); > now() = agendada (futuro).';

-- Backfill: tudo que ja existe fica visivel (preserva o comportamento atual).
update public.matches set liberada_em = now() where liberada_em is null;

-- Indice para o filtro liberada_em <= now() por torneio (RLS do nao-dono e listas).
create index if not exists matches_liberada_em_idx
  on public.matches (tournament_id, liberada_em);

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
-- W.O. de AMBOS ausentes ("duplo W.O."): partida ENCERRADA 0x0 SEM vencedor.
-- Só ocorre FORA de chave (liga/grupos/avulso, posicao nula) — a chave sempre
-- exige um vencedor. Aditivo, sem backfill: legado nasce false (ramos 1 e 2 da
-- CHECK exigem wo_duplo = false).
alter table public.matches
  add column if not exists wo_duplo boolean not null default false;

-- Coerência do W.O. em TRÊS formas mutuamente exclusivas:
--   1) fora de W.O.: wo_vencedor nulo e wo_duplo falso;
--   2) W.O. simples (um lado ausente): partida ENCERRADA, wo_duplo falso,
--      vencedor não-nulo e igual a UM DOS LADOS (vaga), placar zerado;
--   3) duplo W.O. (ambos ausentes): partida ENCERRADA, wo_duplo verdadeiro,
--      SEM vencedor, placar zerado, NÃO é chave (posicao nula) e os dois lados
--      presentes (vaga_1/vaga_2 não nulos). O `posicao is null` é o BACKSTOP
--      contra duplo em chave por POST direto; o `vaga_* is not null` é defesa
--      em profundidade (a action já exige ambos os lados — sem duplo em bye).
-- O `status = 'encerrada'` fecha o POST direto de um participante gravando
-- wo=true numa partida AINDA aberta (a RLS matches_update_participant permite
-- o UPDATE da linha; o lock_match_lifecycle só trava wo em encerrada→encerrada,
-- não em aberta). marcarWO/marcarWoDuplo/varredura setam wo E status no mesmo
-- statement, e a reabertura limpa wo=false, wo_duplo=false — todos satisfazem a
-- CHECK.
alter table public.matches drop constraint if exists matches_wo_coerente;
alter table public.matches
  add constraint matches_wo_coerente
  check (
    (wo = false and wo_vencedor is null and wo_duplo = false)
    or (wo = true and wo_duplo = false and status = 'encerrada'
        and wo_vencedor is not null
        and placar_1 = 0 and placar_2 = 0
        and (wo_vencedor = vaga_1 or wo_vencedor = vaga_2))
    or (wo = true and wo_duplo = true and status = 'encerrada'
        and wo_vencedor is null
        and placar_1 = 0 and placar_2 = 0
        and posicao is null
        and vaga_1 is not null and vaga_2 is not null)
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

-- Escudo do CDN da API-Football (transição) OU do NOSSO Storage (self-host,
-- change add-escudos-self-host) OU nulo. Preserva a intenção anti-injeção: como
-- a RLS teams_insert_authenticated NÃO valida escudo_url, esta CHECK é a ÚNICA
-- defesa no banco contra POST direto via anon key (que ignora o Zod). Os ramos
-- do Storage ANCORAM o host (`https://%.supabase.co/...` prod e
-- `http://127.0.0.1:54321/...` local) — `%` só no meio (sub-ref) e no fim
-- (path); nunca na frente do host, senão `http://169.254.169.254/x/storage/v1/
-- object/public/escudos/y.png` passaria e abriria SSRF no sink (og/rodada.tsx).
-- O ramo api-sports pode SAIR após o backfill 100% migrar os legados.
-- ATENÇÃO: se houver registros com escudo_url fora desses hosts, o ADD falha.
-- Conferir ANTES de aplicar:
--   select count(*) from public.teams
--   where escudo_url is not null
--     and escudo_url not like 'https://media.api-sports.io/%'
--     and escudo_url not like 'https://%.supabase.co/storage/v1/object/public/escudos/%'
--     and escudo_url not like 'http://127.0.0.1:54321/storage/v1/object/public/escudos/%';
alter table public.teams drop constraint if exists teams_escudo_url_dominio;
alter table public.teams
  add constraint teams_escudo_url_dominio
  check (
    escudo_url is null
    or escudo_url like 'https://media.api-sports.io/%'
    or escudo_url like 'https://%.supabase.co/storage/v1/object/public/escudos/%'
    or escudo_url like 'http://127.0.0.1:54321/storage/v1/object/public/escudos/%'
  );

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
    -- add-equipe-campeonato: status agora por pode_arbitrar (dono | admin |
    -- árbitro), não mais só created_by. Defesa de coluna e bypass service_role
    -- abaixo permanecem.
    if new.status is distinct from old.status then
      if not public.pode_arbitrar_torneio(new.tournament_id) then
        raise exception 'Só a organização do torneio altera o status da partida';
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
            or new.wo_vencedor is distinct from old.wo_vencedor
            or new.wo_duplo is distinct from old.wo_duplo)
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

-- ---------- Co-participação: PII (celular) restrita a quem compartilha torneio ----------
-- Verdadeiro quando auth.uid() e p_outro aparecem no MESMO torneio por qualquer
-- caminho de pertencimento (dono, jogador avulso, técnico de vaga). SECURITY
-- DEFINER pelo mesmo motivo de eh_participante (não reentrar nas policies de
-- participants/tournaments/slots); o (select auth.uid()) é o initplan idiomático.
create or replace function public.eh_co_participante(p_outro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from (
      select tournament_id from public.participants    where user_id   = (select auth.uid())
      union
      select id            from public.tournaments      where created_by = (select auth.uid())
      union
      select tournament_id from public.tournament_slots where user_id   = (select auth.uid())
    ) meus
    join (
      select tournament_id from public.participants    where user_id   = p_outro
      union
      select id            from public.tournaments      where created_by = p_outro
      union
      select tournament_id from public.tournament_slots where user_id   = p_outro
    ) deles using (tournament_id)
  );
$$;
-- Sem grant a anon/authenticated: a função é predicado INTERNO da
-- `celulares_de_contato` (DEFINER, roda como owner) e de nenhuma policy — não
-- precisa ser chamável como RPC. Revogar o EXECUTE público zera o WARN do
-- advisor `*_security_definer_function_executable` sem afetar a RPC.
revoke execute on function public.eh_co_participante(uuid) from public, anon, authenticated;

-- celulares_de_contato: ÚNICO caminho de leitura do `celular` (a coluna perde o
-- grant de SELECT mais abaixo). Devolve o telefone de um id só quando é o
-- PRÓPRIO solicitante OU um co-participante. SECURITY DEFINER (lê users sem a
-- barreira de coluna); EXECUTE só a authenticated (anon nunca convoca).
create or replace function public.celulares_de_contato(p_user_ids uuid[])
returns table (user_id uuid, celular text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.celular
  from public.users u
  where u.id = any (p_user_ids)
    and u.celular is not null
    and (u.id = (select auth.uid()) or public.eh_co_participante(u.id));
$$;
-- `from public, anon`: o default-privilege do Supabase concede EXECUTE a anon em
-- toda função nova; revogamos explicitamente (anon nunca convoca). Inócuo de
-- qualquer forma — anon tem auth.uid() nulo e o gate devolve zero linhas.
revoke execute on function public.celulares_de_contato(uuid[]) from public, anon;
grant execute on function public.celulares_de_contato(uuid[]) to authenticated;

-- ====================== PUSH NOTIFICATIONS (PWA Fase 3) ======================
-- Subscriptions de Web Push, uma por (user_id, endpoint). RLS self-service: cada
-- usuário só lê/mexe nas próprias. A policy de UPDATE é OBRIGATÓRIA para o upsert
-- de re-inscrição (o push service renova p256dh/auth no mesmo endpoint).
create table if not exists public.push_subscriptions (
  user_id    uuid not null references public.users (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, endpoint)
);
create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists push_subscriptions_select_self on public.push_subscriptions;
create policy push_subscriptions_select_self on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_insert_self on public.push_subscriptions;
create policy push_subscriptions_insert_self on public.push_subscriptions
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_update_self on public.push_subscriptions;
create policy push_subscriptions_update_self on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists push_subscriptions_delete_self on public.push_subscriptions;
create policy push_subscriptions_delete_self on public.push_subscriptions
  for delete to authenticated using (user_id = (select auth.uid()));

-- subscriptions_de: ÚNICO caminho de leitura cross-user das subscriptions (para o
-- envio). Espelha celulares_de_contato — DEFINER gated por co-participação: só
-- devolve a sub de um id que é o próprio caller OU eh_co_participante. Sem
-- service_role em runtime; o endpoint sozinho não permite enviar (exige a priv VAPID).
create or replace function public.subscriptions_de(p_user_ids uuid[])
returns table (user_id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.user_id, s.endpoint, s.p256dh, s.auth
  from public.push_subscriptions s
  where s.user_id = any (p_user_ids)
    and (s.user_id = (select auth.uid()) or public.eh_co_participante(s.user_id));
$$;
revoke execute on function public.subscriptions_de(uuid[]) from public, anon;
grant execute on function public.subscriptions_de(uuid[]) to authenticated;

-- remover_push_endpoint: poda uma sub expirada (410/404) por endpoint exato. O
-- endpoint é opaco/secreto (só quem recebeu o 410 o conhece) → não é oráculo.
create or replace function public.remover_push_endpoint(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;
revoke execute on function public.remover_push_endpoint(text) from public, anon;
grant execute on function public.remover_push_endpoint(text) to authenticated;
-- ============================================================================

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
         coalesce(tm.nome, ts.rotulo),
         tm.escudo_url,
         ts.user_id is not null,
         exists (
           select 1 from public.tournament_slots s2
           where s2.tournament_id = t.id
             and s2.user_id = auth.uid()
         )
    from public.slot_invites si
    join public.tournament_slots ts on ts.id = si.slot_id
    -- LEFT JOIN: vaga por NOME não tem clube (defensivo — vaga por nome nunca
    -- gera slot_invite, então o RPC não a alcança na prática).
    left join public.teams tm on tm.id = ts.team_id
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
    -- Vaga por NOME: o rótulo também é geometria da disputa — travado pós-rascunho.
    if new.rotulo is distinct from old.rotulo
       and exists (
         select 1 from public.tournaments t
         where t.id = old.tournament_id
           and t.status <> 'rascunho'
       )
    then
      raise exception 'O nome do competidor não pode mudar após o início do torneio';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tournament_slots_lock_relations on public.tournament_slots;
create trigger tournament_slots_lock_relations
  before update on public.tournament_slots
  for each row execute function public.lock_slot_relations();

-- ---------- Trigger: vaga por NOME nunca tem convite ----------
-- Invariante do modelo por-nome: vaga por NOME (team_id NULL + rotulo) não tem
-- técnico nem convite — o organizador lança os placares. A UI já esconde o botão
-- (VagasSection); este trigger é a defesa de integridade no banco (junto da RLS
-- de slot_invites), fechando o POST direto a regenerarConviteVaga / bypass do
-- PostgREST. É trigger (não CHECK) porque a condição mora em outra tabela.
-- SEM exceção de service_role DE PROPÓSITO (ao contrário de lock_slot_relations):
-- nenhum caminho legítimo (seed/admin) cria convite para vaga por-nome.
-- SLOT_POR_NOME é mensagem-código de BACKSTOP, deliberadamente NÃO mapeada na
-- action (o guard de UX de regenerarConviteVaga a antecede no fluxo real).
create or replace function public.block_slot_invite_por_nome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.tournament_slots s
    where s.id = new.slot_id
      and s.team_id is null
  ) then
    raise exception 'SLOT_POR_NOME';
  end if;
  return new;
end;
$$;

drop trigger if exists slot_invites_block_por_nome on public.slot_invites;
create trigger slot_invites_block_por_nome
  before insert or update on public.slot_invites
  for each row execute function public.block_slot_invite_por_nome();

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

-- View pública SEM PII: projeta só id/nome/avatar (nunca o celular).
-- security_invoker = true (hardening, advisor lint 0010): roda com a RLS/grants
-- do papel que consulta. Hoje a view está ÓRFÃ (nenhum código do app a consome —
-- só consta em database.types.ts), então invoker não expõe nada novo; se voltar a
-- ser usada por anon, exigirá policy/grant de coluna explícito em `users`.
create or replace view public.users_public
  with (security_invoker = true)
  as select id, nome, avatar from public.users;

grant select on public.users_public to anon, authenticated;

-- ----- PII: o `celular` é restrito a co-participantes via grant de COLUNA -----
-- A RLS é por-LINHA; para proteger SÓ o `celular` (mantendo nome/avatar amplos,
-- necessários em torneios públicos avulsos), revoga-se o SELECT da TABELA e
-- re-concede-se apenas as colunas não-PII. O `celular` passa a ser legível só
-- pela RPC definer `celulares_de_contato` (gate de co-participação). O re-grant
-- inclui `anon` para preservar o baseline da view órfã users_public (sem ele,
-- anon tomaria "permission denied for column" no lugar de "0 linhas pela RLS").
-- UPDATE/INSERT de coluna ficam intactos: a auto-edição de nome/celular
-- (atualizarPerfil) e o trigger handle_new_user seguem gravando.
-- DEVE ser a última instrução de grant tocando `users` (ver supabase/local-grants.sql).
revoke select on public.users from anon, authenticated;
grant select (id, nome, avatar, created_at) on public.users to anon, authenticated;

-- ----- tournaments: visibilidade por dono/público/participante; escrita do dono -----
-- SELECT: público vê os públicos; o dono vê os seus privados; o PARTICIPANTE
-- confirmado vê o torneio mesmo privado (descoberta pós-convite). A checagem
-- de participação usa eh_participante() (security definer) — ver o comentário
-- da função: referência direta a participants aqui criaria recursão de policy.
-- (anon tem auth.uid() nulo → enxerga apenas is_public.)
drop policy if exists tournaments_select_public on public.tournaments;
drop policy if exists tournaments_select_visivel on public.tournaments;
-- add-equipe-campeonato: SELECT amplia para "ver bastidores" (qualquer membro).
create policy tournaments_select_visivel on public.tournaments
  for select to anon, authenticated
  using (is_public or created_by = auth.uid() or public.eh_participante(id) or public.pode_ver_bastidores_torneio(id));

-- INSERT/UPDATE/DELETE: só o dono. with check impede criar em nome de outro
-- e transferir a posse num UPDATE.
drop policy if exists tournaments_insert_owner on public.tournaments;
create policy tournaments_insert_owner on public.tournaments
  for insert to authenticated
  with check (created_by = auth.uid());

-- add-equipe-campeonato: UPDATE passa a "gerir" (dono | admin). A posse e a
-- reabertura/rebaixamento ficam DONO-ONLY no trigger lock_tournament_reopen.
drop policy if exists tournaments_update_owner on public.tournaments;
create policy tournaments_update_owner on public.tournaments
  for update to authenticated
  using (public.pode_gerir_torneio(id))
  with check (public.pode_gerir_torneio(id));

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
  with check (
    char_length(btrim(nome)) between 1 and 80
    and (external_id is null or external_id ~ '^[0-9]+$')
  );

-- ----- matches: SELECT segue a visibilidade do torneio; INSERT só do dono -----
-- A partida é visível quando o torneio dela é visível (público, ou privado do
-- próprio solicitante) OU quando o solicitante participa da partida — sem essa
-- cláusula, participante convidado em torneio privado de terceiro não veria a
-- própria partida (e o modal de placar quebraria). A subquery contra
-- `tournaments` espelha a policy tournaments_select_visivel: camadas consistentes.
-- O DONO do torneio (inclui divisoes de liga, que sao tournaments) ve TUDO, sem
-- gate de liberacao. Os demais ramos (publico, participante, jogador/tecnico da
-- partida) so veem a partida quando LIBERADA (liberada_em <= now()) — assim o
-- adversario de uma rodada futura nao ve o confronto antes da revelacao. anon
-- tem auth.uid() nulo: cai sempre no ramo "demais" e so ve liberada + is_public.
drop policy if exists matches_select_public on public.matches;
drop policy if exists matches_select_visivel on public.matches;
-- add-equipe-campeonato: bastidores vê TUDO (inclusive partida oculta); o ramo
-- "dono vê tudo" virou pode_ver_bastidores_torneio (dono | qualquer membro).
create policy matches_select_visivel on public.matches
  for select to anon, authenticated
  using (
    public.pode_ver_bastidores_torneio(tournament_id)
    or (
      liberada_em is not null and liberada_em <= now()
      and (
        exists (
          select 1 from public.tournaments t
          where t.id = tournament_id
            and (t.is_public or public.eh_participante(t.id))
        )
        or auth.uid() = participante_1
        or auth.uid() = participante_2
        or exists (
          select 1 from public.tournament_slots s
          where s.id in (matches.vaga_1, matches.vaga_2)
            and s.user_id = auth.uid()
        )
      )
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
-- add-equipe-campeonato: criar partida (estrutura) passa a "gerir" (dono | admin).
drop policy if exists matches_insert_tournament_owner on public.matches;
create policy matches_insert_tournament_owner on public.matches
  for insert to authenticated
  with check (
    public.pode_gerir_torneio(tournament_id)
    and exists (
      select 1 from public.tournaments t
      where t.id = tournament_id
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

-- A policy de UPDATE do participante (matches_update_participant) é definida na
-- seção "PROPOSTA DE RESULTADO COM FOTO" (mais abaixo), na sua forma ESTREITA e
-- única — só participante_1/participante_2 em partida LIBERADA. Não há definição
-- aqui: num apply de cima para baixo a definição de lá venceria de qualquer forma,
-- então mantemos uma fonte única para evitar código morto e divergência.

-- UPDATE também para o DONO do torneio (policies são OR): é ele quem encerra
-- e reabre partidas (modelo árbitro). A semântica de COLUNA (status só dono;
-- placar travado em encerrada) fica no trigger lock_match_lifecycle — RLS é
-- por linha e não distingue colunas.
-- add-equipe-campeonato: encerrar/reabrir partida passa a "arbitrar"
-- (dono | admin | árbitro). O lock de coluna fica no lock_match_lifecycle.
drop policy if exists matches_update_tournament_owner on public.matches;
create policy matches_update_tournament_owner on public.matches
  for update to authenticated
  using (public.pode_arbitrar_torneio(tournament_id))
  with check (public.pode_arbitrar_torneio(tournament_id));

-- ----- participants: leitura acompanha o torneio; entrada controlada -----
-- SELECT: quem enxerga o torneio enxerga a lista (página do torneio, selects
-- de nova partida). A subquery espelha tournaments_select_visivel; a cláusula
-- de participação usa eh_participante() (definer) — sem recursão.
-- add-equipe-campeonato: SELECT += bastidores (qualquer membro vê o elenco).
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
    or public.pode_ver_bastidores_torneio(tournament_id)
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
-- add-equipe-campeonato: expulsar passa a "moderar" (dono | admin | moderador);
-- o próprio participante segue saindo sozinho.
drop policy if exists participants_delete_self_or_owner on public.participants;
create policy participants_delete_self_or_owner on public.participants
  for delete to authenticated
  using (user_id = auth.uid() or public.pode_moderar_torneio(tournament_id));

-- ----- tournament_invites: TUDO restrito ao dono do torneio -----
-- O código é o segredo que dá entrada — convidado não lê a tabela (valida o
-- código apenas via aceitar_convite/info_convite, security definer).
-- add-equipe-campeonato: gerir convites de participação passa a "moderar".
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

-- ---------- Policies: tournament_slots (vagas de clube) ----------
-- SELECT: quem vê o torneio vê as vagas (clube + técnico são o elenco
-- público da disputa; o CÓDIGO do convite mora em slot_invites, só do dono).
-- add-equipe-campeonato: SELECT += bastidores.
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
    or public.pode_ver_bastidores_torneio(tournament_id)
  );

-- INSERT/DELETE: a geometria (quais clubes) pertence à disputa, SÓ EM RASCUNHO.
-- add-equipe-campeonato: passa a "gerir" (dono | admin). WITH CHECK do INSERT
-- exige vaga nascendo VAZIA (atribuição de técnico só pelo aceite).
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

-- add-equipe-campeonato: expulsar/esvaziar vaga passa a "moderar".
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

-- ---------- Policies: slot_invites (código por vaga — segredo do dono) ----------
-- add-equipe-campeonato: gerir convites de vaga passa a "moderar" (via
-- vaga→torneio). WITH CHECK preserva team_id not null (só vaga de CLUBE).
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
    -- foto OPCIONAL: null OU amarrada à pasta do autor <uid>/<match_id>/<uuid>.ext.
    -- Sem isso, o browser (anon key) poderia inserir um foto_path apontando pra
    -- pasta de OUTRO usuário e ler evidência dele via SELECT policy de storage.
    (foto_path is null
     or ((storage.foldername(foto_path))[1] = (select auth.uid())::text
         and (storage.foldername(foto_path))[2] = match_id::text))
    and exists (
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

-- SELECT: o técnico solicitante vê a própria; quem arbitra o torneio vê todas.
-- add-equipe-campeonato: dono → arbitrar (dono | admin | árbitro).
drop policy if exists match_wo_requests_select on public.match_wo_requests;
create policy match_wo_requests_select on public.match_wo_requests
  for select to authenticated
  using (
    exists (select 1 from public.tournament_slots s where s.id = solicitante_slot and s.user_id = auth.uid())
    or exists (select 1 from public.matches m where m.id = match_id and public.pode_arbitrar_torneio(m.tournament_id))
  );

-- UPDATE do veredito (status/resolved_at): quem ARBITRA. O técnico nunca resolve
-- a própria solicitação. (DELETE: sem policy = negado a todos; service_role
-- livre. O registro é histórico imutável.)
drop policy if exists match_wo_requests_update_owner on public.match_wo_requests;
create policy match_wo_requests_update_owner on public.match_wo_requests
  for update to authenticated
  using (exists (select 1 from public.matches m where m.id = match_id and public.pode_arbitrar_torneio(m.tournament_id)))
  with check (exists (select 1 from public.matches m where m.id = match_id and public.pode_arbitrar_torneio(m.tournament_id)));

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
-- Limites do bucket (defesa em profundidade; espelha o MAX_BYTES de 2MB e os
-- tipos aceitos em src/actions/profile.ts). `do update` porque o bucket já
-- existe em prod (do nothing não aplicaria os limites). GIF incluído: a app
-- aceita image/gif (AvatarUpload.accept), omiti-lo quebraria upload legítimo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Hardening (advisor lint 0025): SEM policy SELECT ampla em storage.objects — ela
-- permitiria LISTAR todos os avatares. O bucket é público, então cada objeto continua
-- acessível pela sua URL; o app só usa URLs diretas (nunca lista).
drop policy if exists "avatars leitura publica" on storage.objects;

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

-- ============================================================
-- Storage: bucket `escudos` (escudos de clube self-hostados)
-- ============================================================
-- Bucket PÚBLICO (leitura por URL pública; a URL vai em public.teams.escudo_url).
-- Cache COMPARTILHADO (não é por-dono como avatars): a imagem é a mesma para
-- todos, gravada em `escudos/<external_id>.png`. Corta o hotlink do CDN da
-- API-Football em todo render (change add-escudos-self-host). Aplicar
-- MANUALMENTE no Supabase (mesma política de DDL do projeto).
-- Limites do bucket (defesa em profundidade; espelham o MAX_BYTES de 256KB e o
-- CONTENT_TYPE de src/lib/escudos.ts). `do update` porque o bucket pode já
-- existir. Só PNG/WEBP: SVG fica FORA do allowlist (espelha o hardening do
-- avatars) — mata o vetor de SVG-XSS armazenado servido pelo host do projeto.
-- A app grava sempre image/png; webp por robustez.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('escudos', 'escudos', true, 262144,
        array['image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Hardening (espelha avatars, advisor lint 0025): SEM policy SELECT ampla — ela
-- permitiria LISTAR todos os escudos. O bucket é público, então cada objeto
-- continua acessível pela sua URL; o app só usa URLs diretas (nunca lista).
drop policy if exists "escudos leitura publica" on storage.objects;

-- INSERT liberado a autenticados: mesmo nível de confiança de inserir em
-- public.teams (a RLS de teams já permite INSERT a autenticados). O escudo é
-- WRITE-ONCE pela app (chave determinística por external_id; o selectTeam só
-- re-hospeda clube NOVO). O `name` é ANCORADO a `<external_id>.png` (external_id
-- é numérico pela CHECK teams_external_id_num) — bloqueia hosting de arquivo/path
-- arbitrário por autenticado. SEM policy de UPDATE/DELETE amplas — o objeto vira
-- imutável via anon/authenticated. O backfill (service_role) ignora a RLS e
-- pode reprocessar (upsert) qualquer chave.
drop policy if exists "escudos insert autenticado" on storage.objects;
create policy "escudos insert autenticado" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'escudos' and name ~ '^[0-9]+\.png$');

-- ---------- Realtime ----------
-- O painel (/dashboard) assina UPDATE de `matches` via Supabase Realtime para
-- atualizar placar e status ao vivo (sem refresh). A emissão respeita a RLS de
-- SELECT de `matches` (o canal é autenticado; nenhuma policy nova). Publicar a
-- tabela na publication do Realtime é config de banco — aplicar manualmente
-- (idempotente: ignora se já publicada). Ver docs/pendencias-manuais.md seção 16.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;
end $$;

-- ============================================================================
-- LIGAS EM PIRÂMIDE (change: add-ligas-piramide) — Fase 0
-- ============================================================================
-- Camada FINA (6 tabelas + 2 colunas aditivas) que orquestra a pirâmide ACIMA
-- do motor de torneio existente, SEM alterá-lo: cada divisão de uma temporada É
-- um `tournaments` de formato 'liga'. As vagas das divisões são pré-preenchidas
-- pela RPC `montar_temporada` (SECURITY DEFINER) — o único caminho que grava
-- `tournament_slots.user_id` no INSERT, contornando de forma auditável a policy
-- `slots_insert_owner_rascunho` (que exige user_id null) e preservando o
-- invariante "técnico só por aceite" do torneio AVULSO. Tudo aditivo, nullable e
-- idempotente: zero regressão nos torneios legados/standalone.

-- ---------- Enums da pirâmide ----------
do $$
begin
  -- Estado da pirâmide (competição imortal): 'ativa' (pública/em curso) ou
  -- 'arquivada' (visível só ao dono).
  if not exists (select 1 from pg_type where typname = 'league_competition_status') then
    create type public.league_competition_status as enum ('ativa', 'arquivada');
  end if;
  -- Estado da temporada: 'rascunho' (montando), 'ativa' (divisões rodando),
  -- 'em_fluxo' (todas encerraram, calculando sobe/cai — trava antes de gerar
  -- N+1), 'encerrada' (próxima temporada gerada — congelada).
  if not exists (select 1 from pg_type where typname = 'league_season_status') then
    create type public.league_season_status as enum ('rascunho', 'ativa', 'em_fluxo', 'encerrada');
  end if;
  -- Base de cálculo de sobe/cai por divisão (snapshot na temporada): 'posicao'
  -- (colocação direta), 'ppg' (pontos por jogo — desempata divisões de tamanhos
  -- diferentes), 'promedios' (média plurianual — Fase 4).
  if not exists (select 1 from pg_type where typname = 'league_ranking_base') then
    create type public.league_ranking_base as enum ('posicao', 'ppg', 'promedios');
  end if;
  -- Modo de resolução de uma fronteira entre a divisão d e d+1: 'direto' (pelos
  -- extremos da tabela — Fase 1) ou via chave (Fases 2-3).
  if not exists (select 1 from pg_type where typname = 'league_boundary_mode') then
    create type public.league_boundary_mode as enum ('direto', 'playoff_acesso', 'playout', 'barragem_cruzada');
  end if;
end$$;

-- ---------- Tabela: league_competitions (a pirâmide imortal — config-mãe) ----------
-- created_by anulável + ON DELETE SET NULL: espelha tournaments — apagar o dono
-- não derruba a pirâmide com histórico. is_public default true: HERDADO pelos
-- tournaments das divisões (montar_temporada copia para tournaments.is_public).
create table if not exists public.league_competitions (
  id               uuid primary key default gen_random_uuid(),
  nome             text not null,
  created_by       uuid references public.users (id) on delete set null,
  status           public.league_competition_status not null default 'ativa',
  -- Snapshot da config CORRENTE (desempate default). A temporada congela a sua
  -- cópia em league_seasons.config_snapshot ao ser montada.
  desempate_padrao text not null default 'cbf',
  is_public        boolean not null default true,
  -- Vitrine pública (change add-vitrine-publica-e-compartilhar): opt-in do dono
  -- para LISTAR a pirâmide na aba Explorar. default false (opt-in real). Listar a
  -- liga publica a pirâmide inteira; a vitrine linka a temporada corrente.
  listada          boolean not null default false,
  created_at       timestamptz not null default now(),
  constraint league_competitions_nome_nao_vazio check (length(trim(nome)) > 0),
  -- 'cbf'/'ingles' reordenam a cadeia objetiva; 'espanhol'/'fifa' (Fase 5) usam
  -- a mini-tabela entre os empatados; 'custom' é reservado (degrada p/ 'cbf').
  constraint league_competitions_desempate_valido
    check (desempate_padrao in ('cbf', 'ingles', 'custom', 'espanhol', 'fifa'))
);

create index if not exists league_competitions_created_by_idx
  on public.league_competitions (created_by);

-- Vitrine pública (change add-vitrine-publica-e-compartilhar): coluna defensiva
-- para DBs já existentes (o create table if not exists pula a coluna inline) +
-- índice parcial da vitrine (listada=true, ordena por created_at desc).
alter table public.league_competitions
  add column if not exists listada boolean not null default false;

create index if not exists league_competitions_listada_idx
  on public.league_competitions (created_at desc)
  where listada;

-- Cores de identidade da pirâmide (default herdado pelas divisões — change
-- add-cores-campeonato). Hex #rrggbb minúsculo OU NULL.
alter table public.league_competitions add column if not exists cor_primaria  text;
alter table public.league_competitions add column if not exists cor_secundaria text;
alter table public.league_competitions drop constraint if exists league_competitions_cor_primaria_hex;
alter table public.league_competitions add  constraint league_competitions_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$');
alter table public.league_competitions drop constraint if exists league_competitions_cor_secundaria_hex;
alter table public.league_competitions add  constraint league_competitions_cor_secundaria_hex
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$');

-- ---------- Tabela: league_seasons (uma temporada da pirâmide) ----------
create table if not exists public.league_seasons (
  id                 uuid primary key default gen_random_uuid(),
  competition_id     uuid not null references public.league_competitions (id) on delete cascade,
  numero             integer not null,                 -- 1-based; sequencial na pirâmide
  status             public.league_season_status not null default 'rascunho',
  -- Ciclo da temporada (Fase 5.1). 'anual' (default) = um torneio por divisão
  -- (byte-idêntico ao legado). 'apertura_clausura' = temporada DIVIDIDA: cada
  -- divisão roda Apertura + Clausura; sobe/cai pela tabela ANUAL COMBINADA;
  -- campeão = grande final entre os campeões dos dois turnos. montarProximaTemporada
  -- COPIA o ciclo para a N+1 (senão a pirâmide degrada para single-stage).
  ciclo              text not null default 'anual',
  -- Cópia imutável da config no momento da montagem (nº divisões, fronteiras,
  -- toggles nome/clube, desempate por divisão). jsonb: a config evolui por fase
  -- sem nova coluna; a temporada já gerada nunca é re-lida da config-mãe.
  config_snapshot    jsonb not null default '{}'::jsonb,
  -- Aponta para a temporada anterior (cadeia de proveniência do realocamento).
  previous_season_id uuid references public.league_seasons (id) on delete set null,
  created_at         timestamptz not null default now(),
  encerrada_em       timestamptz,
  constraint league_seasons_numero_positivo check (numero >= 1),
  constraint league_seasons_ciclo_valido check (ciclo in ('anual', 'apertura_clausura'))
);

-- SENTINELA de dupla criação de temporada (23505 em corrida → retry encontra a
-- já criada).
create unique index if not exists league_seasons_numero_unico
  on public.league_seasons (competition_id, numero);
create index if not exists league_seasons_competition_idx
  on public.league_seasons (competition_id);

-- ---------- Tabela: league_division_seasons (uma divisão → um tournaments) ----------
-- A divisão É um torneio de liga. tournament_id RESTRICT explicita a dependência
-- (apagar o torneio exige desfazer a divisão antes); NULL enquanto a temporada é
-- rascunho e o torneio ainda não foi criado por montar_temporada. A UNIQUE
-- (season_id, nivel) é a SENTINELA de idempotência da montagem (criada ANTES dos
-- tournaments — promote-first).
create table if not exists public.league_division_seasons (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.league_seasons (id) on delete cascade,
  nivel         integer not null,                  -- 1 = topo (1ª divisão); cresce p/ baixo
  nome          text not null,                     -- ex.: "Série A", "Premier"
  tournament_id uuid references public.tournaments (id) on delete restrict,
  -- Fase 5.1 — split season. tournament_id passa a ser a APERTURA; estes dois são
  -- a CLAUSURA (gravada na montagem, espelha tournament_id) e a GRANDE FINAL
  -- (decorativa, gravada pós-encerramento por montar_grande_final). FKs
  -- auto-nomeadas (..._tournament_id_clausura_fkey / ..._final_tournament_id_fkey)
  -- — usadas como FK-hint nos embeds PostgREST (3 FKs lds->tournaments seriam
  -- ambíguas e quebrariam em runtime sem o hint).
  tournament_id_clausura uuid references public.tournaments (id) on delete restrict,
  final_tournament_id    uuid references public.tournaments (id) on delete restrict,
  -- Toggle POR DIVISÃO: false = clubes; true = por nome (texto livre OU
  -- competidor persistente). Espelha tournaments.por_nome.
  por_nome      boolean not null default false,
  -- Preset de desempate desta divisão (snapshot). Passa ao computeStandings via
  -- tournaments.desempate_criterio.
  desempate     text not null default 'cbf',
  -- Base de cálculo de sobe/cai desta divisão (snapshot — Fase 4). 'posicao'
  -- (default) = corte pela posição da tabela (byte-idêntico ao legado); 'promedios'
  -- = corte pela média plurianual de pontos-por-jogo (vida toda, todas as divisões,
  -- estilo argentino); 'ppg' é latente (== 'posicao' dentro de uma divisão).
  ranking_base  public.league_ranking_base not null default 'posicao',
  -- Formato interno da divisão (snapshot — Fase 5.2). 'liga' (default) = pontos
  -- corridos (byte-idêntico ao legado); 'grupos_mata_mata' = fase de grupos (que
  -- DECIDE o sobe/cai pelo agregado posição-no-grupo) + mata-mata decorativo (só
  -- coroa o campeão). qtd_grupos/classificados_por_grupo só em grupos.
  formato       text not null default 'liga',
  qtd_grupos    integer,
  classificados_por_grupo integer,
  -- Tamanho-alvo da divisão (nº de competidores). Usado na CONSERVAÇÃO de tamanho
  -- ao montar a próxima temporada (sobe == desce nas fronteiras simétricas).
  tamanho       integer not null,
  created_at    timestamptz not null default now(),
  constraint league_division_seasons_nivel_positivo check (nivel >= 1),
  constraint league_division_seasons_tamanho_valido check (tamanho >= 2 and tamanho <= 20),
  -- Fase 0: 'cbf'|'ingles'|'custom'; 'espanhol'/'fifa' adicionados na Fase 5.
  constraint league_division_seasons_desempate_valido
    check (desempate in ('cbf', 'ingles', 'custom', 'espanhol', 'fifa')),
  -- Fase 5.2: formato interno + coerência da geometria de grupos.
  constraint league_division_seasons_formato_valido
    check (formato in ('liga', 'grupos_mata_mata')),
  constraint league_division_seasons_grupos_coerente
    check (
      (formato = 'liga'
         and qtd_grupos is null and classificados_por_grupo is null)
      or (formato = 'grupos_mata_mata'
         and qtd_grupos >= 2 and classificados_por_grupo >= 1)
    ),
  -- Fase 5.1: reforço intra-linha da decisão "split só liga" (a Clausura só pode
  -- existir em divisão liga). A coerência "clausura ⇒ season split" é garantida
  -- pela RPC/action (CHECK cross-table exigiria trigger).
  constraint league_division_seasons_split_so_liga
    check (tournament_id_clausura is null or formato = 'liga')
);

create unique index if not exists league_division_seasons_nivel_unico
  on public.league_division_seasons (season_id, nivel);
-- Um torneio pertence a no máximo uma divisão (quando atribuído).
create unique index if not exists league_division_seasons_tournament_unico
  on public.league_division_seasons (tournament_id) where tournament_id is not null;
-- Fase 5.1: cada torneio em UM papel (espelham league_division_seasons_tournament_unico).
create unique index if not exists league_division_seasons_clausura_unico
  on public.league_division_seasons (tournament_id_clausura) where tournament_id_clausura is not null;
create unique index if not exists league_division_seasons_final_unico
  on public.league_division_seasons (final_tournament_id) where final_tournament_id is not null;
create index if not exists league_division_seasons_season_idx
  on public.league_division_seasons (season_id);

-- Cores de identidade por DIVISÃO (override do default da pirâmide — change
-- add-cores-campeonato). Hex #rrggbb minúsculo OU NULL (herda a competição).
-- Copiadas para a próxima temporada por montarProximaTemporada.
alter table public.league_division_seasons add column if not exists cor_primaria  text;
alter table public.league_division_seasons add column if not exists cor_secundaria text;
alter table public.league_division_seasons drop constraint if exists league_division_seasons_cor_primaria_hex;
alter table public.league_division_seasons add  constraint league_division_seasons_cor_primaria_hex
  check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$');
alter table public.league_division_seasons drop constraint if exists league_division_seasons_cor_secundaria_hex;
alter table public.league_division_seasons add  constraint league_division_seasons_cor_secundaria_hex
  check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$');

-- Turno da divisão de liga (change add-ida-volta-divisao). false = turno único
-- (default; preserva o legado); true = ida-e-volta (turno e returno). Só faz
-- sentido em formato='liga' (a action/wizard normalizam; grupos_mata_mata fica
-- false). montar_temporada COPIA para tournaments.ida_e_volta (o que o motor lê);
-- montarProximaTemporada copia para a próxima temporada.
alter table public.league_division_seasons
  add column if not exists ida_e_volta boolean not null default false;
-- Invariante liga-only no BANCO (defesa-em-profundidade além da app): grupos
-- nunca grava ida_e_volta=true. Cobre createCompetition, atualizar_ida_e_volta_divisao
-- e a cópia N+1. Linhas legadas (ida_e_volta=false) já satisfazem.
alter table public.league_division_seasons drop constraint if exists league_division_seasons_ida_volta_so_liga;
alter table public.league_division_seasons add  constraint league_division_seasons_ida_volta_so_liga
  check (formato = 'liga' or ida_e_volta = false);

-- ---------- Tabela: league_boundaries (regra sobe/cai por par adjacente) ----------
-- Fronteira entre a divisão de nível `nivel_superior` (d) e a de baixo (d+1).
-- Guardamos o nível superior; a inferior é nivel_superior + 1.
create table if not exists public.league_boundaries (
  id             uuid primary key default gen_random_uuid(),
  season_id      uuid not null references public.league_seasons (id) on delete cascade,
  nivel_superior integer not null,
  -- Quantos CAEM da divisão superior e quantos SOBEM da inferior. Fronteira
  -- SIMÉTRICA por padrão (sobem == descem); assimétrica é permitida (com aviso
  -- na UI) — a CONSERVAÇÃO de tamanho é garantida no fluxo, não pela CHECK.
  vagas_rebaixamento integer not null default 0,
  vagas_acesso       integer not null default 0,
  -- Modo de resolução. 'direto' = pelos extremos da tabela (Fase 1). Os demais
  -- (playoff/playout/barragem) usam gerarChaveMataMata (Fases 2-3).
  modo           public.league_boundary_mode not null default 'direto',
  -- Quantos entram no playoff/playout/barragem (>= as vagas em disputa).
  playoff_vagas  integer,
  created_at     timestamptz not null default now(),
  constraint league_boundaries_nivel_positivo check (nivel_superior >= 1),
  constraint league_boundaries_vagas_nao_negativas
    check (vagas_rebaixamento >= 0 and vagas_acesso >= 0),
  constraint league_boundaries_playoff_coerente
    check (
      (modo = 'direto' and playoff_vagas is null)
      or (modo <> 'direto' and playoff_vagas is not null and playoff_vagas >= 2)
    )
);

create unique index if not exists league_boundaries_nivel_unico
  on public.league_boundaries (season_id, nivel_superior);
create index if not exists league_boundaries_season_idx
  on public.league_boundaries (season_id);

-- Fase 2 (playoff de acesso + playout). Aditivo/idempotente. Cada fronteira de
-- playoff cria um tournaments formato='mata_mata' entre os times da ZONA; o
-- resultado da chave decide o sobe/cai (em vez do corte por posição do 'direto').
--   playoff_estilo: 'vagas' = a chave decide as vagas (chave completa 4/8/16/32,
--     joga f rodadas até sobrar o nº de sobreviventes — potência de 2); 'extra' =
--     diretos por posição + 1 vaga decidida pelo campeão (acesso) / perdedor da
--     final (playout). NULL em 'direto'.
--   playoff_ida_e_volta: leg format da chave (false = jogo único; herda em
--     tournaments.ida_e_volta; final sempre jogo único).
--   playoff_tournament_id: vínculo ao tournaments da chave (SENTINELA de
--     idempotência de montar_playoff). on delete restrict: a chave não some sem
--     desfazer a fronteira (espelha league_division_seasons.tournament_id).
alter table public.league_boundaries
  add column if not exists playoff_estilo text;
alter table public.league_boundaries
  add column if not exists playoff_ida_e_volta boolean not null default false;
alter table public.league_boundaries
  add column if not exists playoff_tournament_id uuid
  references public.tournaments (id) on delete restrict;

-- Estilo coerente com o modo: existe sse há playoff. A coerência
-- "vagas potência de 2 / zona cabe na divisão" NÃO é expressável em CHECK cruzada
-- (precisa do tamanho da divisão) — validada no Zod + na action montarPlayoffs,
-- como a conservação de tamanho da Fase 1.
-- Fase 3: a barragem cruzada usa estilos próprios ('pares'/'chave'); o CHECK é
-- disjuntivo POR MODO (playoff ⇒ vagas/extra; barragem ⇒ pares/chave).
alter table public.league_boundaries
  drop constraint if exists league_boundaries_estilo_coerente;
alter table public.league_boundaries
  add constraint league_boundaries_estilo_coerente
  check (
    (modo = 'direto' and playoff_estilo is null)
    or (modo in ('playoff_acesso', 'playout') and playoff_estilo in ('vagas', 'extra'))
    or (modo = 'barragem_cruzada' and playoff_estilo in ('pares', 'chave'))
  );

-- Um torneio de chave pertence a no máximo uma fronteira (sentinela).
create unique index if not exists league_boundaries_playoff_tournament_unico
  on public.league_boundaries (playoff_tournament_id)
  where playoff_tournament_id is not null;

-- ---------- Tabela: league_competitors (competidor PERSISTENTE) ----------
-- Identidade do competidor: team_id = clube real (modo clube); rotulo = nome
-- livre persistente (modo por nome). XOR exatamente um, espelhando
-- tournament_slots. team RESTRICT (cache): o competidor É a entidade-âncora;
-- apagar o clube do cache não deve sumir com o histórico.
-- holder_user_id = técnico HUMANO que ACOMPANHA o competidor ao subir/cair
-- (mantém o elenco entre temporadas). NULLABLE: null = vaga gerida pelo dono da
-- pirâmide (sem técnico dedicado; o dono lança placares). SET NULL ao apagar a
-- conta. Propagado ao tournament_slots.user_id por montar_temporada SE presente
-- e SE não violar o UNIQUE slots_um_clube_por_tecnico (senão degrada para NULL).
create table if not exists public.league_competitors (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.league_competitions (id) on delete cascade,
  team_id        uuid references public.teams (id) on delete restrict,
  rotulo         text,
  holder_user_id uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint league_competitors_clube_xor_rotulo
    check ((team_id is null) <> (rotulo is null)),
  constraint league_competitors_rotulo_nao_vazio
    check (rotulo is null or length(trim(rotulo)) > 0)
);

create index if not exists league_competitors_competition_idx
  on public.league_competitors (competition_id);
-- Unicidade por pirâmide (direto p/ clube; case-insensitive p/ rótulo).
create unique index if not exists league_competitors_team_unico
  on public.league_competitors (competition_id, team_id) where team_id is not null;
create unique index if not exists league_competitors_rotulo_unico
  on public.league_competitors (competition_id, lower(trim(rotulo))) where rotulo is not null;

-- ---------- Tabela: league_division_entries (histórico competidor × divisão) ----------
-- A vaga concreta deste competidor na divisão (= um tournament_slots). slot_id
-- NULL enquanto a temporada é rascunho e os slots ainda não nasceram; RESTRICT:
-- o slot é a âncora competitiva; não pode sumir sem desfazer a entry. O resultado
-- consolidado (posicao_final/destino/resolvido_por/pontos/jogos) é preenchido
-- APÓS o fluxo. `destino` = O QUE aconteceu (sobe|cai|permanece); `resolvido_por`
-- = COMO foi decidido (classificacao|playoff|sorteio|override). 'sorteio' é
-- MOTIVO, não destino — separar evita tratá-lo como um quarto destino.
create table if not exists public.league_division_entries (
  id                 uuid primary key default gen_random_uuid(),
  division_season_id uuid not null references public.league_division_seasons (id) on delete cascade,
  competitor_id      uuid not null references public.league_competitors (id) on delete cascade,
  slot_id            uuid references public.tournament_slots (id) on delete restrict,
  posicao_final      integer,
  destino            text,            -- 'sobe' | 'cai' | 'permanece' | null (pré-fluxo)
  resolvido_por      text,            -- 'classificacao' | 'playoff' | 'sorteio' | 'override' | null
  pontos             integer,
  jogos              integer,
  created_at         timestamptz not null default now(),
  constraint league_division_entries_posicao_positiva
    check (posicao_final is null or posicao_final >= 1),
  constraint league_division_entries_destino_valido
    check (destino is null or destino in ('sobe', 'cai', 'permanece')),
  constraint league_division_entries_resolvido_por_valido
    check (resolvido_por is null
           or resolvido_por in ('classificacao', 'playoff', 'sorteio', 'override'))
);

-- Um competidor ocupa no máximo uma vaga por divisão-temporada.
create unique index if not exists league_division_entries_competitor_unico
  on public.league_division_entries (division_season_id, competitor_id);
create unique index if not exists league_division_entries_slot_unico
  on public.league_division_entries (slot_id) where slot_id is not null;
create index if not exists league_division_entries_competitor_idx
  on public.league_division_entries (competitor_id);
create index if not exists league_division_entries_division_idx
  on public.league_division_entries (division_season_id);

-- ---------- tournament_slots.competitor_id (terceiro lado da vaga) ----------
-- Liga a vaga ao competidor persistente da pirâmide. NULL em TODO torneio legado
-- e em torneios avulsos/standalone. on delete set null: apagar o competidor não
-- derruba a vaga (o histórico de matches sobrevive). NÃO mexe no CHECK
-- slots_clube_xor_rotulo: a identidade visível continua clube XOR rótulo (motor/
-- render intactos) e competitor_id é um PONTEIRO ADITIVO de proveniência —
-- ortogonal, nullable, ignorado pelo motor (como o user_id do técnico). A
-- coerência (rotulo/team_id do slot espelham o do competidor) é garantida por
-- montar_temporada server-side, não por CHECK cruzada (Postgres não a permite).
alter table public.tournament_slots
  add column if not exists competitor_id uuid
  references public.league_competitors (id) on delete set null;

create index if not exists tournament_slots_competitor_idx
  on public.tournament_slots (competitor_id) where competitor_id is not null;

-- ---------- tournaments.desempate_criterio (preset de desempate por torneio) ----------
-- Aditivo; idempotente. Default 'cbf' = comportamento atual; legados e torneios
-- standalone preservam a cadeia CBF simplificada. montar_temporada grava o preset
-- da divisão aqui; getTournamentClassificacao lê. Presets: 'cbf'/'ingles'
-- (cadeia objetiva), 'espanhol'/'fifa' (mini-tabela entre os empatados, Fase 5),
-- 'custom' (reservado, degrada p/ 'cbf').
alter table public.tournaments
  add column if not exists desempate_criterio text not null default 'cbf';

alter table public.tournaments drop constraint if exists tournaments_desempate_valido;
alter table public.tournaments
  add constraint tournaments_desempate_valido
  check (desempate_criterio in ('cbf', 'ingles', 'custom', 'espanhol', 'fifa'));

-- ---------- RPC: montar_temporada (SECURITY DEFINER) ----------
-- Único caminho que cria os tournaments das divisões e INSERE os tournament_slots
-- JÁ PREENCHIDOS, contornando de forma AUDITÁVEL e restrita a policy
-- slots_insert_owner_rascunho (que proíbe user_id no INSERT de cliente). Espelha
-- o estilo de aceitar_convite_vaga: set search_path = '', valida posse explícita.
--   (1) Posse: auth.uid() DEVE ser o created_by da pirâmide dona da season,
--       senão raise 'NAO_DONO' (a RPC roda como definer, mas a checagem é
--       explícita — é o único motivo de poder pré-preencher user_id).
--   (2) Idempotência (promote-first): se a division_season já tem tournament_id,
--       PULA (a sentinela é a UNIQUE (season_id, nivel) criada antes dos
--       tournaments). Re-rodar após falha parcial completa só o que faltou.
--   (3) Cria o tournament da divisão (formato 'liga', status 'rascunho',
--       created_by = dono, por_nome/desempate_criterio da divisão, is_public
--       herdado da pirâmide). Grava league_division_seasons.tournament_id.
--   (4) Insere os slots por modo: por NOME = rotulo + competitor_id, user_id
--       null; por CLUBE = team_id + competitor_id + user_id (regra de degradação
--       abaixo). O mapeamento competidor → divisão chega pelas
--       league_division_entries pré-criadas pela action de montagem (com
--       competitor_id + division_season_id e slot_id null — o único canal
--       persistente compatível com a assinatura fixa (p_season_id)); a RPC
--       PREENCHE o slot_id de cada entry com a vaga recém-criada.
--   (5) Degradação do user_id (modo clube): user_id = holder_user_id SE não null
--       E inserir não violar o UNIQUE slots_um_clube_por_tecnico (mesmo holder em
--       2 competidores da MESMA divisão). Senão grava NULL (vaga gerida pelo
--       dono). A RPC detecta a colisão ANTES de inserir.
create or replace function public.montar_temporada(p_season_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_competition  uuid;
  v_is_public    boolean;
  v_dono         uuid;
  v_ciclo        text;
  v_div          record;
  v_comp         record;
  v_tournament   uuid;
  v_slot         uuid;
  v_user_id      uuid;
  v_holders_usados uuid[];
  v_vagas        integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- (1) Posse: só o dono da pirâmide monta a temporada dela. Lê também o ciclo
  -- (Fase 5.1): 'apertura_clausura' cria DOIS torneios por divisão.
  select ls.competition_id, lc.created_by, lc.is_public, ls.ciclo
    into v_competition, v_dono, v_is_public, v_ciclo
    from public.league_seasons ls
    join public.league_competitions lc on lc.id = ls.competition_id
   where ls.id = p_season_id;

  if v_competition is null then
    raise exception 'SEASON_INVALIDA';
  end if;
  if not public.pode_gerir_competition(v_competition) then
    raise exception 'NAO_DONO';
  end if;

  -- (1.1) Serializa a montagem por temporada: as sentinelas (tournament_id e, no
  -- split, tournament_id_clausura) só são gravadas após o INSERT do torneio, então
  -- duas chamadas concorrentes (ex.: duas abas) leriam NULL e ambas criariam
  -- torneios+slots duplicados. O advisory lock transacional força a 2ª chamada a
  -- esperar o commit da 1ª e então ver as sentinelas preenchidas (pula os blocos
  -- já feitos). Liberado automaticamente no fim da tx. Cobre os 2 torneios do split.
  perform pg_advisory_xact_lock(hashtextextended(p_season_id::text, 0));

  -- (2) Para cada divisão, criar o(s) torneio(s) que faltam. Fase 5.1 [NIT]: SEM
  -- continue de curto-circuito — Apertura e Clausura são blocos guardados
  -- INDEPENDENTES (cada um com sua sentinela e seu v_holders_usados), para que o
  -- retry de uma montagem parcial complete só o que faltou.
  for v_div in
    select id, nivel, nome, por_nome, desempate, formato, ida_e_volta,
           classificados_por_grupo, tournament_id, tournament_id_clausura
      from public.league_division_seasons
     where season_id = p_season_id
     order by nivel
  loop
    -- Fase 5.1 [MEDIUM]: backstop da decisão "split só liga". Antes de criar nada.
    if v_ciclo = 'apertura_clausura' and v_div.formato <> 'liga' then
      raise exception 'SPLIT_SO_LIGA';
    end if;

    -- ===== BLOCO A — APERTURA (= tournament_id; caminho legado quando anual) =====
    -- (3) Cria o tournament da divisão com o FORMATO da divisão (liga ou
    -- grupos_mata_mata) e o K dos grupos (null em liga; FONTE ÚNICA — Fase 5.2).
    -- is_public herdado da pirâmide. CAST text→enum: league_division_seasons.formato
    -- é text (com CHECK); tournaments.formato é o enum tournament_format (variável
    -- text NÃO auto-coage para enum — sem o cast a RPC inteira falha). No split o
    -- título ganha o sufixo " — Apertura"; anual mantém o nome puro (byte-idêntico).
    if v_div.tournament_id is null then
      insert into public.tournaments
        (titulo, status, created_by, formato, ida_e_volta, classificados_por_grupo,
         por_nome, desempate_criterio, is_public)
      values
        (case when v_ciclo = 'apertura_clausura'
              then v_div.nome || ' — Apertura' else v_div.nome end,
         'rascunho', v_uid,
         v_div.formato::public.tournament_format, v_div.ida_e_volta,
         v_div.classificados_por_grupo,
         v_div.por_nome, v_div.desempate, v_is_public)
      returning id into v_tournament;

      update public.league_division_seasons
         set tournament_id = v_tournament
       where id = v_div.id;

      -- (4)+(5) Insere os slots preenchidos, um por competidor da divisão. Os
      -- competidores são os que já têm league_division_entries para esta
      -- division_season (criadas pela action ANTES da RPC, sem slot_id ainda). A
      -- Apertura LIGA entries.slot_id (o lado canônico do remap slot→competidor).
      v_holders_usados := array[]::uuid[];
      v_vagas := 0;
      for v_comp in
        select lde.id as entry_id, lc.id as competitor_id, lc.team_id, lc.rotulo,
               lc.holder_user_id, lc.competition_id
          from public.league_division_entries lde
          join public.league_competitors lc on lc.id = lde.competitor_id
         where lde.division_season_id = v_div.id
           and lde.slot_id is null
         order by lde.created_at, lc.created_at
      loop
        -- Integridade cross-pirâmide: o competidor da entry tem de pertencer à
        -- MESMA competição da temporada (a cascata de posse não garante; o FK só
        -- exige existência).
        if v_comp.competition_id is distinct from v_competition then
          raise exception 'COMPETIDOR_DE_OUTRA_PIRAMIDE';
        end if;

        if v_div.por_nome then
          if v_comp.rotulo is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, null, v_comp.rotulo, null, v_comp.competitor_id)
          returning id into v_slot;
        else
          if v_comp.team_id is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          if v_comp.holder_user_id is not null
             and not (v_comp.holder_user_id = any (v_holders_usados))
          then
            v_user_id := v_comp.holder_user_id;
            v_holders_usados := array_append(v_holders_usados, v_comp.holder_user_id);
          else
            v_user_id := null;
          end if;

          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, v_comp.team_id, null, v_user_id, v_comp.competitor_id)
          returning id into v_slot;
        end if;

        update public.league_division_entries
           set slot_id = v_slot
         where id = v_comp.entry_id;

        v_vagas := v_vagas + 1;
      end loop;

      -- (6) Uma liga precisa de 2..20 (iniciarTorneio). Falha explícita ANTES de
      -- consolidar a sentinela em estado inválido (o raise reverte a tx toda,
      -- restaurando tournament_id = NULL para re-montagem).
      if v_vagas < 2 then
        raise exception 'DIVISAO_SEM_COMPETIDORES_SUFICIENTES';
      end if;
    end if;

    -- ===== BLOCO B — CLAUSURA (só split; itera TODAS as entries) =====
    -- A Clausura é um segundo torneio independente. Os slots iteram TODAS as
    -- entries da divisão (NÃO filtram slot_id, que já aponta para a Apertura) e
    -- NÃO tocam entries.slot_id (a entry continua ligada só à Apertura — modelo de
    -- entries intocado). O competitor_id do slot da Clausura é o que a combinada
    -- usa para mapear o lado → competidor (slot Clausura → competidor → slot
    -- Apertura). Split é só liga (5.1b) ⇒ formato/K herdados são liga/null.
    if v_ciclo = 'apertura_clausura' and v_div.tournament_id_clausura is null then
      insert into public.tournaments
        (titulo, status, created_by, formato, ida_e_volta, classificados_por_grupo,
         por_nome, desempate_criterio, is_public)
      values
        (v_div.nome || ' — Clausura', 'rascunho', v_uid,
         v_div.formato::public.tournament_format, v_div.ida_e_volta,
         v_div.classificados_por_grupo,
         v_div.por_nome, v_div.desempate, v_is_public)
      returning id into v_tournament;

      update public.league_division_seasons
         set tournament_id_clausura = v_tournament
       where id = v_div.id;

      v_holders_usados := array[]::uuid[];
      v_vagas := 0;
      for v_comp in
        select lc.id as competitor_id, lc.team_id, lc.rotulo,
               lc.holder_user_id, lc.competition_id
          from public.league_division_entries lde
          join public.league_competitors lc on lc.id = lde.competitor_id
         where lde.division_season_id = v_div.id
         order by lde.created_at, lc.created_at
      loop
        if v_comp.competition_id is distinct from v_competition then
          raise exception 'COMPETIDOR_DE_OUTRA_PIRAMIDE';
        end if;

        if v_div.por_nome then
          if v_comp.rotulo is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, null, v_comp.rotulo, null, v_comp.competitor_id);
        else
          if v_comp.team_id is null then
            raise exception 'COMPETIDOR_INCOMPATIVEL_COM_DIVISAO';
          end if;
          if v_comp.holder_user_id is not null
             and not (v_comp.holder_user_id = any (v_holders_usados))
          then
            v_user_id := v_comp.holder_user_id;
            v_holders_usados := array_append(v_holders_usados, v_comp.holder_user_id);
          else
            v_user_id := null;
          end if;
          insert into public.tournament_slots
            (tournament_id, team_id, rotulo, user_id, competitor_id)
          values
            (v_tournament, v_comp.team_id, null, v_user_id, v_comp.competitor_id);
        end if;

        v_vagas := v_vagas + 1;
      end loop;

      if v_vagas < 2 then
        raise exception 'DIVISAO_SEM_COMPETIDORES_SUFICIENTES';
      end if;
    end if;
  end loop;
end;
$$;

revoke execute on function public.montar_temporada(uuid) from public, anon;
grant execute on function public.montar_temporada(uuid) to authenticated;

-- ---------- RPC: atualizar_ida_e_volta_divisao (SECURITY DEFINER) ----------
-- Alterna o turno (ida-e-volta) de UMA divisão de liga AINDA EM RASCUNHO, sem
-- recriar a pirâmide (change add-ida-volta-divisao). Escrita TRANSACIONAL (a
-- função inteira é uma tx): grava league_division_seasons.ida_e_volta (fonte de
-- verdade) E tournaments.ida_e_volta da Apertura e, no split, da Clausura — o que
-- o motor lê ao iniciar. NUNCA via writes PostgREST separados (divergiriam em
-- falha parcial). Auth por CAPACIDADE (pode_gerir_competition; herança de admin
-- de liga), NÃO created_by (league_division_seasons não tem essa coluna).
-- Guards: formato liga; torneio(s) em rascunho; e SEM rodadas geradas — sonda
-- matches.rodada, pois 'rascunho' sozinho NÃO prova ausência (iniciarTorneio
-- insere matches ANTES de promover a 'ativo'; a falha deixa matches+rascunho).
-- tournament_id/_clausura podem ser null (pré-montagem/anual): o `in (...)` é
-- null-safe (null nunca casa) e a divisão ainda recebe o turno para a montagem.
create or replace function public.atualizar_ida_e_volta_divisao(
  p_division_season_id uuid,
  p_ida_e_volta boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition  uuid;
  v_formato      text;
  v_tid          uuid;
  v_tid_clausura uuid;
begin
  -- (1) Carrega a divisão + a competição-mãe (para a checagem de capacidade).
  select ls.competition_id, lds.formato, lds.tournament_id, lds.tournament_id_clausura
    into v_competition, v_formato, v_tid, v_tid_clausura
    from public.league_division_seasons lds
    join public.league_seasons ls on ls.id = lds.season_id
   where lds.id = p_division_season_id;

  if v_competition is null then
    raise exception 'DIVISAO_INVALIDA';
  end if;

  -- (2) Auth por CAPACIDADE (dono OU admin de liga). NÃO created_by.
  if not public.pode_gerir_competition(v_competition) then
    raise exception 'NAO_AUTORIZADO';
  end if;

  -- (3) Só liga: em grupos_mata_mata o turno teria semântica intragrupo (fora de escopo).
  if v_formato <> 'liga' then
    raise exception 'FORMATO_INVALIDO';
  end if;

  -- (4) Só em rascunho: após iniciar, a tabela já foi gerada com o turno.
  if exists (
    select 1 from public.tournaments t
     where t.id in (v_tid, v_tid_clausura)
       and t.status <> 'rascunho'
  ) then
    raise exception 'JA_INICIADA';
  end if;

  -- (5) 'rascunho' não prova ausência de rodadas (recuperação de iniciarTorneio
  -- deixa matches+rascunho). Sonda matches.rodada nos torneios da divisão.
  if exists (
    select 1 from public.matches m
     where m.tournament_id in (v_tid, v_tid_clausura)
       and m.rodada is not null
  ) then
    raise exception 'JA_TEM_RODADAS';
  end if;

  -- (6) Escrita transacional: a divisão (fonte de verdade) + o(s) torneio(s) que
  -- o motor lê. final_tournament_id (mata_mata) NÃO é tocado.
  update public.league_division_seasons
     set ida_e_volta = p_ida_e_volta
   where id = p_division_season_id;

  update public.tournaments
     set ida_e_volta = p_ida_e_volta
   where id in (v_tid, v_tid_clausura);
end;
$$;

revoke execute on function public.atualizar_ida_e_volta_divisao(uuid, boolean) from public, anon;
grant execute on function public.atualizar_ida_e_volta_divisao(uuid, boolean) to authenticated;

-- ---------- RPC: montar_playoff (SECURITY DEFINER) — Fase 2 ----------
-- Cria o tournaments formato='mata_mata' de UMA fronteira de playoff e insere os
-- tournament_slots JÁ PREENCHIDOS dos competidores da ZONA, na ordem recebida em
-- p_competitor_ids (= ordem de classificação/seeding). Mesma razão de montar_temporada
-- ser DEFINER: pré-preenche user_id (o técnico que ACOMPANHA o competidor joga o
-- playoff) — slots_insert_owner_rascunho proíbe user_id no INSERT de cliente.
-- NÃO gera a chave (partidas) — isso fica na action (motor JS gerarFaseInicial),
-- preservando o seeding por posição. Retorna o tournament_id (idempotente pela
-- sentinela league_boundaries.playoff_tournament_id).
--   Zona FONTE conforme modo: playout = divisão SUPERIOR (nivel_superior);
--   playoff_acesso = divisão INFERIOR (nivel_superior + 1). Todos os competidores
--   vêm de UMA divisão (intra-divisão) — homogeneidade por_nome segue da fonte.
create or replace function public.montar_playoff(
  p_boundary_id   uuid,
  p_competitor_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_season       uuid;
  v_nivel        integer;
  v_modo         public.league_boundary_mode;
  v_idavolta     boolean;
  v_existing     uuid;
  v_competition  uuid;
  v_dono         uuid;
  v_is_public    boolean;
  v_source_nivel integer;
  v_div_source   uuid;
  v_por_nome     boolean;
  v_desempate    text;
  v_tournament   uuid;
  v_user_id      uuid;
  v_holders_usados uuid[];
  v_cid          uuid;
  v_comp         record;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Fronteira + posse + herança (por_nome/desempate vêm da divisão-fonte, abaixo).
  select lb.season_id, lb.nivel_superior, lb.modo, lb.playoff_ida_e_volta,
         lb.playoff_tournament_id, ls.competition_id, lc.created_by, lc.is_public
    into v_season, v_nivel, v_modo, v_idavolta, v_existing,
         v_competition, v_dono, v_is_public
    from public.league_boundaries lb
    join public.league_seasons ls on ls.id = lb.season_id
    join public.league_competitions lc on lc.id = ls.competition_id
   where lb.id = p_boundary_id;

  if v_season is null then
    raise exception 'BOUNDARY_INVALIDA';
  end if;
  if not public.pode_gerir_competition(v_competition) then
    raise exception 'NAO_DONO';
  end if;
  if v_modo = 'direto' then
    raise exception 'FRONTEIRA_SEM_PLAYOFF';
  end if;

  -- Idempotência: a chave já existe (sentinela).
  if v_existing is not null then
    return v_existing;
  end if;

  -- Serializa por fronteira (namespace 1 ≠ 0 da montar_temporada): a 2ª chamada
  -- espera o commit da 1ª e vê a sentinela preenchida.
  perform pg_advisory_xact_lock(hashtextextended(p_boundary_id::text, 1));
  select playoff_tournament_id into v_existing
    from public.league_boundaries where id = p_boundary_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Divisão-FONTE conforme o modo (intra-divisão).
  v_source_nivel := case when v_modo = 'playout' then v_nivel else v_nivel + 1 end;
  select id, por_nome, desempate
    into v_div_source, v_por_nome, v_desempate
    from public.league_division_seasons
   where season_id = v_season and nivel = v_source_nivel;
  if v_div_source is null then
    raise exception 'DIVISAO_FONTE_INVALIDA';
  end if;

  -- Cardinalidade mínima da zona: < 2 competidores não forma chave. Barra POST
  -- direto com array vazio/curto ANTES de criar o torneio + gravar a sentinela
  -- (senão a chave nasceria inutilizável e travaria a re-montagem). A zona EXATA
  -- (top/bottom por classificação) é validada na action (precisa da classificação).
  if array_length(p_competitor_ids, 1) is null
     or array_length(p_competitor_ids, 1) < 2 then
    raise exception 'ZONA_VAZIA';
  end if;

  -- Cria o tournaments da chave (rascunho — a action gera as partidas e promove).
  insert into public.tournaments
    (titulo, status, created_by, formato, ida_e_volta, terceiro_lugar,
     por_nome, desempate_criterio, is_public)
  values
    ('Playoff — nível ' || v_nivel::text, 'rascunho', v_uid, 'mata_mata',
     coalesce(v_idavolta, false), false, v_por_nome, v_desempate, v_is_public)
  returning id into v_tournament;

  update public.league_boundaries
     set playoff_tournament_id = v_tournament
   where id = p_boundary_id;

  -- Slots na ORDEM de p_competitor_ids (= ordem de seeding por classificação).
  v_holders_usados := array[]::uuid[];
  foreach v_cid in array p_competitor_ids loop
    select lc.id as competitor_id, lc.team_id, lc.rotulo,
           lc.holder_user_id, lc.competition_id
      into v_comp
      from public.league_competitors lc
     where lc.id = v_cid;

    if v_comp.competitor_id is null then
      raise exception 'COMPETIDOR_INEXISTENTE';
    end if;
    -- Integridade: pertence à competição da fronteira E tem entry na divisão-fonte.
    if v_comp.competition_id is distinct from v_competition then
      raise exception 'COMPETIDOR_DE_OUTRA_PIRAMIDE';
    end if;
    if not exists (
      select 1 from public.league_division_entries lde
       where lde.division_season_id = v_div_source
         and lde.competitor_id = v_cid
    ) then
      raise exception 'COMPETIDOR_FORA_DA_ZONA';
    end if;

    if v_por_nome then
      if v_comp.rotulo is null then
        raise exception 'PLAYOFF_POR_NOME_INCOERENTE';
      end if;
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, null, v_comp.rotulo, null, v_comp.competitor_id);
    else
      if v_comp.team_id is null then
        raise exception 'PLAYOFF_POR_NOME_INCOERENTE';
      end if;
      -- Degradação do user_id na colisão com slots_um_clube_por_tecnico.
      if v_comp.holder_user_id is not null
         and not (v_comp.holder_user_id = any (v_holders_usados))
      then
        v_user_id := v_comp.holder_user_id;
        v_holders_usados := array_append(v_holders_usados, v_comp.holder_user_id);
      else
        v_user_id := null;
      end if;
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, v_comp.team_id, null, v_user_id, v_comp.competitor_id);
    end if;
  end loop;

  return v_tournament;
end;
$$;

revoke execute on function public.montar_playoff(uuid, uuid[]) from public, anon;
grant execute on function public.montar_playoff(uuid, uuid[]) to authenticated;

-- ---------- RPC: montar_barragem (SECURITY DEFINER) — Fase 3 ----------
-- Espelha montar_playoff, mas a chave MISTURA competidores de DUAS divisões
-- adjacentes (a fronteira barragem_cruzada): superior (nivel_superior) e
-- inferior (nivel_superior+1). Valida ambas as fontes + homogeneidade por_nome
-- cruzada (BARRAGEM_POR_NOME_INCOERENTE). Os p_competitor_ids vêm JÁ ordenados
-- (seeding) pela action montarPlayoffs.
create or replace function public.montar_barragem(
  p_boundary_id    uuid,
  p_competitor_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_season       uuid;
  v_nivel        integer;
  v_modo         public.league_boundary_mode;
  v_idavolta     boolean;
  v_existing     uuid;
  v_competition  uuid;
  v_dono         uuid;
  v_is_public    boolean;
  v_div_sup      uuid;
  v_div_inf      uuid;
  v_por_nome_sup boolean;
  v_por_nome_inf boolean;
  v_por_nome     boolean;
  v_desempate    text;
  v_tournament   uuid;
  v_user_id      uuid;
  v_holders_usados uuid[];
  v_cid          uuid;
  v_comp         record;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Fronteira + posse + herança (por_nome/desempate vêm das divisões-fonte abaixo).
  select lb.season_id, lb.nivel_superior, lb.modo, lb.playoff_ida_e_volta,
         lb.playoff_tournament_id, ls.competition_id, lc.created_by, lc.is_public
    into v_season, v_nivel, v_modo, v_idavolta, v_existing,
         v_competition, v_dono, v_is_public
    from public.league_boundaries lb
    join public.league_seasons ls on ls.id = lb.season_id
    join public.league_competitions lc on lc.id = ls.competition_id
   where lb.id = p_boundary_id;

  if v_season is null then
    raise exception 'BOUNDARY_INVALIDA';
  end if;
  if not public.pode_gerir_competition(v_competition) then
    raise exception 'NAO_DONO';
  end if;
  if v_modo <> 'barragem_cruzada' then
    raise exception 'FRONTEIRA_NAO_BARRAGEM';
  end if;

  -- Idempotência: a chave já existe (sentinela).
  if v_existing is not null then
    return v_existing;
  end if;

  -- Serializa por fronteira (namespace 1, igual a montar_playoff).
  perform pg_advisory_xact_lock(hashtextextended(p_boundary_id::text, 1));
  select playoff_tournament_id into v_existing
    from public.league_boundaries where id = p_boundary_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- DUAS divisões-fonte: superior (nivel) e inferior (nivel+1).
  select id, por_nome, desempate
    into v_div_sup, v_por_nome_sup, v_desempate
    from public.league_division_seasons
   where season_id = v_season and nivel = v_nivel;
  select id, por_nome
    into v_div_inf, v_por_nome_inf
    from public.league_division_seasons
   where season_id = v_season and nivel = v_nivel + 1;
  if v_div_sup is null or v_div_inf is null then
    raise exception 'DIVISAO_FONTE_INVALIDA';
  end if;

  -- Homogeneidade por_nome CRUZADA: chave entre clube e nome é incoerente.
  if v_por_nome_sup is distinct from v_por_nome_inf then
    raise exception 'BARRAGEM_POR_NOME_INCOERENTE';
  end if;
  v_por_nome := v_por_nome_sup;

  -- Cardinalidade mínima da zona (a zona EXATA é validada na action).
  if array_length(p_competitor_ids, 1) is null
     or array_length(p_competitor_ids, 1) < 2 then
    raise exception 'ZONA_VAZIA';
  end if;

  -- Cria o tournaments da chave (rascunho — a action gera as partidas e promove).
  insert into public.tournaments
    (titulo, status, created_by, formato, ida_e_volta, terceiro_lugar,
     por_nome, desempate_criterio, is_public)
  values
    ('Barragem — nível ' || v_nivel::text || '×' || (v_nivel + 1)::text,
     'rascunho', v_uid, 'mata_mata',
     coalesce(v_idavolta, false), false, v_por_nome, v_desempate, v_is_public)
  returning id into v_tournament;

  update public.league_boundaries
     set playoff_tournament_id = v_tournament
   where id = p_boundary_id;

  -- Slots na ORDEM de p_competitor_ids (= ordem de seeding da action).
  v_holders_usados := array[]::uuid[];
  foreach v_cid in array p_competitor_ids loop
    select lc.id as competitor_id, lc.team_id, lc.rotulo,
           lc.holder_user_id, lc.competition_id
      into v_comp
      from public.league_competitors lc
     where lc.id = v_cid;

    if v_comp.competitor_id is null then
      raise exception 'COMPETIDOR_INEXISTENTE';
    end if;
    if v_comp.competition_id is distinct from v_competition then
      raise exception 'COMPETIDOR_DE_OUTRA_PIRAMIDE';
    end if;
    -- Entry em UMA das DUAS divisões-fonte (superior OU inferior).
    if not exists (
      select 1 from public.league_division_entries lde
       where lde.division_season_id in (v_div_sup, v_div_inf)
         and lde.competitor_id = v_cid
    ) then
      raise exception 'COMPETIDOR_FORA_DA_ZONA';
    end if;

    if v_por_nome then
      if v_comp.rotulo is null then
        raise exception 'BARRAGEM_POR_NOME_INCOERENTE';
      end if;
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, null, v_comp.rotulo, null, v_comp.competitor_id);
    else
      if v_comp.team_id is null then
        raise exception 'BARRAGEM_POR_NOME_INCOERENTE';
      end if;
      -- Degradação do user_id na colisão com slots_um_clube_por_tecnico.
      if v_comp.holder_user_id is not null
         and not (v_comp.holder_user_id = any (v_holders_usados))
      then
        v_user_id := v_comp.holder_user_id;
        v_holders_usados := array_append(v_holders_usados, v_comp.holder_user_id);
      else
        v_user_id := null;
      end if;
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, v_comp.team_id, null, v_user_id, v_comp.competitor_id);
    end if;
  end loop;

  return v_tournament;
end;
$$;

revoke execute on function public.montar_barragem(uuid, uuid[]) from public, anon;
grant execute on function public.montar_barragem(uuid, uuid[]) to authenticated;

-- ---------- RPC: montar_grande_final (SECURITY DEFINER) — Fase 5.1 ----------
-- Cria o tournaments formato='mata_mata' (2 competidores, IDA E VOLTA, sem 3º
-- lugar) da GRANDE FINAL de UMA divisão de season split, entre o campeão da
-- Apertura e o da Clausura. Decorativa para o sobe/cai (NÃO entra no agregado nem
-- no gate de fluxo): coroa SÓ o campeão da divisão (5.1c). Espelha montar_playoff:
-- pré-preenche user_id (slots_insert_owner_rascunho proíbe no INSERT de cliente) e
-- NÃO gera a chave (a action chama gerarChaveSemeada). Sentinela = final_tournament_id.
-- O caso campeão Apertura == campeão Clausura é tratado na ACTION (campeão direto,
-- sem montar a final) — a RPC nunca é chamada nesse caso e exige 2 ids distintos.
create or replace function public.montar_grande_final(
  p_division_season_id uuid,
  p_competitor_ids     uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := (select auth.uid());
  v_season       uuid;
  v_nome         text;
  v_por_nome     boolean;
  v_desempate    text;
  v_existing     uuid;
  v_competition  uuid;
  v_dono         uuid;
  v_is_public    boolean;
  v_tournament   uuid;
  v_user_id      uuid;
  v_holders_usados uuid[];
  v_cid          uuid;
  v_comp         record;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Divisão + posse transitiva + herança (por_nome/desempate/is_public da divisão).
  select lds.season_id, lds.nome, lds.por_nome, lds.desempate, lds.final_tournament_id,
         ls.competition_id, lc.created_by, lc.is_public
    into v_season, v_nome, v_por_nome, v_desempate, v_existing,
         v_competition, v_dono, v_is_public
    from public.league_division_seasons lds
    join public.league_seasons ls on ls.id = lds.season_id
    join public.league_competitions lc on lc.id = ls.competition_id
   where lds.id = p_division_season_id;

  if v_season is null then
    raise exception 'DIVISAO_INVALIDA';
  end if;
  if not public.pode_gerir_competition(v_competition) then
    raise exception 'NAO_DONO';
  end if;

  -- Idempotência: a grande final já existe (sentinela).
  if v_existing is not null then
    return v_existing;
  end if;

  -- Serializa por divisão (namespace 1, como montar_playoff/montar_barragem): a 2ª
  -- chamada espera o commit da 1ª e vê a sentinela preenchida.
  perform pg_advisory_xact_lock(hashtextextended(p_division_season_id::text, 1));
  select final_tournament_id into v_existing
    from public.league_division_seasons where id = p_division_season_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Exatamente 2 competidores DISTINTOS (campeão Apertura × campeão Clausura).
  if array_length(p_competitor_ids, 1) is distinct from 2
     or p_competitor_ids[1] = p_competitor_ids[2] then
    raise exception 'GRANDE_FINAL_IDS_INVALIDOS';
  end if;

  -- Cria o tournaments da final (rascunho — a action gera as partidas ida-e-volta).
  insert into public.tournaments
    (titulo, status, created_by, formato, ida_e_volta, terceiro_lugar,
     por_nome, desempate_criterio, is_public)
  values
    (v_nome || ' — Grande Final', 'rascunho', v_uid, 'mata_mata',
     true, false, v_por_nome, v_desempate, v_is_public)
  returning id into v_tournament;

  update public.league_division_seasons
     set final_tournament_id = v_tournament
   where id = p_division_season_id;

  -- Slots na ORDEM recebida (seeding: campeão Apertura, campeão Clausura).
  v_holders_usados := array[]::uuid[];
  foreach v_cid in array p_competitor_ids loop
    select lc.id as competitor_id, lc.team_id, lc.rotulo,
           lc.holder_user_id, lc.competition_id
      into v_comp
      from public.league_competitors lc
     where lc.id = v_cid;

    if v_comp.competitor_id is null then
      raise exception 'COMPETIDOR_INEXISTENTE';
    end if;
    if v_comp.competition_id is distinct from v_competition then
      raise exception 'COMPETIDOR_DE_OUTRA_PIRAMIDE';
    end if;
    if not exists (
      select 1 from public.league_division_entries lde
       where lde.division_season_id = p_division_season_id
         and lde.competitor_id = v_cid
    ) then
      raise exception 'COMPETIDOR_FORA_DA_ZONA';
    end if;

    if v_por_nome then
      if v_comp.rotulo is null then
        raise exception 'FINAL_POR_NOME_INCOERENTE';
      end if;
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, null, v_comp.rotulo, null, v_comp.competitor_id);
    else
      if v_comp.team_id is null then
        raise exception 'FINAL_POR_NOME_INCOERENTE';
      end if;
      if v_comp.holder_user_id is not null
         and not (v_comp.holder_user_id = any (v_holders_usados))
      then
        v_user_id := v_comp.holder_user_id;
        v_holders_usados := array_append(v_holders_usados, v_comp.holder_user_id);
      else
        v_user_id := null;
      end if;
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, v_comp.team_id, null, v_user_id, v_comp.competitor_id);
    end if;
  end loop;

  return v_tournament;
end;
$$;

revoke execute on function public.montar_grande_final(uuid, uuid[]) from public, anon;
grant execute on function public.montar_grande_final(uuid, uuid[]) to authenticated;

-- ---------- Helper anti-recursão de RLS: dono da pirâmide ----------
-- Usada DENTRO das policies das tabelas da pirâmide. SECURITY DEFINER evita a
-- recursão e a repetição da subquery (espelha eh_participante).
create or replace function public.eh_dono_competition(c_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_competitions c
    where c.id = c_id
      and c.created_by = (select auth.uid())
  );
$$;

revoke execute on function public.eh_dono_competition(uuid) from public;
grant execute on function public.eh_dono_competition(uuid) to anon, authenticated;

-- ============================================================================
-- EQUIPE DE CAMPEONATO (change add-equipe-campeonato — aplicada em PROD)
-- Papéis admin/arbitro/moderador em torneios e ligas. As CAPACIDADES
-- (pode_gerir/arbitrar/moderar/ver_bastidores) substituem o antigo "dono-only"
-- nas policies de escrita/visibilidade. Ações irreversíveis permanecem
-- DONO-ONLY: apagar (todos os níveis), reabrir/rebaixar torneio, virar
-- temporada, promover admin e transferir posse.
-- Posicionado após as tabelas da pirâmide (league_*) pois os helpers de
-- capacidade as referenciam (funções SQL resolvem relações no CREATE).
-- NOTA (carga local): as policies de torneio/matches/slots (≈linhas 1236+) e o
-- trigger lock_match_lifecycle invocam estes helpers definidos MAIS ABAIXO —
-- um forward-reference. Carregar este schema.sql do zero exige os 2 PASSES já
-- usados no setup local (ver memória arena-supabase-local). Em PROD não se
-- aplica: lá rodou o migration.sql linear (helpers antes das policies).
-- ============================================================================

-- ---------- Tabelas de membros + convites por papel ----------
-- Membro = papel concedido a um user num torneio ou numa pirâmide. PK composta
-- (um papel por user por escopo). admin entra só por adição direta do dono.
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

-- ---------- Mapa torneio→liga + helpers de capacidade ----------
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

-- ---------- Triggers de posse/reabertura (dono-only via API) ----------
-- lock_tournament_reopen (novo): posse imutável + reverter status (reabrir
-- encerrado→aberto OU rebaixar ativo→rascunho) é só do dono. BEFORE UPDATE geral
-- (não só de status) para travar também a transferência de created_by.
-- (lock_match_lifecycle foi refatorado no bloco de matches: usa pode_arbitrar.)
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

-- lock_league_competition_owner (novo): posse da pirâmide imutável pela API.
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

-- ---------- RPCs de equipe ----------
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

-- ---------- Policies das tabelas novas ----------
-- tournament_members: SELECT gestor OU próprio; IUD gestor; admin = dono-only; sair = próprio.
drop policy if exists tournament_members_select on public.tournament_members;
create policy tournament_members_select on public.tournament_members
  for select to authenticated
  using (public.pode_gerir_torneio(tournament_id) or user_id = (select auth.uid()));
drop policy if exists tournament_members_insert on public.tournament_members;
create policy tournament_members_insert on public.tournament_members
  for insert to authenticated
  with check (
    public.pode_gerir_torneio(tournament_id)
    and (papel <> 'admin'
         or exists (select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid())))
  );
drop policy if exists tournament_members_update on public.tournament_members;
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
drop policy if exists tournament_members_delete on public.tournament_members;
create policy tournament_members_delete on public.tournament_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.pode_gerir_torneio(tournament_id)
        and (papel <> 'admin'
             or exists (select 1 from public.tournaments t where t.id = tournament_id and t.created_by = (select auth.uid()))))
  );

-- league_members: idem com competition
drop policy if exists league_members_select on public.league_members;
create policy league_members_select on public.league_members
  for select to authenticated
  using (public.pode_gerir_competition(competition_id) or user_id = (select auth.uid()));
drop policy if exists league_members_insert on public.league_members;
create policy league_members_insert on public.league_members
  for insert to authenticated
  with check (
    public.pode_gerir_competition(competition_id)
    and (papel <> 'admin'
         or exists (select 1 from public.league_competitions lc where lc.id = competition_id and lc.created_by = (select auth.uid())))
  );
drop policy if exists league_members_update on public.league_members;
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
drop policy if exists league_members_delete on public.league_members;
create policy league_members_delete on public.league_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    or (public.pode_gerir_competition(competition_id)
        and (papel <> 'admin'
             or exists (select 1 from public.league_competitions lc where lc.id = competition_id and lc.created_by = (select auth.uid()))))
  );

-- member_invites: SELECT/INSERT/DELETE por gestor (sem UPDATE → papel imutável).
drop policy if exists member_invites_select on public.member_invites;
create policy member_invites_select on public.member_invites
  for select to authenticated
  using (
    (escopo='tournament' and public.pode_gerir_torneio(tournament_id))
    or (escopo='league'  and public.pode_gerir_competition(competition_id))
  );
drop policy if exists member_invites_insert on public.member_invites;
create policy member_invites_insert on public.member_invites
  for insert to authenticated
  with check (
    (escopo='tournament' and public.pode_gerir_torneio(tournament_id))
    or (escopo='league'  and public.pode_gerir_competition(competition_id))
  );
drop policy if exists member_invites_delete on public.member_invites;
create policy member_invites_delete on public.member_invites
  for delete to authenticated
  using (
    (escopo='tournament' and public.pode_gerir_torneio(tournament_id))
    or (escopo='league'  and public.pode_gerir_competition(competition_id))
  );

-- ---------- Trigger: temporada encerrada imutável ----------
-- Barra UPDATE que reabra/altere uma temporada 'encerrada' (status/numero/
-- competition_id). Espelha lock_match_lifecycle; complementa
-- lock_division_tournament_reopen (aquele protege o TORNEIO da divisão, este
-- protege a LINHA da temporada). service_role (migrations) permanece livre.
create or replace function public.lock_league_season()
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
    if old.status = 'encerrada'
       and (new.status is distinct from old.status
            or new.numero is distinct from old.numero
            or new.competition_id is distinct from old.competition_id)
    then
      raise exception 'A temporada encerrada não pode ser alterada';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists league_seasons_lock on public.league_seasons;
create trigger league_seasons_lock
  before update on public.league_seasons
  for each row execute function public.lock_league_season();

-- ---------- Trigger: geometria da divisão travada fora de rascunho ----------
-- tournament_id/nivel/por_nome/tamanho são a GEOMETRIA da divisão: editáveis só
-- enquanto a temporada é 'rascunho' e travados depois. Espelha
-- lock_slot_relations. service_role permanece livre.
create or replace function public.lock_league_division_season()
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
    if (new.tournament_id is distinct from old.tournament_id
        or new.tournament_id_clausura is distinct from old.tournament_id_clausura
        or new.nivel is distinct from old.nivel
        or new.por_nome is distinct from old.por_nome
        or new.tamanho is distinct from old.tamanho
        or new.desempate is distinct from old.desempate
        or new.ranking_base is distinct from old.ranking_base
        or new.formato is distinct from old.formato
        or new.qtd_grupos is distinct from old.qtd_grupos
        or new.classificados_por_grupo is distinct from old.classificados_por_grupo)
       and exists (
         select 1 from public.league_seasons ls
         where ls.id = old.season_id
           and ls.status <> 'rascunho'
       )
    then
      raise exception 'A geometria da divisão não pode mudar após a temporada sair do rascunho';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists league_division_seasons_lock on public.league_division_seasons;
create trigger league_division_seasons_lock
  before update on public.league_division_seasons
  for each row execute function public.lock_league_division_season();

-- ---------- Trigger: identidade do competidor imutável após jogar ----------
-- team_id/rotulo (identidade) são travados depois que o competidor tem QUALQUER
-- league_division_entries (já entrou numa divisão — identidade imutável).
-- holder_user_id (técnico que acompanha) permanece MUTÁVEL (substituível).
-- service_role permanece livre.
create or replace function public.lock_league_competitor_identity()
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
    if (new.team_id is distinct from old.team_id
        or new.rotulo is distinct from old.rotulo)
       and exists (
         select 1 from public.league_division_entries lde
         where lde.competitor_id = old.id
       )
    then
      raise exception 'A identidade do competidor não pode mudar após a primeira entrada em divisão';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists league_competitors_lock_identity on public.league_competitors;
create trigger league_competitors_lock_identity
  before update on public.league_competitors
  for each row execute function public.lock_league_competitor_identity();

-- ---------- Trigger: freeze do torneio de divisão de temporada congelada ----------
-- DEFESA REAL do FREEZE (vale contra QUALQUER caminho, inclusive POST direto e
-- qualquer action futura): reabrirTorneio opera direto em tournaments e o dono
-- da pirâmide É o created_by dos torneios das divisões — passaria por todas as
-- policies. Este trigger barra a transição de status 'encerrado' →
-- 'ativo'/'rascunho' QUANDO o tournaments.id pertence a uma divisão cuja
-- league_seasons.status in ('em_fluxo','encerrada'). Espelha lock_match_lifecycle.
-- service_role (migrations) permanece livre. O guard na action reabrirTorneio é
-- a camada de UX complementar (não substitui esta).
create or replace function public.lock_division_tournament_reopen()
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
    if old.status = 'encerrado'
       and new.status in ('ativo', 'rascunho')
       and (
         exists (
           select 1
           from public.league_division_seasons lds
           join public.league_seasons ls on ls.id = lds.season_id
           where lds.tournament_id = old.id
             and ls.status in ('em_fluxo', 'encerrada')
         )
         -- Fase 5.1: a CLAUSURA de uma season congelada também não pode reabrir (ela
         -- decide a combinada → o sobe/cai, igual à Apertura). A GRANDE FINAL fica
         -- DE FORA (decorativa, jogável após o fluxo).
         or exists (
           select 1
           from public.league_division_seasons lds
           join public.league_seasons ls on ls.id = lds.season_id
           where lds.tournament_id_clausura = old.id
             and ls.status in ('em_fluxo', 'encerrada')
         )
         -- Fase 2: a CHAVE de playoff de uma fronteira de season congelada também
         -- não pode reabrir (senão o dono mudaria o resultado que já gerou a N+1).
         or exists (
           select 1
           from public.league_boundaries lb
           join public.league_seasons ls on ls.id = lb.season_id
           where lb.playoff_tournament_id = old.id
             and ls.status in ('em_fluxo', 'encerrada')
         )
       )
    then
      raise exception 'A divisão de uma temporada congelada não pode ser reaberta';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tournaments_lock_division_reopen on public.tournaments;
create trigger tournaments_lock_division_reopen
  before update on public.tournaments
  for each row execute function public.lock_division_tournament_reopen();

-- ---------- Estende lock_slot_relations: competitor_id travado fora de rascunho ----------
-- competitor_id é gravado na montagem (rascunho) e não muda depois — defendido
-- pelo mesmo lock que já trava team_id/rotulo. Reescreve a função preservando o
-- corpo original e adicionando o ramo do competitor_id. service_role livre.
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
    -- Vaga por NOME: o rótulo também é geometria da disputa — travado pós-rascunho.
    if new.rotulo is distinct from old.rotulo
       and exists (
         select 1 from public.tournaments t
         where t.id = old.tournament_id
           and t.status <> 'rascunho'
       )
    then
      raise exception 'O nome do competidor não pode mudar após o início do torneio';
    end if;
    -- Pirâmide: o competidor persistente ligado à vaga é geometria de
    -- proveniência — gravado na montagem (rascunho) e imutável depois.
    if new.competitor_id is distinct from old.competitor_id
       and exists (
         select 1 from public.tournaments t
         where t.id = old.tournament_id
           and t.status <> 'rascunho'
       )
    then
      raise exception 'O competidor da vaga não pode mudar após o início do torneio';
    end if;
  end if;
  return new;
end;
$$;

-- (o trigger tournament_slots_lock_relations já aponta para esta função)

-- ============================================================
-- Row Level Security — tabelas da pirâmide
-- ============================================================
-- Padrão cascata do schema: SELECT espelha a visibilidade da pirâmide (ativa OU
-- dono); escrita só do dono (validada via subquery transitiva contra a pirâmide,
-- com o helper eh_dono_competition definer). As policies tournaments_insert_owner
-- e slots_insert_owner_rascunho NÃO são relaxadas — o pré-preenchimento de slots
-- roda pela RPC montar_temporada (SECURITY DEFINER), preservando o invariante
-- "técnico só por aceite" do torneio AVULSO.
alter table public.league_competitions     enable row level security;
alter table public.league_seasons          enable row level security;
alter table public.league_division_seasons enable row level security;
alter table public.league_boundaries       enable row level security;
alter table public.league_competitors      enable row level security;
alter table public.league_division_entries enable row level security;

-- ----- league_competitions: ativa é pública; arquivada vê quem é da equipe -----
-- add-equipe-campeonato: SELECT += bastidores; UPDATE → gerir (dono | admin).
-- INSERT e DELETE permanecem dono-only.
drop policy if exists league_competitions_select_visivel on public.league_competitions;
create policy league_competitions_select_visivel on public.league_competitions
  for select to anon, authenticated
  using (status = 'ativa' or created_by = auth.uid() or public.pode_ver_bastidores_competition(id));

drop policy if exists league_competitions_insert_owner on public.league_competitions;
create policy league_competitions_insert_owner on public.league_competitions
  for insert to authenticated
  with check (created_by = auth.uid());

drop policy if exists league_competitions_update_owner on public.league_competitions;
create policy league_competitions_update_owner on public.league_competitions
  for update to authenticated
  using (public.pode_gerir_competition(id))
  with check (public.pode_gerir_competition(id));

drop policy if exists league_competitions_delete_owner on public.league_competitions;
create policy league_competitions_delete_owner on public.league_competitions
  for delete to authenticated
  using (created_by = auth.uid());

-- ----- league_seasons: visibilidade/escrita via pirâmide -----
-- add-equipe-campeonato: SELECT += bastidores; INSERT/UPDATE → gerir. DELETE
-- permanece dono-only (eh_dono_competition).
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

drop policy if exists league_seasons_delete_owner on public.league_seasons;
create policy league_seasons_delete_owner on public.league_seasons
  for delete to authenticated
  using (public.eh_dono_competition(competition_id));

-- ----- league_division_seasons: visibilidade/escrita via season → pirâmide -----
-- add-equipe-campeonato: SELECT += bastidores; INSERT/UPDATE → gerir. DELETE
-- permanece dono-only (eh_dono_competition).
drop policy if exists league_division_seasons_select_visivel on public.league_division_seasons;
create policy league_division_seasons_select_visivel on public.league_division_seasons
  for select to anon, authenticated
  using (exists (select 1 from public.league_seasons ls
          join public.league_competitions c on c.id = ls.competition_id
          where ls.id = season_id and (c.status = 'ativa' or c.created_by = auth.uid() or public.pode_ver_bastidores_competition(c.id))));

-- Escrita: quem GERE a pirâmide gere a season. A subquery resolve a season → a
-- pirâmide; pode_gerir_competition (definer) valida a capacidade.
drop policy if exists league_division_seasons_insert_owner on public.league_division_seasons;
create policy league_division_seasons_insert_owner on public.league_division_seasons
  for insert to authenticated
  with check (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)));

drop policy if exists league_division_seasons_update_owner on public.league_division_seasons;
create policy league_division_seasons_update_owner on public.league_division_seasons
  for update to authenticated
  using (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)))
  with check (exists (select 1 from public.league_seasons ls where ls.id = season_id and public.pode_gerir_competition(ls.competition_id)));

drop policy if exists league_division_seasons_delete_owner on public.league_division_seasons;
create policy league_division_seasons_delete_owner on public.league_division_seasons
  for delete to authenticated
  using (
    exists (
      select 1 from public.league_seasons ls
      where ls.id = season_id
        and public.eh_dono_competition(ls.competition_id)
    )
  );

-- ----- league_boundaries: visibilidade/escrita via season → pirâmide -----
-- add-equipe-campeonato: SELECT += bastidores; INSERT/UPDATE → gerir. DELETE
-- permanece dono-only (eh_dono_competition).
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

drop policy if exists league_boundaries_delete_owner on public.league_boundaries;
create policy league_boundaries_delete_owner on public.league_boundaries
  for delete to authenticated
  using (
    exists (
      select 1 from public.league_seasons ls
      where ls.id = season_id
        and public.eh_dono_competition(ls.competition_id)
    )
  );

-- ----- league_competitors: visibilidade/escrita via pirâmide -----
-- add-equipe-campeonato: SELECT += bastidores; INSERT/UPDATE → gerir. DELETE
-- permanece dono-only (eh_dono_competition).
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

drop policy if exists league_competitors_delete_owner on public.league_competitors;
create policy league_competitors_delete_owner on public.league_competitors
  for delete to authenticated
  using (public.eh_dono_competition(competition_id));

-- ----- league_division_entries: visibilidade/escrita via entry → divisão → season → pirâmide -----
-- add-equipe-campeonato: SELECT += bastidores; INSERT/UPDATE → gerir. DELETE
-- permanece dono-only (eh_dono_competition). Coerência cross-pirâmide mantida.
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

drop policy if exists league_division_entries_delete_owner on public.league_division_entries;
create policy league_division_entries_delete_owner on public.league_division_entries
  for delete to authenticated
  using (
    exists (
      select 1
      from public.league_division_seasons lds
      join public.league_seasons ls on ls.id = lds.season_id
      where lds.id = division_season_id
        and public.eh_dono_competition(ls.competition_id)
    )
  );

-- ============================================================================
-- Hardening de segurança (advisor lints 0010/0025/0028/0029) — fim do arquivo
-- para todas as funções já existirem. Ver change `hardening-seguranca-supabase`.
-- ============================================================================

-- Funções de TRIGGER: rodam SÓ via trigger, nunca como RPC. CREATE FUNCTION dá
-- EXECUTE a PUBLIC → revoga-se de todos os papéis da API (o trigger dispara
-- independente de grant).
revoke execute on function public.lock_league_season() from anon, authenticated, public;
revoke execute on function public.lock_league_division_season() from anon, authenticated, public;
revoke execute on function public.lock_league_competitor_identity() from anon, authenticated, public;
revoke execute on function public.lock_division_tournament_reopen() from anon, authenticated, public;
revoke execute on function public.lock_match_lifecycle() from anon, authenticated, public;
revoke execute on function public.lock_match_relations() from anon, authenticated, public;
revoke execute on function public.lock_slot_relations() from anon, authenticated, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.valida_resultado_mata_mata() from anon, authenticated, public;
revoke execute on function public.block_slot_invite_por_nome() from anon, authenticated, public;

-- Helper de RLS eh_dono_competition: como eh_participante (832-837), as policies
-- o avaliam COM O ROLE DA QUERY → revoga-se só PUBLIC e concede-se aos 2 roles
-- (revogar deles quebraria a RLS — lição do smoke da change de hardening).
revoke execute on function public.eh_dono_competition(uuid) from public;
grant execute on function public.eh_dono_competition(uuid) to anon, authenticated;


-- =====================================================================
-- COPAS E CONTINENTAIS (change add-copas-continentais)
-- Copas imortais alimentadas pela classificacao final encerrada de ligas
-- e de outras copas. Uma EDICAO materializa UM tournaments (mata_mata ou
-- grupos_mata_mata), reusando o motor de jogo existente. As copas apenas
-- LEEM a classificacao da piramide; zero regressao.
--
-- Ordem de dependencias: enums -> tabelas (cup_competitions ->
-- cup_qualification_rules -> cup_seasons -> cup_entries ->
-- cup_season_exclusions) -> helper eh_dono_cup -> RPCs de leitura gated ->
-- RPC montar_copa -> triggers (anti-ciclo, guard de delete) -> RLS/policies.
--
-- Idempotente onde o repo e idempotente (IF NOT EXISTS / DROP ... IF EXISTS /
-- create or replace). Tudo qualificado com public.
--
-- ADVISORY LOCK NAMESPACES (documentado junto de montar_temporada/playoff):
--   0 = montar_temporada (por season)
--   1 = montar_playoff / montar_barragem / montar_grande_final (por fronteira/divisao)
--   2 = montar_copa (por cup_season)  <-- reservado nesta change
-- =====================================================================

-- ---------- Enums ----------
do $$
begin
  -- Formato da copa (espelha o subconjunto de tournament_format usado: a copa
  -- so suporta chave eliminatoria ou grupos+mata).
  if not exists (select 1 from pg_type where typname = 'cup_format') then
    create type public.cup_format as enum ('mata_mata', 'grupos_mata_mata');
  end if;
  -- Abrangencia: ROTULO informativo (exibicao/filtro), sem invariante
  -- estrutural (continental nao exige >=2 piramides) — D12.
  if not exists (select 1 from pg_type where typname = 'cup_scope') then
    create type public.cup_scope as enum ('nacional', 'continental');
  end if;
  -- Tipo de origem de uma regra de qualificacao: divisao de liga OU resultado
  -- de outra copa (XOR por CHECK na tabela).
  if not exists (select 1 from pg_type where typname = 'cup_origin_type') then
    create type public.cup_origin_type as enum ('divisao', 'copa');
  end if;
  -- Ciclo de vida da edicao: 'rascunho' (montando o pool/ajuste manual),
  -- 'montada' (tournament criado, slots semeados, antes de iniciar), 'ativa'
  -- (chave/grupos gerados, jogando), 'encerrada' (posicao_final gravada).
  if not exists (select 1 from pg_type where typname = 'cup_season_status') then
    create type public.cup_season_status as enum ('rascunho', 'montada', 'ativa', 'encerrada');
  end if;
  -- Ciclo de vida da copa (imortal): 'ativa' (default) ou 'arquivada' (some das
  -- listagens publicas; edicoes preservadas). status NAO e gate de privacidade.
  if not exists (select 1 from pg_type where typname = 'cup_competition_status') then
    create type public.cup_competition_status as enum ('ativa', 'arquivada');
  end if;
end$$;

-- ---------- Tabela: cup_competitions (a copa imortal — config-mae) ----------
-- Espelha league_competitions (schema.sql:1721): created_by anulavel + ON DELETE
-- SET NULL (apagar o dono nao derruba a copa com historico); is_public default
-- true (herdado pelos tournaments das edicoes via montar_copa). Soma o formato
-- da copa (mata_mata|grupos_mata_mata), os toggles de mata-mata (ida_e_volta,
-- terceiro_lugar), a geometria de grupos (qtd_grupos/classificados_por_grupo,
-- so em grupos_mata_mata) e por_nome (clube vs rotulo — homogeneidade da copa).
create table if not exists public.cup_competitions (
  id                       uuid primary key default gen_random_uuid(),
  nome                     text not null,
  created_by               uuid references public.users (id) on delete set null,
  status                   public.cup_competition_status not null default 'ativa',
  -- Mapeia a coluna 'abrangencia' (rotulo nacional|continental — D12).
  abrangencia              public.cup_scope not null default 'nacional',
  formato                  public.cup_format not null default 'mata_mata',
  -- Identidade do participante: false = clube; true = por nome (rotulo livre).
  -- Homogeneidade autoritativa e checada na montagem (COPA_HETEROGENEA — D6).
  por_nome                 boolean not null default false,
  -- Toggles de mata-mata (significativos no mata_mata e no mata-mata pos-grupos).
  ida_e_volta              boolean not null default false,
  terceiro_lugar           boolean not null default false,
  -- Geometria de grupos: presente sse formato = grupos_mata_mata (CHECK abaixo).
  qtd_grupos               integer,
  classificados_por_grupo  integer,
  -- Preset de desempate (mesmo dominio de tournaments.desempate_criterio,
  -- schema.sql:2046). Passa ao tournaments da edicao em montar_copa.
  desempate_criterio       text not null default 'cbf',
  is_public                boolean not null default true,
  -- Cores de identidade (hex #rrggbb minusculo OU NULL — espelha league_competitions).
  cor_primaria             text,
  cor_secundaria           text,
  created_at               timestamptz not null default now(),
  constraint cup_competitions_nome_nao_vazio check (length(trim(nome)) > 0),
  constraint cup_competitions_desempate_valido
    check (desempate_criterio in ('cbf', 'ingles', 'custom', 'espanhol', 'fifa')),
  constraint cup_competitions_cor_primaria_hex
    check (cor_primaria is null or cor_primaria ~ '^#[0-9a-f]{6}$'),
  constraint cup_competitions_cor_secundaria_hex
    check (cor_secundaria is null or cor_secundaria ~ '^#[0-9a-f]{6}$'),
  -- Coerencia de formato: geometria de grupos presente E coerente SSE
  -- grupos_mata_mata; ausente/nula em mata_mata (espelha
  -- league_division_seasons_grupos_coerente, schema.sql:1837). Alem do espelho,
  -- o produto qtd_grupos*classificados_por_grupo DEVE ser uma chave valida:
  -- potencia de 2 entre 2 e 32 (teto do motor MATA_MATA_MAX_PARTICIPANTES).
  -- Bitwise: n>0 and (n & (n-1)) = 0 testa potencia de 2.
  constraint cup_competitions_grupos_coerente
    check (
      (formato = 'mata_mata'
         and qtd_grupos is null and classificados_por_grupo is null)
      or (formato = 'grupos_mata_mata'
         and qtd_grupos >= 2 and classificados_por_grupo >= 1
         and (qtd_grupos * classificados_por_grupo) between 2 and 32
         and ((qtd_grupos * classificados_por_grupo)
              & ((qtd_grupos * classificados_por_grupo) - 1)) = 0)
    )
);

create index if not exists cup_competitions_created_by_idx
  on public.cup_competitions (created_by);

-- ---------- Tabela: cup_qualification_rules (regra de qualificacao = vaga(s)) ----------
-- Cada regra deriva uma faixa de vagas de UMA origem: uma divisao de liga
-- (origem_competition_id + origem_nivel) OU o resultado de outra copa
-- (origem_cup_id). XOR por CHECK. A faixa [posicao_inicio..posicao_fim] indexa
-- um RANK DE SEEDING CONTIGUO 1..n por origem (NAO o valor cru de posicao_final
-- — D3). ON DELETE: cup_competition_id CASCADE (regra morre com a copa);
-- origem_competition_id/origem_cup_id RESTRICT (nao perder regra silenciosamente
-- ao apagar a origem — tasks.md 1.3).
create table if not exists public.cup_qualification_rules (
  id                    uuid primary key default gen_random_uuid(),
  cup_competition_id    uuid not null references public.cup_competitions (id) on delete cascade,
  origem_tipo           public.cup_origin_type not null,
  origem_competition_id uuid references public.league_competitions (id) on delete restrict,
  origem_nivel          integer,
  -- Auto-referencia a outra copa (forward-ref resolvida: cup_competitions ja existe).
  origem_cup_id         uuid references public.cup_competitions (id) on delete restrict,
  posicao_inicio        integer not null,
  posicao_fim           integer not null,
  prioridade            integer not null default 0,
  rotulo                text,
  created_at            timestamptz not null default now(),
  -- XOR de origem amarrado ao tipo: divisao => competition_id + nivel not null,
  -- cup_id null; copa => cup_id not null, competition_id + nivel null.
  constraint cup_qualification_rules_origem_xor
    check (
      (origem_tipo = 'divisao'
         and origem_competition_id is not null and origem_nivel is not null
         and origem_cup_id is null)
      or (origem_tipo = 'copa'
         and origem_cup_id is not null
         and origem_competition_id is null and origem_nivel is null)
    ),
  constraint cup_qualification_rules_nivel_positivo
    check (origem_nivel is null or origem_nivel >= 1),
  -- Faixa valida: fim >= inicio >= 1 (num_vagas = fim - inicio + 1).
  constraint cup_qualification_rules_faixa_valida
    check (posicao_inicio >= 1 and posicao_fim >= posicao_inicio),
  -- Uma copa nao pode ter origem nela mesma (caso trivial; ciclos transitivos
  -- sao barrados pelo trigger anti-ciclo).
  constraint cup_qualification_rules_nao_auto
    check (origem_cup_id is null or origem_cup_id <> cup_competition_id)
);

create index if not exists cup_qualification_rules_cup_idx
  on public.cup_qualification_rules (cup_competition_id);
create index if not exists cup_qualification_rules_origem_competition_idx
  on public.cup_qualification_rules (origem_competition_id) where origem_competition_id is not null;
create index if not exists cup_qualification_rules_origem_cup_idx
  on public.cup_qualification_rules (origem_cup_id) where origem_cup_id is not null;

-- ---------- Tabela: cup_seasons (uma edicao da copa) ----------
-- Espelha league_seasons (schema.sql:1757): numero 1-based sequencial unico por
-- copa (SENTINELA de dupla criacao), previous_season_id (cadeia de proveniencia),
-- config_snapshot jsonb (geometria/formato congelados ao montar — D2). tournament_id
-- e a SENTINELA de idempotencia da montagem (RESTRICT: o torneio nao some sem
-- desfazer a edicao; UNIQUE parcial garante 1 torneio por papel).
create table if not exists public.cup_seasons (
  id                 uuid primary key default gen_random_uuid(),
  cup_competition_id uuid not null references public.cup_competitions (id) on delete cascade,
  numero             integer not null,
  status             public.cup_season_status not null default 'rascunho',
  -- Aponta para o unico tournaments materializado (NULL enquanto rascunho).
  tournament_id      uuid references public.tournaments (id) on delete restrict,
  -- Snapshot imutavel da geometria/formato no momento da montagem (a copa-mae
  -- pode evoluir; a edicao ja montada le do snapshot). NULL ate montar.
  config_snapshot    jsonb,
  -- Auto-referencia a edicao anterior (forward-ref auto-resolvida no Postgres).
  previous_season_id uuid references public.cup_seasons (id) on delete set null,
  montada_em         timestamptz,
  encerrada_em       timestamptz,
  created_at         timestamptz not null default now(),
  constraint cup_seasons_numero_positivo check (numero >= 1)
);

-- SENTINELA de dupla criacao de edicao (23505 em corrida -> retry acha a criada).
create unique index if not exists cup_seasons_numero_unico
  on public.cup_seasons (cup_competition_id, numero);
create index if not exists cup_seasons_cup_idx
  on public.cup_seasons (cup_competition_id);
-- Um torneio pertence a no maximo uma edicao (sentinela de idempotencia).
create unique index if not exists cup_seasons_tournament_unico
  on public.cup_seasons (tournament_id) where tournament_id is not null;
create index if not exists cup_seasons_previous_idx
  on public.cup_seasons (previous_season_id) where previous_season_id is not null;

-- ---------- Tabela: cup_entries (participante de uma edicao) ----------
-- Identidade do participante: team_id = clube (modo clube) XOR rotulo (modo por
-- nome) — espelha league_competitors (schema.sql:1960) e tournament_slots, mas
-- SEM competitor_id (participante de copa NAO e league_competitor). slot_id liga
-- a vaga concreta no tournaments da edicao (NULL ate montar; RESTRICT). origem_*
-- rastreia de onde a vaga veio. posicao_final NULL ate o encerramento (D11).
-- manual=true marca ancoras (ajuste do dono; preservadas na re-derivacao — D5).
-- Vaga vazia = AUSENCIA de linha (o CHECK XOR proibe placeholder — D5).
create table if not exists public.cup_entries (
  id              uuid primary key default gen_random_uuid(),
  cup_season_id   uuid not null references public.cup_seasons (id) on delete cascade,
  team_id         uuid references public.teams (id) on delete restrict,
  rotulo          text,
  -- Regra que derivou esta entry (NULL em entry manual). SET NULL: apagar a regra
  -- nao apaga a entry ja derivada (preserva a edicao montada).
  origem_rule_id  uuid references public.cup_qualification_rules (id) on delete set null,
  -- Season/edicao-origem efetivamente consumida na derivacao. POLIMORFICA (aponta
  -- para league_seasons OU cup_seasons conforme origem_tipo da regra) — SEM FK
  -- forte por isso. Rastreabilidade + base do COPA_HETEROGENEA em montar_copa.
  origem_season_id uuid,
  origem_descricao text,
  seed            integer,
  posicao_final   integer,
  -- Vaga concreta no tournaments da edicao (gravada por montar_copa). NULL ate montar.
  slot_id         uuid references public.tournament_slots (id) on delete restrict,
  manual          boolean not null default false,
  created_at      timestamptz not null default now(),
  constraint cup_entries_clube_xor_rotulo
    check ((team_id is null) <> (rotulo is null)),
  constraint cup_entries_rotulo_nao_vazio
    check (rotulo is null or length(trim(rotulo)) > 0),
  constraint cup_entries_posicao_positiva
    check (posicao_final is null or posicao_final >= 1),
  constraint cup_entries_seed_positivo
    check (seed is null or seed >= 1)
);

create index if not exists cup_entries_season_idx
  on public.cup_entries (cup_season_id);
create index if not exists cup_entries_rule_idx
  on public.cup_entries (origem_rule_id) where origem_rule_id is not null;
-- UNIQUE participante por edicao SEM componente de origem (identidade de edicao =
-- team_id OU lower(trim(rotulo)) — D5). Dois indices parciais (espelha
-- league_competitors_team_unico / _rotulo_unico, schema.sql:1976-1979).
create unique index if not exists cup_entries_team_unico
  on public.cup_entries (cup_season_id, team_id) where team_id is not null;
create unique index if not exists cup_entries_rotulo_unico
  on public.cup_entries (cup_season_id, lower(trim(rotulo))) where rotulo is not null;
-- Um slot pertence a no maximo uma entry (espelha league_division_entries_slot_unico).
create unique index if not exists cup_entries_slot_unico
  on public.cup_entries (slot_id) where slot_id is not null;
create index if not exists cup_entries_team_idx
  on public.cup_entries (team_id) where team_id is not null;

-- ---------- Tabela: cup_season_exclusions (exclusoes persistentes da re-derivacao) ----------
-- O dono removeu uma entry derivada -> registramos a IDENTIDADE excluida aqui
-- (nao como linha em cup_entries, preservando o invariante "sem placeholder" — D5)
-- para que a re-derivacao nao a reintroduza. Identidade = team_id XOR rotulo.
create table if not exists public.cup_season_exclusions (
  id            uuid primary key default gen_random_uuid(),
  cup_season_id uuid not null references public.cup_seasons (id) on delete cascade,
  team_id       uuid references public.teams (id) on delete restrict,
  rotulo        text,
  created_at    timestamptz not null default now(),
  constraint cup_season_exclusions_clube_xor_rotulo
    check ((team_id is null) <> (rotulo is null)),
  constraint cup_season_exclusions_rotulo_nao_vazio
    check (rotulo is null or length(trim(rotulo)) > 0)
);

create index if not exists cup_season_exclusions_season_idx
  on public.cup_season_exclusions (cup_season_id);
-- Unicidade da identidade excluida por edicao (espelha o UNIQUE de cup_entries).
create unique index if not exists cup_season_exclusions_team_unico
  on public.cup_season_exclusions (cup_season_id, team_id) where team_id is not null;
create unique index if not exists cup_season_exclusions_rotulo_unico
  on public.cup_season_exclusions (cup_season_id, lower(trim(rotulo))) where rotulo is not null;
create index if not exists cup_season_exclusions_team_idx
  on public.cup_season_exclusions (team_id) where team_id is not null;

-- ---------- Helper anti-recursao de RLS: dono da copa ----------
-- Usada DENTRO das policies das tabelas-filhas da copa. SECURITY DEFINER evita a
-- recursao (espelha eh_dono_competition, schema.sql:2791). EXECUTE a anon +
-- authenticated — NUNCA revogar de authenticated: a policy o avalia COM O ROLE
-- DA QUERY (licao do hardening — revogar quebra a RLS).
create or replace function public.eh_dono_cup(p_cup_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.cup_competitions c
    where c.id = p_cup_id
      and c.created_by = (select auth.uid())
  );
$$;

revoke execute on function public.eh_dono_cup(uuid) from public;
grant execute on function public.eh_dono_cup(uuid) to anon, authenticated;

-- ---------- RPC: classificacao_final_divisao (SECURITY DEFINER, leitura gated) ----------
-- Le a classificacao final ENCERRADA de uma divisao de liga para alimentar a
-- derivacao de vagas (D3/D4/D9). DEFINER para NAO depender da RLS row-level do
-- dono da copa (que esconderia piramide arquivada e produziria pool silenciosamente
-- incompleto). Aplica o GATE de consentimento explicitamente:
--   (1) ORIGEM_INVISIVEL: a piramide nao e publica nem do proprio dono da copa.
--   (2) ORIGEM_NAO_ENCERRADA: nenhuma temporada 'encerrada' (ativacao diferida).
--   (3) NIVEL_INEXISTENTE: o nivel sumiu da temporada consumida (piramide encolheu).
-- Retorna a lista ordenada por (posicao_final asc, competitor_id asc) com RANK
-- CONTIGUO 1..n (row_number) — a faixa da regra indexa esse rank, nao o valor cru.
-- Inclui origem_season_id (a league_seasons consumida) para rastreabilidade.
create or replace function public.classificacao_final_divisao(
  p_competition_id uuid,
  p_nivel          integer
)
returns table (
  team_id          uuid,
  rotulo           text,
  posicao_final    integer,
  rank             integer,
  origem_season_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_is_public boolean;
  v_dono      uuid;
  v_season    uuid;
  v_div       uuid;
begin
  -- (1) Gate de consentimento: origem publica OU do proprio dono.
  select lc.is_public, lc.created_by
    into v_is_public, v_dono
    from public.league_competitions lc
   where lc.id = p_competition_id;

  if v_is_public is null then
    raise exception 'ORIGEM_INVISIVEL';
  end if;
  if not (v_is_public or v_dono = v_uid) then
    raise exception 'ORIGEM_INVISIVEL';
  end if;

  -- (2) Temporada encerrada de MAIOR numero (D8: nao usar encerrada_em, nullable).
  select ls.id into v_season
    from public.league_seasons ls
   where ls.competition_id = p_competition_id
     and ls.status = 'encerrada'
   order by ls.numero desc
   limit 1;

  if v_season is null then
    raise exception 'ORIGEM_NAO_ENCERRADA';
  end if;

  -- (3) Divisao do nivel pedido na temporada consumida.
  select lds.id into v_div
    from public.league_division_seasons lds
   where lds.season_id = v_season
     and lds.nivel = p_nivel;

  if v_div is null then
    raise exception 'NIVEL_INEXISTENTE';
  end if;

  -- Lista ordenada com rank contiguo. Join league_division_entries ->
  -- league_competitors para resolver team_id/rotulo. posicao_final e NOT NULL na
  -- temporada encerrada (gravado por confirmarFluxoTemporada); filtramos por
  -- garantia. competitor_id e o desempate estavel do seeding.
  return query
    select lcomp.team_id,
           lcomp.rotulo,
           lde.posicao_final,
           (row_number() over (
              order by lde.posicao_final asc, lde.competitor_id asc
           ))::integer as rank,
           v_season as origem_season_id
      from public.league_division_entries lde
      join public.league_competitors lcomp on lcomp.id = lde.competitor_id
     where lde.division_season_id = v_div
       and lde.posicao_final is not null
     order by lde.posicao_final asc, lde.competitor_id asc;
end;
$$;

revoke execute on function public.classificacao_final_divisao(uuid, integer) from public, anon;
grant execute on function public.classificacao_final_divisao(uuid, integer) to authenticated;

-- ---------- RPC: classificacao_final_copa (SECURITY DEFINER, leitura gated) ----------
-- Simetrico a classificacao_final_divisao, mas a fonte e cup_entries.posicao_final
-- da edicao 'encerrada' de maior numero (preenchido por encerrarEdicaoCopa — D11).
-- O gate de consentimento usa cup_competitions.is_public/created_by. Em copa nao ha
-- 'nivel' (NIVEL_INEXISTENTE nao se aplica). Retorna a mesma forma TABLE com rank
-- contiguo (campeao=rank 1, vice=rank 2, ...).
create or replace function public.classificacao_final_copa(
  p_cup_id uuid
)
returns table (
  team_id          uuid,
  rotulo           text,
  posicao_final    integer,
  rank             integer,
  origem_season_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := (select auth.uid());
  v_is_public boolean;
  v_dono      uuid;
  v_season    uuid;
begin
  -- (1) Gate de consentimento.
  select c.is_public, c.created_by
    into v_is_public, v_dono
    from public.cup_competitions c
   where c.id = p_cup_id;

  if v_is_public is null then
    raise exception 'ORIGEM_INVISIVEL';
  end if;
  if not (v_is_public or v_dono = v_uid) then
    raise exception 'ORIGEM_INVISIVEL';
  end if;

  -- (2) Edicao encerrada de MAIOR numero.
  select cs.id into v_season
    from public.cup_seasons cs
   where cs.cup_competition_id = p_cup_id
     and cs.status = 'encerrada'
   order by cs.numero desc
   limit 1;

  if v_season is null then
    raise exception 'ORIGEM_NAO_ENCERRADA';
  end if;

  -- Lista ordenada com rank contiguo. posicao_final foi gravada por
  -- encerrarEdicaoCopa (NOT NULL na edicao encerrada). Desempate por id da entry
  -- (estavel; a copa nao tem competitor_id).
  return query
    select ce.team_id,
           ce.rotulo,
           ce.posicao_final,
           (row_number() over (
              order by ce.posicao_final asc, ce.id asc
           ))::integer as rank,
           v_season as origem_season_id
      from public.cup_entries ce
     where ce.cup_season_id = v_season
       and ce.posicao_final is not null
     order by ce.posicao_final asc, ce.id asc;
end;
$$;

revoke execute on function public.classificacao_final_copa(uuid) from public, anon;
grant execute on function public.classificacao_final_copa(uuid) to authenticated;

-- ---------- RPC: montar_copa (SECURITY DEFINER) ----------
-- Cria o UNICO tournaments da edicao e insere os tournament_slots semeados na
-- ORDEM de p_seeded_entry_ids, a partir de cup_entries (por team_id/rotulo, com
-- competitor_id e user_id NULL — participante de copa NAO e league_competitor),
-- e grava cup_entries.slot_id + cup_seasons.tournament_id + status='montada'.
-- Reusa de montar_playoff (schema.sql:2313) APENAS o esqueleto: posse explicita,
-- advisory lock, sentinela/promote-first, criacao do tournaments rascunho, slots
-- na ordem de seeding. DIFERENCAS: autoriza por created_by DIRETO (sem helper de
-- capacidade); namespace 2 do advisory lock; slots sem competitor_id/user_id.
--   Pre-checks: ENTRY_DE_OUTRA_EDICAO, COPA_HETEROGENEA (por_nome da origem
--   consumida vs por_nome da copa), COPA_LOTADA / geometria.
create or replace function public.montar_copa(
  p_cup_season_id    uuid,
  p_seeded_entry_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid            uuid := (select auth.uid());
  v_cup            uuid;
  v_dono           uuid;
  v_is_public      boolean;
  v_formato        public.cup_format;
  v_por_nome       boolean;
  v_idavolta       boolean;
  v_terceiro       boolean;
  v_qtd_grupos     integer;
  v_classif        integer;
  v_desempate      text;
  v_nome           text;
  v_existing       uuid;
  v_n              integer;
  v_produto        integer;
  v_tournament     uuid;
  v_eid            uuid;
  v_entry          record;
  v_slot           uuid;
  v_heterogenea    boolean;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Copa-mae da edicao + posse + heranca (formato/toggles/geometria/desempate).
  select cc.id, cc.created_by, cc.is_public, cc.formato, cc.por_nome,
         cc.ida_e_volta, cc.terceiro_lugar, cc.qtd_grupos, cc.classificados_por_grupo,
         cc.desempate_criterio, cc.nome
    into v_cup, v_dono, v_is_public, v_formato, v_por_nome,
         v_idavolta, v_terceiro, v_qtd_grupos, v_classif,
         v_desempate, v_nome
    from public.cup_seasons cs
    join public.cup_competitions cc on cc.id = cs.cup_competition_id
   where cs.id = p_cup_season_id;

  if v_cup is null then
    raise exception 'EDICAO_INVALIDA';
  end if;
  -- Posse DIRETA (D9): sem helper de capacidade — copa e gerida so pelo dono.
  if v_dono is distinct from v_uid then
    raise exception 'NAO_DONO';
  end if;

  -- Idempotencia (promote-first): a edicao ja tem torneio (sentinela).
  select tournament_id into v_existing
    from public.cup_seasons where id = p_cup_season_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Serializa por edicao (namespace 2 — reservado a montar_copa): a 2a chamada
  -- espera o commit da 1a e ve a sentinela preenchida.
  perform pg_advisory_xact_lock(hashtextextended(p_cup_season_id::text, 2));
  select tournament_id into v_existing
    from public.cup_seasons where id = p_cup_season_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Cardinalidade do array de seeding.
  v_n := coalesce(array_length(p_seeded_entry_ids, 1), 0);

  -- Pre-check: toda entry semeada pertence a ESTA edicao. Faz num passo so via
  -- contagem (o array nao pode ter id fora da edicao).
  if exists (
    select 1
      from unnest(p_seeded_entry_ids) as t(eid)
     where not exists (
       select 1 from public.cup_entries ce
        where ce.id = t.eid and ce.cup_season_id = p_cup_season_id
     )
  ) then
    raise exception 'ENTRY_DE_OUTRA_EDICAO';
  end if;

  -- Pre-check: homogeneidade por_nome (D6). AUTORIDADE da checagem. Cada entry
  -- registra a identidade efetiva (team_id XOR rotulo) que DEVE ser compativel
  -- com cup_competitions.por_nome: copa por clube exige toda entry com team_id;
  -- copa por nome exige toda entry com rotulo. Isso reflete o por_nome da origem
  -- EFETIVAMENTE consumida (a derivacao so gera team_id de origem por-clube e
  -- rotulo de origem por-nome — origem_season_id rastreia o vinculo). Uma entry
  -- divergente => COPA_HETEROGENEA.
  select exists (
    select 1 from public.cup_entries ce
     where ce.id = any (p_seeded_entry_ids)
       and ( (v_por_nome and ce.team_id is not null)
          or (not v_por_nome and ce.rotulo is not null) )
  ) into v_heterogenea;
  if v_heterogenea then
    raise exception 'COPA_HETEROGENEA';
  end if;

  -- Pre-check de capacidade/geometria por formato (D7), sobre N efetivo (= entries
  -- semeadas; vagas vazias ja sao ausencia de id no array).
  if v_formato = 'mata_mata' then
    if v_n < 2 then
      raise exception 'COPA_SEM_PARTICIPANTES_SUFICIENTES';
    end if;
    if v_n > 32 then
      raise exception 'COPA_LOTADA';
    end if;
  else
    -- grupos_mata_mata: a geometria (qtd_grupos x classificados_por_grupo) e fixa
    -- na copa; o N efetivo deve preencher exatamente os grupos (N = qtd_grupos x
    -- tamanho_do_grupo). Como o tamanho do grupo nao e fixado na copa, exigimos N
    -- divisivel por qtd_grupos, com >= classificados_por_grupo+1 por grupo (ao
    -- menos 2 por grupo) e produto classificados = chave valida (ja garantido pelo
    -- CHECK de cup_competitions). O teto de 32 vale para a chave dos classificados.
    if v_qtd_grupos is null or v_classif is null then
      raise exception 'COPA_GEOMETRIA_INVALIDA';
    end if;
    -- Grupos podem ser DESIGUAIS (+-1), como o motor gerarFaseGruposSemeada/
    -- validarGeometria: NAO exigir N % qtd_grupos = 0. O menor grupo =
    -- floor(N/qtd_grupos) precisa de >= 2 e > classificados_por_grupo.
    if v_n < (v_qtd_grupos * 2) then
      raise exception 'COPA_SEM_PARTICIPANTES_SUFICIENTES';
    end if;
    if (v_n / v_qtd_grupos) < (v_classif + 1) then
      raise exception 'COPA_GEOMETRIA_INVALIDA';
    end if;
    v_produto := v_qtd_grupos * v_classif;
    if v_produto > 32 then
      raise exception 'COPA_LOTADA';
    end if;
  end if;

  -- Cria o tournaments da edicao (rascunho — iniciarEdicaoCopa gera a chave/grupos
  -- e promove). por_nome/desempate/ida_e_volta/terceiro/qtd_grupos/classificados
  -- herdados da copa; created_by = dono; is_public herdado. classificados_por_grupo
  -- so em grupos (NULL em mata_mata).
  insert into public.tournaments
    (titulo, status, created_by, formato, ida_e_volta, terceiro_lugar,
     por_nome, desempate_criterio, is_public, classificados_por_grupo)
  values
    (v_nome, 'rascunho', v_uid, v_formato::text::public.tournament_format,
     coalesce(v_idavolta, false), coalesce(v_terceiro, false),
     v_por_nome, v_desempate, v_is_public,
     case when v_formato = 'grupos_mata_mata' then v_classif else null end)
  returning id into v_tournament;

  -- Promove a sentinela ANTES dos slots (o promote-first protege a corrida).
  update public.cup_seasons
     set tournament_id = v_tournament,
         status        = 'montada',
         montada_em    = now(),
         config_snapshot = jsonb_build_object(
           'formato', v_formato::text,
           'por_nome', v_por_nome,
           'ida_e_volta', coalesce(v_idavolta, false),
           'terceiro_lugar', coalesce(v_terceiro, false),
           'qtd_grupos', v_qtd_grupos,
           'classificados_por_grupo', v_classif,
           'desempate_criterio', v_desempate,
           'n', v_n
         )
   where id = p_cup_season_id;

  -- Slots na ORDEM de p_seeded_entry_ids (= ordem de seeding). competitor_id e
  -- user_id NULL (participante de copa nao tem league_competitor nem tecnico).
  foreach v_eid in array p_seeded_entry_ids loop
    select ce.id, ce.team_id, ce.rotulo
      into v_entry
      from public.cup_entries ce
     where ce.id = v_eid;

    if v_entry.id is null then
      raise exception 'ENTRY_DE_OUTRA_EDICAO';
    end if;

    if v_por_nome then
      -- (a heterogeneidade ja foi barrada acima; rotulo e NOT NULL aqui)
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, null, v_entry.rotulo, null, null)
      returning id into v_slot;
    else
      insert into public.tournament_slots
        (tournament_id, team_id, rotulo, user_id, competitor_id)
      values
        (v_tournament, v_entry.team_id, null, null, null)
      returning id into v_slot;
    end if;

    update public.cup_entries
       set slot_id = v_slot
     where id = v_eid;
  end loop;

  return v_tournament;
end;
$$;

revoke execute on function public.montar_copa(uuid, uuid[]) from public, anon;
grant execute on function public.montar_copa(uuid, uuid[]) to authenticated;

-- ---------- Trigger anti-ciclo copa->copa (DEFINER) — D10 ----------
-- BEFORE INSERT/UPDATE em cup_qualification_rules de origem 'copa': caminha o
-- grafo de origens-copa a partir de origem_cup_id e verifica se alcanca a
-- propria copa-mae (cup_competition_id) — ciclo transitivo. SECURITY DEFINER
-- para ler regras de copas de OUTROS donos (a varredura nao deve depender de RLS).
-- A recursao usa um WITH RECURSIVE sobre cup_qualification_rules. Profundidade
-- limitada pelo numero de copas (grafo finito; cup_qualification_rules_nao_auto
-- ja barra o auto-loop trivial de 1 no).
create or replace function public.cup_rule_anti_ciclo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_alcanca boolean;
begin
  if new.origem_tipo <> 'copa' or new.origem_cup_id is null then
    return new;
  end if;

  -- A copa-mae (new.cup_competition_id) e alcancavel a partir de new.origem_cup_id
  -- seguindo as arestas origem 'copa'? Se sim, fechar essa aresta criaria ciclo.
  with recursive alcancaveis(cup_id) as (
    select new.origem_cup_id
    union
    select r.origem_cup_id
      from public.cup_qualification_rules r
      join alcancaveis a on a.cup_id = r.cup_competition_id
     where r.origem_tipo = 'copa'
       and r.origem_cup_id is not null
  )
  select exists (
    select 1 from alcancaveis where cup_id = new.cup_competition_id
  ) into v_alcanca;

  if v_alcanca then
    raise exception 'CICLO_DE_COPAS';
  end if;

  return new;
end;
$$;

drop trigger if exists cup_qualification_rules_anti_ciclo on public.cup_qualification_rules;
create trigger cup_qualification_rules_anti_ciclo
  before insert or update on public.cup_qualification_rules
  for each row execute function public.cup_rule_anti_ciclo();
revoke execute on function public.cup_rule_anti_ciclo() from anon, authenticated, public;

-- ---------- Trigger guard: nao apagar copa com edicao materializada ----------
-- BEFORE DELETE em cup_competitions: recusa se alguma edicao ja tem tournament_id
-- (materializada — preserva o historico de partidas). A action arquiva em vez de
-- apagar. Espelha o espirito de league_division_seasons.tournament_id RESTRICT.
create or replace function public.cup_block_delete_materializada()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.cup_seasons cs
     where cs.cup_competition_id = old.id
       and cs.tournament_id is not null
  ) then
    raise exception 'COPA_COM_EDICAO_MATERIALIZADA';
  end if;
  return old;
end;
$$;

drop trigger if exists cup_competitions_block_delete on public.cup_competitions;
create trigger cup_competitions_block_delete
  before delete on public.cup_competitions
  for each row execute function public.cup_block_delete_materializada();
revoke execute on function public.cup_block_delete_materializada() from anon, authenticated, public;

-- ============================================================================
-- RLS das tabelas cup_* (D9)
-- SELECT: cup_competitions usa (is_public or created_by = (select auth.uid())) — status
-- NAO e gate de privacidade. Filhas resolvem via eh_dono_cup(<fk>) OR is_public
-- da copa-mae. INSERT/UPDATE/DELETE: cup_competitions por created_by direto;
-- filhas via eh_dono_cup (dono direto). O tournaments/slots da edicao tem RLS
-- propria (nao recriada aqui). Sem grants de tabela explicitos: o repo usa o
-- default privilege do Supabase (cloud) / `grant all on all tables` do
-- local-grants.sql — a RLS governa o acesso.
-- ============================================================================
alter table public.cup_competitions       enable row level security;
alter table public.cup_qualification_rules enable row level security;
alter table public.cup_seasons             enable row level security;
alter table public.cup_entries             enable row level security;
alter table public.cup_season_exclusions   enable row level security;

-- ----- cup_competitions: publica OU do dono (status nao e gate) -----
drop policy if exists cup_competitions_select_visivel on public.cup_competitions;
create policy cup_competitions_select_visivel on public.cup_competitions
  for select to anon, authenticated
  using (is_public or created_by = (select auth.uid()));

drop policy if exists cup_competitions_insert_owner on public.cup_competitions;
create policy cup_competitions_insert_owner on public.cup_competitions
  for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy if exists cup_competitions_update_owner on public.cup_competitions;
create policy cup_competitions_update_owner on public.cup_competitions
  for update to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

drop policy if exists cup_competitions_delete_owner on public.cup_competitions;
create policy cup_competitions_delete_owner on public.cup_competitions
  for delete to authenticated
  using (created_by = (select auth.uid()));

-- ----- cup_qualification_rules: visibilidade/escrita via copa-mae -----
drop policy if exists cup_qualification_rules_select_visivel on public.cup_qualification_rules;
create policy cup_qualification_rules_select_visivel on public.cup_qualification_rules
  for select to anon, authenticated
  using (exists (select 1 from public.cup_competitions c
          where c.id = cup_competition_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_qualification_rules_insert_owner on public.cup_qualification_rules;
create policy cup_qualification_rules_insert_owner on public.cup_qualification_rules
  for insert to authenticated
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_qualification_rules_update_owner on public.cup_qualification_rules;
create policy cup_qualification_rules_update_owner on public.cup_qualification_rules
  for update to authenticated
  using (public.eh_dono_cup(cup_competition_id))
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_qualification_rules_delete_owner on public.cup_qualification_rules;
create policy cup_qualification_rules_delete_owner on public.cup_qualification_rules
  for delete to authenticated
  using (public.eh_dono_cup(cup_competition_id));

-- ----- cup_seasons: visibilidade/escrita via copa-mae -----
drop policy if exists cup_seasons_select_visivel on public.cup_seasons;
create policy cup_seasons_select_visivel on public.cup_seasons
  for select to anon, authenticated
  using (exists (select 1 from public.cup_competitions c
          where c.id = cup_competition_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_seasons_insert_owner on public.cup_seasons;
create policy cup_seasons_insert_owner on public.cup_seasons
  for insert to authenticated
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_seasons_update_owner on public.cup_seasons;
create policy cup_seasons_update_owner on public.cup_seasons
  for update to authenticated
  using (public.eh_dono_cup(cup_competition_id))
  with check (public.eh_dono_cup(cup_competition_id));

drop policy if exists cup_seasons_delete_owner on public.cup_seasons;
create policy cup_seasons_delete_owner on public.cup_seasons
  for delete to authenticated
  using (public.eh_dono_cup(cup_competition_id));

-- ----- cup_entries: visibilidade/escrita via edicao -> copa-mae -----
drop policy if exists cup_entries_select_visivel on public.cup_entries;
create policy cup_entries_select_visivel on public.cup_entries
  for select to anon, authenticated
  using (exists (select 1 from public.cup_seasons cs
          join public.cup_competitions c on c.id = cs.cup_competition_id
          where cs.id = cup_season_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_entries_insert_owner on public.cup_entries;
create policy cup_entries_insert_owner on public.cup_entries
  for insert to authenticated
  with check (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

drop policy if exists cup_entries_update_owner on public.cup_entries;
create policy cup_entries_update_owner on public.cup_entries
  for update to authenticated
  using (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)))
  with check (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

drop policy if exists cup_entries_delete_owner on public.cup_entries;
create policy cup_entries_delete_owner on public.cup_entries
  for delete to authenticated
  using (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

-- ----- cup_season_exclusions: visibilidade/escrita via edicao -> copa-mae -----
drop policy if exists cup_season_exclusions_select_visivel on public.cup_season_exclusions;
create policy cup_season_exclusions_select_visivel on public.cup_season_exclusions
  for select to anon, authenticated
  using (exists (select 1 from public.cup_seasons cs
          join public.cup_competitions c on c.id = cs.cup_competition_id
          where cs.id = cup_season_id and (c.is_public or c.created_by = (select auth.uid()))));

drop policy if exists cup_season_exclusions_insert_owner on public.cup_season_exclusions;
create policy cup_season_exclusions_insert_owner on public.cup_season_exclusions
  for insert to authenticated
  with check (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

drop policy if exists cup_season_exclusions_delete_owner on public.cup_season_exclusions;
create policy cup_season_exclusions_delete_owner on public.cup_season_exclusions
  for delete to authenticated
  using (exists (select 1 from public.cup_seasons cs
          where cs.id = cup_season_id and public.eh_dono_cup(cs.cup_competition_id)));

-- =====================================================================
-- Fim — COPAS E CONTINENTAIS
-- =====================================================================

-- =====================================================================
-- PROPOSTA DE RESULTADO COM FOTO (add-proposta-resultado-foto)
-- O técnico (não-admin) propõe placar (foto obrigatória) / W.O. (foto
-- opcional); dono/admin/árbitro aprova. Aprovar é atômico (RPC). Evidência
-- em bucket privado, lida só por aprovador/jogador via policy de storage.
-- =====================================================================

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
create unique index if not exists match_score_proposals_uma_pendente
  on public.match_score_proposals (match_id, submetido_por) where status = 'pendente';

alter table public.match_score_proposals enable row level security;

-- Foto OPCIONAL na solicitação de W.O.
alter table public.match_wo_requests add column if not exists foto_path text;

-- Autores dos gols PROPOSTOS (add-artilharia): lista jsonb [{lado,jogador,gols}]
-- guardada até a aprovação, quando a RPC aprovar_proposta_placar os materializa
-- em match_goals atomicamente. Nullable/retrocompat (propostas antigas = null).
alter table public.match_score_proposals add column if not exists autores jsonb;

-- RLS de match_score_proposals -----------------------------------------------
drop policy if exists match_score_proposals_insert_tecnico on public.match_score_proposals;
create policy match_score_proposals_insert_tecnico on public.match_score_proposals
  for insert to authenticated
  with check (
    submetido_por = (select auth.uid())
    -- foto_path (NOT NULL) amarrado à pasta do autor: <uid>/<match_id>/<uuid>.ext.
    -- Impede forjar a COLUNA da linha via PostgREST (a action é burlável) e ler
    -- evidência de outra pasta pela SELECT policy de storage (confused deputy).
    and (storage.foldername(foto_path))[1] = (select auth.uid())::text
    and (storage.foldername(foto_path))[2] = match_id::text
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
-- UPDATE: sem policy (negado à sessão) — aprovar/rejeitar só via RPC.
-- DELETE: só a PRÓPRIA pendente (reenvio substitui; veredito é imutável).
drop policy if exists match_score_proposals_delete_own_pendente on public.match_score_proposals;
create policy match_score_proposals_delete_own_pendente on public.match_score_proposals
  for delete to authenticated
  using (submetido_por = (select auth.uid()) and status = 'pendente');

-- Bucket privado de evidências + storage policies ----------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('match_evidence','match_evidence', false, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

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

-- RPC: aprovar proposta — atômico (aplica placar + encerra; trigger valida) ----
create or replace function public.aprovar_proposta_placar(p_proposal_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_match   uuid;
  v_p1      integer;
  v_p2      integer;
  v_tid     uuid;
  v_autores jsonb;
  v_linhas  integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select sp.match_id, sp.placar_1, sp.placar_2, m.tournament_id, sp.autores
    into v_match, v_p1, v_p2, v_tid, v_autores
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

  update public.matches
     set placar_1 = v_p1, placar_2 = v_p2, status = 'encerrada'
   where id = v_match and status <> 'encerrada';
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'PARTIDA_INDISPONIVEL';
  end if;

  -- Materializa os autores propostos em match_goals ATOMICAMENTE (add-artilharia).
  -- `autores` é jsonb LIVRE e a policy de INSERT da proposta NÃO valida o conteúdo,
  -- logo esta RPC é o writer AUTORITATIVO e endurece tudo aqui:
  --  * Só mexe em match_goals quando a proposta traz autores como ARRAY. `null` =
  --    "não informado" → PRESERVA os gols já registrados (alinha com updateMatchScore);
  --    `[]` = "limpar explicitamente" → delete sem reinsert.
  --  * Guardas de tipo (jsonb_typeof) ANTES dos casts: elemento malformado
  --    (lado/gols não-numérico, jogador não-string) é IGNORADO, jamais lança 22P02 e
  --    trava a aprovação inteira.
  --  * Agrega por (lado, nome normalizado) coincidindo com o índice único funcional
  --    (defende contra autores duplicados forjados: soma em vez de violar o unique).
  --  * Descarta (clampa) o lado cuja SOMA de gols exceda o placar daquele lado, para
  --    que autores forjados não inflem o ranking sem quebrar a aprovação legítima —
  --    numa proposta legítima o Zod já garante soma≤placar, então nunca dispara.
  if v_autores is not null and jsonb_typeof(v_autores) = 'array' then
    delete from public.match_goals where match_id = v_match;
    insert into public.match_goals (match_id, lado, jogador, gols)
    select v_match, g.lado, g.jogador, g.gols
      from (
        select x.lado,
               min(x.jogador)                             as jogador,
               sum(x.gols)                                as gols,
               sum(sum(x.gols)) over (partition by x.lado) as total_lado
          from (
            select (e->>'lado')::smallint  as lado,
                   btrim(e->>'jogador')    as jogador,
                   (e->>'gols')::int       as gols
              from jsonb_array_elements(v_autores) e
             where jsonb_typeof(e->'lado')    = 'number'
               and jsonb_typeof(e->'gols')    = 'number'
               and jsonb_typeof(e->'jogador') = 'string'
          ) x
         where x.lado in (1, 2)
           and char_length(x.jogador) between 1 and 60
           and x.gols between 1 and 99
         group by x.lado, lower(x.jogador)
      ) g
     where g.total_lado <= case g.lado when 1 then v_p1 else v_p2 end;
  end if;

  update public.match_score_proposals
     set status = 'aprovada', resolvido_em = now(), resolvido_por = v_uid
   where id = p_proposal_id;

  update public.match_score_proposals
     set status = 'rejeitada', motivo = 'substituída (partida encerrada)',
         resolvido_em = now(), resolvido_por = v_uid
   where match_id = v_match and status = 'pendente' and id <> p_proposal_id;

  return v_match;
end;
$$;

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

-- Estreitar matches_update_participant para AVULSO (técnico de vaga não escreve direto)
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

-- Grants
grant select, insert, delete on public.match_score_proposals to authenticated;
revoke execute on function public.aprovar_proposta_placar(uuid) from public, anon;
revoke execute on function public.rejeitar_proposta_placar(uuid, text) from public, anon;
grant execute on function public.aprovar_proposta_placar(uuid) to authenticated;
grant execute on function public.rejeitar_proposta_placar(uuid, text) to authenticated;

-- =====================================================================
-- Fim — PROPOSTA DE RESULTADO COM FOTO
-- =====================================================================

-- =====================================================================
-- ARTILHARIA — autores dos gols (add-artilharia)
-- Captura QUEM fez cada gol (nome livre + autocomplete por competidor), alimenta
-- o ranking de artilharia por competição e os artilheiros na carreira do
-- competidor persistente. Tabela GENÉRICA: resolve o competidor por JOIN
-- (match.vaga_N → tournament_slots.competitor_id) — NÃO denormaliza competitor_id
-- (o lado é imutável via lock_match_relations). Assistências/MVP fora de escopo.
-- =====================================================================

create table if not exists public.match_goals (
  id         uuid primary key default gen_random_uuid(),
  match_id   uuid not null references public.matches (id) on delete cascade,
  lado       smallint not null check (lado in (1, 2)),
  jogador    text not null,                        -- nome livre (guardado com btrim)
  gols       int not null default 1 check (gols between 1 and 99),
  created_at timestamptz not null default now(),
  constraint match_goals_jogador_tam
    check (char_length(btrim(jogador)) between 1 and 60)
);

create index if not exists match_goals_match_idx
  on public.match_goals (match_id);
-- Um autor por (partida, lado), case-insensitive: "Endrick"/"endrick" na mesma
-- partida/lado colidem (contagem fica em `gols`). Índice funcional (constraint
-- inline não aceita expressão).
create unique index if not exists match_goals_unico
  on public.match_goals (match_id, lado, lower(btrim(jogador)));

alter table public.match_goals enable row level security;

-- SELECT: espelha matches_select_visivel — só vê o gol quem vê a partida (não
-- vaza gol de rodada oculta). anon cai no ramo "liberada + público".
drop policy if exists match_goals_select on public.match_goals;
create policy match_goals_select on public.match_goals
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and (
          public.pode_ver_bastidores_torneio(m.tournament_id)
          or (
            m.liberada_em is not null and m.liberada_em <= now()
            and (
              exists (
                select 1 from public.tournaments t
                where t.id = m.tournament_id
                  and (t.is_public or public.eh_participante(t.id))
              )
              or auth.uid() = m.participante_1
              or auth.uid() = m.participante_2
              or exists (
                select 1 from public.tournament_slots s
                where s.id in (m.vaga_1, m.vaga_2) and s.user_id = auth.uid()
              )
            )
          )
        )
    )
  );

-- INSERT/DELETE: derivam de quem grava PLACAR DIRETO (o técnico de vaga PROPÕE;
-- seus autores entram via a RPC definer aprovar_proposta_placar, que ignora RLS).
-- Espelha matches_update_tournament_owner (ARBITRAR, competitivo) OU
-- matches_update_participant (avulso liberado). Partida encerrada não recebe gols
-- (a app só grava com o placar, em partida não encerrada). Sem policy de UPDATE:
-- a substituição é delete-then-insert.
drop policy if exists match_goals_insert on public.match_goals;
create policy match_goals_insert on public.match_goals
  for insert to authenticated
  with check (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status <> 'encerrada'
        and (
          public.pode_arbitrar_torneio(m.tournament_id)
          or (
            m.liberada_em is not null and m.liberada_em <= now()
            and (auth.uid() = m.participante_1 or auth.uid() = m.participante_2)
          )
        )
    )
  );

drop policy if exists match_goals_delete on public.match_goals;
create policy match_goals_delete on public.match_goals
  for delete to authenticated
  using (
    exists (
      select 1 from public.matches m
      where m.id = match_id
        and m.status <> 'encerrada'
        and (
          public.pode_arbitrar_torneio(m.tournament_id)
          or (
            m.liberada_em is not null and m.liberada_em <= now()
            and (auth.uid() = m.participante_1 or auth.uid() = m.participante_2)
          )
        )
    )
  );

-- Grants: leitura pública (anon vê gol de partida liberada/pública); escrita só
-- autenticado (a policy é a barreira fina).
grant select on public.match_goals to anon, authenticated;
grant insert, delete on public.match_goals to authenticated;

-- =====================================================================
-- Fim — ARTILHARIA
-- =====================================================================

-- =====================================================================
-- CONQUISTAS / HALL DA FAMA (change add-conquistas-hall — aplicada em PROD)
-- =====================================================================
-- Foto persistida dos troféus de uma TEMPORADA de liga encerrada, na estante do
-- competidor. Writer AUTORITATIVO único = a RPC registrar_conquistas_temporada
-- (SECURITY DEFINER). A tabela tem RLS SELECT-only e ZERO grant de escrita (o
-- REVEKE explícito abaixo reforça o modelo). Torneio avulso e copa ficam fora de
-- escopo (identidade não persistente / chaveamento distinto) — o CHECK de escopo
-- os mantém por forward-compat.

create table if not exists public.conquistas (
  id             uuid primary key default gen_random_uuid(),
  competitor_id  uuid not null references public.league_competitors (id) on delete cascade,
  tipo           text not null check (tipo in (
                    'campeao', 'vice', 'artilheiro', 'melhor_ataque',
                    'melhor_defesa', 'melhor_sequencia', 'promovido', 'rebaixado'
                  )),
  -- 'torneio'/'copa' mantidos por forward-compat; esta change grava só 'temporada'.
  escopo         text not null check (escopo in ('temporada', 'torneio', 'copa')),
  -- ref_id é POLIMÓRFICO (season_id | tournament_id | cup_season_id): sem FK, para
  -- o troféu SOBREVIVER à remoção da competição (hall da fama é durável). A
  -- estabilidade de exibição vem de ref_rotulo (materializado no fechamento).
  ref_id         uuid not null,
  ref_rotulo     text not null,     -- ex.: "Brasileirão — Temporada 3"
  nivel          smallint,          -- nível da divisão (liga); null nos demais
  valor_texto    text,              -- "Série A", "47 gols pró", "12 vitórias seguidas"
  valor_num      int,               -- 47, 12 (opcional)
  jogador        text,              -- nome do artilheiro (tipo='artilheiro'); null nos demais
  conquistado_em timestamptz not null default now(),
  constraint conquistas_unica unique (escopo, ref_id, competitor_id, tipo)
);

create index if not exists conquistas_competitor_idx
  on public.conquistas (competitor_id);
create index if not exists conquistas_escopo_ref_idx
  on public.conquistas (escopo, ref_id);

alter table public.conquistas enable row level security;

-- RLS SELECT-only (espelha league_competitors_select_visivel). SEM policy nem
-- grant de escrita: o único writer é a RPC SECURITY DEFINER.
drop policy if exists conquistas_select on public.conquistas;
create policy conquistas_select on public.conquistas
  for select to anon, authenticated
  using (
    exists (
      select 1
        from public.league_competitors lc
        join public.league_competitions c on c.id = lc.competition_id
       where lc.id = competitor_id
         and (
           c.status = 'ativa'
           or c.created_by = auth.uid()
           or public.pode_ver_bastidores_competition(c.id)
         )
    )
  );

grant select on public.conquistas to anon, authenticated;
-- Defesa em profundidade: o Supabase AUTO-CONCEDE insert/update/delete/truncate/
-- references/trigger aos roles de API; a RLS já nega (sem policy de escrita), mas o
-- REVOKE explícito fecha o modelo "zero grant de escrita" no nível do privilégio.
revoke insert, update, delete, truncate, references, trigger
  on public.conquistas from anon, authenticated;

-- RPC registrar_conquistas_temporada — writer AUTORITATIVO da temporada. Deriva em
-- SQL, de dados JÁ CONGELADOS por confirmarFluxoTemporada, os troféus estruturais
-- (campeão/vice de liga-anual, promovido, rebaixado) e o artilheiro (match_goals);
-- os prêmios das divisões coroadas por chave (liga-split via grande final +
-- grupos_mata_mata) e os destaques (melhor ataque/defesa/sequência) vêm do payload
-- p_premios, validados (guardas de tipo + UUID + pertencimento + dedup). Idempotente
-- (delete-then-insert do escopo). Aceita a season 'em_fluxo' (premiação ANTES do
-- flip para 'encerrada') ou 'encerrada' (re-execução idempotente).
create or replace function public.registrar_conquistas_temporada(
  p_season_id uuid,
  p_premios jsonb default '[]'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_comp   uuid;
  v_nome   text;
  v_numero integer;
  v_rotulo text;
  v_count  integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  -- Posse (dono da liga) + estado (em fechamento ou já encerrada).
  select s.competition_id, c.nome, s.numero
    into v_comp, v_nome, v_numero
    from public.league_seasons s
    join public.league_competitions c on c.id = s.competition_id
   where s.id = p_season_id
     and c.created_by = v_uid
     and s.status in ('em_fluxo', 'encerrada');
  if v_comp is null then
    raise exception 'TEMPORADA_INVALIDA';
  end if;

  v_rotulo := v_nome || ' — Temporada ' || v_numero::text;

  -- Idempotência: reescreve a FOTO inteira desta temporada.
  delete from public.conquistas where escopo = 'temporada' and ref_id = p_season_id;

  -- (a) Campeão (pos 1) / Vice (pos 2) — SÓ em divisão liga de ciclo ANUAL, onde o
  --     campeão É o líder da tabela (posicao_final 1). EXCLUI split
  --     (tournament_id_clausura not null): em apertura_clausura o campeão da
  --     divisão é o VENCEDOR DA GRANDE FINAL, nunca o líder da combinada — vem pelo
  --     payload (bloco d). grupos_mata_mata também é coroado por chave → payload.
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_texto)
  select e.competitor_id,
         case e.posicao_final when 1 then 'campeao' when 2 then 'vice' end,
         'temporada', p_season_id, v_rotulo, ds.nivel, ds.nome
    from public.league_division_entries e
    join public.league_division_seasons ds on ds.id = e.division_season_id
   where ds.season_id = p_season_id
     and ds.formato = 'liga'
     and ds.tournament_id_clausura is null
     and e.posicao_final in (1, 2);

  -- (b) Promovido ('sobe') / Rebaixado ('cai') — de entries.destino (todo formato).
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_texto)
  select e.competitor_id,
         case e.destino when 'sobe' then 'promovido' when 'cai' then 'rebaixado' end,
         'temporada', p_season_id, v_rotulo, ds.nivel, ds.nome
    from public.league_division_entries e
    join public.league_division_seasons ds on ds.id = e.division_season_id
   where ds.season_id = p_season_id
     and e.destino in ('sobe', 'cai');

  -- (c) Artilheiro por divisão — de match_goals (autoritativo). Um por divisão: o
  --     par (competidor, nome normalizado) com mais gols nos torneios da divisão
  --     (apertura + clausura + grande final, quando existirem).
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_num, jogador)
  select r.competitor_id, 'artilheiro', 'temporada', p_season_id, v_rotulo,
         r.nivel, r.gols, r.jogador
    from (
      select ds.nivel,
             s.competitor_id,
             min(g.jogador) as jogador,
             sum(g.gols)    as gols,
             row_number() over (
               partition by ds.nivel
               order by sum(g.gols) desc, lower(btrim(min(g.jogador)))
             ) as rn
        from public.league_division_seasons ds
        join public.matches m
          on m.tournament_id in (ds.tournament_id, ds.tournament_id_clausura, ds.final_tournament_id)
        join public.match_goals g on g.match_id = m.id
        join public.tournament_slots s
          on s.id = case g.lado when 1 then m.vaga_1 else m.vaga_2 end
       where ds.season_id = p_season_id
         and s.competitor_id is not null
       group by ds.nivel, s.competitor_id, lower(btrim(g.jogador))
    ) r
   where r.rn = 1;

  -- (d) Prêmios do servidor (payload): campeão/vice das divisões coroadas por
  --     chave (liga-SPLIT via grande final + grupos_mata_mata) + melhor
  --     ataque/defesa/sequência. Guardas de tipo antes dos casts (num-guard em
  --     nivel/valor_num; UUID-guard em competitor_id) — linha malformada é
  --     IGNORADA, jamais lança 22P02 nem aborta a RPC. `distinct on (competitor_id,
  --     tipo)` DEDUPLICA o payload antes do insert: dois prêmios do mesmo
  --     (competidor, tipo) NÃO podem disparar cardinality_violation (21000) no
  --     `on conflict` — mantém a invariante "malformado é ignorado, nunca aborta".
  --     Só grava para competidor que PERTENCE à temporada.
  insert into public.conquistas
    (competitor_id, tipo, escopo, ref_id, ref_rotulo, nivel, valor_texto, valor_num)
  select y.competitor_id::uuid, y.tipo, 'temporada', p_season_id, v_rotulo,
         y.nivel, y.valor_texto, y.valor_num
    from (
      select distinct on (x.competitor_id, x.tipo)
             x.competitor_id, x.tipo, x.nivel, x.valor_texto, x.valor_num
        from (
          select d->>'competitor_id' as competitor_id,
                 d->>'tipo'          as tipo,
                 case when jsonb_typeof(d->'nivel')     = 'number' then (d->>'nivel')::smallint end   as nivel,
                 case when jsonb_typeof(d->'valor_texto') = 'string' then d->>'valor_texto' end        as valor_texto,
                 case when jsonb_typeof(d->'valor_num') = 'number' then (d->>'valor_num')::int end     as valor_num
            from jsonb_array_elements(coalesce(p_premios, '[]'::jsonb)) d
           where jsonb_typeof(d->'competitor_id') = 'string'
             and d->>'competitor_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
             and jsonb_typeof(d->'tipo') = 'string'
             and (d->>'tipo') in ('campeao', 'vice', 'melhor_ataque', 'melhor_defesa', 'melhor_sequencia')
        ) x
       where exists (
         select 1
           from public.league_division_entries e
           join public.league_division_seasons ds on ds.id = e.division_season_id
          where ds.season_id = p_season_id
            and e.competitor_id = x.competitor_id::uuid
       )
       order by x.competitor_id, x.tipo, x.valor_num desc nulls last
    ) y
  on conflict (escopo, ref_id, competitor_id, tipo) do update
    set valor_texto = excluded.valor_texto,
        valor_num   = excluded.valor_num,
        nivel       = excluded.nivel,
        ref_rotulo  = excluded.ref_rotulo;

  select count(*) into v_count from public.conquistas
   where escopo = 'temporada' and ref_id = p_season_id;
  return v_count;
end;
$$;

revoke execute on function public.registrar_conquistas_temporada(uuid, jsonb) from public, anon;
grant  execute on function public.registrar_conquistas_temporada(uuid, jsonb) to authenticated;

-- =====================================================================
-- Fim — CONQUISTAS / HALL DA FAMA
-- =====================================================================
