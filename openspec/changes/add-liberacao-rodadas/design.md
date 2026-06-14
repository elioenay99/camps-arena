# Design — add-liberacao-rodadas

## Contexto (mapeado por workflow de leitura)

- `matches` é schema flat; `rodada integer` (null = avulsa) é a coordenada de rodada
  compartilhada por todos os formatos. NÃO existe `liberada_em` nem helper
  `eh_dono_competition` — a posse é sempre inline `tournaments.created_by = auth.uid()`.
- Visibilidade de partida hoje é 100% da RLS `matches_select_visivel`
  (`schema.sql:1126-1143`): torneio público/dono/participante OU jogador/técnico da partida.
  Cinco fetchers de display confiam nela e não filtram nada por conta própria.
- Há **8 pontos de INSERT** de matches, todos app-side (nenhuma RPC insere matches):
  `tournaments.ts` ×5 (`iniciarTorneio` liga, `iniciarMataMata`, `avancarFase`,
  `iniciarTorneioGrupos`, `gerarMataMataDosGrupos`), `match.ts:createMatch` (avulso),
  `montarFaseGruposPiramide.ts:gerarFaseGruposSemeada`, `gerarChaveSemeada.ts`.
- UPDATE de partida tem 2 policies OR: `matches_update_participant` (jogador) e
  `matches_update_tournament_owner` (dono). `lock_match_relations` trava colunas
  estruturais (incl. `rodada`) mas NÃO `liberada_em`.
- Divisão de pirâmide É um `tournaments` → o gating por torneio cobre liga sem ramo especial.
- UI: `OpenMatchesList` já agrupa por rodada com cabeçalho `Rodada N` e `FecharRodadaButton`
  (dono, rodada ativa). `fecharRodada` (`wo.ts:187-233`) é o molde exato da action de
  liberação. A página da divisão de liga só linka para a página do torneio da divisão.

## Decisões de design

### D1 — Gating na RLS, dono vê tudo, demais só liberadas
A forma mais limpa e segura é separar a policy de SELECT em dois ramos:
1. **dono** (`tournaments.created_by = auth.uid()`) — sem restrição de liberação;
2. **demais** (público/participante/jogador/técnico) — exigem
   `liberada_em is not null and liberada_em <= now()`.

Assim os write-paths que rodam como dono (geração, avanço de fase, fluxo de pirâmide,
fechar rodada) continuam enxergando tudo, e os 5 fetchers de display herdam o gating
automaticamente — sem reescrever cada um. Anon tem `auth.uid()` nulo ⇒ cai sempre no ramo
"demais" e só vê `liberada_em <= now() AND is_public`.

### D2 — Oculta para todos menos o dono (incl. o jogador da partida)
O objetivo é o efeito Brasileirão: a rodada futura é segredo até a revelação. Portanto o
filtro `liberada_em <= now()` aplica-se também aos ramos `participante_1/2` e
`tournament_slots.user_id` (o jogador/técnico). O adversário da rodada N+1 NÃO vê o
confronto antes de liberado. (Custo: o jogador também não vê a própria partida futura — é o
comportamento desejado, a partida nem é jogável ainda.)

### D3 — Jogabilidade via a policy de UPDATE do participante (sem trigger novo)
`matches_update_participant` ganha `liberada_em is not null and liberada_em <= now()` no
`using` e no `with check`. Consequências:
- o jogador não atualiza partida oculta (`using` falha);
- o jogador não consegue setar `liberada_em` para null/futuro numa partida liberada
  (`with check` falha) ⇒ a coluna fica protegida contra POST direto.

Como os únicos writers de matches são o participante (agora gated), o dono (policy própria,
liberada) e `service_role` (bypassa RLS), **não é preciso estender nenhum trigger**. Evita
mexer em `lock_match_lifecycle`/`lock_match_relations` (delicados). O dono continua livre via
`matches_update_tournament_owner` (intocado).

### D4 — Classificação do não-dono é parcial (e isso é o certo)
`getTournamentClassificacao` roda `computeStandings` sobre as partidas que a RLS devolve.
Para o não-dono, isso passa a ser só o liberado ⇒ tabela parcial. É exatamente o que a
feature quer: nada de resultado de rodada não anunciada vazar pela tabela/chave/histórico.
Tudo vem do MESMO array de partidas, então gatear na RLS resolve lista E tabela de forma
consistente. Para o dono, `computeStandings` vê tudo. Ação: corrigir o comentário enganoso
em `getTournamentClassificacao` (que afirma receber "todas" as partidas) e revisar testes que
assumam isso; varrer também `getActiveMatches` e `getDivisionClassificacaoCombinada`.

