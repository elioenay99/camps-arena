## Why

Hoje `tournament_slots.user_id` guarda apenas o técnico ATUAL de cada vaga: a
classificação lê `tecnico:{ id, nome }` (`getTournamentClassificacao.ts:389-390`),
mas nada persiste QUEM comandou o clube ao longo do tempo. Quando um técnico é
expulso, desiste, ou aceita um convite no meio de uma temporada, a posse anterior
some — o app não sabe dizer "o Ataias comandou o Fluminense nas rodadas 1–12 da
Temporada 3, e o Endrick assumiu da 13 ao título". Sem esse registro não há:

- **perfil do clube por técnico** (a linha do tempo de quem passou pela vaga),
- **perfil do técnico** (um usuário global cujos títulos são herdados dos clubes
  que ele comandou no instante do título),
- nem a atribuição correta de troféu quando há **troca no meio da temporada**.

Esta change materializa esse histórico como uma tabela `public.coach_tenures` —
uma linha por PASSAGEM de técnico numa vaga — alimentada por um ÚNICO trigger na
coluna `tournament_slots.user_id` (o funil por onde toda atribuição/limpeza/
materialização já passa). A tenure com `encerrada_em IS NULL` É o técnico VIGENTE,
o que resolve o troféu (vigente na rodada final) sem materialização extra. Sobre
isso constroem-se dois perfis de leitura derivada (clube e técnico), sem tocar o
writer de conquistas nem a ordem de encerramento — a herança de prêmios é 100%
leitura cruzando tenure-vigente × `conquistas`.

O escopo é **LIGA-only** (gate `competitor_id IS NOT NULL`): torneio avulso não
tem competidor persistente (sem âncora de temporada/visibilidade via
`league_competitors`) e fica de fora (ver "Fora de escopo"). Técnico = USUÁRIO
GLOBAL (`users.id`) — o mesmo em qualquer campeonato; competidor POR NOME
(`rotulo`, sem conta) vira técnico LOCAL, presente só na timeline do clube e
excluído do perfil global.

## What Changes

- **Schema (DDL aditivo, só documentado — não aplicado).** Nova tabela
  `public.coach_tenures`: uma passagem por linha, referenciando a vaga
  (`tournament_slots`), o competidor persistente (`league_competitors`), o
  torneio da divisão, e — best-effort — a temporada/divisão (`league_seasons` /
  `league_division_seasons`). Técnico = NO MÁXIMO um preenchido entre conta global
  (`user_id`) e rótulo local (`nome`, vaga por-nome) — ambos nulos é o estado
  legítimo "técnico removido/anonimizado" (surge só por cascade de exclusão de
  conta, com `user_id on delete set null`). `rodada_inicio` delimita a passagem
  (NULL = "desde o começo da temporada"); a VIGÊNCIA é dada por `encerrada_em IS
  NULL` (marcador autoritativo), enquanto `rodada_fim` é valor de exibição. Índice
  ÚNICO PARCIAL de tenure vigente por vaga+usuário (defesa contra duplicata) +
  índices por `user_id`/`competitor_id`/`season_id`. Nome do técnico resolve por
  join (não denormalizado — lição da artilharia/conquistas).
- **Captura por TRIGGER na coluna `user_id` — writer único.** Função
  `fn_registrar_coach_tenure` (`SECURITY DEFINER`, `search_path=''`, SEM `raise`)
  no trigger `AFTER INSERT OR UPDATE OF user_id ON tournament_slots`, gate
  `competitor_id IS NOT NULL`. AFTER INSERT (materialização): `user_id` propagado
  → abre tenure desde o início; vaga por-nome → abre tenure de rótulo; clube vazio
  → nada. AFTER UPDATE de `user_id` (OLD≠NEW): fecha a tenure aberta do técnico que
  saiu (`rodada_fim = fn_rodada_corrente`) e abre a do que entrou. Assim
  `aceitar_convite_vaga` abre, `expulsar`/`desistir` fecham, novo convite reabre —
  quantas vezes ocorrer, sem instrumentar cada action. NENHUMA server action é
  alterada — o funil é a coluna.
