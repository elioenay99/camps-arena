# Design — add-tecnicos-historico

Base para a proposal e para o SQL a mostrar ao dono antes de aplicar em PROD.
Ancora tudo em `file:linha`. As decisões TRAVADAS do dono (1)–(8) estão
respeitadas (ver "Decisões travadas").

## Decisões travadas (não rediscutir)

1. Técnico = USUÁRIO GLOBAL (`users.id`) — o mesmo em qualquer campeonato.
   Competidor POR NOME (`rotulo`) = técnico local (sem conta), só na timeline do
   clube, FORA do perfil global.
2. Técnico é DERIVADO de quem controla a vaga (`slot.user_id`/`rotulo`), sem
   cadastro à parte.
3. Histórico por temporada, INCLUSIVE troca no meio (múltiplas na mesma
   temporada).
4. Escopo COMPLETO (perfil do clube por técnico + perfil do técnico com prêmios
   herdados).
5. Escopo LIGA-only — gate `competitor_id IS NOT NULL` (torneio avulso fora).
6. Backfill SIM — do técnico ATUAL de cada vaga; temporadas encerradas ganham só
   o técnico FINAL (sem trocas históricas — LIMITAÇÃO documentada).
7. Troféu na troca → técnico VIGENTE na rodada final (tenure aberta,
   `encerrada_em IS NULL`). Quem saiu no meio = passagem no histórico, sem
   troféu/posição.
8. Perfil do técnico PÚBLICO respeitando a RLS da competição.

## Vigência: SEMPRE `encerrada_em IS NULL` (nunca `rodada_fim IS NULL`)

O predicado autoritativo de "tenure vigente / técnico atual" é `encerrada_em IS
NULL`. `encerrada_em` é SEMPRE setado no fechamento (junto de `rodada_fim`);
`rodada_fim` é valor de EXIBIÇÃO ("comandou rodadas i–f"). Nunca usar `rodada_fim
IS NULL` como predicado de vigência — o índice único parcial, o trigger, a herança
de troféu e todas as leituras da FASE-2 usam `encerrada_em IS NULL`. (Motivo: numa
janela fim-de-temporada — todas as partidas `encerrada` mas o torneio ainda não
`'encerrado'` — a rodada de fechamento é calculada por fallback; acoplar a
corretude a `rodada_fim` arriscaria mis-atribuir o troféu a quem SAIU. `encerrada_em`
não tem essa fragilidade.)

## Estado "técnico removido/anonimizado" (`user_id NULL, nome NULL`)

`coach_tenures.user_id` é `on delete set null` e `public.users` cascateia de
`auth.users` (`schema.sql:40`). Apagar uma conta zera `user_id` das tenures
daquele técnico. Por isso o CHECK é "NO MÁXIMO um preenchido"
(`coach_tenure_user_ou_nome`), não XOR estrito: `(NULL, NULL)` é o estado LEGÍTIMO
de técnico removido — sem ele, apagar a conta abortaria por violar o CHECK
(técnico indeletável). O trigger e o backfill SEMPRE gravam exatamente um
preenchido; `(NULL,NULL)` só surge por cascade. Consequências na FASE-2: a timeline
do CLUBE exibe a passagem como "técnico removido" (rótulo placeholder, sem link);
o perfil GLOBAL de técnico naturalmente ignora tenures com `user_id IS NULL`.

## Princípio central (o que torna isto simples)

**`tournament_slots.user_id` é o ÚNICO ponto de verdade de "quem comanda a vaga"**
e todo caminho de escrita passa por ele:

- INSERT com `user_id` na materialização — `montar_temporada`
  (`schema.sql:2313-2335`, e as variantes de Clausura/playoff/barragem/final);
- UPDATE que ATRIBUI — `aceitar_convite_vaga` (`schema.sql:1105-1108`, único
  writer de atribuição);
- UPDATE que LIMPA — `desistirDaVaga` (`src/actions/slots.ts:150-155`) e
  `expulsarTecnico` (`slots.ts:209-213`).

Logo, **um único gatilho na coluna `user_id`** captura 100% das transições —
inclusive múltiplas trocas na mesma temporada — sem instrumentar cada
action/RPC. É a espinha do design.

## 1. Mecanismo de captura das TENURES

### Opções avaliadas

