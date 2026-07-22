## Context

A copa (change `add-copas-continentais`) deriva cada vaga da **classificação final** de uma origem
via RPCs DEFINER gated. As duas origens atuais (`divisao`, `copa`) exigem uma temporada/edição
`encerrada` (ativação diferida). O dono quer uma copa com **todos** os 40 clubes da pirâmide **em
disputa** — sem encerrar. Esta change adiciona uma **terceira origem** que lê a temporada corrente e
resolve o técnico vivo pelo slot, e uma **visão consolidada** de copas na página da pirâmide.

Achados verificados que ancoram o desenho:

- `league_competitors.holder_user_id` (`schema.sql:2168`) é **vestigial**: 80 competidores, 0 com
  holder. A criação seta `null` (`leaguePyramid.ts:245-260`) e nada nunca escreve. Logo a herança de
  técnico da copa clássica (`montar_copa`, `schema.sql:4693`) hoje **sempre resolve NULL**.
- O técnico vivo está no **slot**: `league_division_entries.slot_id → tournament_slots.user_id`.
  Nesta pirâmide, Série A = 20/20 com técnico; Série B = 5/20 (15 órfãos — que entram assim mesmo).
- `league_competitors.competition_id` (`schema.sql:2165`) é `NOT NULL` — dá o vínculo direto
  competidor → pirâmide, base do lookup do técnico atual.
- Temporada corrente = a de maior `numero` (`getCompetitions.ts:57-60`). Seeding determinístico sem
  classificação = `order by created_at, id` (espelha `montar_temporada`, `schema.sql:2407`).
- `derivarPool` expande cada regra em `posicao_fim - posicao_inicio + 1` vagas
  (`derivacao.ts:239-247`). **Não** modelar "todos" como faixa gigante (`posicao_fim=9999`) — geraria
  milhares de lacunas. Ramo dedicado: consumir a lista inteira.
- Vínculo copa→pirâmide já consultável por `origem_competition_id` (`getCup.ts:145`) ⇒ visão
  consolidada é ZERO-DDL.

## Goals / Non-Goals

**Goals**: origem `divisao_todos` (divisão inteira, temporada corrente, sem faixa, sem encerramento);
técnico dinâmico resolvido do slot; clube órfão incluído; formato grupos+mata reusado; visão
consolidada de copas na pirâmide; zero regressão no caminho clássico (`divisao`/`copa`) e na pirâmide.

**Non-Goals**: corrigir o `holder_user_id` vestigial (dívida registrada, fora de escopo); "pirâmide
inteira num clique" (o dono escolheu por divisão); qualquer alteração no motor de formato ou no fluxo
de montar/iniciar/encerrar além da semeadura do técnico.

## Decisão 1 — Modelar "todos" como valor de enum, não como faixa nem flag

Alternativas consideradas:

- **(rejeitada) Sentinela de posição** (`posicao_fim = 9999`): viola a semântica da faixa e explode
  o `derivarPool` em ~10⁴ vagas vazias; ainda precisaria de um ramo pra não gerar lacunas.
- **(rejeitada) Flag booleana `origem_todos`**: cria um segundo eixo de verdade paralelo ao
  `origem_tipo`, obrigando toda checagem a testar dois campos.
- **(escolhida) Novo valor `divisao_todos` em `cup_origin_type`**: um único eixo de tipo; a CHECK de
  XOR de origem ganha um ramo; a faixa vira opcional (NULL) para esse tipo. Mudança mínima e
  autoexplicativa. É a recomendação do briefing.

Consequência no motor: `chaveDaOrigem` ganha uma chave **distinta** (`todos:comp:nivel`) — mesmo que
uma regra `divisao` e uma `divisao_todos` apontem para a mesma `competition+nivel`, as **leituras
vêm de RPCs diferentes** (`classificacao_final_divisao` vs `inscritos_divisao`); compartilhar o cache
`div:…` serviria a lista errada. O dedup global por identidade continua evitando duplicar um clube
entre regras.

## Decisão 2 — Técnico dinâmico: resolver na DERIVAÇÃO, gravando em `cup_entries.tecnico_user_id`

