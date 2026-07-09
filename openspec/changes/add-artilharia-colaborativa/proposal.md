## Why

Hoje só quem lança o placar informa OS PRÓPRIOS gols; o adversário nunca
completa os dele, e não há como registrar um gol que ninguém marcou (gol contra).
Na prática o placar fica com artilharia PELA METADE — o ranking e a carreira do
competidor (features já entregues em `add-artilharia`) só refletem o lado de quem
lançou.

Esta change torna a atribuição de artilheiros **colaborativa e por-lado**, e ela
**continua depois do placar validado**: cada técnico completa os gols do PRÓPRIO
lado (append-only, limitado ao placar do lado), e um gol sem autor pode ser
marcado como **gol contra** (fecha a conta do lado, fica FORA do ranking). O
organizador/árbitro mantém controle total dos dois lados (adiciona/corrige/remove).

O ponto técnico central: os DOIS escritores atuais fazem **delete-then-insert do
MATCH INTEIRO** (`updateMatchScore` e a RPC `aprovar_proposta_placar`), o que
apagaria o lado do adversário numa edição colaborativa. Introduzimos uma RPC
`SECURITY DEFINER` **escopada a UM lado** que nunca toca o lado oposto e funciona
com a partida **encerrada** (o teto soma-do-lado ≤ placar-do-lado impede inflar).

Escopo: só partidas COMPETITIVAS (com `vaga_1`/`vaga_2` → competidor). O avulso
(`participante_1/2`) não muda.

## What Changes

- **Schema (DDL aditivo, só documentado — não aplicado).**
  - `public.match_goals` ganha **`contra boolean not null default false`**.
    `contra=false` (gol normal): `jogador` OBRIGATÓRIO, entra no ranking.
    `contra=true` (gol contra): `jogador` OPCIONAL (nome do adversário, pode ser
    `null`), NUNCA entra no ranking.
  - `match_goals.jogador` passa a ser **NULLABLE**; a CHECK
    `match_goals_jogador_tam` é substituída por `match_goals_jogador_valido`:
    `(jogador is not null and char_length(btrim(jogador)) between 1 and 60) or
    (jogador is null and contra = true)` — só o gol contra admite nome nulo, e
    todo nome presente respeita 1..60.
  - O índice único `match_goals_unico` é **reprojetado como PARCIAL** só para
    `contra = false` (`(match_id, lado, lower(btrim(jogador)))`); um segundo
    índice parcial `match_goals_contra_unico` para `contra = true` usa
    `lower(btrim(coalesce(jogador,'')))` — um gol contra por (partida, lado,
    nome), com o nome anônimo (`null`/vazio) colapsando numa ÚNICA linha de tally
    por lado. Normal e contra nunca colidem (predicados disjuntos).
- **Nova RPC `SECURITY DEFINER` `registrar_autores_lado(p_match_id uuid, p_lado
  smallint, p_autores jsonb, p_modo text)`.** Escopada a UM lado (só mexe em
  `(match_id, lado)` — NUNCA o oposto), exige `auth.uid()`, resolve o competitivo
  pela vaga do lado (sem vaga → erro). O MODO é EXPLÍCITO (não inferido do papel,
  que teria footgun dual-role): `p_modo='append'` (soma ao existente, nunca
  reduz/remove; autoriza técnico-do-lado OU árbitro) e `p_modo='replace'`
  (substitui a lista do lado; autoriza SÓ árbitro). Teto: `normais + contra` do
  lado ≤ `placar[lado]`. Roda com a partida ENCERRADA (a RPC definer ignora a RLS
  que exige `status <> 'encerrada'`). Grant EXECUTE a `authenticated`, revoke
  `public`/`anon`. Parse robusto: o RANGE de `gols`/`lado` é checado no `numeric`
  ANTES do `::int`, então nem fracionário (`2.5`) nem gigante (`1e20`) aborta com
  `22P02`/`22003` — o item é ignorado.
- **Escrita SEMPRE por-lado (fecha perda silenciosa).** Os DOIS escritores de
  entrada (`updateMatchScore` e a RPC `aprovar_proposta_placar`) passam a deletar
  APENAS os lados presentes no payload — um lado ausente fica INTOCADO. Sem isso,
  reabrir+re-lançar/re-aprovar apagaria toda a artilharia colaborativa, e aprovar
  uma proposta de um lado só deletaria o lado oposto colaborativo.
