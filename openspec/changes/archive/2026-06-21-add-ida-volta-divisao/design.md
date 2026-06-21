# Design — ida-e-volta por divisão na pirâmide

## Contexto

- `previaLiga(n, idaEVolta)` (`src/features/league/gerarTabelaLiga.ts:103`) já é a fonte única da matemática: `C(n,2)·turnos` partidas, `(n−1 ou n)·turnos` rodadas. `gerarTabelaLiga` já gera o returno quando `idaEVolta=true`. **Nenhum motor muda.**
- `tournaments.ida_e_volta` já existe (`supabase/schema.sql:81`) e é o que `iniciarTorneio`/`gerarTabelaLiga` consomem (`iniciarTorneio` lê em `src/actions/tournaments.ts:380`).
- A config por-divisão já vive em `league_division_seasons` (`formato`, `por_nome`, `desempate`, `qtd_grupos`, cores). É o lugar natural para o turno.
- `montar_temporada` (RPC SECURITY DEFINER, `schema.sql:2074`) é o ÚNICO caminho que cria os torneios das divisões; é **idempotente** via sentinela `tournament_id` — não recria um torneio já existente.

## Decisões

### D1 — Fonte de verdade: `league_division_seasons.ida_e_volta`
Coluna nova `ida_e_volta boolean not null default false`. A division-season é a fonte de verdade (sobrevive às temporadas, alimenta N+1 e remontagens); `tournaments.ida_e_volta` é a **cópia materializada** que o motor lê, gravada na montagem. Default `false` = sem regressão.

### D2 — Escopo: só `formato='liga'`; normalização server-side
O toggle só aparece/vale quando a divisão é liga. Divisões `grupos_mata_mata` ficam fora — ali `ida_e_volta` significaria turno duplo DENTRO de cada grupo (semântica diferente, conversa de produto separada). **Mecanismo da normalização** (decisão explícita, evita redundância):
- `divisaoSchema`: `idaEVolta: z.boolean().default(false)` — SEM rejeição condicional (diferente de `qtdGrupos`, que o schema rejeita em liga; aqui um booleano default-false é inofensivo).
- A normalização liga-only vive na **action e no wizard** (`div.formato==='liga' ? div.idaEVolta : false`), consistente com como `qtdGrupos`/`classificadosPorGrupo` já são zerados no payload do wizard (`LeagueWizard.tsx:795`).
- Isso espelha o backstop **`SPLIT_SO_LIGA`** (`schema.sql:2133`), NÃO o `createTournament` (que aceita `ida_e_volta=true` em todos os formatos gerados — `tournaments.ts:129`).

### D3 — Split Apertura/Clausura herda o mesmo turno
Os DOIS torneios da divisão (Apertura e Clausura) herdam o `ida_e_volta` da divisão. O split é "liga só"; ambos os meio-anos são a mesma liga. A **Grande Final** (`final_tournament_id`, `schema.sql:1806`) é `mata_mata`, NÃO liga — **não é tocada** por nada desta change.

### D4 — Persistência plurianual (corrige bug latente de `.select` string)
`montarProximaTemporada` copia `ida_e_volta` ao inserir as `league_division_seasons` da N+1. **Atenção (Major do gate):** o `.select()` que lê as divisões da temporada anterior (`leaguePyramid.ts:1907`) NÃO inclui `ida_e_volta` hoje — incluir só no `insert` faria `geo.ida_e_volta` ser sempre `undefined` → toda divisão N+1 cairia silenciosamente para `false` (não pego por typecheck, pois `.select` é string; mesma classe dos bugs já comentados sobre `ranking_base`/cores). Logo é OBRIGATÓRIO adicionar `ida_e_volta` ao `.select` de `:1907` **E** ao insert.