| Opção | Cobre troca no meio? | Toca N pontos | Robustez | Veredito |
|---|---|---|---|---|
| **A. Snapshot só no encerramento** (ler `slot.user_id` em `premiarEEncerrarTemporada`) | NÃO — só o técnico FINAL | 1 | — | Reprovada (viola requisito 3) |
| **B. Gravar nas server actions** (aceitar/expulsar/desistir) + RPC de aceite | Sim | ≥5 (2 actions + RPC + 5 INSERTs de materialização) | Frágil: esquecer um caminho = buraco silencioso; três linguagens | Reprovada |
| **C. Trigger `AFTER INSERT OR UPDATE OF user_id`** | Sim, N vezes | 1 (a coluna) | Alta: impossível escrever `user_id` sem passar pelo trigger | **RECOMENDADA** |

### Recomendação: Opção C (trigger na coluna) + tenure aberta = "vigente"

Não há write separado no encerramento nem snapshot: a **tenure com `encerrada_em
IS NULL` É o técnico vigente** (ver "Vigência" acima). Resolve troféu (vigente na
final) sem materialização extra.

**Lógica do trigger** (`fn_registrar_coach_tenure`, `SECURITY DEFINER`,
`search_path=''`, **sem `raise`**):

- **AFTER INSERT** (materialização — torneio `rascunho`, sem `matches` ainda), só
  se `NEW.competitor_id IS NOT NULL`:
  - `user_id NOT NULL` (holder propagado, `schema.sql:2322-2335`) → **abre**
    tenure com `rodada_inicio = NULL` ("desde o início da temporada");
  - vaga por NOME (`team_id NULL AND rotulo NOT NULL`, sempre `user_id NULL`) →
    abre tenure de **nome** (`nome = NEW.rotulo`, `user_id NULL`);
  - clube vazio (`user_id NULL`, com `team_id`) → nada.
- **AFTER UPDATE OF user_id** com `OLD.user_id IS DISTINCT FROM NEW.user_id`:
  - `v_rodada` = rodada EFETIVA da troca = `fn_rodada_corrente(NEW.tournament_id)`;
    se NULL (janela fim-de-temporada: todas `encerrada`, torneio ainda não
    `'encerrado'`), fallback para a ÚLTIMA rodada (`max(rodada)`) — assim
    `rodada_fim`/`rodada_inicio` nunca ficam NULL num torneio com partidas;
  - `OLD.user_id NOT NULL` → **fecha** a tenure aberta daquela vaga+user
    (`rodada_fim = v_rodada`, `encerrada_em = now()`);
  - `NEW.user_id NOT NULL` → **abre** nova tenure (`rodada_inicio = v_rodada`).
  - **Convenção de fronteira (spec + impl idênticos):** a rodada da troca
    `v_rodada` é a fronteira COMPARTILHADA — quem saiu fecha EM `v_rodada` e quem
    entrou abre EM `v_rodada` (ex.: A comandou `[início, 7]`, B `[7, 12]`, C `[12,
    …]` vigente).

Assim `aceitar_convite_vaga` abre, `expulsar`/`desistir` fecham, um novo convite
reabre — quantas vezes ocorrer.

**Gate de escopo — só LIGA:** `competitor_id IS NOT NULL`. `tournament_slots`
também serve torneios avulsos (`aceitar_convite_vaga` é genérico), mas nesses
`competitor_id IS NULL`. Restringir a slots com `competitor_id` (1) alinha o
histórico a competidor/temporada/conquistas, (2) permite RLS idêntica à de
`conquistas` (via `league_competitors`), e (3) evita ruído.

**Competidores POR NOME:** tenure com `nome`/`user_id NULL` — nunca troca (rótulo
travado pós-rascunho por `lock_slot_relations` `schema.sql:1189-1198`, sem convite
por `block_slot_invite_por_nome` `schema.sql:1219-1233`). Aparece na timeline do
clube como técnico local; EXCLUÍDA do perfil global (sem conta). Coerente com a
decisão (1).

### Pontos exatos de engate
- Trigger em `public.tournament_slots`, `AFTER INSERT OR UPDATE OF user_id`.
  Coexiste com `tournament_slots_lock_relations` (`schema.sql:1204-1207`) — aquele
  é BEFORE e não toca `user_id`.
- A materialização já roda como `SECURITY DEFINER` dentro de tx (`montar_temporada`
  `schema.sql:2200+`); o trigger AFTER dispara na mesma tx — atômico com o INSERT
  do slot.