**Alcance na liga (v1):** `getDivisionStandings`/`getDivisionClassificacaoCombinada` e a
página `ligas/[id]` são lidos SÓ pelo dono (`getSeason` filtra por `created_by`) e divisões
de pirâmide nascem liberadas ⇒ não existe "tabela combinada parcial do não-dono". A única
superfície de não-dono numa liga é a página do torneio da divisão (`torneios/[id]`,
possivelmente pública), coberta pela mesma regra do torneio standalone. O gating RLS é
uniforme (correção), mas a cadência manual no v1 só é exposta no torneio standalone.

### D5 — Cadência inicial só na geração upfront (liga e fase de grupos)
A cadência manual só faz sentido onde TODAS as rodadas nascem de uma vez: **liga**
(round-robin) e **fase de grupos**. No mata-mata as fases nascem sob demanda (`avancarFase`
exige a anterior decidida) — não há fase futura para pré-liberar; logo a chave **nasce
liberada** (default `now()`). Mesmo para a chave dos grupos, a chave da pirâmide e a fase de
grupos da pirâmide: nascem liberadas (caminhos de geração que não recebem `liberarTudo`).

`iniciarTorneio` e `iniciarTorneioGrupos` recebem `liberarTudo` (default `true`). O caminho
da pirâmide (`iniciarDivisao → iniciarTorneio`) não passa nada ⇒ default `true` ⇒ divisões
nascem liberadas (zero regressão). Só o painel de início do torneio standalone expõe a
escolha.

Implementação do payload de insert (liga/grupos):
```ts
// liberarTudo = true  → omite a chave → DEFAULT now() (sem skew de relógio)
// liberarTudo = false → liberada_em: null (oculta)
const ocultar = !liberarTudo;
partidas.push({ tournament_id, vaga_1, vaga_2, rodada, ...(ocultar ? { liberada_em: null } : {}) });
```

### D6 — Action única `liberarRodadas`
Molde: `fecharRodada` (uuid + int + posse por `created_by` + revalidate). Assinatura:
```ts
type AlvoLiberacao =
  | { tipo: "rodada"; rodada: number }
  | { tipo: "ate"; rodada: number }      // "próximas N" = ate proxima+(N-1)
  | { tipo: "faseGrupos" }
  | { tipo: "tudo" };
liberarRodadas(tournamentId: string, alvo: AlvoLiberacao): Promise<ActionResult>
```
Validação Zod (discriminated union em `schema/`). Fluxo:
1. autentica; busca torneio `.eq("id").eq("created_by", user.id).neq("status","encerrado")` →
   se não achar, erro de posse sem oráculo;
2. `update matches set liberada_em = now()` filtrando `tournament_id` + alvo +
   `liberada_em is null` (idempotente — só toca ocultas):
   - `rodada`: `.eq("rodada", N)`
   - `ate`: `.lte("rodada", N)`
   - `faseGrupos`: `.not("grupo","is",null)`
   - `tudo`: sem filtro extra
   sempre `.is("liberada_em", null)` + `.select("id")` (confirma efeito; não retorna
   `ok:true` cego);
3. `revalidatePath("/dashboard/torneios/${tournamentId}")` (a superfície do não-dono). NÃO
   é preciso revalidar `ligas/[id]`: ela é owner-only (`getSeason` filtra por `created_by`)
   e o dono vê todas as partidas independentemente de liberação.

A RLS `matches_update_tournament_owner` é o backstop (o dono pode tudo). `liberada_em` não
está em `lock_match_relations` ⇒ o UPDATE passa.

### D7 — Derivação do estado de liberação por rodada
`getTournamentClassificacao` já carrega todas as partidas (para o dono). Adicionar
`liberada_em` ao `.select()` e às projeções `PartidaAberta`/`PartidaEncerrada` e derivar:
```ts
rodadasLiberacao: { rodada: number; total: number; liberada: boolean }[]  // rodada não nula
proximaRodadaOculta: number | null  // min(rodada) com alguma partida liberada_em null/futuro
```
"liberada" = todas as partidas daquela rodada com `liberada_em <= now()`. Como o não-dono
não vê ocultas, esses derivados só importam para o dono (a seção é dele).