### D5 — Correção do rascunho existente: RPC `SECURITY DEFINER` transacional
Como a montagem é idempotente (a divisão já tem `tournament_id`), re-montar NÃO reescreve o torneio. Para destravar a Série A já montada, atua-se direto — mas via **uma RPC transacional**, NÃO via dual-write PostgREST (que não é transacional cross-tabela; falha parcial deixaria `division_season` e `tournament` divergentes — exatamente o que esta decisão evita). Espelha o padrão de `montar_temporada`/`montar_playoff`.

**RPC `atualizar_ida_e_volta_divisao(p_division_season_id uuid, p_ida_e_volta boolean)`** (SECURITY DEFINER):
- **Auth**: `pode_gerir_competition(competition_id)` via join `league_division_seasons → league_seasons → league_competitions` (NÃO `created_by` — `league_division_seasons` nem tem essa coluna; herança de admin de liga precisa de capacidade). Senão `raise 'NAO_AUTORIZADO'`.
- **Guards** (recusa, sem escrita):
  - divisão é `formato='liga'` (senão `FORMATO_INVALIDO`);
  - o(s) torneio(s) vinculado(s) estão em `status='rascunho'` (senão `JA_INICIADA`);
  - **sem rodadas geradas**: `not exists (select 1 from matches where tournament_id = any(...) and rodada is not null)` (senão `JA_TEM_RODADAS`). Status `rascunho` sozinho NÃO basta — `iniciarTorneio` tem caminho de recuperação onde `matches` com `rodada` já existem mas o torneio segue `rascunho` (`tournaments.ts:337-342`).
- **Escrita (uma transação)**: `update league_division_seasons.ida_e_volta`; `update tournaments.ida_e_volta` para `tournament_id` e, se não-nulo, `tournament_id_clausura` (null-safe em montagem parcial). `final_tournament_id` NÃO é tocado (mata_mata).
- `revoke execute from public, anon; grant execute to authenticated`.

**Action `atualizarIdaEVoltaDivisao`** (TS, thin): valida input (Zod), chama a RPC, mapeia as exceções-código para mensagens pt-BR (espelha `mensagemDaMontagem`), `revalidatePath` da liga e do torneio. A RLS de UPDATE serve de backstop nas tabelas (mas a RPC é DEFINER e a auth real é o `pode_gerir_competition` interno).

### D6 — Camada de leitura `getSeason` (Blocker do gate)
O card da divisão (onde o controle de correção mora) é renderizado por `ligas/[id]/page.tsx:486`, alimentado por `getSeason` (`src/features/league/data/getSeason.ts`). Hoje o SELECT (`:141`) NÃO traz `formato`, `ida_e_volta` nem o `status` do Apertura — sem eles o toggle não consegue ser liga-only, refletir o valor atual, nem desabilitar quando já iniciada. OBRIGATÓRIO:
- Estender o embed `league_division_seasons` do SELECT com `formato, ida_e_volta` e o status do Apertura: `apertura:tournaments!league_division_seasons_tournament_id_fkey ( status )` (padrão já usado em `leaguePyramid.ts:481`).
- Tipos: `DivisaoEmbed` (`:72`) +`formato`/`ida_e_volta`/`apertura`; `DivisaoTemporada` (`:18`) +`formato`/`idaEVolta`/`iniciada` (= `apertura?.status` existe e ≠ `rascunho`); o `.map` (`:204-218`) preenche os novos campos.

### D7 — UI
- **Wizard**: `DivisaoRascunho` (`LeagueWizard.tsx:73`) +`idaEVolta: boolean` (default `false` no rascunho inicial e presets). Toggle "Ida e volta (dois turnos)" no card da divisão, SÓ quando `formato==='liga'`; ao virar `grupos_mata_mata`, zera `idaEVolta`. Serialização no payload (`:795`): `d.formato==='liga' ? d.idaEVolta : false`.
- **Divisão em rascunho** (correção): controle (toggle) no card da divisão em `ligas/[id]/page.tsx:486`, perto do "Iniciar divisão"; desabilitado com tooltip quando `iniciada` (status do Apertura ≠ rascunho). Mostra a prévia de contagem via `previaLiga(tamanho, idaEVolta)` (190→380) ao lado do toggle — hoje o wizard/página da liga NÃO exibem essa contagem (só o `IniciarTorneioPanel` pós-montagem, por-torneio); adicioná-la aqui ataca diretamente a confusão de contagem do dono. Tratar o layout do split (o card já tem "Abrir Apertura/Clausura").

