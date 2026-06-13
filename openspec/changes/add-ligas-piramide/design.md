# Design — add-ligas-piramide

Sintetizado de um mapeamento exaustivo do motor de liga, motor de classificação, schema/RLS e geradores de mata-mata/grupos (workflow 5 áreas) + verificação direta do código. Honra a classe de bug "consumidor órfão" ([[arena-modelo-clube-centrico]]): TODO consumidor de `tournament_slots`/clube já varrido na change `add-competidores-por-nome`; aqui o competidor persistente entra como TERCEIRO lado da vaga (XOR de 3 vias) sem reabrir esses consumidores.

## Princípio arquitetural — reúso máximo do motor

**Cada divisão de uma temporada É um `tournaments` de `formato='liga'`.** A camada nova (6 tabelas + 1 coluna) é fina e só ORQUESTRA acima do motor existente. Nada do motor de liga muda:

- `gerarTabelaLiga(participantes, idaEVolta)` (`src/features/league/gerarTabelaLiga.ts`) — gera as rodadas round-robin a partir dos slot ids.
- `iniciarTorneio(tournamentId)` (`src/actions/tournaments.ts:277`) — valida 2..`LIGA_MAX_PARTICIPANTES` (20), ordena por code-point, gera `matches` em lote (vaga_1/vaga_2/rodada), promove `rascunho`→`ativo`, recuperação idempotente via `rodada IS NOT NULL`.
- `computeStandings(regras, partidas)` (`src/features/standings/computeStandings.ts:78`) — função pura; única mudança é um 3º parâmetro `tiebreaker` com default `"cbf"` (sem regressão).
- `getTournamentClassificacao(tournamentId)` (`src/features/standings/data/getTournamentClassificacao.ts:289`) — fetch competitivo já roda o motor sobre `vaga_1/vaga_2`; ganha a passagem do preset de desempate (ver §2.4: o preset SÓ é honrado se `desempate_criterio` entrar no SELECT — linha ~297 — e for repassado aos 3 call-sites do motor — linhas 404/418/591; sem isso o preset é silenciosamente ignorado).
- RLS de `tournament_slots`, `matches`, `slot_invites`, triggers `lock_match_relations`/`lock_match_lifecycle`/`lock_slot_relations`/`valida_resultado_mata_mata` — **intactos** para o fluxo de torneio AVULSO/standalone.

**Caminho próprio da pirâmide (NÃO reusa `createTournament` nem `slot_invites`).** As divisões da pirâmide são criadas e preenchidas por uma RPC `SECURITY DEFINER` `montar_temporada(p_season_id uuid)` (§3.3), não pelo fluxo de criação de torneio avulso. Motivo: a policy `slots_insert_owner_rascunho` (`schema.sql:1354`) exige `user_id is null` (atribuição de técnico é EXCLUSIVA do aceite de convite — invariante "técnico só por aceite"). Pré-preencher `user_id` com o técnico que ACOMPANHA o competidor (decisão de produto) NÃO pode passar por policy de cliente sem furar esse invariante para todo o resto do app. A RPC é o ÚNICO caminho que pré-preenche `user_id`, e SÓ para divisões de pirâmide cujo dono é o `auth.uid()` chamador — o invariante do torneio avulso permanece intacto.

O modo "por nome" da divisão usa o caminho EXISTENTE de `por_nome`/`rotulo` quando o nome é texto livre, ou o NOVO `competitor_id` quando o competidor é persistente (migra entre temporadas conservando identidade/elenco).

---

## 1. Modelo de dados (DDL aditiva; fonte de verdade = `supabase/schema.sql`)

Convenções herdadas do schema real (mapa schema-rls): PK `uuid primary key default gen_random_uuid()`; `created_at timestamptz not null default now()`; FK de posse `on delete set null`, FK de participação `on delete cascade`, FK de geometria `on delete restrict`; booleanos opt-in `default false`; CHECK XOR `(a is null) <> (b is null)`; índices parciais `where ... is not null`; enums via `do $$ ... if not exists ... create type ... end$$` + `alter type ... add value if not exists`; locks `security definer` com bypass de `service_role`; RLS de subtabela espelhando `tournaments_select_visivel`.

### 1.0 Enums novos

```sql
do $$
begin
  -- Estado da pirâmide (competição imortal).
  if not exists (select 1 from pg_type where typname = 'league_competition_status') then
    create type public.league_competition_status as enum ('ativa', 'arquivada');
  end if;
  -- Estado da temporada: rascunho (montando), ativa (divisões rodando),
  -- em_fluxo (todas encerraram, calculando sobe/cai — trava antes de gerar N+1),
  -- encerrada (próxima temporada gerada — congelada).
  if not exists (select 1 from pg_type where typname = 'league_season_status') then
    create type public.league_season_status as enum ('rascunho', 'ativa', 'em_fluxo', 'encerrada');
  end if;
  -- Base de cálculo de sobe/cai por divisão (snapshot na temporada).
  if not exists (select 1 from pg_type where typname = 'league_ranking_base') then
    create type public.league_ranking_base as enum ('posicao', 'ppg', 'promedios');
  end if;
  -- Modo de resolução de uma fronteira entre divisão d e d+1.
  if not exists (select 1 from pg_type where typname = 'league_boundary_mode') then
    create type public.league_boundary_mode as enum ('direto', 'playoff_acesso', 'playout', 'barragem_cruzada');
  end if;
end$$;
```

### 1.1 `league_competitions` — a pirâmide imortal (config-mãe)

```sql
create table if not exists public.league_competitions (
  id            uuid primary key default gen_random_uuid(),
  nome          text not null,
  created_by    uuid references public.users (id) on delete set null,
  status        public.league_competition_status not null default 'ativa',
  -- Snapshot da config CORRENTE (presets + desempate default). A temporada
  -- congela a sua cópia em league_seasons.config_snapshot ao ser montada.
  desempate_padrao text not null default 'cbf',
  -- Visibilidade da pirâmide: pública (default) ou só do dono. HERDADA pelos
  -- tournaments das divisões (montar_temporada copia para tournaments.is_public).
  is_public     boolean not null default true,
  created_at    timestamptz not null default now(),
  constraint league_competitions_nome_nao_vazio check (length(trim(nome)) > 0),
  -- Fase 0 entrega apenas 'cbf'|'ingles'|'custom'. 'espanhol' (mini-tabela
  -- entre 3+ empatados) entra na Fase 5 — o CHECK é alargado nessa fase.
  constraint league_competitions_desempate_valido
    check (desempate_padrao in ('cbf', 'ingles', 'custom'))
);

create index if not exists league_competitions_created_by_idx
  on public.league_competitions (created_by);
```

### 1.2 `league_seasons` — uma temporada da pirâmide

```sql
create table if not exists public.league_seasons (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.league_competitions (id) on delete cascade,
  numero         integer not null,                 -- 1-based; sequencial na pirâmide
  status         public.league_season_status not null default 'rascunho',
  -- Cópia imutável da config no momento da montagem (nº divisões, fronteiras,
  -- toggles nome/clube, desempate por divisão). jsonb: a config evolui por
  -- fase sem nova coluna; a temporada já gerada nunca é re-lida da config-mãe.
  config_snapshot jsonb not null default '{}'::jsonb,
  -- Aponta para a temporada anterior (cadeia de proveniência do realocamento).
  previous_season_id uuid references public.league_seasons (id) on delete set null,
  created_at     timestamptz not null default now(),
  encerrada_em   timestamptz,
  constraint league_seasons_numero_positivo check (numero >= 1)
);

create unique index if not exists league_seasons_numero_unico
  on public.league_seasons (competition_id, numero);
create index if not exists league_seasons_competition_idx
  on public.league_seasons (competition_id);
```

### 1.3 `league_division_seasons` — uma divisão de uma temporada (→ um `tournaments`)