### D8 — UI (mobile-first 390px)
- **Seção "Liberação de rodadas"** (RSC, via helper `SecaoTorneio`, ícone `CalendarClock`),
  inserida na página `torneios/[id]` antes de "Partidas em aberto", gateada por
  `ehDono && ehGerado`. Lista cada rodada com pill de estado (Lock/Unlock) e:
  - `Liberar próxima rodada` → `{tipo:"rodada", rodada: proximaRodadaOculta}`
  - `Liberar próximas 3` → derivar da LISTA real de rodadas ocultas (as 3 menores ainda
    ocultas em `rodadasLiberacao`), enviando `{tipo:"ate", rodada: maiorDessas}`; o rótulo
    reflete a contagem real (clampada às ocultas restantes), não `proximaRodadaOculta+2`
  - `Liberar fase de grupos` (só `ehGrupos`) → `{tipo:"faseGrupos"}`
  - `Liberar tudo` (confirmação em 2 cliques, padrão `TournamentLifecycleButtons`) → `{tipo:"tudo"}`
  Folha cliente `LiberarRodadasButtons` no padrão de `FecharRodadaButton` (useTransition +
  sonner toast). Some quando não há rodada oculta (tudo liberado).
- **Toggle de cadência** no painel de início do torneio standalone (liga e grupos): um
  checkbox "Liberar todas as rodadas agora" (marcado por padrão); desmarcado ⇒
  `liberarTudo=false`. Reusa `PainelInicioShell`.
- **Indicador opcional** no `DivisaoCard` da liga ("X/Y rodadas liberadas") — nice-to-have,
  pode ficar de fora do v1.

### D9 — Jogabilidade do não-dono é barrada pela RLS (sem gate de action)
Reconciliado com D2: como a partida oculta NÃO é retornada ao jogador pela RLS, o SELECT
inicial de `updateMatchScore` (`match.ts:97-111`) e `solicitarWO` (`wo.ts:256-269`) volta
NULL → o caminho cai no "Partida não encontrada." já existente. Logo NÃO é preciso gate
extra de action para o jogador (e distinguir "existe mas oculta" exporia a existência,
contrariando D2). A própria policy `match_wo_requests_insert_tecnico` (subquery inline
`from public.matches m`, SECURITY INVOKER) também já barra pedido de W.O. em partida oculta.
Os caminhos do dono (`mudarStatusComoDono`, `marcarWoInterno`, `fecharRodada`,
`varrerOrfaosDaRodada`) seguem intocados (o dono vê tudo). Resultado: o gate de jogabilidade
é 100% RLS, zero código de action novo além de `liberarRodadas`.

