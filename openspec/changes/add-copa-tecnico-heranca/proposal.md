## Why

A carreira do técnico (feature `add-perfil-tecnico-carreira`) cobre liga + mata-mata
DERIVADO de liga (playoff/barragem/grande final), porque esses `montar_*` gravam
`competitor_id` + técnico (`holder_user_id`) na vaga → o trigger de `coach_tenures`
gera a passagem. As COPAS ficam de fora: `montar_copa` grava a vaga com
`competitor_id`/`user_id` NULOS ("participante de copa não é league_competitor"),
então nenhuma tenure de copa existe e os jogos de copa não entram na carreira nem no
confronto entre técnicos.

O dono quer que os jogos de copa CONTEM para o técnico. O caminho é fazer a copa se
comportar como os outros torneios derivados: a vaga de copa que veio classificada de
uma DIVISÃO de liga herda o `league_competitor` (e o técnico dele) — e o trigger já
existente faz o resto. O elo existe no ponto de origem
(`classificacao_final_divisao` faz `join league_division_entries → league_competitors`)
mas é DESCARTADO antes de virar `cup_entry`; basta propagá-lo.

**Decisões de produto (travadas pelo dono):**
1. **Só herança de participante POR-CLUBE vindo da DIVISÃO de liga.** A herança vale
   apenas para a entrada por-CLUBE (`team_id` preenchido) classificada de uma divisão
   (com `competitor_id`). Ficam SEM técnico: entradas POR-NOME/rótulo (mesmo que o
   `league_competitor` de origem seja por-nome e tenha técnico — a regra é `team_id
   presente`, não "tem competitor"), classificadas de OUTRA COPA
   (`classificacao_final_copa` não expõe `competitor_id`) e MANUAIS. Seus jogos de
   copa não contam para ninguém. Sem UI de atribuição manual (YAGNI).
2. **Forward-only.** A herança vale para copas montadas DAQUI PRA FRENTE. Edições já
   montadas ficam inalteradas (sem backfill, sem mexer em dado existente).

## What Changes

- **`cup_entries` ganha `competitor_id`** (`uuid references league_competitors(id)
  on delete set null`, NULLABLE). É o elo que falta: a proveniência do participante
  quando ele veio de uma divisão de liga. NULL para por-nome/origem-copa/manual.
- **`classificacao_final_divisao` expõe `competitor_id`** no `returns table` (o valor
  já está no join interno `lde.competitor_id`/`lcomp.id`, só não era retornado).
  **ATENÇÃO (blocker):** adicionar coluna ao `returns table` é MUDANÇA DE TIPO DE
  RETORNO — `create or replace function` FALHA com `42P13`. O DDL SHALL ser **`drop
  function if exists public.classificacao_final_divisao(uuid, integer); create
  function ...`**, e como o DROP apaga os privilégios, SHALL **re-emitir logo depois
  `revoke execute on function ... from public, anon;` + `grant execute ... to
  authenticated;`** (senão a função `SECURITY DEFINER` volta a EXECUTE público,
  re-expondo a classificação da pirâmide ao anon). `classificacao_final_copa` NÃO
  muda (origem-copa segue sem `competitor_id`). Confirmar a assinatura exata dos
  args antes do DROP.
- **Derivação das entries propaga `competitor_id` só para POR-CLUBE de divisão.**
  `derivarVagasCopa`/`derivarPool` (motor `src/features/cup/derivacao.ts` + action
  `src/actions/cups.ts`) gravam `cup_entries.competitor_id` APENAS quando a entrada é
  por-CLUBE (`team_id` presente) vinda de origem-DIVISÃO (o `competitor_id` do
  resultado da RPC). Entrada por-NOME/rótulo, origem-copa e manual gravam
  `competitor_id` NULL — mesmo que a RPC devolva um `competitor_id` para um
  competidor de divisão por-nome (a regra é `team_id` presente).
- **`montar_copa` herda técnico como os `montar_*` derivados.** Para cada entry com
  `competitor_id NOT NULL`, resolve `league_competitors.holder_user_id` e grava
  `competitor_id` + `user_id` na vaga — REPLICANDO o padrão de
  `montar_playoff`/`montar_barragem`/`montar_grande_final`, INCLUSIVE a deduplicação
  `v_holders_usados` que degrada `user_id` para NULL quando o mesmo técnico já foi
  usado no torneio (respeita `slots_um_clube_por_tecnico`). O ramo POR-NOME/rótulo
  (`v_por_nome`) SHALL sempre gravar `competitor_id`/`user_id` NULOS — a herança vive
  só no ramo por-CLUBE. Entry sem `competitor_id` segue gravando
  `competitor_id`/`user_id` NULOS (comportamento atual).
- **O trigger de `coach_tenures` faz o resto (SEM mudança).** Com a vaga de copa
  carregando `competitor_id`, `fn_registrar_coach_tenure` passa a abrir a tenure de
  copa no INSERT do slot; `fn_resolver_season_divisao` retorna `(null,null)` para o
  torneio de copa (não há `league_division_seasons`) → tenure com `season_id`/
  `division_season_id` NULOS — **exatamente a mesma forma das tenures de
  playoff/barragem/grande final que já existem hoje**.