- **Preload reconciliado com o MODO (não pode DOBRAR).** Nas superfícies REPLACE
  (modal de lançamento direto do organizador + console do organizador) o preload é
  EDITÁVEL e submete a lista COMPLETA (`autoresTocado` governa `undefined` vs
  lista). Na superfície APPEND (editor "Meus artilheiros" do técnico) os autores já
  registrados aparecem SOMENTE-LEITURA e o save envia APENAS o DELTA (as entradas
  novas) — a RPC já soma o existente; reenviar o preload dobraria o artilheiro.
- **RPC `aprovar_proposta_placar` estendida** para carregar `contra` pela proposta
  (agrega por `(lado, contra, nome)`, insere `contra`, teto conta contra) E escrever
  POR-LADO. `gols`/`lado` com range-check no `numeric` antes do `::int`.
- **RPC `registrar_conquistas_temporada` estendida (BLOQUEANTE — hall da fama).** É
  o ÚNICO outro leitor SQL de `match_goals` e materializa o troféu de Artilheiro numa
  FOTO DURÁVEL. O join do bloco "(c) Artilheiro por divisão" ganha `and g.contra =
  false`; sem ele, um gol contra cravaria um artilheiro fictício/nulo no hall da
  fama — corrupção IRREVERSÍVEL. A change reproduz a RPC inteira com essa única
  mudança.
- **Fluxo de entrada (aditivo).** A captura de autores (`AutoresLado` no
  `MatchScoreModal`) ganha o toggle **"gol contra"** por linha; os schemas Zod
  (`autorGolSchema`, `checarAutores`, `agregarAutores`, `chaveAutor`) e os DOIS
  escritores de entrada (`updateMatchScore`, `proporPlacar`) propagam `contra`.
- **W.O./0×0 limpa `match_goals` via TRIGGER atômico.** Um trigger AFTER UPDATE
  `matches_limpar_gols_wo` (`when new.wo=true and new.status='encerrada' and (…)`)
  deleta os `match_goals` da partida no MESMO passo do UPDATE que grava o W.O. —
  cobre TODOS os caminhos (simples/duplo/órfão/aceite) num lugar só, ATÔMICO (sem
  janela de corrida com um `aprovar` concorrente), `SECURITY DEFINER` (ignora a
  policy de DELETE). O encerramento NORMAL (`wo=false`) PRESERVA os gols. `wo.ts`
  não precisa mais deletar `match_goals`.