```sql
create table if not exists public.league_division_seasons (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.league_seasons (id) on delete cascade,
  nivel         integer not null,                  -- 1 = topo (1ª divisão); cresce p/ baixo
  nome          text not null,                      -- ex.: "Série A", "Premier"
  -- A divisão É um torneio de liga: RESTRICT explicita a dependência (apagar o
  -- torneio exige desfazer a divisão antes). NULL enquanto a temporada é rascunho
  -- e o torneio ainda não foi criado por montarTemporada.
  tournament_id uuid references public.tournaments (id) on delete restrict,
  -- Toggle POR DIVISÃO (decisão de produto): false = clubes; true = por nome
  -- (texto livre OU competidor persistente). Espelha tournaments.por_nome do
  -- torneio criado para a divisão.
  por_nome      boolean not null default false,
  -- Preset de desempate desta divisão (snapshot). Default 'cbf' = comportamento
  -- atual; passa ao computeStandings via tournaments.desempate_criterio.
  desempate     text not null default 'cbf',
  -- Tamanho-alvo da divisão (nº de competidores). Usado na CONSERVAÇÃO de tamanho
  -- ao montar a próxima temporada (sobe = desce em nº igual nas fronteiras).
  tamanho       integer not null,
  created_at    timestamptz not null default now(),
  constraint league_division_seasons_nivel_positivo check (nivel >= 1),
  constraint league_division_seasons_tamanho_valido check (tamanho >= 2 and tamanho <= 20),
  -- Fase 0: 'cbf'|'ingles'|'custom'; 'espanhol' adicionado na Fase 5.
  constraint league_division_seasons_desempate_valido
    check (desempate in ('cbf', 'ingles', 'custom'))
);

create unique index if not exists league_division_seasons_nivel_unico
  on public.league_division_seasons (season_id, nivel);
-- Um torneio pertence a no máximo uma divisão (quando atribuído).
create unique index if not exists league_division_seasons_tournament_unico
  on public.league_division_seasons (tournament_id) where tournament_id is not null;
create index if not exists league_division_seasons_season_idx
  on public.league_division_seasons (season_id);
```

### 1.4 `league_boundaries` — regra sobe/cai por par de divisões adjacentes

```sql
create table if not exists public.league_boundaries (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references public.league_seasons (id) on delete cascade,
  -- Fronteira entre a divisão de nível `nivel_superior` (d) e a de baixo (d+1).
  -- Guardamos o nível superior; a inferior é nivel_superior + 1.
  nivel_superior integer not null,
  -- Quantos CAEM da divisão superior e quantos SOBEM da inferior. Fronteira
  -- SIMÉTRICA por padrão (sobem == descem); assimétrica é permitida (com aviso
  -- na UI) — a CONSERVAÇÃO de tamanho é garantida no fluxo, não pela CHECK.
  vagas_rebaixamento integer not null default 0,
  vagas_acesso       integer not null default 0,
  -- Modo de resolução. 'direto' = pelos extremos da tabela (Fase 1). Os demais
  -- (playoff/playout/barragem) usam gerarChaveMataMata (Fases 2-3).
  modo          public.league_boundary_mode not null default 'direto',
  -- Quantos entram no playoff/playout/barragem (>= as vagas em disputa).
  playoff_vagas integer,
  created_at    timestamptz not null default now(),
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
```

### 1.5 `league_competitors` — competidor PERSISTENTE (migra entre temporadas)

```sql
create table if not exists public.league_competitors (
  id             uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.league_competitions (id) on delete cascade,
  -- Identidade do competidor. team_id = clube real (modo clube); rotulo = nome
  -- livre persistente (modo por nome). XOR: exatamente um, espelhando
  -- tournament_slots. team RESTRICT (cache), set null não — o competidor É a
  -- entidade-âncora; apagar o clube do cache não deve sumir com o histórico.
  team_id        uuid references public.teams (id) on delete restrict,
  rotulo         text,
  -- Técnico HUMANO que ACOMPANHA o competidor ao subir/cair (decisão de
  -- produto: mantém o elenco entre temporadas). NULLABLE: null = vaga gerida
  -- pelo dono da pirâmide (sem técnico humano dedicado; o dono lança placares).
  -- Substituível; SET NULL ao apagar a conta. Propagado ao
  -- tournament_slots.user_id por montar_temporada SE presente e SE não violar
  -- o UNIQUE slots_um_clube_por_tecnico (senão a RPC degrada para NULL — §3.3).
  holder_user_id uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  constraint league_competitors_clube_xor_rotulo
    check ((team_id is null) <> (rotulo is null)),
  constraint league_competitors_rotulo_nao_vazio
    check (rotulo is null or length(trim(rotulo)) > 0)
);

create index if not exists league_competitors_competition_idx
  on public.league_competitors (competition_id);
-- Unicidade por pirâmide (case-insensitive p/ rótulo; direto p/ clube).
create unique index if not exists league_competitors_team_unico
  on public.league_competitors (competition_id, team_id) where team_id is not null;
create unique index if not exists league_competitors_rotulo_unico
  on public.league_competitors (competition_id, lower(trim(rotulo))) where rotulo is not null;
```

### 1.6 `league_division_entries` — histórico: competidor × temporada × divisão

```sql
create table if not exists public.league_division_entries (
  id                  uuid primary key default gen_random_uuid(),
  division_season_id  uuid not null references public.league_division_seasons (id) on delete cascade,
  competitor_id       uuid not null references public.league_competitors (id) on delete cascade,
  -- A vaga concreta deste competidor na divisão (= um tournament_slots). NULL
  -- enquanto a temporada é rascunho e os slots ainda não nasceram. RESTRICT:
  -- o slot é a âncora competitiva; não pode sumir sem desfazer a entry.
  slot_id             uuid references public.tournament_slots (id) on delete restrict,
  -- Resultado consolidado APÓS o fluxo (preenchido por executarFluxoTemporada):
  -- posição final + DESTINO (para onde foi) + COMO foi decidido.
  posicao_final       integer,
  -- DESTINO = o que aconteceu com o competidor (mutuamente exclusivo).
  destino             text,            -- 'sobe' | 'cai' | 'permanece' | null (pré-fluxo)
  -- MOTIVO/resolvido_por = COMO o destino foi decidido. 'sorteio' é MOTIVO, não
  -- destino (um competidor SOBE/CAI/PERMANECE *por* sorteio). Separar evita o
  -- bug de tratar 'sorteio' como um quarto destino.
  resolvido_por       text,            -- 'classificacao' | 'playoff' | 'sorteio' | 'override' | null
  pontos              integer,
  jogos               integer,
  created_at          timestamptz not null default now(),
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
```

### 1.7 `tournament_slots.competitor_id` — terceiro lado da vaga (XOR de 3 vias)

O mapa por-nome-types confirma: adicionar `competitor_id` nullable e EXPANDIR o CHECK XOR de 2 para 3 vias. Hoje o CHECK é `slots_clube_xor_rotulo: (team_id is null) <> (rotulo is null)`. A divisão por nome PERSISTENTE usa `competitor_id` (não texto livre `rotulo`), mas o slot ainda precisa de um `rotulo` ou `team_id` para o motor renderizar o nome — então a regra é: a vaga continua sendo clube XOR rótulo (motor intocado), e `competitor_id` é um PONTEIRO ADITIVO opcional para o competidor persistente.

```sql
-- competitor_id: liga a vaga ao competidor persistente da pirâmide. NULL em
-- TODO torneio legado e em torneios avulsos/standalone. on delete set null:
-- apagar o competidor não derruba a vaga (o histórico de matches sobrevive).
alter table public.tournament_slots
  add column if not exists competitor_id uuid
  references public.league_competitors (id) on delete set null;

create index if not exists tournament_slots_competitor_idx
  on public.tournament_slots (competitor_id) where competitor_id is not null;

-- A identidade visível continua sendo clube XOR rótulo (motor/render intactos).
-- Quando competitor_id está presente, o rotulo do slot espelha o do competidor
-- (modo nome) OU o team_id espelha o do competidor (modo clube). Coerência
-- garantida por montarTemporada (server-side), não por CHECK cruzada de tabela
-- (Postgres não permite subquery em CHECK).
```