- Nenhuma alteração em `aceitar_convite_vaga`, `expulsarTecnico`, `desistirDaVaga`,
  `montar_temporada` — o funil é a coluna.
- **Posição física no `schema.sql`:** o bloco (tabela + helpers + trigger +
  backfill) vai ao FINAL do arquivo (após `conquistas`), porque referencia
  `league_competitors` (2086), `league_seasons` (1869), `league_division_seasons`
  (1905) e `matches` (257), todos definidos antes. O "engate na coluna" é o ponto
  CONCEITUAL do trigger, não a ordem textual do DDL.

## 2. DDL (esboço — ver `ddl.sql` / `supabase/schema.sql` para o texto exato)

Tabela `public.coach_tenures`:
- `id`, `slot_id → tournament_slots (cascade)`, `competitor_id → league_competitors
  (cascade)`, `tournament_id → tournaments (cascade)`;
- `season_id → league_seasons (cascade, nullable)`, `division_season_id →
  league_division_seasons (cascade, nullable)` — best-effort (NULL em
  playoff/barragem/final);
- "No máximo um preenchido" `user_id → users (set null)` **vs** `nome text`
  (constraint `coach_tenure_user_ou_nome`; `(NULL,NULL)` = técnico removido —
  ver "Estado técnico removido/anonimizado" acima);
- `rodada_inicio smallint` (NULL = início), `rodada_fim smallint` (rodada de
  fechamento — EXIBIÇÃO), `aberta_em`, `encerrada_em` (NULL = VIGENTE — marcador
  autoritativo).

Índices: único parcial `coach_tenures_slot_aberta_uk (slot_id, coalesce(user_id,
sentinela)) where encerrada_em is null` (uma tenure vigente por vaga+usuário) +
`user_id`/`competitor_id`/`season_id`.

Helper de rodada corrente (STABLE, espelha `getTournamentClassificacao.ts:736-741`):
```sql
create or replace function public.fn_rodada_corrente(p_tournament_id uuid)
returns smallint language sql stable security definer set search_path = '' as $$
  select min(rodada)::smallint from public.matches
   where tournament_id = p_tournament_id and status <> 'encerrada' and rodada is not null;
$$;
```

Helper de resolução season/division (`fn_resolver_season_divisao`): consulta
`league_division_seasons` por `tournament_id OR tournament_id_clausura` (cobre
anual + Apertura/Clausura, portadores do standing/troféu; playoff/barragem/final
→ `NULL`). Retorna `(season_id, division_season_id)`.

Ambos os helpers têm EXECUTE revogado de `public`/`anon`/`authenticated` (internos
ao trigger, que é `SECURITY DEFINER` e os invoca como owner).

Função do trigger (a lógica do §1), `security definer set search_path=''`, **sem
`raise`** (um erro reverteria a atribuição do técnico — a corretude vem de testes,
não de swallow). Tudo é **trigger**, zero escrita por action.

RLS: `coach_tenures_select` (anon+authenticated) ESPELHANDO `conquistas_select`
(`schema.sql:5225-5240`) via `league_competitors`; `grant select` + REVOKE
explícito de escrita (lição conquistas: Supabase auto-concede escrita em tabela
nova). Nenhuma policy/grant de escrita — o único writer é a função de trigger.

Backfill: INSERT único das `tournament_slots` atuais com `competitor_id` → 1
tenure vigente por vaga (técnico FINAL). Idempotente (`NOT EXISTS`).

## 3. Perfil do CLUBE por técnico + Perfil do TÉCNICO (FASE 2)

### Regra de atribuição do troféu (com troca no meio) — decisão (7)
**Troféu estrutural da temporada → técnico VIGENTE na rodada final** = a tenure
ABERTA (`encerrada_em IS NULL`) para aquele `(competitor_id, season_id)`. Técnico
que saiu no meio aparece no histórico como *stint* ("comandou rodadas i–f"), SEM o
troféu e sem `posicao_final` (o resultado é da temporada inteira, não do trecho).
`conquistas` NÃO muda — o writer autoritativo `registrar_conquistas_temporada`
(`schema.sql:5258-5399`) segue gravando por `competitor_id`; a herança é DERIVADA
em leitura cruzando tenure-vigente × `conquistas`. NUNCA tocar esse writer nem a
ordem de `premiarEEncerrarTemporada.ts`.