- **Censo de consumidores (a maioria JÁ trata `season_id` nulo, porque
  playoff/barragem/final já geram tenures assim).** A change AUDITA e garante cada
  consumidor:
  - `getTecnicoCampanha` (carreira) e `getConfrontoTecnicos` (H2H): passam a INCLUIR
    os jogos de copa — **é o objetivo**. Partida de copa mata-mata tem `rodada` via
    `posicao`/`perna` (ou grupos com `rodada`); a tenure de copa é totalmente aberta
    (sem troca) → `partidaNaJanela` credita mesmo com `rodada` nula (rede defensiva).
  - `getTecnicoProfile` ("Clubes comandados"): a contagem de temporadas JÁ guarda
    `if (t.season_id)` — tenure de copa (season nula) NÃO infla o total. Auditar o
    flag `vigente`: uma tenure de copa ABERTA não deve marcar o clube "· atual" de
    forma enganosa (filtrar `vigente` a tenures de temporada, `season_id NOT NULL`).
  - `getTecnicosDoCompetidor` (timeline do clube): JÁ lida com `season_id` nulo
    (grande final mapeada; playoff/barragem não). Garantir que a tenure de copa não
    polua a timeline por-temporada (mesmo tratamento das de playoff/barragem — não
    listar as `season_id` nulas não mapeáveis, ou rotular).
  - `getConquistasDoTecnico` (troféus herdados): cruza `(competitor_id, season_id)`;
    tenure de copa tem `season_id` nula → não casa nenhuma conquista → SEM troféu
    falso. Confirmar.
  - **Consumidores `competitor_id → slots → matches`** (`getCompetidorInsights`,
    `getConfrontoDireto`, `getArtilheirosDoCompetidor`, etc.): passam a incluir os
    jogos de copa daquele competidor — **mesmo efeito que playoff/barragem/final já
    têm hoje** (a vaga derivada compartilha o `competitor_id`). É comportamento
    DESEJADO (o registro do clube é completo) e BENIGNO; a change o documenta como
    intencional. As tabelas/classificações POR-TORNEIO (escopadas por `tournament_id`)
    NÃO mudam — a liga continua liga.
  - `registrar_conquistas_temporada` (hall da fama): escopada a uma season/divisão de
    liga; vaga de copa tem `season_id` nula → fora da materialização → SEM troféu de
    liga falso. Confirmar.
- **Tipos gerados** (`src/lib/supabase/database.types.ts`): `cup_entries` Row/Insert/
  Update com `competitor_id: string | null`; `classificacao_final_divisao` com
  `competitor_id` no retorno.

## Capabilities

### Modified Capabilities
- `cup-editions`: a montagem da edição de copa herda `competitor_id` + técnico
  (`holder_user_id`) da divisão de liga de origem, com a mesma dedup de técnico dos
  torneios derivados; participantes sem origem-divisão seguem sem técnico.
- `coach-history`: as tenures passam a incluir copas (via a vaga de copa com
  `competitor_id`); a carreira e o confronto do técnico incluem jogos de copa; o
  censo de consumidores de `coach_tenures`/`competitor_id` trata a tenure de copa
  (season nula) sem regressão.
- `data-model`: `cup_entries` ganha `competitor_id` (elo à proveniência de liga).

## Impact

- **Banco de dados (DDL — mostrado antes de aplicar, REGRA 4):** `supabase/schema.sql`
  (fonte de verdade) + `openspec/changes/add-copa-tecnico-heranca/ddl.sql`,
  idempotente: `cup_entries add column if not exists competitor_id` (+ índice
  parcial); **`drop function if exists classificacao_final_divisao(...)` + `create
  function`** (mudança de tipo de retorno impede `create or replace`) + re-emissão
  de `revoke ... from public, anon` e `grant ... to authenticated`; `create or
  replace function montar_copa` (herança + dedup). ZERO mudança de RLS (leitura de
  `cup_entries` inalterada). O trigger e `fn_resolver_season_divisao` NÃO mudam.
- **Código de aplicação:**
  - `src/features/cup/classificacaoFinalDivisao.ts` (ou o loader que consome a RPC) +
    `src/features/cup/derivacao.ts` (`derivarPool`) + `src/actions/cups.ts`
    (`derivarVagasCopa`): propagar `competitor_id` do resultado até o insert de
    `cup_entries`.
  - `src/lib/supabase/database.types.ts`: `cup_entries.competitor_id` + retorno da RPC.
  - Auditoria/ajuste PONTUAL dos consumidores do censo acima (provável toque só em
    `getTecnicoProfile` no flag `vigente` e talvez `getTecnicosDoCompetidor`; os
    demais já tratam `season_id` nulo por causa de playoff/barragem/final).
- **Segurança:** só leitura/derivação; nenhuma policy nova. `montar_copa` segue
  `SECURITY DEFINER` com o mesmo gate de autorização atual.
- **Dependências:** nenhuma nova.
- **Testes:**
  - **vitest (mock):** `derivarPool` grava `competitor_id` só na origem-divisão (null
    em copa/manual/por-nome); tipos; consumidores auditados (getTecnicoProfile não
    infla temporada nem marca vigente por copa; getTecnicoCampanha inclui jogo de
    copa creditado ao técnico).
  - **pgTAP REAL (`pnpm test:rls`, OBRIGATÓRIO):** as garantias vivem em plpgsql —
    `montar_copa` grava `competitor_id`+`user_id` na vaga de origem-divisão e NULOS na
    por-nome/manual; dedup de técnico (`slots_um_clube_por_tecnico`) degrada o 2º para
    NULL; o trigger abre a tenure de copa (season nula) para a vaga herdada e NÃO abre
    para a sem competitor_id; `classificacao_final_divisao` retorna `competitor_id`.