**Por que NÃO mexer no CHECK existente `slots_clube_xor_rotulo`**: o motor (`gerarTabelaLiga`, `computeStandings`, `getTournamentClassificacao`) só conhece clube/rótulo. Manter o XOR de 2 vias preserva 100% do comportamento e dos consumidores já varridos. `competitor_id` é um metadado de proveniência ortogonal — o equivalente do `user_id` (técnico): nullable, aditivo, ignorado pelo motor.

### 1.8 `tournaments.desempate_criterio` — preset de desempate por torneio

```sql
-- Preset de desempate (aditivo; idempotente). Default 'cbf' = comportamento
-- atual; legados e torneios standalone preservam a cadeia CBF simplificada.
-- montarTemporada grava o preset da divisão aqui; getTournamentClassificacao lê.
alter table public.tournaments
  add column if not exists desempate_criterio text not null default 'cbf';

-- Fase 0 só expõe 'cbf'|'ingles'|'custom'. 'espanhol' (mini-tabela entre 3+
-- empatados) é incompatível com o motor da Fase 0 (que só reordena
-- comparadores objetivos + confronto direto entre 2) — entra na Fase 5, que
-- ALARGA este CHECK para incluir 'espanhol'.
alter table public.tournaments drop constraint if exists tournaments_desempate_valido;
alter table public.tournaments
  add constraint tournaments_desempate_valido
  check (desempate_criterio in ('cbf', 'ingles', 'custom'));
```

**Regeneração de tipos**: após a DDL, `database.types.ts` ganha `competitor_id: string | null` em `tournament_slots` (Row/Insert/Update), `desempate_criterio: string` em `tournaments`, e as 6 tabelas + enums novos. Mapa por-nome-types confirma: nenhuma query existente quebra (`.select()` é string literal; campos novos são opcionais no Insert).

---

## 2. Parametrização de `computeStandings` (desempate por preset)

### 2.1 Assinatura (em `src/features/standings/computeStandings.ts:78`)

```typescript
// Fase 0: 'cbf' | 'ingles' | 'custom'. 'espanhol' adicionado na Fase 5 (exige
// mini-tabela entre 3+ empatados, que o motor objetivo da Fase 0 não cobre).
export type TiebreakerPreset = "cbf" | "ingles" | "custom"

export interface TiebreakerSpec {
  // Cadeia de comparadores objetivos (cada um retorna negativo/zero/positivo).
  // Aplicados em cascata ANTES do confronto direto e do porId final.
  comparadores: Array<(a: Acumulado, b: Acumulado) => number>
  // CBF: confronto direto só entre EXATAMENTE 2 (evita ciclo A>B>C>A).
  confrontoDiretoApenasEm2: boolean
}

export function computeStandings(
  regras: RegrasPontuacao,
  partidas: PartidaClassificavel[],
  tiebreaker: TiebreakerPreset = "cbf"   // NOVO — default preserva o atual
): LinhaClassificacao[]
```

### 2.2 Onde injetar (refatoração cirúrgica, sem regressão)

A cadeia hardcoded de `computeStandings.ts:148-155` (`b.pontos - a.pontos || b.vitorias - a.vitorias || saldo(b) - saldo(a) || b.golsPro - a.golsPro || porId`) vira dinâmica:

```typescript
const spec = obterTiebreakerSpec(tiebreaker)   // tabela de presets
const linhas = [...acumulados.values()].sort((a, b) => {
  for (const cmp of spec.comparadores) {
    const r = cmp(a, b)
    if (r !== 0) return r
  }
  return porId(a, b)   // tiebreaker final determinístico (inalterado)
})
```

O agrupamento de empatados (`computeStandings.ts:158-169`) passa a comparar pelos MESMOS comparadores objetivos do preset (não mais os 4 fixos). O confronto direto (`computeStandings.ts:195-209`) respeita `spec.confrontoDiretoApenasEm2`.

### 2.3 Presets

| Preset | Cadeia de comparadores objetivos | Confronto direto | Fase |
|--------|----------------------------------|------------------|------|
| `cbf` (default) | pontos → vitórias → saldo → gols pró | só em 2 (atual) | 0 |
| `ingles` | pontos → saldo → gols pró → vitórias | só em 2 | 0 |
| `custom` | configurável (cadeia objetiva reordenável) | configurável | 5 |
| `espanhol` | pontos → mini-tabela entre 3+ empatados → saldo → gols pró | mini-tabela (confronto direto entre TODOS os empatados, não só 2) | 5 |

**Por que `espanhol` NÃO é Fase 0**: o motor parametrizável da Fase 0 apenas REORDENA comparadores objetivos e mantém o confronto direto restrito a EXATAMENTE 2 (para evitar o ciclo A>B>C>A). O `espanhol` REAL exige uma mini-tabela entre 3+ empatados (sub-classificação só com os jogos entre eles), que é uma mecânica nova — vai para a Fase 5 junto do `custom` e do desempate por mini-tabela. Até a Fase 5, `espanhol` NÃO é selecionável (não consta dos CHECKs nem do enum de preset).

**Garantia de não-regressão**: `obterTiebreakerSpec("cbf")` retorna EXATAMENTE `{ comparadores: [pontos, vitorias, saldo, golsPro], confrontoDiretoApenasEm2: true }` — produz ordenação byte-idêntica à atual. Todos os testes de `computeStandings.test.ts` (especialmente os de confronto direto 2-a-2 nas linhas 138-151, ciclo 3+ nas 167-179, divisão de posição nas 181-192) passam SEM alteração porque o default não muda nada.

### 2.4 Propagação no fetcher (SEM isso, o preset é ignorado silenciosamente)

O preset só tem efeito se TRÊS edições cirúrgicas acontecerem juntas — caso contrário a coluna `desempate_criterio` existe no banco mas o motor nunca a vê (bug silencioso: a UI promete desempate por divisão, o motor roda sempre CBF):

1. **SELECT** (`getTournamentClassificacao.ts:~297`): adicionar `desempate_criterio` à string do `.select(...)` de `tournaments`. Hoje a string termina em `pontos_derrota`; passa a incluir `, desempate_criterio`.
2. **Tipo** (`getTournamentClassificacao.ts:16-32`): adicionar `desempate_criterio: string` à interface `TorneioClassificacao` (senão o typecheck quebra ao ler o campo).
3. **3 call-sites do motor** recebem o preset como 3º arg `tiebreaker`:
   - Linha 404 (classificação geral competitiva): `computeStandings(regras, linhasMotor, desempate)`
   - Linha 418 (clubes do avulso): `computeStandings(regras, ..., desempate)`
   - Linha 591 (por grupo): `computeStandings(regras, ..., desempate)`

onde `const desempate = (torneio.desempate_criterio as TiebreakerPreset) ?? "cbf"`. `page.tsx` não muda (passa pelo fetcher). Um parâmetro opcional `tiebreakerOverride?` no fetcher facilita testes. Esta tríade está cravada como sub-task 0.3.4 nas tasks.

---

## 3. Ciclo de temporada (`executarFluxoTemporada`)

Nova Server Action em `src/actions/leaguePyramid.ts`. Orquestra a virada de temporada. **NUNCA escreve em `matches`/standings legados** — só lê o motor e escreve nas 6 tabelas novas + cria os torneios da próxima temporada (reusando `iniciarTorneio`).

### 3.1 Pré-condições (FILTRO + RLS, padrão das actions)
- `season.status = 'ativa'` (a temporada está rodando).
- TODAS as divisões da temporada têm o torneio com `status = 'encerrado'` (divisões em PARALELO; o fluxo só dispara quando todas encerram — default de produto).
- Posse: `competition.created_by = auth.uid()`.

### 3.2 Algoritmo (2 passos — calcular, depois confirmar)

**Passo A — `calcularFluxoTemporada(seasonId)` (read-only, idempotente, sem escrita):**
1. Para cada `league_division_seasons` da temporada, ler a classificação via `getTournamentClassificacao(tournament_id)` (já com o preset de desempate da divisão).
2. Derivar a base de ranking conforme `config_snapshot`/`league_ranking_base`:
   - `posicao`: usa `linha.posicao` direto (Fase 1).
   - `ppg` (pontos por jogo): `pontos / jogos` — desempata divisões de tamanhos diferentes (Fase 1, trivial sobre o output do motor).
   - `promedios`: média plurianual lendo `league_division_entries` das N temporadas anteriores via `previous_season_id` (Fase 4).