- **Edição pós-validação (a virada).** Partida ENCERRADA competitiva ganha, no card
  do técnico daquele lado (gate: `status='encerrada'` + competitivo + `auth.uid()`
  == `slot.user_id` de um lado), um editor **"Meus artilheiros"** (append, "X de Y
  gols atribuídos"); o console do organizador (`OpenMatchesList`/`PropostasPendentes`)
  ganha o editor COMPLETO dos dois lados (replace). Ambos via a nova RPC/Server
  Action. Um **badge "faltam N artilheiros"** nas encerradas com gols por atribuir
  puxa a completação.
- **Ranking, carreira e HALL DA FAMA excluem `contra = true`.** `getArtilharia`,
  `getArtilheirosDoCompetidor`/`golsPorNomeDoCompetidor` (e, por consequência,
  `getScorerSuggestions`) e `registrar_conquistas_temporada` filtram gols contra. O
  gol contra pode aparecer no detalhe da partida ("3 gols + 1 contra"), fora do
  ranking.
- **Tipos gerados.** `src/lib/supabase/database.types.ts` atualizado: `match_goals`
  Row/Insert/Update com `contra: boolean` e `jogador: string | null`; assinatura
  `registrar_autores_lado` no bloco `Functions`. Sem isso o `pnpm typecheck` do gate
  não fecha.

## Capabilities

### Modified Capabilities
- `goal-scorers`: atribuição colaborativa por-lado que continua após a validação;
  gol contra (fora do ranking); ranking/carreira/hall da fama excluem gol contra;
  preload do modal; superfícies e descoberta do editor pós-validação.
- `data-model`: coluna `contra` + reprojeção dos índices únicos de `match_goals`.
- `match-mutations`: nova Server Action/RPC `registrar_autores_lado` por-lado com
  MODO explícito (`append`/`replace`); escrita por-lado no `updateMatchScore`;
  preload; `autores` ganha `contra`.
- `match-result-approval`: a proposta e a materialização na aprovação preservam
  `contra` E escrevem por-lado (não apagam o lado oposto colaborativo).
- `hall-of-fame`: o Artilheiro derivado de `match_goals` considera só gol normal
  (`contra = false`).
- `match-walkover`: W.O./0×0 limpa os `match_goals` da partida.
- `row-level-security`: grants e escopo da RPC `registrar_autores_lado`.

## Impact

- **Código de aplicação:**
  - `src/schema/matchSchema.ts` (`contra` em `autorGolSchema`; `jogador`
    condicional; `checarAutores`/`agregarAutores`/`chaveAutor` com `contra`; teto
    conta contra; `registrarAutoresLadoSchema` do payload por-lado + `modo`).
  - `src/actions/match.ts` (`updateMatchScore` propaga `contra` + delete por-lado).
  - `src/actions/scoreProposals.ts` (`proporPlacar` propaga `contra`).
  - `src/actions/wo.ts` (NENHUMA mudança para a limpeza — o trigger
    `matches_limpar_gols_wo` cobre os 4 caminhos atomicamente).
  - `src/actions/matchGoals.ts` (NOVO — Server Action `registrarAutoresLado`
    embrulhando a RPC + Zod; passa `modo`).
  - `src/features/league/data/getArtilharia.ts`,
    `getArtilheirosDoCompetidor.ts` (filtram `contra = false`).
  - `src/lib/supabase/database.types.ts` (`match_goals` com `contra`/`jogador`
    nullable; assinatura `registrar_autores_lado`).
  - **UI:** `MatchScoreModal`/`AutoresLado` (toggle gol contra + preload EDITÁVEL
    `autoresIniciais`/`autoresTocado` — superfície replace), editor "Meus
    artilheiros" na partida encerrada (técnico, `append`: existentes SOMENTE-LEITURA,
    submete só o DELTA), editor completo no console do organizador
    (`OpenMatchesList`/`PropostasPendentes`, `replace`), badge "faltam N
    artilheiros", detalhe da partida ("N gols + M contra").
- **Banco de dados:** DDL ADITIVO em `supabase/schema.sql` (fonte de verdade) +
  `openspec/changes/add-artilharia-colaborativa/ddl.sql` com pré-checagens,
  idempotente (`add column if not exists`, `drop constraint/index if exists` +
  recreate, `create or replace function`, `create trigger` — incl. a reprodução de
  `registrar_conquistas_temporada` com `and g.contra = false` e o trigger
  `matches_limpar_gols_wo`). O SQL é MOSTRADO ao dono antes de aplicar (REGRA 4) —
  esta change documenta, não aplica.
- **Segurança/autorização:** a RPC `registrar_autores_lado` re-verifica por MODO
  (`replace` só árbitro; `append` técnico-do-lado OU árbitro) e só escreve UM lado;
  o teto do lado (≤ placar) vale para os dois modos. Parse com range-check no
  `numeric` (não aborta com `22P02`/`22003`). RLS de leitura de `match_goals`
  inalterada.
- **Dependências:** nenhuma nova.
- **Testes:**
  - **Hermético (vitest, Supabase mockado):** Zod (contra; jogador nulo só em
    contra; teto conta contra; duplicata por lado+contra); ações (delete por-lado;
    W.O. limpa gols; `registrarAutoresLado` passa `modo`); ranking/carreira (excluem
    contra). Suíte atual permanece verde.
  - **pgTAP REAL (`pnpm test:rls`, OBRIGATÓRIO no gate):** as garantias centrais
    vivem em plpgsql (mock = falso-verde). `supabase/tests/*_match_goals.sql`
    exercita contra Postgres real: append soma; replace substitui; **lado oposto
    intacto**; `TETO_LADO`; roda com partida ENCERRADA; `NAO_AUTORIZADO`;
    `LADO_SEM_VAGA`; `aprovar_proposta_placar` preserva `contra` e não deleta o lado
    oposto; `registrar_conquistas_temporada` NÃO materializa gol contra como
    artilheiro.
