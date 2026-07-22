## Why

Hoje **toda** vaga de copa é derivada da **classificação final** de uma origem, o que exige uma
temporada `encerrada` (ativação diferida — `classificacao_final_divisao`, `schema.sql:4300`). O dono
tem uma pirâmide (Série A + Série B, 40 clubes) com a **temporada 1 em andamento** e quer montar uma
"Copa do Brasil" com esses 40 clubes **agora**, sem encerrar a temporada. Isso é hoje impossível:
não há origem que leve TODOS os competidores de uma divisão independente de posição/encerramento.

Além disso, a herança de técnico da copa clássica lê `league_competitors.holder_user_id`
(`schema.sql:4693`), um campo **vestigial** — verificado no banco: **80 competidores, 0 com holder
preenchido**. O técnico vivo de um clube durante a temporada está no **slot**
(`league_division_entries.slot_id → tournament_slots.user_id`), não no holder. Uma origem "todos"
que dependa de holder nasceria sem técnico algum. Ela precisa resolver o técnico pelo **slot**.

Falta também uma **visão consolidada**: quem olha a pirâmide não vê quais copas ela alimenta.

## What Changes

- **Nova origem de qualificação `divisao_todos`** — um novo valor do enum `cup_origin_type` (hoje
  `('divisao','copa')`). Uma regra `divisao_todos` leva **todos os competidores** de uma divisão da
  **temporada corrente** (maior `numero`), **sem** exigir `encerrada` e **sem** faixa de posição.
- **Seleção por divisão**: o dono adiciona uma regra "todos da Série A" e outra "todos da Série B"
  (misturáveis com quaisquer outras regras). Não é "pirâmide inteira num clique".
- **Puxa clube órfão** (vaga sem técnico) — o clube entra na copa mesmo sem técnico no slot.
- **Técnico dinâmico via slot** — a origem resolve o técnico **atual** do clube na pirâmide a partir
  do slot da temporada corrente (não do holder vestigial, não congelado na criação da regra). Cada
  **derivação** de uma edição repega os técnicos atuais; re-derivar atualiza.
- **Formato que comporta 40**: reusa o formato **grupos + mata-mata** já existente (8 grupos de 5 →
  classifica 4 → chave de 32). Nada muda no motor de formato; mata-mata puro tampa em 32.
- **Nova RPC `inscritos_divisao`** (SECURITY DEFINER, leitura gated) — clone de
  `classificacao_final_divisao` **sem** o gate de encerrada e **sem** filtro de `posicao_final`, que
  devolve os inscritos da temporada corrente com `competitor_id` e o **técnico resolvido do slot**,
  em rank determinístico (`created_at, id`). Replica o gate de consentimento
  (`is_public OR created_by = auth.uid()`) da RPC clássica.
- **Motor de derivação**: ramo novo em `derivarPool` que consome a **lista inteira** da origem
  `divisao_todos` (não a expande em faixa `posicao_inicio..posicao_fim` — isso geraria milhares de
  lacunas). `chaveDaOrigem` ganha uma chave própria (`todos:…`), distinta de `div:…`, porque a
  leitura vem de outra RPC.
- **Semeadura do técnico dinâmico**: `cup_entries` ganha `tecnico_user_id` (nullable, FK
  `users ON DELETE SET NULL`), gravado na derivação a partir do técnico do slot; `montar_copa`
  passa a usar `coalesce(cup_entries.tecnico_user_id, league_competitors.holder_user_id)` — o caminho
  clássico fica **intocado** (para ele `tecnico_user_id` é sempre NULL, cai no holder de sempre).
- **Visão consolidada (ZERO-DDL)**: nova seção "Copas" na página da pirâmide
  (`/dashboard/ligas/[id]`) listando as copas alimentadas por aquela pirâmide (vínculo já consultável
  por `origem_competition_id` — `getCup.ts:145`). Só leitura + UI, respeitando a RLS/visibilidade.
- **UI das regras**: opção de origem "todos os clubes da divisão" no wizard/editores, escondendo os
  inputs de faixa quando o tipo é `divisao_todos`.
- Sem regressão na copa clássica nem na pirâmide: `divisao`/`copa` seguem lendo a classificação
  encerrada; a pirâmide só é **lida**.

## Capabilities

### Modified Capabilities
- `cup-competitions`: o modelo de **regra de qualificação** ganha a origem `divisao_todos` (divisão
  inteira, sem faixa, sem encerramento), com a CHECK de origem/faixa ajustada e o gate de
  consentimento replicado na nova RPC de leitura.
- `cup-editions`: a **derivação** ganha o ramo "todos os competidores da temporada corrente" e a
  **resolução dinâmica de técnico via slot**, gravada em `cup_entries.tecnico_user_id` e semeada por
  `montar_copa`; clube órfão entra sem técnico.
- `league-pyramid`: a página da pirâmide ganha uma **seção consolidada de copas** alimentadas por ela.

### New Capabilities
<!-- Nenhuma. Tudo estende capacidades existentes. -->

## Impact

- **Banco (DDL — aplicada manualmente/via MCP mostrando o SQL antes; espelhada em `supabase/schema.sql`)**:
  novo valor de enum `cup_origin_type` (`divisao_todos`); relaxar `NOT NULL` de
  `cup_qualification_rules.posicao_inicio/fim` e reescrever as CHECKs `_origem_xor` e `_faixa_valida`;
  nova coluna `cup_entries.tecnico_user_id`; nova RPC `inscritos_divisao` (DEFINER, grants
  re-emitidos); alteração de `montar_copa` (coalesce do técnico) com **re-emissão de grants** após o
  DROP; `database.types.ts` atualizado à mão.
- **Motor** (`src/features/cup/derivacao.ts`, `types.ts`): ramo `divisao_todos` (lista inteira),
  chave de origem própria, passthrough de `tecnico_user_id`.
- **Server Actions** (`src/actions/cups.ts`): INSERT/edição de regras `divisao_todos` (sem faixa);
  ramo em `lerOrigemViaRpc` (chama `inscritos_divisao`); `resolverNomesDeOrigem`;
  `validarConsentimentoRegras`; gravação de `tecnico_user_id` no preview.
- **Schema Zod** (`src/schema/cupSchema.ts`): `ORIGEM_TIPOS_DISPONIVEIS` ganha `divisao_todos`;
  posição opcional para o novo tipo no `superRefine`.
- **UI** (`src/features/cup/components/*`, `src/app/dashboard/copas/*`): opção de origem "todos" com
  faixa oculta; e **seção "Copas"** em `src/app/dashboard/ligas/[id]/page.tsx` + novo fetcher
  (ZERO-DDL).
- **Reuso sem alteração**: motor de grupos/mata-mata, `tournaments`/`tournament_slots`/`match`, RLS
  das tabelas `cup_*` e o restante do fluxo de edição (derivar → ajustar → montar → iniciar →
  encerrar).
- **Dívida registrada (fora de escopo)**: `league_competitors.holder_user_id` continua vestigial; a
  herança clássica de técnico segue resolvendo NULL. Não é corrigida aqui.