3. Para cada `league_boundaries` (nível d ↔ d+1), no modo `'direto'` (Fase 1): os `vagas_rebaixamento` ÚLTIMOS da divisão d CAEM; os `vagas_acesso` PRIMEIROS da divisão d+1 SOBEM.
4. **Empate exato na zona de corte** (mesma posição decide quem cruza a linha): SORTEIO crypto (`crypto.getRandomValues`) — registrado no `config_snapshot`/resultado do fluxo (semente + ordem sorteada, auditável). O dono pode AJUSTAR manualmente antes de confirmar (Passo B).
5. Produz um PLANO: para cada competidor, `{ origem: nivel, destino: nivel', motivo: 'sobe'|'cai'|'permanece'|'sorteio' }`. Mostra na TELA DE FLUXO (mobile-first) antes de commitar.

**Passo B — `confirmarFluxoTemporada(seasonId, ajustes?)` (escrita, idempotente):**
1. Transição `season.status: 'ativa' → 'em_fluxo'` (TRAVA: nenhuma divisão pode reabrir; lock trigger barra).
2. Persiste o resultado por competidor em `league_division_entries` (`posicao_final`, `destino`, `pontos`, `jogos`).
3. Aplica `ajustes?` do dono sobre o plano sorteado (override manual do empate).
4. **`montarProximaTemporada`** (ver 3.3) — cria a temporada N+1 e seus torneios.
5. Transição `season(N).status: 'em_fluxo' → 'encerrada'` (CONGELA N).

### 3.3 `montar_temporada` (RPC `SECURITY DEFINER`) — único caminho que cria divisões e pré-preenche slots

A montagem da temporada (tanto a temporada 1 quanto N+1) corre numa RPC `SECURITY DEFINER` `montar_temporada(p_season_id uuid)`. Ela NÃO usa `createTournament` nem `slot_invites`: cria os `tournaments` das divisões e INSERE os `tournament_slots` JÁ PREENCHIDOS, contornando a policy `slots_insert_owner_rascunho` (que proíbe `user_id` no INSERT de cliente) de forma AUDITÁVEL e restrita.

**Contrato da RPC** (`set search_path = ''`, mesmo estilo de `aceitar_convite_vaga`):

1. **Posse**: `auth.uid()` DEVE ser o `created_by` da `league_competitions` dona da `p_season_id` — senão `raise exception 'NAO_DONO'`. (A RPC roda como definer, mas a checagem de posse é explícita; é o único motivo de ela poder pré-preencher `user_id`.)
2. **Idempotência (promote-first)**: para cada `league_division_seasons` da temporada, se já tem `tournament_id`, PULA a criação (a `division_season` é a SENTINELA — UNIQUE `(season_id, nivel)` criada ANTES dos tournaments). Re-rodar após falha parcial completa só o que faltou.
3. **Cria o tournament da divisão**: `tournaments(formato='liga', status='rascunho', created_by=auth.uid(), por_nome=<divisão>, desempate_criterio=<divisão>, is_public=<herdado de league_competitions.is_public>)`. Grava `league_division_seasons.tournament_id`.
4. **Insere os slots já preenchidos**, por modo da divisão:
   - **Por NOME**: `tournament_slots(team_id=null, rotulo=<rotulo do competitor>, user_id=null, por_nome=true, competitor_id=<id>)`. (Já seria permitido pela RLS de cliente, mas a RPC unifica o caminho.)
   - **Por CLUBE**: `tournament_slots(team_id=<team do competitor>, rotulo=null, competitor_id=<id>, user_id=<regra de degradação abaixo>)`.
5. **Regra do `user_id` no modo clube (degradação na colisão)**: `user_id = competitor.holder_user_id` SE `holder_user_id` não for null E inserir esse valor NÃO violar o UNIQUE parcial `slots_um_clube_por_tecnico (tournament_id, user_id) where user_id is not null` (mesmo `holder` em 2 competidores da MESMA divisão). Se `holder_user_id` é null OU a inserção colidiria, grava `user_id = NULL` (vaga GERIDA pelo dono — o dono lança os placares). A RPC DETECTA a colisão antes de inserir (consulta os holders já usados na divisão) e DEGRADA para NULL. Esse comportamento é documentado e tem cenário próprio na spec.
6. Cria as `league_division_entries` (`competitor_id`, `slot_id`).

**Não relaxa as policies de cliente**: a RPC é o único bypass, e só para divisões de pirâmide do próprio dono. O invariante "técnico só por aceite" do torneio AVULSO permanece, porque o avulso nunca chama esta RPC e as policies `slots_insert_owner_rascunho`/`slots_update_*` continuam exigindo `user_id is null`.

#### `montarProximaTemporada` — CONSERVAÇÃO de tamanho (chama `montar_temporada`)

Cria `league_seasons(numero = N+1, previous_season_id = N)`, copia `config_snapshot`, realoca os competidores ao destino e DELEGA a criação de torneios/slots à RPC `montar_temporada(N+1)`:
1. **Realoca competidores**: o competidor que estava na divisão d em N vai para a divisão de destino em N+1 (d, d-1 se subiu, d+1 se caiu). O técnico (`league_competitors.holder_user_id`) ACOMPANHA o competidor (decisão de produto), sujeito à degradação do passo 5 acima na colisão.
2. **Conserva o tamanho**: como a fronteira simétrica garante `sobem(d+1→d) == descem(d→d+1)`, `league_division_seasons.tamanho` de cada divisão é idêntico ao de N. Conservação é EXIGIDA por CHECK de fechamento na montagem (ver §7), não apenas avisada.
3. `montar_temporada(N+1)` cria os tournaments, os `tournament_slots` realocados (`competitor_id` + `team_id`/`rotulo` espelhado + `user_id` por degradação) e as `league_division_entries`.
4. O dono então clica "iniciar" cada divisão (reúsa `iniciarTorneio`).

### 3.4 Idempotência e FREEZE da temporada (defesa em profundidade)

**O lock NÃO pode viver só em `league_division_seasons`.** O risco real: `reabrirTorneio` (`actions/tournaments.ts:479`) opera direto na tabela `tournaments` — ele acha o torneio por `created_by`+`status='encerrado'` e faz `UPDATE tournaments SET status = 'ativo'|'rascunho'`. Como o dono da pirâmide É o `created_by` dos torneios das divisões, ele passaria por todas as policies e REABRIRIA uma divisão de uma temporada já congelada, sem nada barrar. Por isso o freeze é em TRÊS camadas:

**(a) Guard na action `reabrirTorneio` (`actions/tournaments.ts:479`)**: após carregar o torneio (hoje seleciona `id, formato`), checar se ele é uma DIVISÃO cuja season está congelada — `select 1 from league_division_seasons lds join league_seasons ls on ls.id = lds.season_id where lds.tournament_id = <id> and ls.status in ('em_fluxo','encerrada')`. Se existe, retorna erro de propriedade ("Torneio não encontrado, não encerrado ou você não é o dono dele.") — sem reabrir. Camada de UX rápida (não depende do banco gritar).

**(b) Trigger `lock_division_tournament_reopen` em UPDATE de `tournaments`** (security definer, bypass `service_role`, espelha `lock_match_lifecycle`): barra a transição de `status` de `'encerrado'` para `'ativo'`/`'rascunho'` QUANDO o `tournaments.id` pertence a uma divisão cuja `league_seasons.status in ('em_fluxo','encerrada')`. Esta é a defesa REAL (vale contra qualquer caminho, inclusive POST direto e qualquer action futura). Mensagem: `'A divisão de uma temporada congelada não pode ser reaberta'`. service_role (migrations) permanece livre.

**(c) Reflexo na RLS spec**: a spec de row-level-security descreve este trigger explicitamente (ele opera em `tournaments`, não nas tabelas novas) e o porquê de o lock de `league_division_seasons` (geometria) não cobrir a reabertura do torneio.