- **Helpers `fn_rodada_corrente(uuid)` e `fn_resolver_season_divisao(uuid)`**
  (`SECURITY DEFINER`, `search_path=''`, EXECUTE revogado dos papéis de API —
  internos ao trigger). O primeiro espelha a rodada ativa de
  `getTournamentClassificacao`; o segundo resolve `(season_id, division_season_id)`
  do torneio da divisão (anual + Apertura/Clausura; playoff/barragem/final →
  `NULL`).
- **RLS de `coach_tenures` — SELECT-only, sem writer via PostgREST.** A LEITURA
  (anon+authenticated) ESPELHA a visibilidade do competidor (`conquistas_select`
  via `league_competitors`): visível quando a competição está `ativa`, é do dono,
  ou o solicitante vê bastidores. NENHUM grant/policy de escrita: o único writer é
  a função de trigger `SECURITY DEFINER`. `grant select` + REVOKE explícito de
  insert/update/delete/truncate/references/trigger de anon/authenticated (lição
  conquistas: Supabase auto-concede escrita em tabela nova).
- **Backfill (documentado, aplicado pelo dono).** INSERT único a partir das
  `tournament_slots` ATUAIS com `competitor_id` → 1 tenure VIGENTE por vaga (o
  técnico FINAL de cada temporada). Idempotente (`NOT EXISTS`). LIMITAÇÃO: o
  trigger é forward-only; temporadas já encerradas ganham SÓ o técnico final, sem
  as trocas históricas (que nunca foram registradas) — documentado.
- **Perfil do CLUBE por técnico (FASE 2).** Fetcher
  `getTecnicosDoCompetidor(competitorId)` (`src/features/league/data/`) →
  timeline por temporada (quem comandou, rodadas i–f, marca o vigente-final),
  renderizada no perfil do competidor
  (`src/app/dashboard/ligas/competidor/[id]/page.tsx`) ao lado do hall da fama.
- **Perfil do TÉCNICO — rota nova (FASE 2).**
  `src/app/dashboard/ligas/tecnico/[userId]/page.tsx` (uuid validado, espelha
  `competidor/[id]`). `getTecnicoProfile(userId)` (só `user_id NOT NULL`: clubes
  comandados, temporadas, resultado por-stint quando vigente-final) +
  `getConquistasDoTecnico(userId)` (prêmios HERDADOS: pares `(competitor_id,
  season_id)` das tenures vigentes-final × `conquistas` escopo `temporada`).
  Reaproveita os shapes de `getCompetitorProfile`/`getConquistasDoCompetidor`.
  Link do técnico a partir da classificação (já lê `tecnico {id,nome}`) e da
  timeline do clube. NÃO toca o writer `registrar_conquistas_temporada` nem a
  ordem de `premiarEEncerrarTemporada` — herança = 100% leitura derivada.

## Capabilities

### New Capabilities
- `coach-history`: o histórico de posse de vaga por técnico — a semântica da
  tenure (uma passagem por linha; vigente = `encerrada_em NULL`), a captura por
  trigger na coluna `user_id`, a atribuição do troféu ao técnico vigente na rodada
  final, os perfis do clube (timeline) e do técnico (global, com prêmios
  herdados), e a exclusão do técnico local (por-nome) do perfil global.

### Modified Capabilities
- `data-model`: tabela `public.coach_tenures` (+ índices).
- `row-level-security`: políticas de `coach_tenures` (SELECT-only) + a autoridade
  exclusiva do trigger `SECURITY DEFINER` como writer + REVOKE de escrita.

## Impact