### Regra do SPLIT (Apertura/Clausura) — dedup do troféu de temporada
`fn_resolver_season_divisao` casa **Apertura E Clausura na MESMA `(season_id,
division_season_id)`** (ambas portam o standing combinado), e os slots da GRANDE
FINAL ficam com `season_id NULL` (o `final_tournament_id` está FORA do resolver).
Consequência: numa temporada split há **2 tenures vigentes por `(competitor_id,
season_id)`** — uma ancorada no torneio da Apertura, outra no da Clausura — e o par
`(competitor_id, season_id)` de um mesmo técnico-campeão apareceria DUAS vezes. Os
dados POR VAGA estão certos; o cuidado é na AGREGAÇÃO (leitura da FASE-2).

Verdade canônica do app: **o campeão de split é o vencedor da GRANDE FINAL**
(`getCompetitorProfile.ts` via `resolverCampeaoDivisaoSplit`/`getGrandeFinal`), não
o líder da tabela combinada. Portanto o troféu de temporada vai ao técnico VIGENTE
no torneio **DECISIVO**: a **grande final** se ela existir (o técnico vigente na
vaga da grande final daquele competidor); senão a **Clausura** (o último turno).
Regras da FASE-2:
- `getConquistasDoTecnico` **DEDUPLICA por `(competitor_id, season_id)`** — cada
  temporada rende NO MÁXIMO um conjunto de troféus por competidor, nunca somando
  Apertura+Clausura como dois técnicos-campeões nem repetindo o mesmo troféu 2×
  (a `conquistas_unica (escopo, ref_id, competitor_id, tipo)` já é única por
  `(competidor, season, tipo)`; o dedup é da lista de PARES de entrada, para não
  gerar linhas duplicadas no `in (...)`).
- Como escolher a tenure certa por par: preferir a tenure vigente cujo
  `tournament_id` seja o torneio DECISIVO — grande final (`ds.final_tournament_id`)
  se houver, senão a Clausura (`ds.tournament_id_clausura`), senão o único torneio
  (ciclo anual, `ds.tournament_id`). Assim, se técnicos DIFERENTES comandaram
  Apertura e Clausura, o troféu vai ao do turno decisivo — coerente com a decisão
  (7). O técnico do turno não-decisivo consta como stint no perfil do clube, sem
  troféu.
- Ciclo ANUAL (não-split): o par `(competitor_id, season_id)` já é único (uma só
  tenure vigente por vaga) — o dedup é no-op, mas mantê-lo é barato e blinda o
  split.

### A) Perfil do CLUBE por técnico — nova seção no perfil existente
Fetcher `getTecnicosDoCompetidor(competitorId)` em `src/features/league/data/`,
renderizado em `src/app/dashboard/ligas/competidor/[id]/page.tsx` (junto de
`CompetidorHallDaFama`). Query: `coach_tenures where competitor_id = :id` left
join `users` (nome do técnico, ou `coach_tenures.nome` se por-nome) + `league_
seasons` (rótulo/numero), ordenado por `s.numero, rodada_inicio`. Retorna a
timeline por temporada: quem comandou, rodadas i–f, marcando o vigente-final.
Espelha o padrão `TemporadaTimeline`.

### B) Perfil do TÉCNICO (global, por `user_id`) — rota nova
Rota `src/app/dashboard/ligas/tecnico/[userId]/page.tsx` (`[userId]` validado como
uuid, espelhando `competidor/[id]/page.tsx:33,48`). Server component com
`Promise.all`:

- `getTecnicoProfile(userId)` — identidade `users(id, nome)` + tenures (só `user_id
  NOT NULL`) join `league_competitors`/`teams`/`league_competitions`/`league_
  seasons`. Agrega: clubes comandados (distinct `competitor_id`), temporadas, e
  por-stint o resultado quando a tenure é vigente (`encerrada_em IS NULL`) (join
  `league_division_entries` por `competitor_id + division_season_id` →
  `posicao_final/destino`, o shape de `getCompetitorProfile.ts:129-140`).
- `getConquistasDoTecnico(userId)` — prêmios HERDADOS: o conjunto de pares
  `(competitor_id, season_id)` das tenures VIGENTES (`encerrada_em IS NULL`) do
  técnico, **deduplicado por `(competitor_id, season_id)`** e resolvendo o SPLIT
  pela tenure do torneio decisivo (ver "Regra do SPLIT" acima) →
  `conquistas where escopo = 'temporada' and (competitor_id, ref_id) in (<pares>)`.
  Usa a UNIQUE `conquistas_unica (escopo, ref_id, competitor_id, tipo)`
  (`schema.sql:5214`) e o índice `conquistas_escopo_ref_idx` (`5219`). Devolve o
  mesmo `Trofeu[]` de `getConquistasDoCompetidor.ts:18-24`, AGRUPADO por técnico —
  reaproveita o componente de hall.