**Demais idempotências e locks:**
- **Promote-first / idempotência**: como `iniciarTorneio`, `montar_temporada` detecta estado parcial pela SENTINELA `league_division_seasons.tournament_id` (UNIQUE `(season_id, nivel)` criada ANTES dos tournaments — ver §3.3 passo 2). `league_seasons_numero_unico (competition_id, numero)` barra dupla criação de N+1 (23505 em corrida → retry encontra a temporada já criada).
- **Lock temporada encerrada**: trigger `lock_league_season` (security definer, bypass `service_role`) barra `UPDATE` que reabra uma temporada `'encerrada'` (mudança de `status`/`numero`/`competition_id`). Espelha `lock_match_lifecycle`. Complementa (b): (b) protege o torneio da divisão, este protege a linha da temporada.
- **Sorteio determinístico-auditável**: a semente crypto é gravada; re-rodar `calcularFluxoTemporada` com a MESMA semente reproduz o resultado (idempotência do cálculo).

---

## 4. Reúso do motor por divisão

| Etapa | Função reusada | Arquivo:linha |
|-------|----------------|---------------|
| Criar a divisão + slots preenchidos | RPC `montar_temporada` (SECURITY DEFINER — §3.3; NÃO `createTournament`) | `supabase/schema.sql` (RPC nova) |
| Iniciar a divisão | `iniciarTorneio(tournamentId)` | `actions/tournaments.ts:277` |
| Gerar a tabela | `gerarTabelaLiga(slotIds, idaEVolta)` | `features/league/gerarTabelaLiga.ts:33` |
| Classificar | `getTournamentClassificacao` → `computeStandings` | `features/standings/data/getTournamentClassificacao.ts:289` |
| Render da tabela | `StandingsTable` (RSC puro) | `features/standings/components/StandingsTable.tsx:22` |
| Playoff/playout (Fase 2) | `montarConfrontosSorteio` + `gerarFaseInicial` + `gerarProximaFase` | `features/knockout/gerarChaveMataMata.ts` |
| Barragem cruzada (Fase 3) | `montarConfrontosManual` + `gerarProximaFase` | `features/knockout/gerarChaveMataMata.ts:202` |

`StandingsTable` ganha uma prop opcional `zonas?: { acesso: number[]; rebaixamento: number[] }` (posições destacadas) — aditiva, default vazio preserva o uso atual em torneios standalone.

---

## 5. RLS das 6 tabelas + triggers de lock

Padrão cascata do mapa schema-rls: SELECT espelha a visibilidade da pirâmide; escrita só do dono (`league_competitions.created_by = auth.uid()`). Subtabelas validam posse via subquery na pirâmide (como `slot_invites` valida via `tournaments`).

### 5.1 SELECT
- `league_competitions_select`: `for select to anon, authenticated using (status = 'ativa' or created_by = auth.uid())` — pirâmides ativas são públicas (espelha `is_public` dos torneios); arquivadas só o dono.
- `league_seasons`/`league_division_seasons`/`league_boundaries`/`league_competitors`/`league_division_entries`: `using (exists (select 1 from league_competitions c where c.id = <competition_id derivado> and (c.status='ativa' or c.created_by = auth.uid())))`. Subtabelas profundas fazem o join transitivo (entry → division_season → season → competition).

### 5.2 INSERT/UPDATE/DELETE
- Todas (6 tabelas novas): `with check (exists (select 1 from league_competitions c where c.id = <competition_id> and c.created_by = auth.uid()))`. Só o dono cria/edita pirâmide, temporada, divisão, fronteira, competidor e entry.
- **`tournaments`/`tournament_slots` das divisões NÃO nascem por policy de cliente**: a RPC `montar_temporada` (SECURITY DEFINER) é o caminho de criação (§3.3). As policies `tournaments_insert_owner` e `slots_insert_owner_rascunho` permanecem INTACTAS e NÃO são relaxadas — elas seguem exigindo `user_id is null` no INSERT de cliente, preservando o invariante "técnico só por aceite" do torneio AVULSO. A RPC pré-preenche `user_id` por DENTRO do definer, após validar a posse da pirâmide, e SÓ para divisões da pirâmide do caller. A RLS spec detalha por que a RPC não exige afrouxar nenhuma policy.
- Helper `eh_dono_competition(uuid) returns boolean security definer` (espelha `eh_participante`) evita recursão e repetição da subquery.

### 5.3 Triggers de lock (security definer, bypass `service_role`)
- `lock_league_season`: barra `UPDATE` que reabra uma temporada `'encerrada'`; barra mudança de `numero`/`competition_id`. Mensagem: `'A temporada encerrada não pode ser alterada'`.
- `lock_league_division_season`: barra mudança de `tournament_id`/`nivel`/`por_nome`/`tamanho` após a temporada sair de `'rascunho'`. Espelha `lock_slot_relations`.
- `lock_league_competitor_identity`: barra mudança de `team_id`/`rotulo` após o competidor ter qualquer `league_division_entries` (já jogou — identidade imutável). `holder_user_id` (técnico) permanece mutável.
- **`lock_division_tournament_reopen` (em `tournaments`, NÃO nas tabelas novas)**: barra a transição de `status` `'encerrado'` → `'ativo'`/`'rascunho'` quando o torneio pertence a uma divisão cuja `league_seasons.status in ('em_fluxo','encerrada')` (§3.4-b). É o que IMPEDE `reabrirTorneio` de furar o freeze. service_role livre.
- Reúso do existente: `lock_slot_relations` já barra mudar `rotulo`/`team_id` do slot fora de rascunho — vale para os slots das divisões sem alteração. `competitor_id` do slot é gravado na montagem (rascunho) e não muda depois (defendido pelo mesmo lock, estendido para a coluna nova).

---

## 6. Mapeamento das 6 fases

| Fase | Entrega técnica |
|------|-----------------|
| **0** | DDL: 4 enums + 6 tabelas (com `league_competitions.is_public`, `league_competitors.holder_user_id`, `league_division_entries.resolvido_por`) + `tournament_slots.competitor_id` + `tournaments.desempate_criterio` + índices + CHECKs + RLS + 4 lock triggers (`lock_league_season`, `lock_league_division_season`, `lock_league_competitor_identity`, `lock_division_tournament_reopen`) + RPC `montar_temporada` (SECURITY DEFINER) + helper `eh_dono_competition`, espelhado em `supabase/schema.sql`; `database.types.ts` regenerado; `computeStandings` parametrizável (`TiebreakerPreset` default `cbf`, presets `cbf`/`ingles` — `espanhol`/`custom` ficam para a Fase 5) + propagação nos 3 call-sites do fetcher (SELECT+tipo+args — §2.4). Testes de preset (CBF byte-idêntico ao atual). Aditivo — nada quebra. |
| **1** | Fundação ponta-a-ponta: `createCompetition` (wizard mobile-first + presets Brasileirão 4-4 / Premier 3-3 / Personalizado), `montarTemporada` (action que chama a RPC `montar_temporada`: cria N torneios de liga + slots preenchidos + entries + competitors, toggle nome/clube por divisão, `user_id` = `holder_user_id` com degradação para NULL na colisão), reúso de `iniciarTorneio` por divisão, página da temporada (abas de divisão linkando o torneio EXISTENTE), `StandingsTable` com zona sobe/cai, `executarFluxoTemporada` (base `posicao`+`ppg`, fronteira `'direto'` simétrica, sorteio crypto no empate + override do dono), `montarProximaTemporada` (técnico acompanha, conservação de tamanho com CHECK de fechamento), guard em `reabrirTorneio`, tela de fluxo (2 cliques), locks/RLS completos. |
| **2** | Fronteira `'playoff_acesso'` + `'playout'`: `montarConfrontosSorteio`/`montarConfrontosPotes` + `gerarFaseInicial` + `gerarProximaFase` sobre os times da zona; integra o resultado da chave ao plano de sobe/cai. |
| **3** | Fronteira `'barragem_cruzada'` (X de d × Y de d+1): `montarConfrontosManual` com seeds explícitos + `gerarProximaFase`; UI da chave de barragem. |
| **4** | Base `promedios` (média plurianual lendo `league_division_entries` via `previous_season_id`) + página do competidor (histórico de temporadas/divisões/destinos). |
| **5** | Ciclos alternativos (Apertura/Clausura, split — duas meias-temporadas por `league_seasons`), formato interno por divisão (grupos+mata-mata via `gerarFaseDeGrupos`), desempate `custom` + `espanhol` (cadeia configurável + mini-tabela 3+; ALARGA os CHECKs de desempate para incluir `'espanhol'`). |