O técnico vivo tem que sair do **slot**, não do holder. A pergunta é **onde** o `tournament_slots.user_id`
da copa recebe esse valor. Duas saídas:

- **(a — escolhida) Resolver na derivação e gravar em coluna nova `cup_entries.tecnico_user_id`.** A
  RPC `inscritos_divisao` já faz o join até o slot; devolve `tecnico_user_id` junto com o competidor.
  `derivarVagasCopa` grava no preview. `montar_copa` semeia com
  `coalesce(cup_entries.tecnico_user_id, league_competitors.holder_user_id)`.
- **(b — rejeitada) Resolver dentro de `montar_copa`**, relendo o slot da divisão corrente por
  competidor, gated por `origem_tipo = 'divisao_todos'`.

**Por que (a):** o **conjunto de clubes** de uma edição já é snapshotado na derivação — `montar_copa`
apenas **semeia** as `cup_entries` existentes, não adiciona participantes. Um clube que entra na
divisão depois da derivação só aparece **re-derivando**. Resolver o técnico no mesmo instante
(derivação) mantém **um único momento de snapshot** (clube + técnico juntos, coerentes); resolver o
técnico em `montar_copa` misturaria dois instantes (clube na derivação, técnico na montagem) sem
ganho real de dinamismo, já que o clube não é re-resolvido lá. "Cada edição repega os técnicos
atuais" é satisfeito porque a derivação roda por edição e é re-executável. Além disso (a) mantém
`montar_copa` praticamente intocado (um `coalesce`), enquanto (b) exigiria reordenar os ramos do laço
de slots e um lookup de `origem_tipo` dentro do laço — mais invasivo ao caminho crítico clássico.

**Não-regressão do clássico:** para entries `divisao`/`copa`/manual, `inscritos_divisao` não roda e
`tecnico_user_id` fica NULL → o `coalesce` cai no `holder_user_id` de sempre (que é NULL) → mesmo
comportamento de hoje. O dedup `slots_um_clube_por_tecnico` de `montar_copa` (`v_holders_usados`)
continua valendo: o técnico dinâmico entra no mesmo mecanismo de "2ª vaga do mesmo técnico sem
user_id".

**Clube órfão:** `inscritos_divisao` faz LEFT JOIN ao slot; sem técnico, `tecnico_user_id = NULL`. A
entry é criada (o clube entra na copa), só sem técnico no slot. Nenhum tratamento especial.

## Decisão 3 — `inscritos_divisao` é DEFINER e replica o gate de consentimento

Espelha `classificacao_final_divisao` (mesmo motivo: não depender da RLS row-level, que esconderia
pirâmide de terceiro e produziria pool silenciosamente incompleto), com o **gate**
`is_public OR created_by = auth.uid()` (senão `ORIGEM_INVISIVEL`). Diferenças: sem
`ORIGEM_NAO_ENCERRADA` (lê a corrente), sem filtro `posicao_final`, `posicao_final := rank` (usado só
no texto de descrição), e devolve `tecnico_user_id` do slot. `security definer` +
`set search_path = ''` (lição das 22 DEFINER). Como criamos via `create` limpo, os grants
(`revoke ... from public, anon; grant ... to authenticated`) são emitidos logo abaixo; e o **DROP +
CREATE de `montar_copa`** re-emite os grants dele (senão o EXECUTE público volta).

## Decisão 4 — Visão consolidada é ZERO-DDL (leitura + UI)

Novo fetcher que, a partir de `origem_competition_id = <id da pirâmide>` nas
`cup_qualification_rules` (tipos `divisao` e `divisao_todos`), lista as `cup_competitions` distintas,
respeitando a RLS/visibilidade (`is_public OR created_by = auth.uid()`) — a mesma que já filtra
`getCup`. Sem tabela nem coluna nova. Seção "Copas" na página da pirâmide seguindo o padrão das
outras seções (mobile-first 44px, `text-base`, sem `shrink-0` esmagando).

## SQL proposto (NÃO aplicar nesta etapa — só desenho; espelhar em `supabase/schema.sql` na implementação)