## Pontos de mudança (mapa)

| Camada | Arquivo | Mudança |
|---|---|---|
| DDL | `supabase/schema.sql` + `migration.sql` | +coluna `league_division_seasons.ida_e_volta`; `montar_temporada` (SELECT do cursor `v_div` + 2 inserts de `tournaments`); **nova RPC** `atualizar_ida_e_volta_divisao` |
| Schema | `src/schema/leaguePyramidSchema.ts` | `divisaoSchema` +`idaEVolta` (`z.boolean().default(false)`, sem rejeição) |
| Action criar | `src/actions/leaguePyramid.ts` `createCompetition` | insert da divisão inclui `ida_e_volta` (normalizado liga-only) |
| Action N+1 | `src/actions/leaguePyramid.ts` `montarProximaTemporada` | `ida_e_volta` no `.select` (`:1907`) **e** no insert (`geo?.ida_e_volta ?? false`) |
| Action editar | `src/actions/leaguePyramid.ts` (nova) | `atualizarIdaEVoltaDivisao` (thin sobre a RPC; mapeia exceções) |
| Leitura | `src/features/league/data/getSeason.ts` | SELECT +`formato`/`ida_e_volta`/status Apertura; tipos `DivisaoEmbed`/`DivisaoTemporada`; map |
| Wizard | `src/features/league/components/LeagueWizard.tsx` | `DivisaoRascunho.idaEVolta`, toggle liga-only, serialização |
| UI divisão | `src/app/dashboard/ligas/[id]/page.tsx` + componente do card | controle de correção em rascunho + prévia `previaLiga` |
| Tipos | `src/lib/supabase/database.types.ts` | +coluna `ida_e_volta` em `league_division_seasons` (Row/Insert/Update) |

## Edge cases

- `grupos_mata_mata`: toggle ausente; servidor força `false`.
- Split: ambos os torneios herdam; `final_tournament_id` (mata_mata) intocado.
- Editar após iniciar / com rodadas: bloqueado (RPC: status + sonda `matches.rodada`; UI: desabilita por `iniciada`).
- N+1: herda o turno da temporada anterior (via `.select` corrigido).
- Pirâmide N=1 (liga multi-temporada): também recebe o toggle.
- Concorrência: a correção atua pós-montagem, pré-início; a RPC é transacional. `tournament_id_clausura` null (montagem parcial) é tratado.
- Cross-tenant: passar `divisionSeasonId` de pirâmide alheia → `pode_gerir_competition` falha → `NAO_AUTORIZADO`.

## Testes

- `previaLiga`/`gerarTabelaLiga`: já cobrem a matemática e o returno (sem mudança).
- `leaguePyramidSchema`: `idaEVolta` default false.
- `createCompetition`: grava `ida_e_volta` por divisão (liga true/false; grupos forçado false).
- `montarProximaTemporada`: copia `ida_e_volta` na N+1 (herda `true`) — guarda contra o bug do `.select`.
- `atualizarIdaEVoltaDivisao` (action): liga/desliga; mapeia exceções; rejeita não-autorizado (cross-tenant), `JA_INICIADA`, `JA_TEM_RODADAS`, `FORMATO_INVALIDO`.
- Wizard: toggle só em liga; payload correto.
- **Só validação ao vivo** (consistente com o padrão do projeto p/ RPC SQL): `montar_temporada` materializando `ida_e_volta`; a RPC `atualizar_ida_e_volta_divisao` ponta-a-ponta (incl. split e sonda de matches).