- **Banco de dados (DDL ADITIVO, MOSTRADO ao dono — REGRA 4; esta change
  documenta, não aplica).** `supabase/schema.sql` (fonte de verdade) +
  `openspec/changes/add-tecnicos-historico/ddl.sql` (recorte exato, idempotente,
  com pré/pós-checagens). Escopo: tabela `coach_tenures` (+ índices + RLS
  SELECT-only + grant só de `select` + REVOKE de escrita), 2 helpers internos
  (`fn_rodada_corrente`, `fn_resolver_season_divisao`), 1 função de trigger + o
  trigger em `tournament_slots`, e o backfill. Nada destrutivo; nenhum dado
  existente é alterado. `src/lib/supabase/database.types.ts` atualizado À MÃO
  (`coach_tenures` + `fn_rodada_corrente`) para o TS passar sem a tabela existir
  ainda em PROD.
- **Código de aplicação (FASE 2):**
  - `src/features/league/data/getTecnicosDoCompetidor.ts` (`server-only`:
    timeline de técnicos do clube).
  - `src/features/league/data/getTecnicoProfile.ts` +
    `getConquistasDoTecnico.ts` (`server-only`: perfil global + prêmios herdados).
  - `src/app/dashboard/ligas/tecnico/[userId]/page.tsx` (rota nova, uuid validado).
  - `src/app/dashboard/ligas/competidor/[id]/page.tsx` (render da timeline).
  - Link do técnico na classificação e na timeline do clube (componentes RSC).
- **Segurança/autorização:** RLS `coach_tenures` = SELECT-only por visibilidade do
  competidor; ZERO grant de escrita → forja por PostgREST impossível. O writer é o
  trigger `SECURITY DEFINER` na coluna `user_id`; os helpers têm EXECUTE revogado
  dos papéis de API. O perfil do técnico é público, filtrado pela RLS da
  competição (você vê o histórico dele só onde já pode ver).
- **Consumidores de `slot.user_id`:** todos ADITIVOS — a coluna continua sendo o
  técnico atual (`getTournamentClassificacao`, `confrontosTextoDaRodada`,
  `getVagasDoTorneio`, `getActiveMatches`, `listaTimesTexto`). Nada muda; a
  classificação ganha só um link para a nova rota.
- **Risco do trigger:** um `raise` reverteria `aceitar_convite_vaga`/`expulsar`/
  materialização. Mitigação: o trigger só faz INSERT/UPDATE em `coach_tenures`,
  SEM exceções; a corretude é coberta por testes (materialização abre; convite
  reabre; expulsão fecha; troca dupla = 2 tenures fechadas + 1 vigente).
- **Dependências:** nenhuma nova.
- **Testes:** derivação/fetchers em JS (`getTecnicosDoCompetidor`,
  `getTecnicoProfile`, `getConquistasDoTecnico` — shapes, agrupamento, atribuição
  do troféu ao vigente-final, exclusão do por-nome do perfil global). A lógica do
  TRIGGER é SQL: casos (materialização abre; convite reabre; expulsão fecha; troca
  dupla = 2 fechadas + 1 vigente) descritos como pgTAP no `ddl.sql`/spec, rodáveis
  no Supabase LOCAL — NÃO simulados em jsdom.

## Fora de escopo (follow-up documentado)

- **Torneio avulso.** `tournament_slots.competitor_id` nasce NULL no avulso (sem
  competidor persistente, sem perfil de competidor avulso) → não há âncora de
  temporada nem de visibilidade via `league_competitors`. O gate `competitor_id
  IS NOT NULL` o deixa de fora. Uma change futura pode modelar identidade
  persistente para o avulso.
- **Reconstrução do passado.** O trigger é forward-only; o backfill registra
  apenas o técnico FINAL de cada temporada já encerrada, sem as trocas
  intermediárias (que nunca foram gravadas). Adiante, todo histórico é completo.
- **Copa.** `cup_entries` chaveia por `team_id/rotulo`, não `league_competitors` —
  fora do modelo de tenure por competidor.