---

## 7. Edge cases e riscos

### 7.1 Conservação de tamanho — INVARIANTE multi-fronteira (CHECK, não aviso)
Para cada divisão d, ao montar a temporada N+1:
```
tamanho_{N+1}(d) = tamanho_N(d) - sobe(d→d-1) - cai(d→d+1)
                                 + recebidos_de_cima(d-1→d) + recebidos_de_baixo(d+1→d)
```
- **Pontas**: a divisão 1 (topo) NUNCA sobe (`recebidos_de_cima = 0`, `sobe = 0`); a última NUNCA cai (`recebidos_de_baixo = 0`, `cai = 0`). Qualquer config/fronteira que viole isso (ex.: vaga de acesso saindo da divisão 1, vaga de rebaixamento saindo da última) é REJEITADA.
- **Fechamento por CHECK na montagem**: a montagem REJEITA (não apenas avisa) qualquer configuração ou resultado de temporada que deixe alguma divisão fora de `[2, 20]`. Fronteira assimétrica é permitida SE o fechamento continuar válido em todas as divisões; senão a montagem falha com erro explícito antes de escrever.
- **Teste explícito**: pirâmide de 3 divisões (task 1.4.1) exercitando todas as fronteiras internas + as duas pontas.

### 7.2 Idempotência do promote-first (sentinela concreta)
`league_division_seasons` com UNIQUE `(season_id, nivel)` é criada ANTES dos tournaments e serve de SENTINELA: `montar_temporada` é idempotente verificando se a `division_season` já tem `tournament_id` (se sim, pula a criação). `league_seasons_numero_unico` barra dupla criação de N+1.

### 7.3 Sorteio na zona de corte
Crypto (`crypto.getRandomValues`), semente gravada (auditável/reproduzível), override manual do dono antes do commit. O sorteio ORDENA todos os empatados na fronteira e preenche as vagas na ordem sorteada; só roda quando `computeStandings` retorna posições empatadas (sem desempate objetivo) EXATAMENTE na linha de corte. Registrado em `league_division_entries.resolvido_por = 'sorteio'` (motivo) — o `destino` continua sendo `sobe`/`cai`/`permanece`.

### 7.4 Degradação do `user_id` na colisão (modo clube)
Se dois competidores da MESMA divisão têm o mesmo `holder_user_id`, o UNIQUE `slots_um_clube_por_tecnico (tournament_id, user_id)` proíbe ambos os slots carregarem esse `user_id`. `montar_temporada` detecta e grava `user_id = NULL` na vaga em conflito (gerida pelo dono); a primeira mantém o técnico. Sem isso a montagem quebraria com 23505. Documentado em §3.3 passo 5 e com cenário na spec league-pyramid.

### 7.5 Edge cases de fronteira
- **N=1 (pirâmide de 1 divisão)**: liga multi-temporada SEM fronteiras e SEM sobe/cai (só acumula temporadas). Permitida — o fluxo apenas persiste o resultado e monta a próxima temporada com os mesmos competidores na mesma divisão.
- **Divisão que ficaria <2 após o fluxo**: REJEITADA pela CHECK de fechamento (§7.1) antes de qualquer escrita.
- **Empate cruzando 2+ posições de corte**: o sorteio crypto ordena TODOS os empatados na fronteira e preenche as vagas em disputa na ordem sorteada (§7.3).

### 7.6 Demais
- **`competitor_id` órfão**: `on delete set null` — apagar o competidor não derruba a vaga nem o histórico de `matches`.
- **Freeze furado por `reabrirTorneio`**: fechado em 3 camadas (§3.4) — guard na action + trigger `lock_division_tournament_reopen` em `tournaments` + reflexo na RLS spec.
- **Mobile-first**: wizard com presets resolve ~90% dos casos em poucos toques; config avançada (fronteiras/desempate) em telas dedicadas validadas a 390px nos 2 temas.
- **Não-regressão do motor**: `desempate_criterio` default `'cbf'` + `por_nome`/`rotulo` intactos → torneios legados e standalone idênticos.

---

## 8. Fase 2 — Playoff de acesso + playout (detalhe)

Sintetizado de um mapeamento exaustivo (workflow 5 áreas) do motor de mata-mata, da RPC `montar_temporada`, do reader de classificação de chave, da UI de fluxo e do wizard. Decisão de produto do dono (AskUserQuestion 2026-06-13): **suportar OS DOIS estilos por fronteira** (`vagas` e `extra`) e **leg format configurável por fronteira**. Reúso máximo: a chave de cada fronteira É um `tournaments` de `formato='mata_mata'` — todo o motor de chave (`gerarChaveMataMata`, `iniciarMataMata`/`avancarFase`, `BracketView`, `decidirConfronto`) é reaproveitado.

### 8.1 Semântica por fronteira (qual lado a chave decide)
- `playoff_acesso`: o lado do ACESSO (quem sobe de d+1) é decidido por chave; o REBAIXAMENTO de d continua DIRETO por posição.
- `playout`: o lado da QUEDA (quem cai de d) é decidido por chave; o ACESSO de d+1 continua DIRETO por posição.
- `barragem_cruzada` (Fase 3): chave MISTA entre d e d+1 (fica para a Fase 3).

### 8.2 Dois estilos (resolução da chave)
- **`vagas`** (chave decide as vagas): chave COMPLETA de `playoff_vagas ∈ {4,8,16,32}` (sem byes — `TAMANHOS_POTES`). Joga SÓ `f` rodadas (chave PARCIAL — NÃO vai à final) até `sobreviventes = playoff_vagas/2^f`. `playoff_acesso`: os `vagas_acesso` sobreviventes SOBEM (⇒ `vagas_acesso` potência de 2, `0 < vagas_acesso < playoff_vagas`, `= playoff_vagas/2^f`). `playout`: os `vagas_rebaixamento` ELIMINADOS na(s) rodada(s) jogadas caem (⇒ `sobreviventes = playoff_vagas - vagas_rebaixamento` é potência de 2, `0 < sobreviventes < playoff_vagas`). `f = log2(playoff_vagas / sobreviventes)`. Reader puro novo `resultadoDaChave(partidas, opts)` (em `gerarChaveMataMata.ts`) deriva sobreviventes/eliminados por rodada via `decidirConfronto` slot a slot. **`decidida` no `vagas` = rodada `f` 100% encerrada** (não "final decidida" — a chave nem chega à final). A UI NÃO oferece avançar fase além da rodada `f` no `vagas` (senão o dono mudaria quem subiu).
- **`extra`** (direto + 1 na chave): vagas diretas por posição (igual `direto`) + chave COMPLETA de `playoff_vagas ∈ [2,32]` (byes ok) jogada ATÉ A FINAL, decidindo 1 extra. `playoff_acesso`: campeão sobe. `playout`: PERDEDOR DA FINAL cai (simétrico — não inventar ranking de eliminados precoces que o motor não fornece). **`decidida` no `extra` = final decidida** (`decidirConfronto` do slot 1 da fase final ≠ null).

