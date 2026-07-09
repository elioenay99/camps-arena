# Design — add-copa-tecnico-heranca

## Princípio: copa = mais um torneio DERIVADO

`montar_playoff`/`montar_barragem`/`montar_grande_final` já recebem
`p_competitor_ids` (IDs de `league_competitors`), resolvem `holder_user_id` como
técnico, deduplicam colisão de técnico via `v_holders_usados` (degrada o 2º para
`user_id` NULL, respeitando `slots_um_clube_por_tecnico`) e inserem a vaga com
`competitor_id` + `user_id`. O trigger `fn_registrar_coach_tenure` então abre a
tenure; `fn_resolver_season_divisao` devolve `(null,null)` (não há
`league_division_seasons` para playoff/final) → tenure com `season_id` NULO. Ou
seja: **tenures com `season_id` nulo já existem e já circulam por todos os
consumidores hoje.**

Esta change faz a COPA entrar nesse mesmo trilho. A única peça que falta é o elo
`vaga de copa → league_competitor`, hoje descartado. Uma vez presente, copa =
playoff no que diz respeito a técnico/carreira.

## O elo que falta e como completá-lo

`cup_entries` guarda só `team_id` XOR `rotulo`. O `competitor_id` de origem existe
dentro de `classificacao_final_divisao` (`join league_division_entries lde →
league_competitors lcomp`, usa `lde.competitor_id` para ordenar) mas o `returns
table` não o expõe. Cadeia da correção:

1. **`classificacao_final_divisao`** — adiciona `competitor_id uuid` ao `returns
   table` (retorna `lde.competitor_id` / `lcomp.id`). Só origem-DIVISÃO.
   `classificacao_final_copa` (origem-copa) NÃO ganha `competitor_id`. **DDL: DROP +
   CREATE** (não `create or replace` — adicionar coluna ao `returns table` muda o
   tipo de retorno → `42P13`), e como o DROP apaga os privilégios, **re-emitir
   `revoke ... from public, anon` + `grant ... to authenticated`** logo depois (senão
   a função `SECURITY DEFINER` reverte para EXECUTE público → vaza a classificação da
   pirâmide ao anon). Sem CASCADE (nada no banco referencia a função).
2. **`cup_entries.competitor_id`** — nova coluna NULLABLE (`references
   league_competitors on delete set null`). Índice parcial `where competitor_id is
   not null`.
3. **Derivação** (`derivacao.ts`/`derivarVagasCopa`) — ao gravar `cup_entries` a
   partir do resultado de origem-divisão, inclui `competitor_id` SOMENTE quando a
   entrada é por-CLUBE (`team_id` presente). Origem-copa / manual / por-nome/rótulo →
   `competitor_id` NULL (a regra é `team_id` presente, NÃO "a RPC devolveu
   competitor_id" — um competidor de divisão POR-NOME também tem competitor_id, mas
   entra como rótulo e fica sem técnico, conforme a decisão do dono).
4. **`montar_copa`** — para cada `cup_entry`, lê `ce.competitor_id`; se NOT NULL,
   busca `league_competitors.holder_user_id`, aplica a MESMA dedup `v_holders_usados`
   dos derivados, e insere a vaga com `competitor_id` + `user_id`. Se NULL, insere
   `competitor_id`/`user_id` NULOS (comportamento atual, para por-nome/copa/manual).

## Fonte do técnico e vigência

Técnico da copa = `league_competitors.holder_user_id` (o mesmo que os `montar_*`
derivados usam — o técnico-âncora do competidor). Snapshot no momento da MONTAGEM da
copa. **Limitação aceita:** se o técnico-âncora mudar depois da copa montada, a copa
reflete o snapshot (igual aos derivados hoje). Fora de escopo mexer nisso.

Dedup (`v_holders_usados`): se o mesmo `holder_user_id` aparece em dois participantes
da MESMA copa (dois clubes do mesmo técnico), o 2º slot grava `user_id` NULL (mas
mantém `competitor_id`) — idêntico aos derivados. Consequência: uma das duas vagas
não gera tenure de técnico (não infla nem quebra).

## Censo de consumidores (o ponto de maior atenção)

Dar `competitor_id` (de liga) à vaga de copa tem DOIS efeitos que se propagam:

**(A) Tenures de copa (`season_id` nulo) em consumidores de `coach_tenures`:**
- `getTecnicoCampanha` (carreira) — INCLUI jogo de copa. OBJETIVO. ✓
- `getConfrontoTecnicos` (H2H) — INCLUI confronto de copa. OBJETIVO. ✓
- `getTecnicoProfile` — contagem de temporadas já guarda `if (t.season_id)`
  (`getTecnicoProfile.ts:108`) → copa não infla. **Ajuste:** o flag `vigente`
  (`:109 if (t.encerrada_em == null)`) deve considerar só tenures de temporada
  (`season_id NOT NULL`), senão uma tenure de copa aberta marca o clube "· atual"
  indevidamente.
- `getTecnicosDoCompetidor` (timeline do clube) — já trata `season_id` nulo
  (mapeia grande-final; playoff/barragem ficam sem season). **Garantir** que a tenure
  de copa (season nula, não mapeável) receba o mesmo tratamento que playoff/barragem
  (não vira "temporada fantasma" na timeline).
- `getConquistasDoTecnico` — cruza `(competitor_id, season_id)`; copa tem season nula
  → não casa conquista → sem troféu falso. ✓ (confirmar no código).

**(B) Vaga de copa com `competitor_id` em consumidores `competitor_id → slots →
matches`:** `getCompetidorInsights`, `getConfrontoDireto`, `getArtilheirosDoCompetidor`
e afins passam a ver os jogos de copa daquele competidor — **exatamente como já veem
os jogos de playoff/barragem/grande final** (essas vagas derivadas já compartilham o
`competitor_id`). É DESEJADO (registro do clube completo) e BENIGNO. **Não** afeta:
- classificações/tabelas POR-TORNEIO (escopadas por `tournament_id` — a liga segue
  liga);
- `registrar_conquistas_temporada` (escopada a season/divisão; copa tem season nula →
  fora).

A change AUDITA cada consumidor acima e só ajusta onde há regressão real (esperado:
`getTecnicoProfile.vigente` e talvez `getTecnicosDoCompetidor`).

## Casos de borda

- **Participante por-NOME / origem-COPA / MANUAL:** `cup_entries.competitor_id` NULL
  → vaga sem técnico → sem tenure. Jogos não contam. (Decisão do dono.)
- **`holder_user_id` NULL** (competidor sem técnico-âncora): vaga grava
  `competitor_id` mas `user_id` NULL → sem tenure (ramo "vaga vazia" do trigger). OK.
- **Colisão de técnico na copa:** dedup degrada o 2º para `user_id` NULL. OK.
- **Copas já montadas (forward-only):** `montar_copa` só roda na montagem; edições já
  montadas não são tocadas. As entries antigas ficam com `competitor_id` NULL.
- **`bye` de mata-mata** (`vaga_2` NULL): não é partida creditável (um lado só) —
  `ehElegivel` já exige dois lados.
- **Âncora manual + mesma identidade vinda de regra de divisão:** se um clube é ao
  mesmo tempo âncora MANUAL e classificado por uma regra de divisão, a entrada manual
  tem precedência de identidade → `competitor_id` NULL → sem técnico (consistente com
  "manual = sem técnico"). Aceito; resolver herdando na colisão fica fora de escopo.
- **Visibilidade da tenure de copa gated pela pirâmide de origem:** a RLS de
  `coach_tenures` visibiliza a passagem pela visibilidade da COMPETIÇÃO de origem
  (pirâmide), não da copa. Uma copa PÚBLICA cuja pirâmide-origem esteja arquivada tem
  os jogos de copa DESCARTADOS da carreira/confronto para quem não vê a pirâmide
  (inclusive o próprio técnico se não for dono). É o mesmo acoplamento dos derivados;
  documentado como limitação. Corrigir (visibilidade da tenure de copa também pela
  copa) fica fora do escopo mínimo.

## Alternativas descartadas

- **Backfill das copas existentes:** rejeitado pelo dono (forward-only). Evita
  religação heurística e mexer em dado gravado.
- **Atribuição manual de técnico a vaga de copa:** rejeitado (YAGNI); exigiria UI de
  convite/atribuição.
- **Relaxar `coach_tenures.competitor_id` para nullable + linkar copa por outro
  caminho:** desnecessário — reusar o `league_competitor` de origem é mais simples e
  faz o clube da liga e o da copa serem o MESMO competidor (carreira unificada).