```sql
-- 1) Novo valor de enum ------------------------------------------------------
-- ADD VALUE é idempotente-friendly com o guard; roda FORA de transação em PG.
do $$
begin
  if not exists (
    select 1 from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typname = 'cup_origin_type' and e.enumlabel = 'divisao_todos'
  ) then
    alter type public.cup_origin_type add value 'divisao_todos';
  end if;
end$$;

-- 2) Regra: faixa vira opcional p/ divisao_todos -----------------------------
alter table public.cup_qualification_rules
  alter column posicao_inicio drop not null,
  alter column posicao_fim    drop not null;

-- XOR de origem: divisao_todos usa competition_id + nivel (como divisao), cup null.
alter table public.cup_qualification_rules
  drop constraint if exists cup_qualification_rules_origem_xor;
alter table public.cup_qualification_rules
  add constraint cup_qualification_rules_origem_xor check (
    (origem_tipo in ('divisao', 'divisao_todos')
       and origem_competition_id is not null and origem_nivel is not null
       and origem_cup_id is null)
    or (origem_tipo = 'copa'
       and origem_cup_id is not null
       and origem_competition_id is null and origem_nivel is null)
  );

-- Faixa: obrigatória e válida p/ divisao/copa; NULA p/ divisao_todos (sem posição).
alter table public.cup_qualification_rules
  drop constraint if exists cup_qualification_rules_faixa_valida;
alter table public.cup_qualification_rules
  add constraint cup_qualification_rules_faixa_valida check (
    case
      when origem_tipo = 'divisao_todos'
        then posicao_inicio is null and posicao_fim is null
      else posicao_inicio is not null and posicao_fim is not null
           and posicao_inicio >= 1 and posicao_fim >= posicao_inicio
    end
  );

-- 3) cup_entries.tecnico_user_id (técnico vivo do slot, resolvido na derivação) --
-- NULL para clube órfão e para origem clássica/por-nome/manual. ON DELETE SET NULL:
-- apagar o usuário não apaga a entry já derivada.
alter table public.cup_entries
  add column if not exists tecnico_user_id uuid
    references public.users (id) on delete set null;

-- 4) RPC inscritos_divisao (DEFINER, leitura gated) --------------------------
-- Clone de classificacao_final_divisao SEM gate de encerramento e SEM posicao_final:
-- lê a temporada CORRENTE (maior numero) e devolve TODOS os competidores da divisao,
-- com o tecnico resolvido do SLOT (LEFT JOIN — orfao => tecnico_user_id NULL) e rank
-- deterministico por (created_at, id). Mantem o gate de consentimento.
create or replace function public.inscritos_divisao(
  p_competition_id uuid,
  p_nivel          integer
)
returns table (
  team_id          uuid,
  rotulo           text,
  posicao_final    integer,
  rank             integer,
  origem_season_id uuid,
  competitor_id    uuid,
  tecnico_user_id  uuid
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
  -- (1) Gate de consentimento: pirâmide pública OU do próprio dono da copa.
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

  -- (2) Temporada EM DISPUTA = maior numero com status <> 'rascunho'. NÃO exige
  --     'encerrada' (a diferença central desta origem), mas EXCLUI a rascunho:
  --     montarProximaTemporada (leaguePyramid.ts:2008-2040) cria a N+1 rascunho de
  --     MAIOR numero ao avançar a pirâmide, com slots frescos (user_id NULL). Sem
  --     este filtro a RPC leria a rascunho vazia e zeraria todos os técnicos ao
  --     re-derivar (achado MEDIUM da revisão). Sem temporada em disputa ⇒
  --     NIVEL_INEXISTENTE cobre ao não achar divisão.
  select ls.id into v_season
    from public.league_seasons ls
   where ls.competition_id = p_competition_id
     and ls.status <> 'rascunho'
   order by ls.numero desc
   limit 1;

  -- (3) Divisão do nível pedido na temporada corrente.
  select lds.id into v_div
    from public.league_division_seasons lds
   where lds.season_id = v_season
     and lds.nivel = p_nivel;

  if v_div is null then
    raise exception 'NIVEL_INEXISTENTE';
  end if;

  -- Todos os competidores da divisão corrente, rank determinístico por
  -- (created_at, id) do competidor (sem classificação), técnico do slot (LEFT JOIN
  -- — clube órfão entra com tecnico_user_id NULL). posicao_final := rank (só texto).
  return query
    with base as (
      select lcomp.team_id,
             lcomp.rotulo,
             lcomp.id            as competitor_id,
             ts.user_id          as tecnico_user_id,
             row_number() over (
               order by lcomp.created_at asc, lcomp.id asc
             )::integer          as rank
        from public.league_division_entries lde
        join public.league_competitors lcomp on lcomp.id = lde.competitor_id
        left join public.tournament_slots ts on ts.id = lde.slot_id
       where lde.division_season_id = v_div
    )
    select b.team_id,
           b.rotulo,
           b.rank             as posicao_final,
           b.rank,
           v_season           as origem_season_id,
           b.competitor_id,
           b.tecnico_user_id
      from base b
     order by b.rank asc;
end;
$$;

revoke execute on function public.inscritos_divisao(uuid, integer) from public, anon;
grant  execute on function public.inscritos_divisao(uuid, integer) to authenticated;

-- 5) montar_copa: técnico dinâmico via coalesce (caminho clássico intocado) ----
-- Alteração pontual do laço de slots para entries POR-CLUBE: preferir o técnico
-- resolvido na derivação (cup_entries.tecnico_user_id) e cair no holder clássico
-- (vestigial/NULL) quando ausente. O restante da função (autorização, advisory
-- lock, geometria, sentinela, dedup v_holders_usados) permanece idêntico. Como a
-- alteração é via CREATE OR REPLACE, os grants seguem válidos; se a implementação
-- optar por DROP+CREATE, RE-EMITIR:
--   revoke execute on function public.montar_copa(uuid, uuid[]) from public, anon;
--   grant  execute on function public.montar_copa(uuid, uuid[]) to authenticated;
--
-- Trecho relevante do ramo `elsif v_entry.competitor_id is not null then` (o SELECT
-- de v_entry passa a trazer ce.tecnico_user_id):
--
--   v_holder := coalesce(
--     v_entry.tecnico_user_id,                          -- técnico vivo do slot (todos)
--     (select lc.holder_user_id                         -- holder clássico (vestigial/NULL)
--        from public.league_competitors lc
--       where lc.id = v_entry.competitor_id)
--   );
--   if v_holder is not null and not (v_holder = any (v_holders_usados)) then
--     v_user_id := v_holder;
--     v_holders_usados := array_append(v_holders_usados, v_holder);
--   else
--     v_user_id := null;
--   end if;
```

