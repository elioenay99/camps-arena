# Design — visão de leitura da página da liga

## Contexto e restrições

- A rota `/dashboard/ligas/[id]` tem `[id] = season_id` (temporada), NÃO a
  competição. Vários comentários no código já registram essa pegadinha.
- A **RLS é a fronteira de visibilidade** e já cobre o caso: as policies
  `league_{competitions,seasons,division_seasons,boundaries,competitors,division_entries}_select_visivel`
  liberam SELECT para `anon, authenticated` quando `status = 'ativa'` OR
  `created_by = auth.uid()` OR `pode_ver_bastidores_competition(id)`. Ou seja:
  liga **ativa** é pública; **arquivada** só a equipe/dono vê. Não há DDL a fazer.
- As partidas continuam gateadas pela sua própria RLS (capability
  `row-level-security`): um não-dono só enxerga **rodadas liberadas** de um
  torneio visível; o dono vê tudo. A classificação que um leitor vê é computada
  sobre as partidas que a RLS lhe entrega — **idêntico ao que a página de torneio
  da divisão já faz hoje**. Não é vazamento; é o mesmo "sem oráculo de rodada
  oculta". Não mudamos isso.
- A página de torneio de divisão (`/dashboard/torneios/[id]`) é o **template
  comprovado**: `redirect(login)` se `!user`, carrega via
  `getTournamentClassificacao` (RLS pública) e usa `podeGerir/podeArbitrar/
  podeModerar` como **flags** para renderizar controles condicionalmente. A
  página da liga passa a seguir o mesmo padrão.

## Decisão 1 — Relaxar os loaders (confiar na RLS) vs. loaders de leitura separados

**Escolha: relaxar os loaders existentes** e devolver capacidade como flag, em vez
de criar `getSeasonReadonly`/`getDivisionStandingsReadonly` paralelos.

Motivos:
- Os quatro loaders já declaram a RLS como backstop e já carregam `_userId` como
  parâmetro **vestigial** (`void _userId`) — a autorização hoje deriva a
  capacidade da `competition_id`, não do usuário. O gate de app-layer é
  redundante-porém-mais-estrito que a RLS.
- Duplicar quatro loaders dobraria a superfície e convidaria à divergência
  (o motor de standings/zonas/playoff é intrincado).
- A capacidade continua checada **onde importa**: nas Server Actions (mutações) e
  na RLS de escrita. Nada disso é tocado.

Efeito por loader (todos passam a **confiar na RLS**; sem gate de app-layer):
- `getSeason`: **deixa de retornar `null` por capacidade**. Retorna
  `TemporadaCompleta & { podeGerir: boolean }`. Continua retornando `null` só
  quando a season **não é visível/não existe** (a query volta vazia — RLS).
- `getDivisionStandings`, `getPlayoffs`, `getGrandeFinal`: **removem o gate
  `podeVerBastidores`**. Passam a retornar dados/estado sempre que a RLS entregar
  as linhas; `null`/vazio só quando a divisão/season é invisível ou não montada.

Consequência de segurança verificada: `getSeason` é consumido por DUAS páginas
irmãs de gestão (`/cores`, `/equipe`) que HOJE dependem do `null` para 404. Elas
passam a gatear-se com `if (!temporada.podeGerir) notFound()`. As **actions** em
`src/actions/leaguePyramid.ts` NÃO usam `getSeason` para autz (chamam `podeGerir`
com a `competition_id` real) — logo não são afetadas.

## Decisão 2 — Onde a capacidade separa leitura de gestão

`getSeason` calcula `podeGerir = await podeGerir(supabase, { competitionId })` e o
devolve. `ehDono` a página já deriva de `competicao.criadaPor === user.id`.

Renderização na página (`page.tsx`):
- **Gestão-only (esconder quando `!podeGerir`)**: `MontarTemporadaButton`,
  `IniciarDivisaoButton`, `TurnoDivisaoControl`, `FluxoTemporadaPanel` (console de
  fim de temporada, inteiro), links "Equipe" e "Identidade" do header.