Link para o perfil do técnico a partir de `getTournamentClassificacao.ts:389-390`
(já lê `tecnico:{ id, nome }`) e da timeline do clube.

## 4. Censo de consumidores / riscos (padrão "motor novo")

- **Quem lê `slot.user_id` hoje** (todos ADITIVOS — a coluna continua sendo o
  técnico atual):
  - `getTournamentClassificacao.ts:389-390` — `tecnico:users!tournament_slots_
    user_id_fkey (id, nome)` em `v1`/`v2`. Intacto; ganha só um link para a rota.
  - `confrontosTextoDaRodada.ts`, `getVagasDoTorneio.ts`, `getActiveMatches.ts`,
    `listaTimesTexto.ts` — leem o técnico atual; NÃO consomem histórico. Sem
    alteração.
- **Lição do REVOKE** (memória `arena-conquistas-hall`): tabela nova recebe
  escrita automática de anon/authenticated → REVOKE explícito no DDL, igual
  `conquistas:5247`.
- **By-name**: tenure com `nome`/`user_id NULL`; nunca vira conta agregável
  (decisão 1). Fora do perfil global; só na timeline do clube.
- **RLS**: `coach_tenures_select` espelha `conquistas_select` via
  `league_competitors` — por isso o gate `competitor_id NOT NULL` (torneio avulso
  não tem competidor e ficaria sem âncora de visibilidade). O perfil do técnico
  filtra por RLS: mostra só o histórico em competições que o observador pode ver
  (comportamento correto e desejado — decisão 8).
- **NÃO tocar o writer autoritativo** `registrar_conquistas_temporada`
  (`schema.sql:5258-5399`) nem a ordem travada de `premiarEEncerrarTemporada.ts`.
  A herança é 100% leitura derivada.
- **Risco do trigger**: um `raise` reverteria `aceitar_convite_vaga`/`expulsar`/
  `montar_temporada`. Mitigação: o trigger só faz INSERT/UPDATE em `coach_tenures`,
  sem exceções; corretude coberta por testes (materialização abre; convite reabre;
  expulsão fecha; troca dupla = 2 fechadas + 1 vigente).
- **Idempotência da materialização**: `montar_temporada` é idempotente por
  sentinela (`schema.sql:2283`); o índice parcial `coach_tenures_slot_aberta_uk` é
  a defesa extra contra tenure-vigente duplicada por vaga.
- **Backfill**: forward-only; temporadas já `encerrada` não têm histórico de
  trocas. O backfill registra só o técnico FINAL (LIMITAÇÃO documentada — decisão
  6).

## 5. Alternativas consideradas

- **Snapshot no encerramento (Opção A):** rejeitada — perde quem saiu no meio
  (viola requisito 3).
- **Gravar nas server actions (Opção B):** rejeitada — superfície de ≥5 pontos em
  3 linguagens; esquecer um caminho = buraco silencioso.
- **Denormalizar nome/escudo do técnico na tenure:** rejeitado — identidade
  resolve por join (lição artilharia/conquistas); a tenure guarda só a referência.
- **Materializar o troféu na tenure vigente-final:** desnecessário — a herança é
  derivada em leitura (tenure-vigente × `conquistas`), sem duplicar o writer.

---

Arquivos-âncora: `supabase/schema.sql` (1105-1108 aceite; 1189-1233 locks slot;
1204-1207 ponto conceitual do trigger; 2313-2335 materialização; 5195-5248 padrão
conquistas+REVOKE; 5258-5399 writer a NÃO tocar); `src/actions/slots.ts`
(150-155, 209-213 limpeza); `src/features/standings/data/getTournamentClassificacao.ts`
(389-390 leitura do técnico, 736-741 rodada corrente);
`src/features/league/data/getCompetitorProfile.ts` + `getConquistasDoCompetidor.ts`
(shapes a espelhar); `src/app/dashboard/ligas/competidor/[id]/page.tsx` (rota a
espelhar em `.../tecnico/[userId]`).
