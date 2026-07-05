## ADDED Requirements

### Requirement: Tabela de posse de vaga por técnico (coach_tenures)
A tabela `public.coach_tenures` SHALL registrar uma PASSAGEM de técnico por vaga
por linha, com as colunas: `id uuid pk default gen_random_uuid()`, `slot_id uuid
not null references tournament_slots(id) on delete cascade`, `competitor_id uuid
not null references league_competitors(id) on delete cascade`, `tournament_id uuid
not null references tournaments(id) on delete cascade`, `season_id uuid references
league_seasons(id) on delete cascade` (anulável — best-effort), `division_season_id
uuid references league_division_seasons(id) on delete cascade` (anulável),
`user_id uuid references users(id) on delete set null`, `nome text`, `rodada_inicio
smallint` (nulo = desde o início da temporada), `rodada_fim smallint` (rodada de
fechamento — valor de EXIBIÇÃO), `aberta_em timestamptz not null default now()`,
`encerrada_em timestamptz` (nulo = tenure VIGENTE — marcador autoritativo). Uma
restrição CHECK `coach_tenure_user_ou_nome` SHALL impor NO MÁXIMO um preenchido
entre `user_id` (conta global) e `nome` (rótulo local): SHALL proibir ambos
preenchidos, e SHALL PERMITIR ambos nulos como o estado "técnico
removido/anonimizado" (que surge apenas por cascade de exclusão de conta via
`user_id on delete set null` — sem esse relaxamento, apagar uma conta com tenure
violaria a restrição e abortaria a exclusão). O trigger e o backfill SEMPRE gravam
exatamente um preenchido. A tabela NÃO SHALL denormalizar o nome/escudo do técnico
— a identidade resolve por join a `users`. Um índice ÚNICO PARCIAL SHALL garantir
no MÁXIMO uma tenure VIGENTE (`encerrada_em is null`) por vaga+usuário. Índices em
`(user_id)`, `(competitor_id)` e `(season_id)` SHALL acelerar os perfis.

#### Scenario: Ambos preenchidos é rejeitado
- **WHEN** tenta-se inserir uma tenure com `user_id` E `nome` ambos preenchidos
- **THEN** a restrição CHECK rejeita a linha

#### Scenario: Estado técnico removido é permitido
- **WHEN** a conta de um técnico com tenure é apagada e o cascade zera `user_id` (restando `user_id` nulo e `nome` nulo)
- **THEN** a restrição CHECK PERMITE a linha (estado anonimizado), sem abortar a exclusão da conta

#### Scenario: No máximo uma tenure vigente por vaga+usuário
- **WHEN** já existe uma tenure vigente de um técnico numa vaga e tenta-se abrir outra vigente para o mesmo par
- **THEN** o índice único parcial rejeita a duplicata

#### Scenario: Apagar a vaga apaga suas tenures
- **WHEN** a vaga (`tournament_slots`) é removida
- **THEN** as tenures daquela vaga são removidas (cascade)

#### Scenario: Tenure fechada e tenure vigente coexistem na mesma vaga
- **WHEN** um técnico sai (tenure fechada) e outro assume (tenure vigente) na mesma vaga
- **THEN** ambas as linhas coexistem (o único parcial só restringe as vigentes)

### Requirement: Helpers internos de rodada e resolução de temporada
O sistema SHALL prover a função `public.fn_rodada_corrente(uuid)` (STABLE,
`SECURITY DEFINER`, `search_path = ''`) que retorna a menor `rodada` entre as
partidas NÃO encerradas de um torneio (a rodada ativa), e a função
`public.fn_resolver_season_divisao(uuid)` (STABLE, `SECURITY DEFINER`,
`search_path = ''`) que resolve `(season_id, division_season_id)` do torneio de
uma divisão por `tournament_id` OU `tournament_id_clausura`. Ambas as funções
SHALL ter EXECUTE revogado de `public`, `anon` e `authenticated` (são helpers
internos, invocados apenas pela função de trigger). Torneios de playoff/barragem/
final que não portam o standing SHALL resolver para `(null, null)`.

#### Scenario: Rodada corrente é a menor rodada aberta
- **WHEN** um torneio tem partidas encerradas nas rodadas 1–3 e abertas na 4 e 5
- **THEN** `fn_rodada_corrente` retorna 4

#### Scenario: Resolução cobre anual e Apertura/Clausura
- **WHEN** o torneio consultado é a Apertura (ou a Clausura) de uma divisão split
- **THEN** `fn_resolver_season_divisao` retorna a `(season_id, division_season_id)` daquela divisão

#### Scenario: Torneio sem standing resolve para nulo
- **WHEN** o torneio é um playoff/barragem/final que não porta o standing
- **THEN** a resolução retorna `(null, null)`