- **Leitura sempre visível**: classificação por divisão (`StandingsTable` com
  zonas), estados vazios informativos (sem o botão de ação), **chave** de playoff
  (`BracketView`) e da grande final. **Ressalva (RLS de partidas):** a chave de
  playoff/final é montada sobre as partidas que a RLS entrega ao leitor — só
  rodadas **liberadas** de torneios visíveis. Logo o leitor pode ver a chave
  **parcial ou vazia** (não "completa"); o dono vê tudo. É o mesmo comportamento
  já aceito para a classificação — sem oráculo de rodada oculta.
- **Painéis mistos (leitura + botões)**: `PlayoffsPanel` e `GrandeFinalPanel`
  renderizam conteúdo de competição (bracket/resultado) E botões de gestão
  (montar/avançar/montar-final). Recebem um prop `podeGerir` (default coerente) e
  **escondem apenas os botões** quando `false`, preservando o bracket. Assim há um
  único caminho de render, sem duplicar a montagem do `BracketView`.

Estados vazios para o leitor (não-gestor):
- Temporada **não montada**: em vez do card "Monte a temporada" + botão, um card
  read-only "Temporada ainda não montada." (sem ação).
- Divisão montada **não iniciada**: texto "Divisão ainda não iniciada." sem
  `IniciarDivisaoButton`/`TurnoDivisaoControl`.

## Decisão 3 — Navegação até a liga (edge case obrigatório)

Hoje **não há link** da divisão para a liga-mãe (a página de torneio só linka
`cores`, `partidas/nova`, `equipe`). O jogador não descobre a liga.

Proposta: na página de torneio de divisão (quando `ehDivisao`, i.e.
`liga_do_torneio(tid) !== null`), adicionar um link "Ver liga" para
`/dashboard/ligas/[season_id]`. `liga_do_torneio` devolve a **competição**, não a
season; então resolve-se o `season_id` por lookup em `league_division_seasons`
onde `tournament_id = tid` OR `tournament_id_clausura = tid` (a RLS libera essa
linha para liga visível). O link só aparece quando o `season_id` resolve.

## Edge cases

- **Não logado**: `page.tsx` faz `redirect(/login?redirectTo=...)` (já existe;
  mantido). A visão de leitura exige sessão — não é anônima (decisão de produto).
- **Liga arquivada** (`status != 'ativa'`): RLS entrega linhas só a dono/equipe.
  Não-equipe → `getSeason` volta `null` → **404** (comportamento mantido). Equipe
  não-gestora (ex.: árbitro membro) vê a leitura; `podeGerir=false` esconde a
  gestão. Coerente.
- **Admin herdado liga→divisão**: `pode_gerir_competition` já resolve admin de
  liga; o flag `podeGerir` reflete a herança automaticamente. Na divisão, a
  herança é resolvida por `liga_do_torneio` (inalterado).
- **Divisão em rascunho / sem torneio**: cai nos estados vazios read-only acima;
  os loaders de standings retornam `null` (sem torneio) e a página mostra texto,
  não botão.
- **Temporada não montada (ressalva 4):** uma season não montada tende a estar em
  `rascunho`, que a RLS **esconde** do não-equipe → 404 antes de chegar ao estado
  read-only. Ou seja, o estado vazio read-only "temporada não montada" é
  praticamente inalcançável pelo LEITOR comum; ele existe para o **gestor** (que
  ainda não montou) e para o membro de equipe (edge). O spec não vende esse estado
  como caminho do leitor — só como caminho de gestão.
- **Não vazar gestão**: o payload de `getSeason` é config + divisões +
  identidades (nome/escudo/avatar — já públicos nas páginas de torneio) + cores +
  `criadaPor`. `criadaPor` é usado só server-side para derivar `ehDono`; não é
  repassado a client component (o `FluxoTemporadaPanel`, único que recebe
  `ehDono`, nem é renderizado para não-gestor). Sem convites, sem códigos, sem
  telefones no payload.

## Fora de escopo

- Nenhuma mudança de DDL/RLS.
- Página do competidor (`/dashboard/ligas/competidor/[id]`) — já tem requisito
  próprio ("visível em pirâmide ativa"); intacta.
- Visão anônima (deslogada) — decisão de produto é exigir login.
