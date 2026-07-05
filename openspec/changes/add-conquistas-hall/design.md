# Design — add-conquistas-hall

## Contexto e restrições

O encerramento de TEMPORADA é o gancho da premiação (escopo LIGA-only nesta
change):

- **Liga (temporada):** `confirmarFluxoTemporada` (`src/actions/leaguePyramid.ts`)
  é o único caminho de encerrar. Ele já CONGELA, por competidor, o resultado em
  `league_division_entries` (`posicao_final`, `destino ∈ sobe|cai|permanece`,
  `pontos`, `jogos`) usando `computeStandings`/`resultadoDaChave`, e depois marca
  a season `encerrada`. A reabertura de temporada congelada é BLOQUEADA no banco
  (`lock_division_tournament_reopen`) — logo NÃO há caso de "reabrir" a limpar.

**Fora de escopo (proposal → "Fora de escopo"):**
- **Torneio avulso:** `createTournament` não preenche
  `tournament_slots.competitor_id` (nasce NULL — `schema.sql:2146-2147`;
  `src/actions/tournaments.ts:173-180`) e não há perfil de competidor avulso →
  premiar torneio seria código morto (a RPC sempre retornaria 0). Diferido.
- **Copa:** `cup_entries` chaveia por `team_id/rotulo`, NÃO por
  `league_competitors`. Diferido.

Motores a REUSAR (não reinventar): `computeStandings`
(`src/features/standings/computeStandings.ts`), `calcularDestaques` +
`rechavearInsights` (`src/features/standings/insights.ts`), `resultadoDaChave`
(usado em `leaguePyramid.ts:811-823`), `match_goals` (change add-artilharia).
Infra de imagem: `renderRodadaOg` (`src/features/og/rodada`). Push:
`enviarNotificacoes` (`src/features/notifications/enviar.ts`).

## Decisão central: a premiação é uma FOTO persistida, gravada só pelo writer autoritativo

Uma nova tabela `public.conquistas` guarda um troféu por linha. A geração ocorre
**exclusivamente** dentro do caminho de encerramento, via a RPC `SECURITY
DEFINER` `registrar_conquistas_temporada`. `conquistas` tem RLS habilitado com
**apenas** política de SELECT e **nenhum** grant de escrita — logo o único writer
possível é a RPC (que ignora RLS). Isso torna a forja por PostgREST impossível
(mais forte que a artilharia, que permitia INSERT direto no caminho de placar).

### Modelo de confiança (de onde vem cada troféu)

| Troféu | Origem | Confiança |
|---|---|---|
| Campeão / Vice (divisão `liga` de ciclo ANUAL) | **Derivado em SQL** de `entries.posicao_final` (congelado por `computeStandings`) | Zero confiança no cliente |
| Campeão / Vice (divisão `liga` SPLIT ou `grupos_mata_mata`) | **Payload** do servidor (vencedor da grande final / `resultadoDaChave` — quem COROA a divisão) | Compute do servidor confiável |
| Promovido / Rebaixado | **Derivado em SQL** de `entries.destino` | Zero confiança no cliente |
| Artilheiro | **Derivado em SQL** de `match_goals` | Zero confiança no cliente |
| Melhor Ataque/Defesa/Sequência | **Payload** do servidor (`calcularDestaques`) | Compute do servidor confiável |

**Por que campeão é condicional ao formato E ao ciclo (blocker split).** O
campeão SÓ coincide com `posicao_final = 1` numa divisão `liga` de ciclo ANUAL
(sem Clausura) → aí é derivado em SQL sem tocar no cliente. Dois casos DIVERGEM e
são coroados por CHAVE, jamais pelo líder da tabela:
- **Divisão `liga` SPLIT (apertura_clausura):** o campeão é o VENCEDOR DA GRANDE
  FINAL, NUNCA o líder da combinada (verdade canônica do app —
  `getCompetitorProfile.ts:185-201` via `resolverCampeaoDivisaoSplit` de
  `getGrandeFinal`). E TODO split é `formato='liga'` (constraint
  `league_division_seasons_split_so_liga`), justamente o ramo que casaria — logo
  o gate de formato sozinho coroaria o ERRADO e poderia gerar DUAS linhas
  `campeao` (bloco a + payload). O gate exclui split com
  `ds.tournament_id_clausura is null`.
- **Divisão `grupos_mata_mata`:** `posicao_final` é o rank de CORTE por agregado
  de grupo (`leaguePyramid.ts:1506-1521`), e o campeão é quem VENCE o mata-mata.