## Risks / Trade-offs

- **`ALTER TYPE ... ADD VALUE` fora de transação**: em PG o novo valor de enum não pode ser usado na
  mesma transação em que é criado. Aplicar o passo (1) isolado, antes dos demais. Mitigação: passo
  separado no `apply_migration`.
- **Cache de origem no motor** (`chaveDaOrigem`): a chave `todos:…` distinta de `div:…` é
  **load-bearing** — sem ela, uma leitura clássica poderia servir a origem "todos" (ou vice-versa).
  Teste dedicado.
- **Snapshot na derivação**: técnico (e clube) refletem o instante da derivação. Documentar na UI:
  "re-derive para atualizar técnicos/inscritos". É a mesma semântica já existente do conjunto de
  clubes.
- **Grants pós-DDL**: qualquer DROP re-abre EXECUTE público (lição do hardening). O SQL re-emite os
  grants de `inscritos_divisao`; a implementação de `montar_copa` re-emite se usar DROP.
- **Dívida vestigial**: `holder_user_id` continua sem writer. Fora de escopo, mas registrado — a
  herança clássica de técnico segue NULL até uma change futura popular o holder.

## Migration Plan

1. Passo (1) do SQL isolado (`ALTER TYPE ADD VALUE`), fora de transação.
2. Passos (2)–(5) numa transação: colunas/CHECKs, `cup_entries.tecnico_user_id`, RPC, `montar_copa`.
3. Espelhar tudo em `supabase/schema.sql`; regenerar/atualizar `database.types.ts` à mão (enum novo +
   returns de `inscritos_divisao` + coluna nova). Aplicar no LOCAL via psql.
4. `get_advisors` (0 ERROR). Nenhuma migração de dados (só schema).