### D10 — Aviso de "rodadas não liberadas" para o não-dono (corrige o dead-end)
`getTournamentClassificacao` depende só da visibilidade do TORNEIO (não das partidas) →
um não-dono CHEGA em `torneios/[id]` de um torneio ativo mesmo sem ver partida alguma, e as
projeções (linhas/grupos/chave/partidasAbertas) voltam vazias. Hoje isso cai nos
empty-states "aparece quando o torneio for iniciado" / "depois da primeira partida
encerrada" (`page.tsx:324,343,353-355,396-397`), que MENTEM (o torneio está ativo). Como o
não-dono não distingue "não iniciado" de "iniciado-mas-oculto" (ambos vêm como arrays
vazios), a página deriva a condição do TORNEIO:
```
const nadaVisivel = !ehDono && partidasAbertas.length === 0 && partidasEncerradas.length === 0
                    && linhas.length === 0 && grupos.length === 0 && chave.length === 0;
// ehGerado: só formatos com rodadas têm cadência — avulso nasce 'ativo' e vazio.
const aguardandoLiberacao = nadaVisivel && ehGerado && torneio.status === "ativo";
```
Quando `aguardandoLiberacao`, renderizar um aviso ("As próximas rodadas ainda não foram
liberadas pelo organizador") no lugar dos empty-states de não-iniciado. Em rascunho
(`status !== "ativo"`) os empty-states atuais permanecem. Liberação PARCIAL não dispara o
aviso (há partidas visíveis). O dono nunca vê o aviso (vê tudo).

## Edge cases / gotchas

- **Bye nasce encerrada**: em `iniciarMataMata`/`gerarChaveSemeada`, o bye já é `status
  'encerrada'`. Como esses caminhos nascem liberados (default `now()`), o bye fica visível —
  correto (é memória estrutural da chave).
- **Grupos: `rodada` não é única** (grupos correm em paralelo com a mesma rodada interna,
  desambiguados por `grupo`); "liberar rodada N" libera a rodada N de TODOS os grupos. Por
  grupo individual fica fora do v1 (só "fase de grupos inteira").
- **Grupos: rodada contínua** — a chave dos grupos usa `rodadaBase = max(rodada grupos)+1`.
  Como a chave nasce liberada, "Liberar tudo"/`ate` não a deixa oculta; sem inconsistência.
- **Ida-e-volta na liga**: ida e volta de um par caem em rodadas diferentes (returno continua
  a numeração) — cada uma é uma rodada independente. Na chave, as 2 pernas compartilham a
  rodada (diferem por `perna`) ⇒ liberar a fase libera ambas juntas.
- **`rodadaAtiva` parcial**: para o não-dono é derivada só do liberado — coerente (ele não
  enxerga rodadas ocultas). Os controles de fechar/liberar são do dono (que vê tudo).
- **Owner-jogador**: se o dono também joga, ele não usa `updateMatchScore` como dono; para
  jogar uma partida oculta basta liberá-la antes. Aceitável no v1.
- **Skew de relógio**: o caminho "liberar tudo" usa o DEFAULT `now()` do banco (sem skew); a
  action `liberarRodadas` usa `now()` do servidor (Server Action) — diferença irrelevante.
- **W.O. em partida oculta já barrado pela RLS**: a policy `match_wo_requests_insert_tecnico`
  tem subquery inline `from public.matches m` (SECURITY INVOKER) ⇒ partida oculta não aparece
  para o técnico ⇒ o INSERT do pedido de W.O. é negado. Não precisa de gate extra.
- **Invariante de geração (bye oculto)**: nenhum INSERT em lote de liga/grupos pode produzir
  `status='encerrada'` — hoje é verdade (liga insere só pares de vaga sem status; folga de N
  ímpar não vira match). Asserção no teste de geração blinda contra regressão futura (um bye
  oculto sumiria da chave). Byes só nascem nos caminhos de chave, que nascem liberados.
- **Anon = defesa de API, não rota de UI**: o ramo `anon` da RLS protege via API/publishable
  key; `torneios/[id]` e `ligas/[id]` vivem sob `/dashboard` e redirecionam para `/login`. A
  validação do "não-dono" usa um SEGUNDO usuário autenticado (participante/observador de
  torneio público).
- **Realtime não injeta partidas novas**: `LiveMatchesProvider` só atualiza ids já em tela.
  Ao liberar uma rodada, o não-dono precisa RECARREGAR para vê-la (esperado). E, com a
  partida oculta, o evento `postgres_changes` do dono mudando placar NÃO chega ao não-dono.

## Plano de testes

- **Unit (action)** `liberarRodadas`: posse (não-dono negado); cada `alvo`
  (rodada/ate/faseGrupos/tudo) gera o filtro certo; idempotência (só `liberada_em is null`);
  torneio encerrado negado.
- **Unit (geração)**: `iniciarTorneio`/`iniciarTorneioGrupos` com `liberarTudo=false`
  inserem `liberada_em: null`; com `true` (default) omitem a chave (default now()).
- **Unit (gate)**: `updateMatchScore`/`solicitarWO` barram partida não liberada com a
  mensagem certa; permitem quando liberada.
- **Unit (fetcher)**: `getTournamentClassificacao` deriva `rodadasLiberacao`/
  `proximaRodadaOculta` corretamente; testes existentes que assumiam "todas as partidas"
  revisados.
- **Unit (invariante)**: nenhuma partida `status='encerrada'` nasce em INSERT de lote de
  liga/grupos (proteção contra bye oculto).
- **Ao vivo (Supabase local, 390px, 2 temas)**: usar DOIS usuários autenticados (o dono =
  conta de teste; um SEGUNDO usuário participante/observador de torneio PÚBLICO — as páginas
  vivem sob `/dashboard`, não há rota anônima). Torneio liga em modo manual → confirmar que o
  não-dono vê o aviso "rodadas não liberadas" (não os empty-states de não-iniciado) e que,
  ao liberar parcialmente, a tabela dele é parcial; o dono vê tudo + a seção de liberação;
  liberar próxima → aparece para o não-dono (após recarregar) e fica jogável; liberar tudo;
  repetir com torneio de grupos (liberar fase de grupos); conferir que mata-mata/pirâmide
  nascem liberados. Realtime: com partida oculta, o dono mudando placar NÃO entrega evento
  ao não-dono (inspecionar ausência no devtools do 2º navegador).

## Rollout

1. DDL no **LOCAL** via `psql` (idempotente) — `ddl.sql`.
2. Espelhar em `supabase/schema.sql` (coluna, índice, 2 policies).
3. Regenerar/atualizar `database.types.ts` (Row/Insert/Update de `matches` com `liberada_em`).
4. Implementar código + testes; gates (typecheck/lint/test/build).
5. Review adversarial por workflow; corrigir HIGH/CRITICAL.
6. Validação ao vivo no local.
7. Promover a prod via **MCP `apply_migration`** mostrando o SQL; `get_advisors`.
8. Commit pt-BR (sem coautoria) + push; `openspec archive`.