### 8.3 Conservação com movimento efetivo (o `+1` é de UM lado só)
Helper PURO exportado do schema `movimentoEfetivo(f) → { sobeEf, caiEf }`, dependente de **modo × estilo** (o `+1` do `extra` entra SÓ no lado da CHAVE, não nos dois):
```
direto                       ⇒ { sobeEf: vagasAcesso,     caiEf: vagasRebaixamento }
qualquer estilo 'vagas'      ⇒ { sobeEf: vagasAcesso,     caiEf: vagasRebaixamento }   // a chave decide exatamente as vagas
playoff_acesso + 'extra'     ⇒ { sobeEf: vagasAcesso + 1, caiEf: vagasRebaixamento }   // +1 sobe (campeão); queda toda direta
playout + 'extra'            ⇒ { sobeEf: vagasAcesso,     caiEf: vagasRebaixamento + 1 } // +1 cai (perdedor da final); acesso direto
```
A conservação (§7.1) e a SIMETRIA por fronteira valem sobre os EFETIVOS: **`sobeEf == caiEf` por fronteira**. Consequências (a validar):
- `vagas`/`direto`: `vagasAcesso == vagasRebaixamento`.
- `playoff_acesso` `extra`: `vagasRebaixamento == vagasAcesso + 1` (o lado direto da queda precisa da vaga extra configurada).
- `playout` `extra`: `vagasAcesso == vagasRebaixamento + 1`.

**Espelhado em LOCKSTEP**: `leaguePyramidSchema` (servidor: `superRefine` de movimento físico/fechamento) e `LeagueWizard` (`tamanhoFinal`/`erroConservacao`) consomem o MESMO `movimentoEfetivo` — drift aceita config que o outro lado rejeita. O `.refine(vagasAcesso===vagasRebaixamento)` BRUTO de `fronteiraSchema:122` é REMOVIDO; a simetria migra para o `superRefine` do schema-mãe sobre os efetivos. O movimento físico (`saem = sobeEf+caiEf ≤ tamanho`) e o fechamento (`pos = tamanho - sobeEf - caiEf + recebeDeCimaEf + recebeDeBaixoEf ∈ [2,20]`) somam EFETIVOS. `derivarZonas` no client também: a zona de rebaixamento DIRETO do `playoff_acesso extra` é `vagasRebaixamento` (= `vagasAcesso+1`) posições.

### 8.4 Sequência nova (estado)
`divisões encerram → montarPlayoffs(seasonId) → dono joga as chaves → todas decididas → dono ENCERRA cada chave → calcularFluxoTemporada → confirmar`. A página da temporada ganha uma flag derivada `playoffsResolvidos` (toda fronteira não-`direto` tem `playoff_tournament_id` com `resultadoDaChave(...).decidida === true` — NÃO "final decidida" genérica, pois no `vagas` a chave para na rodada `f`). `mostrarFluxo` passa a exigir `todasEncerradas && playoffsResolvidos`. Um novo `PlayoffsPanel` (client) aparece quando `todasEncerradas && !playoffsResolvidos`: botão "Montar playoffs" + `BracketView` (RSC, reúso) por chave + link "Abrir chave" (joga no ciclo de torneio existente) + `AvancarFaseButton` (reúso) **escondido após a rodada `f` no estilo `vagas`**. A semente do sorteio de empate residual NÃO se aplica às fronteiras de playoff (a chave decide por jogo); o sorteio só age nas fronteiras `direto`.

### 8.5 DDL aditiva (Fase 2) — `league_boundaries`
```sql
alter table public.league_boundaries add column if not exists playoff_estilo text;       -- 'vagas' | 'extra'
alter table public.league_boundaries add column if not exists playoff_ida_e_volta boolean not null default false;
alter table public.league_boundaries add column if not exists playoff_tournament_id uuid
  references public.tournaments (id) on delete restrict;                                  -- sentinela
-- CHECK: estilo coerente com o modo
alter table public.league_boundaries drop constraint if exists league_boundaries_estilo_coerente;
alter table public.league_boundaries add constraint league_boundaries_estilo_coerente
  check ((modo = 'direto' and playoff_estilo is null)
      or (modo <> 'direto' and playoff_estilo in ('vagas','extra')));
create unique index if not exists league_boundaries_playoff_tournament_unico
  on public.league_boundaries (playoff_tournament_id) where playoff_tournament_id is not null;
```
A coerência "vagas potência de 2 / estilo bate com playoff_vagas" NÃO é expressável em CHECK cruzada — validada no Zod + na action `montarPlayoffs` (igual à conservação de tamanho da Fase 1). `playoff_ida_e_volta` herda em `tournaments.ida_e_volta`. NÃO há coluna `modo_chaveamento` em `tournaments` — a SEMENTE da chave (por posição) é responsabilidade da action.

### 8.6 RPC `montar_playoff` (SECURITY DEFINER) + `gerarChaveSemeada` (action)
**RPC `montar_playoff(p_boundary_id uuid, p_competitor_ids uuid[])`**: espelha `montar_temporada` — `set search_path=''`, `auth.uid()` + posse via `boundary → season → competition.created_by` (`NAO_DONO`), `pg_advisory_xact_lock` por `p_boundary_id`, sentinela `playoff_tournament_id` (promote-first). Cria `tournaments(formato='mata_mata', status='rascunho', ida_e_volta=playoff_ida_e_volta, terceiro_lugar=false, por_nome herdado, desempate_criterio herdado, is_public herdado)`, grava `playoff_tournament_id`, insere os `tournament_slots` dos competidores em `p_competitor_ids` **na ordem recebida** (= ordem de classificação/seeding), com degradação de `user_id` anti-`slots_um_clube_por_tecnico` idêntica. **Validações de integridade barata (definer)**: cada `competitor_id` pertence à competição da fronteira (`COMPETIDOR_DE_OUTRA_PIRAMIDE`) e tem `league_division_entry` na divisão-FONTE certa desta season (acesso ⇒ inferior `nivel_superior+1`; playout ⇒ superior `nivel_superior`); homogeneidade `por_nome` das duas divisões (`PLAYOFF_POR_NOME_INCOERENTE`). A RPC retorna o `playoff_tournament_id` + o mapa `competitor_id → slot_id` (a action precisa para semear na ordem certa).

**A GERAÇÃO da chave fica na ACTION** (reúso do motor JS, não na RPC). Helper `gerarChaveSemeada(supabase, tournamentId, confrontos, idaEVolta)` EXTRAÍDO de `iniciarMataMata` mas **SEM `participantes.sort()` nem `montarConfrontos*`** (esses destruiriam o seeding por posição — `iniciarMataMata.ts:681`): recebe os `confrontos` JÁ semeados, roda `gerarFaseInicial`, insere a 1ª fase e **PROMOVE `tournaments` de `rascunho`→`ativo` atomicamente** (INSERT da 1ª fase ANTES do UPDATE de status, tratamento de 23505) — sem isso a chave fica em rascunho e a página de torneio (`torneios/[id]/page.tsx:131-150`) mostra o painel de RE-SORTEIO em vez de deixar jogar/avançar. O seeding é `semearPlayoffPorPosicao(competitorIds_ordenados, slotPorCompetitor)`: bracket padrão (1×N, 2×N-1 espelhado) na ORDEM DE SLOT, para que o pareamento fixo `2i-1×2i` das fases seguintes (`gerarChaveMataMata.ts:485-492`) cruze corretamente (1º só encontra o 2º numa eventual final).

**Idempotência / retomada parcial** (a sentinela é gravada pela RPC ao criar o torneio, mas a 1ª fase é inserida pela ACTION depois): `montarPlayoffs` NÃO pula cegamente quando a sentinela existe — replica o gate `jaGeradas` de `iniciarMataMata` (`tournaments.ts:647-657`): se há `playoff_tournament_id` mas NÃO há `matches WHERE rodada IS NOT NULL`, completa via `gerarChaveSemeada` (idempotente, trata 23505). Fecha a janela "torneio criado, chave não gerada".

### 8.7 Freeze da chave (3 camadas, como na divisão §3.4)
1. **Trigger `lock_division_tournament_reopen`** (em `tournaments`) ganha um 2º ramo: barra reabrir (`encerrado`→`ativo`/`rascunho`) quando `old.id` é referenciado por `league_boundaries.playoff_tournament_id` de uma season `em_fluxo`/`encerrada`. `service_role` livre. Defesa REAL.
2. **Guard na action `reabrirTorneio`** (`tournaments.ts:523-527`, hoje só olha `league_division_seasons.tournament_id`) ganha um 2º ramo análogo em `league_boundaries` (playoff de season congelada) → retorna o `erroPropriedade` (UX consistente; sem o guard cairia no catch genérico "Não foi possível reabrir").
3. **`confirmarFluxoTemporada` EXIGE `status='encerrado'`** em TODA chave de playoff da temporada ANTES de montar a N+1 (não basta `decidida`). Fecha a janela de corrupção: enquanto a season é `'ativa'`, a chave `'ativa'` é editável (legítimo, pré-confirmação); ao confirmar, a season vira `em_fluxo` e o trigger (1) congela. Sem o `encerrado`, o dono poderia editar um placar da semi DEPOIS de a N+1 já ter sido montada. As partidas em si já são travadas por `valida_resultado_mata_mata`/`lock_match_lifecycle` (agnósticos à pirâmide) quanto a renumerar/reabrir fase.

