## 1. Banco de dados (DDL)

- [x] 1.1 `alter table public.league_division_seasons add column if not exists ida_e_volta boolean not null default false`
- [x] 1.2 Recriar `montar_temporada(p_season_id uuid)`: adicionar `ida_e_volta` ao SELECT do cursor `v_div`; gravar `ida_e_volta => v_div.ida_e_volta` nos DOIS inserts de `tournaments` (Apertura e Clausura). Sem mudar autorização/idempotência/locks.
- [x] 1.3 Nova RPC `atualizar_ida_e_volta_divisao(p_division_season_id uuid, p_ida_e_volta boolean)` SECURITY DEFINER: auth `pode_gerir_competition` (join season→competition), guards `FORMATO_INVALIDO` (não-liga), `JA_INICIADA` (algum torneio não-rascunho), `JA_TEM_RODADAS` (`exists matches where tournament_id = any(tournament_id,tournament_id_clausura) and rodada is not null`); escrita transacional de `league_division_seasons.ida_e_volta` + `tournaments.ida_e_volta` (tournament_id e, se não-nulo, tournament_id_clausura; `final_tournament_id` intocado). `revoke execute from public, anon; grant authenticated`.
- [x] 1.4 Compor o SQL completo, **mostrar no chat**, aplicar em PROD via MCP, rodar `get_advisors` (0 ERROR), espelhar em `supabase/schema.sql`, aplicar no LOCAL via psql.

## 2. Schema e tipos

- [x] 2.1 `divisaoSchema` (`src/schema/leaguePyramidSchema.ts`): `idaEVolta: z.boolean().default(false)` (sem rejeição condicional — normalização liga-only fica na action/wizard).
- [x] 2.2 `database.types.ts`: `league_division_seasons` Row/Insert/Update +`ida_e_volta: boolean`; tipos da nova RPC em `Functions`.

## 3. Criação da pirâmide

- [x] 3.1 `createCompetition` (`src/actions/leaguePyramid.ts`): insert da divisão inclui `ida_e_volta: div.formato === 'liga' ? div.idaEVolta : false`.
- [x] 3.2 `LeagueWizard.tsx`: `DivisaoRascunho` +`idaEVolta: boolean`; default `false` no rascunho inicial/presets; serializar no payload (`:795`) como `d.formato === 'liga' ? d.idaEVolta : false`.
- [x] 3.3 `LeagueWizard.tsx`: toggle "Ida e volta (dois turnos)" no card da divisão, só quando `formato==='liga'`; ao virar `grupos_mata_mata`, zera `idaEVolta`.

## 4. Próxima temporada (plurianual)

- [x] 4.1 `montarProximaTemporada` (`src/actions/leaguePyramid.ts`): adicionar `ida_e_volta` ao `.select()` das divisões da temporada anterior (`:1907`) **E** `ida_e_volta: geo?.ida_e_volta ?? false` no insert das `league_division_seasons` da N+1. (Sem o `.select`, cai silenciosamente para false — não pego por typecheck.)

## 5. Camada de leitura (getSeason)

- [x] 5.1 `getSeason.ts`: SELECT (`:141`) do embed `league_division_seasons` +`formato, ida_e_volta` e status do Apertura (`apertura:tournaments!league_division_seasons_tournament_id_fkey ( status )`); tipos `DivisaoEmbed` (`:72`) e `DivisaoTemporada` (`:18`) +`formato`/`idaEVolta`/`iniciada`; `.map` (`:204`) preenche (`iniciada = apertura?.status` existe e ≠ `rascunho`).

## 6. Correção do rascunho existente (action + UI)

- [x] 6.1 Action `atualizarIdaEVoltaDivisao(divisionSeasonId, idaEVolta)` (`src/actions/leaguePyramid.ts`): valida input, chama a RPC `atualizar_ida_e_volta_divisao`, mapeia exceções (NAO_AUTORIZADO/FORMATO_INVALIDO/JA_INICIADA/JA_TEM_RODADAS) para pt-BR, `revalidatePath` da liga e do torneio.
- [x] 6.2 UI: controle de ida-e-volta no card da divisão em rascunho (`ligas/[id]/page.tsx:486` + componente), desabilitado com tooltip quando `iniciada`; exibir prévia `previaLiga(tamanho, idaEVolta)` (190↔380) ao lado. Tratar layout do split.

## 7. Testes

- [x] 7.1 `leaguePyramidSchema`: `idaEVolta` default false.
- [x] 7.2 `createCompetition` normalização liga-only: travada de forma MAIS FORTE pelo CHECK do banco `league_division_seasons_ida_volta_so_liga` (grupos+true falha no INSERT, cobre qualquer remoção do ternário) + validada ao vivo (TEST5 FORMATO_INVALIDO, TEST6 CHECK). Teste unitário de cadeia (mock pesado) dispensado por redundância.
- [x] 7.3 `montarProximaTemporada`: copia `ida_e_volta` na N+1 (herda true) — guarda contra o bug do `.select`.
- [x] 7.4 `atualizarIdaEVoltaDivisao` (action): liga/desliga; mapeia cada exceção; rejeita cross-tenant (NAO_AUTORIZADO), JA_INICIADA, JA_TEM_RODADAS, FORMATO_INVALIDO.
- [x] 7.5 Wizard: toggle só em liga; payload correto.

## 8. Gates de qualidade

- [x] 8.1 `pnpm typecheck && pnpm lint && pnpm test && pnpm build` verdes.
- [x] 8.2 Revisão adversarial por workflow (correção + segurança + edge cases) sem `must_fix`.
- [x] 8.3 Validação ao vivo: ligar ida-e-volta na Série A em rascunho → prévia 380/38 → iniciar → conferir 380 partidas / 38 rodadas. Cobre a materialização SQL (`montar_temporada` + RPC) não coberta por testes unitários.

## 9. Arquivar

- [x] 9.1 `openspec archive add-ida-volta-divisao`; sugerir commit (pt-BR, sem coautoria de IA); push.