Nesses dois casos a RPC NÃO deriva campeão/vice de `posicao_final` (gate
`ds.formato = 'liga' and ds.tournament_id_clausura is null`); o servidor — que já
computa o vencedor da grande final / `resultadoDaChave` no fluxo — passa
campeão/vice pelo `p_premios` autoritativo. Promovido/rebaixado (de `destino`) e
artilheiro seguem SQL em todo formato. (Nota: `league_division_seasons.formato`
só admite `'liga'`/`'grupos_mata_mata'` — não há `fase_liga`/`mata_mata`.)

**Superfície de forja residual:** um dono poderia, via chamada direta à RPC,
gravar um destaque/campeão-de-mata-mata falso — mas só na PRÓPRIA temporada em
fechamento (gate de posse + estado + competidor pertence à temporada), sem
qualquer leaderboard global impactado (troféu por-temporada, exibido na estante
daquele competidor). Risco aceito para o MVP.

## Schema `public.conquistas`

```
id             uuid pk
competitor_id  uuid not null → league_competitors(id) on delete cascade
tipo           text  in (campeao,vice,artilheiro,melhor_ataque,melhor_defesa,
                         melhor_sequencia,promovido,rebaixado)
escopo         text  in (temporada,torneio,copa)   -- só 'temporada' gravado aqui
ref_id         uuid  not null           -- season_id (polimórfico; SEM FK)
ref_rotulo     text  not null           -- rótulo estável da temporada no fechamento
nivel          smallint                 -- divisão (liga); null nos demais
valor_texto    text                     -- "Série A", "47 gols pró", "12 vitórias seguidas"
valor_num      int
jogador        text                     -- nome do artilheiro; null nos demais
conquistado_em timestamptz not null default now()
unique (escopo, ref_id, competitor_id, tipo)
```

Decisões:
- **Competidor por join, não denormalizado** (lição da artilharia): nome/escudo
  resolvem por `league_competitors` no fetch. `competitor_id` FK `on delete
  cascade`.
- **`ref_id` polimórfico SEM FK + `ref_rotulo` materializado**: o hall da fama é
  DURÁVEL — o troféu sobrevive à remoção da temporada; o rótulo estável vem
  materializado. É a única materialização; a identidade do COMPETIDOR nunca é.
- **`escopo` mantém `torneio`/`copa`** por forward-compat (as evoluções diferidas),
  mas esta change só grava `temporada`.
- **Unicidade `(escopo, ref_id, competitor_id, tipo)`**: idempotência. Um
  competidor pode ter MÚLTIPLOS troféus na mesma temporada (ex.: Campeão da Série
  B **e** Promovido) — `tipo` distintos, sem colisão.

## Writer autoritativo — `registrar_conquistas_temporada(p_season_id, p_premios)`

`SECURITY DEFINER`, `search_path = ''`, EXECUTE só a `authenticated`. Gate:
`auth.uid()` é o dono da liga E a season está `em_fluxo | encerrada`. Aceitar
`em_fluxo` é o que permite premiar ANTES do flip (ver "Orquestração"). Passos
(idempotentes por `delete-then-insert` do escopo):
1. **(a)** Campeão (pos 1) / Vice (pos 2) — SÓ divisão `formato = 'liga'` de ciclo
   ANUAL (`tournament_id_clausura is null`) — de `entries`.
2. **(b)** Promovido (`sobe`) / Rebaixado (`cai`) por divisão — de `entries`.
3. **(c)** Artilheiro por divisão — de `match_goals` join `matches (torneios da
   divisão)` join `tournament_slots` (resolve lado→competidor).
4. **(d)** Payload `p_premios`: Campeão/Vice de divisão liga-SPLIT (vencedor da
   grande final) e de `grupos_mata_mata` (`resultadoDaChave`) + Melhor
   Ataque/Defesa/Sequência. Guardas de tipo ANTES dos casts:
   `jsonb_typeof(...)='number'` em `nivel`/`valor_num` e regex UUID em
   `competitor_id` — linha malformada é IGNORADA, jamais lança `22P02`. O subselect
   é DEDUPLICADO com `distinct on (competitor_id, tipo)` (desempate por `valor_num
   desc nulls last`) para dois prêmios do mesmo `(competidor, tipo)` NÃO
   dispararem `cardinality_violation (21000)` no `on conflict` — a RPC nunca aborta
   (caminho FATAL de encerramento).
   Só grava para competidor que PERTENCE à temporada.

## Orquestração no fechamento — premiar ANTES do flip (major #2)

`confirmarFluxoTemporada` tem early-return em `status = 'encerrada'`
(`leaguePyramid.ts` ~1751-1762). Se a premiação rodasse DEPOIS do flip para
`encerrada` e falhasse, o re-run cairia no early-return e a estante ficaria vazia
para sempre. Portanto a sequência passa a ser:

1. (passo 1 atual) season → `em_fluxo` (trava reabertura).
2. (passo 2 atual) CONGELA `league_division_entries` (posicao_final/destino).
3. (passo 3 atual) `montarProximaTemporada`.
4. **NOVO — com a season ainda `em_fluxo`:** montar `p_premios` e chamar
   `registrar_conquistas_temporada`; gerar o pôster; disparar o push. A RPC aceita
   `em_fluxo` (as entries já estão congeladas no passo 2). Falha da RPC = falha
   recuperável do fluxo (retorna erro → re-run, ainda em `em_fluxo`, reexecuta
   tudo idempotente). Pôster/push são best-effort (`await` antes do
   `revalidatePath`), nunca derrubam o fluxo.
5. **(agora o ÚLTIMO write)** season → `encerrada`.

Assim o flip para `encerrada` é o último passo; enquanto ele não ocorre, o fluxo
inteiro é resumível e idempotente.

### Montagem do `p_premios` — remap slot→competitor (major #3)

`calcularDestaques`/`computeStandings`/`resultadoDaChave` chaveiam por SLOT
(`participanteId` — `insights.ts:144,159`), mas a RPC valida `competitor_id`. Se
a action montasse `p_premios` com slot ids, o `exists()` da RPC falharia em
SILÊNCIO e os destaques (e o campeão de mata-mata) SUMIRIAM sem erro. Portanto a
action DEVE TRADUZIR slot→`competitor_id` ANTES de montar o payload, usando
`league_division_entries` (tem `slot_id` E `competitor_id`) ou o helper
`rechavearInsights` (`insights.ts:514`, que rechaveia um bloco de insights por
uma função `mapear`). Uma task de TESTE cobre exatamente essa regressão (payload
com slot ids ⇒ destaque ausente).

## Leitura (UI)

`getConquistasDoCompetidor(supabase, { competitorId })` (`server-only`): SELECT em
`conquistas` por `competitor_id`, ordenado por `conquistado_em desc`, agrupável
por `(escopo, ref_id, ref_rotulo)`. `CompetidorHallDaFama` (RSC) renderiza a
estante/timeline ao lado de `CompetidorConquistas` (as contagens agregadas
PERMANECEM). Escudo via `TeamCrest` (placeholder). Estado vazio explícito.

## Pôster + push

- **Pôster:** `src/features/og/temporada.tsx` (`renderTemporadaOg`) reusa o
  estilo/marca de `renderRodadaOg`; rota
  `src/app/dashboard/ligas/[id]/temporada/[seasonId]/imagem/route.tsx`
  (dono-gated, 404 sem oráculo, como a rota de rodada) desenha "Temporada
  encerrada" com o campeão da elite + subiu/caiu.
- **Push:** `enviarNotificacoes(supabase, participantes, payload, callerId)` —
  best-effort, no-op sem VAPID, gated por co-participação. `await` antes de redirect.

## Idempotência e edge cases

- **Re-run do fluxo (ainda `em_fluxo`):** `delete-then-insert` do escopo → mesma
  foto, sem duplicar. Após o flip para `encerrada`, `confirmarFluxoTemporada`
  retorna cedo (guard existente) — mas a premiação já ocorreu ANTES do flip.
- **Temporada sem jogos / sem gols:** artilheiro/destaques simplesmente não
  existem (0 linhas) — troféus estruturais ainda saem das entries.
- **Empate no topo:** `computeStandings` resolve posição única
  (`resolvido_por`), então `posicao_final` é única por divisão.
- **Divisão mata-mata:** campeão/vice não saem de `posicao_final` (gate de
  formato) e sim do payload (`resultadoDaChave`) — evita coroar o errado.
- **Artilheiro ausente:** MVP tolera vazio.
- **Competidor avulso (slot sem `competitor_id`):** ignorado (join exige
  `competitor_id is not null`).
- **Payload malformado / com slot ids:** guardas de tipo + UUID-guard +
  `exists()` de pertencimento → linha ruim é ignorada, a RPC não lança nem trava.

## Alternativas consideradas

- **Trigger puro no banco computando tudo em SQL:** rejeitado — reimplementar
  `computeStandings`/`calcularDestaques`/`resultadoDaChave` (desempate, W.O.
  duplo, sequências, coroação de chave) em SQL divergiria da fonte TS e é frágil.
- **Confiar 100% no payload (sem derivar nada):** rejeitado — violaria "não
  confie no cliente para decidir campeão". Derivamos o núcleo estrutural.
- **Incluir torneio avulso agora:** rejeitado — sem identidade persistente
  (`competitor_id` NULL) seria código morto. Diferido.