### 8.8 Integração no motor de fluxo (`flowEngine.calcularPlanoFluxo`)
O motor hoje garante a DISJUNÇÃO em duas etapas ACOPLADAS (`flowEngine.ts:240-272`): rebaixa primeiro (popula `caiDe`), depois acessa filtrando `elegiveis = inf.linhas.filter(!jaCaiu)`. O ramo playoff PRESERVA essa ordem com FONTE ÚNICA:
1. **Todos os REBAIXAMENTOS primeiro** — diretos via `resolverZonaDeCorte` (fronteira `direto`/`playoff_acesso`, cujo lado de queda é direto) E playout via `resultadoDaChave` (eliminados no `vagas` / perdedor da final no `extra`) — populam o MESMO `caiDe`/`jaCaiu` por nível.
2. **Só então os ACESSOS** — diretos via `resolverZonaDeCorte` (excluindo `jaCaiu`) E `playoff_acesso` via `resultadoDaChave` (sobreviventes no `vagas` / campeão no `extra`, também excluindo `jaCaiu`).

Sem unificar as fontes ANTES do laço de acesso, um competidor poderia entrar em `sobe` (corte direto acima) E `cai` (playout abaixo) numa divisão do meio, e a vaga de acesso sumiria (prioridade `cai>sobe` em `flowEngine.ts:283`). **Cobertura total**: o laço de emissão itera sobre TODAS as `div.linhas`; o ramo playoff marca `permanece` para todo participante de chave sem desfecho — `|itens| == Σ tamanhos` independente de quantas fronteiras são playoff. **Assertion**: o nº de sobe/cai de cada chave DEVE bater com `movimentoEfetivo` da fronteira (divergência ⇒ erro explícito, não perda silenciosa). `resolvido_por='playoff'` (enum já existe). `validarFechamentoTamanho` inalterado.

**`calcularFluxoTemporada` (action) — SELECT de 3 estados**: hoje o SELECT de fronteiras (`leaguePyramid.ts:502`) traz só `nivel_superior, vagas_acesso, vagas_rebaixamento` — CEGO ao modo. Ampliar para `modo, playoff_estilo, playoff_vagas, playoff_tournament_id`. Ramificar: (1) sem `playoff_tournament_id` ⇒ erro "Monte os playoffs antes"; (2) chave existe mas `!resultadoDaChave(...).decidida` ⇒ erro "Há playoff pendente"; (3) decidida ⇒ injeta o conjunto no motor. A definição de `decidida` vive SÓ em `resultadoDaChave` (pura), consumida tanto por `getPlayoffs` (gating da UI) quanto por `calcularFluxoTemporada` (gate da action) — nunca duas heurísticas. **Empate de agregado em ida-e-volta**: o trigger `valida_resultado_mata_mata` (`schema.sql:646-650`) já BARRA persistir agregado empatado (e empate em jogo único), então a chave SEMPRE resolve para um vencedor uma vez jogada validamente — o dono registra prorrogação/pênaltis na própria súmula (igual ao mata-mata avulso). Não há auto-desempate por seed na Fase 2 (anotado como melhoria futura); o gate `decidida` é só verdadeiro quando todos os confrontos necessários (até a rodada `f` no `vagas`, até a final no `extra`) resolvem.

### 8.9 UI (reúso + aditivo)
- `PlayoffsPanel` (client novo) — padrão de `FluxoTemporadaPanel` (useTransition/toast/router.refresh).
- `BracketView` (RSC, reúso direto) por chave; fetcher devolve `PartidaDaChave[]` via `getTournamentClassificacao(playoffTournamentId).chave`.
- `StandingsZonas`/`derivarZonas` ganham `playoffAcesso?`/`playoffRebaixamento?` (posições que vão à chave). **Correção de premissa**: na tabela, acesso direto = `primary`, rebaixamento direto = `destructive`; `accent` JÁ é o hover de linha (`StandingsTable.tsx:109`) E a cor de sorteio/ajuste — NÃO reusar para playoff. A zona de playoff usa um tratamento DISTINTO de `primary`/`destructive`/`accent` (sugestão: faixa/borda âmbar-`gold`-tracejada ou `warning`, escolhida na implementação e validada para contraste AA a 390px nos 2 temas). Legenda com 3 itens (Acesso direto / Playoff / Rebaixamento). Aditivo (default vazio preserva standalone).
- `FluxoTemporadaPanel` intacto; aceita `resolvido_por='playoff'` no chip (aditivo em `DESTINO_ESTILO`/`ResolvidoPor`).

### 8.10 Edge cases Fase 2 (invariantes precisas)
- **Potência de 2 do `vagas`, FECHADA POR LADO/MODO** (3 invariantes distintas, validadas no Zod + action):
  - `playoff_acesso` `vagas`: `playoff_vagas ∈ {4,8,16,32}` (`Number.isInteger(log2)`) E `Number.isInteger(log2(vagas_acesso))` E `0 < vagas_acesso < playoff_vagas` (`vagas_acesso == playoff_vagas` ⇒ `f=0`, ninguém joga = direto disfarçado → rejeita).
  - `playout` `vagas`: `Number.isInteger(log2(playoff_vagas - vagas_rebaixamento))` E `0 < (playoff_vagas - vagas_rebaixamento) < playoff_vagas`. Ex.: 8 jogam ⇒ `vagas_rebaixamento ∈ {4,6,7}` válidos; **"caem 3 de 8" é IMPOSSÍVEL no `vagas`** (sobreviventes 5 não é potência de 2) → a mensagem de erro SUGERE o estilo `extra`.
  - O wizard oferece SÓ combinações válidas (dropdown derivado por modo+playoff_vagas).
- **Zona cabe na divisão** (3ª invariante, distinta de 5a/5b; precisa do tamanho ⇒ no `superRefine`): `playoff_acesso` ⇒ zona na INFERIOR (`playoff_vagas` no `vagas`; `vagas_acesso + playoff_vagas` no `extra`) ≤ `tamanho_inferior`; `playout` ⇒ zona na SUPERIOR (`playoff_vagas` no `vagas`; `vagas_rebaixamento + playoff_vagas` no `extra`) ≤ `tamanho_superior`. Como `tamanho ≤ DIVISAO_MAX (20) < MATA_MATA_MAX (32)`, o teto de 32 nunca aperta primeiro. Rejeita divisão de tamanho 2 com qualquer playoff.
- **Homogeneidade `por_nome`**: chave entre divisão clube e divisão nome é incoerente — `montar_playoff` recusa (`PLAYOFF_POR_NOME_INCOERENTE`).
- **Idempotência/retomada**: sentinela `playoff_tournament_id` + gate `jaGeradas` (§8.6) — re-rodar `montarPlayoffs` completa torneio sem chave; jogar a chave é o ciclo de torneio idempotente existente.
- **Pontas**: a divisão 1 nunca é INFERIOR de fronteira (não recebe playoff_acesso de cima); a última nunca é SUPERIOR (não sofre playout). Já garantido pelo refine de adjacência (`leaguePyramidSchema.ts:262-271`, independe de modo) — 2 cenários de teste documentam.
- **N=1 / fronteira direto**: inalterado — `montarPlayoffs` é no-op para temporadas sem fronteira de playoff; `mostrarFluxo` cai no caminho da Fase 1.
- **Empate de agregado (ida-e-volta)**: barrado na persistência pelo trigger `valida_resultado_mata_mata` (§8.8) — sem estado preso; sem auto-desempate na Fase 2.
