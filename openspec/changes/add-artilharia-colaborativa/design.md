# Design — add-artilharia-colaborativa (backend + fluxo)

Predecessor: `add-artilharia` (tabela `match_goals`, ranking, carreira). Esta
change torna a atribuição COLABORATIVA (por-lado, continua após a validação) e
adiciona o **gol contra**. Reaproveita todo o modelo genérico (competidor por
JOIN, agregação por `(competidor, nome_normalizado)`) — só estende.

## 1. Índice único com `contra` + `jogador` nulo

O `match_goals` de hoje impõe UM autor por `(match_id, lado)` case-insensitive via
índice único FUNCIONAL `match_goals_unico (match_id, lado, lower(btrim(jogador)))`,
com `jogador NOT NULL`. Dois requisitos novos quebram esse desenho:

1. Gol contra pode ter `jogador` **nulo** (o nome do adversário é opcional).
2. Um gol contra e um gol normal do MESMO nome no MESMO lado são coisas
   DIFERENTES (um conta pro ranking, o outro não) e precisam coexistir.

### Decisão: dois índices parciais disjuntos por `contra`

```sql
-- Gol normal: um autor por (partida, lado), case-insensitive. Nome sempre presente.
create unique index match_goals_unico
  on public.match_goals (match_id, lado, lower(btrim(jogador)))
  where contra = false;

-- Gol contra: um por (partida, lado, nome); o nome ANÔNIMO (null/vazio) colapsa
-- numa ÚNICA linha de tally por lado via coalesce(...,'').
create unique index match_goals_contra_unico
  on public.match_goals (match_id, lado, lower(btrim(coalesce(jogador, ''))))
  where contra = true;
```

Por que DOIS índices parciais e não um só sobre `(lado, contra, nome)`:

- **Nulo tratado explicitamente.** Num índice único comum o Postgres trata NULLs
  como distintos, então vários gols contra anônimos no mesmo lado passariam sem
  agregar. O `coalesce(jogador,'')` no índice de contra força o anônimo a um bucket
  ÚNICO por lado — **a resposta ao edge do briefing** ("múltiplos contras anônimos
  no mesmo lado → agregam numa linha só, com a contagem em `gols`"). Um gol contra
  COM nome (ex.: "Zagueiro do rival") vira seu próprio bucket, distinto do anônimo.
- **Disjunção limpa.** Os predicados `where contra = false` / `where contra =
  true` nunca se sobrepõem: normal e contra do mesmo nome coexistem sem colidir,
  sem precisar do `contra` como coluna do índice (que confundiria a semântica "um
  autor por lado" do gol normal com "um contra por nome").
- **Custo baixo.** Índices parciais são mais enxutos; o de contra raramente tem
  muitas linhas.

### CHECK do `jogador` nulo

A CHECK antiga `match_goals_jogador_tam` (`char_length(btrim(jogador)) between 1
and 60`, com `jogador NOT NULL` na coluna) é substituída por:

```sql
constraint match_goals_jogador_valido check (
  (jogador is not null and char_length(btrim(jogador)) between 1 and 60)
  or (jogador is null and contra = true)
)
```

Deliberadamente MAIS ESTRITA que a forma sugerida no briefing (`contra = true OR
(jogador IS NOT NULL AND ...)`), que por curto-circuito deixaria um gol contra com
nome de 200 caracteres passar. Esta forma: **todo nome presente respeita 1..60**
(inclusive o do gol contra nomeado) e **`null` só é aceito quando `contra = true`**.
A coluna `jogador` deixa de ser `NOT NULL`.

Migração segura: todas as linhas existentes têm `contra = false` (default) e
`jogador` não-nulo válido — cabem no índice parcial de normais e na nova CHECK sem
backfill.

## 2. Modo EXPLÍCITO append/replace (não inferido pelo papel)

Nova RPC `registrar_autores_lado(p_match_id uuid, p_lado smallint, p_autores
jsonb, p_modo text)`, `SECURITY DEFINER`, `search_path = ''`. É o coração da change.

### Por que o MODO é um parâmetro, não uma inferência do papel

O desenho ingênuo (round 1) inferia append/replace do papel: técnico → append,
árbitro → replace. **Isso tem um footgun dual-role CONFIRMADO:** quem é árbitro E
técnico do mesmo lado (comum — o dono da liga que também comanda um clube), usando
o editor "Meus artilheiros" (append), mandaria só o DELTA que falta, mas cairia no
ramo REPLACE por ser árbitro e **APAGARIA os gols já salvos** do próprio lado. O
modo passa a ser EXPLÍCITO (`p_modo`), casado com a UI que chama:

- `p_modo = 'append'` — base = EXISTENTE; soma o incoming (nunca reduz/remove).
  Autoriza **técnico-do-lado OU árbitro**. É o que o editor "Meus artilheiros" chama.
- `p_modo = 'replace'` — base = VAZIA; o incoming é a lista COMPLETA do lado
  (substitui). Autoriza **SOMENTE árbitro**. É o que o console do organizador chama.
- `p_modo` fora de `{append, replace}` → `MODO_INVALIDO`.

### Escopo e autorização

- Exige `auth.uid()` (senão `AUTH_REQUIRED`); `p_lado` ∈ {1,2} (senão
  `LADO_INVALIDO`); `p_modo` válido (senão `MODO_INVALIDO`).
- Carrega o match com `for update` (serializa escritas concorrentes no mesmo
  lado): `tournament_id`, a vaga do lado (`vaga_1` se `p_lado=1`, senão `vaga_2`)
  e `placar[lado]`. **Vaga nula → `LADO_SEM_VAGA`** (escopo competitivo; avulso não
  passa por aqui).
- `v_arbitro := pode_arbitrar_torneio(tid)`; `v_tecnico := (slot.user_id =
  auth.uid())`. `replace` exige `v_arbitro`; `append` exige `v_arbitro OR
  v_tecnico`. Falhou → `NAO_AUTORIZADO`.

### O truque de unificação: base ∪ incoming, re-agregado

Os dois modos se reduzem a **"delete-then-insert do LADO com um conjunto
computado"**, diferindo só na BASE (agora pelo MODO, não pelo papel):

```
v_existing := jsonb das linhas atuais de (match, lado)   -- {jogador, gols, contra}
v_input    := (p_modo='replace') ? v_incoming : (v_existing || v_incoming)
-- parse+filtra+agrega v_input por (contra, lower(coalesce(jogador,'')))
-- total := sum(gols);  if total > placar[lado] then raise TETO_LADO
delete from match_goals where match_id = p_match and lado = p_lado
insert ... (conjunto agregado)
```

- **`append`:** a base é o EXISTENTE; concatenar com o incoming e re-agregar por
  bucket SOMA os gols. Como o existente entra sempre no merge, o `append` **nunca
  reduz nem remove** — só acrescenta. Reenviar o mesmo autor SOMA (o Server Action
  manda o DELTA que falta; a UI mostra "X de Y atribuídos").
- **`replace`:** a base é VAZIA; o incoming é a lista COMPLETA desejada do lado →
  substitui as linhas daquele `(match, lado)`. É também como se ZERA um lado
  (`p_autores = []` em replace → lado esvaziado).
- **Nunca toca o lado oposto:** o `delete`/`insert` são filtrados por `lado =
  p_lado`. Esta é a propriedade de segurança que os escritores de match-inteiro
  (`updateMatchScore`, `aprovar_proposta_placar`) precisam replicar (§3).

Round-trip do existente pelo jsonb: cada linha atual vira
`{"jogador": <text|null>, "gols": <int>, "contra": <bool>}`; o gol contra anônimo
(`jogador null`) sobrevive como `{"jogador": null,...}` → `jsonb_typeof = 'null'` →
parseado como nome nulo, bucket anônimo. Sem perda.

### Parse endurecido (writer autoritativo)

O `p_autores` é jsonb LIVRE (alcançável por POST direto), então a RPC valida item
a item, no estilo da `aprovar_proposta_placar`:

- `contra := (jsonb_typeof(e->'contra')='boolean') ? (e->>'contra')::bool : false`.
- `gols`: **RANGE checado no NUMERIC ANTES do `::int`**, via CASE ANINHADO — WHEN
  externo `jsonb_typeof(e->'gols')='number'`, e só então o interno `>= 1 and < 100`
  → `floor(...)::int`. Dois ataques por POST direto (burlam o Zod, a RPC é grantada
  a `authenticated`): um `'2.5'` PASSA o `jsonb_typeof='number'` e `::int` truncaria
  com `22P02`; um `1e20` também passa e `::int` estouraria com `22003` (integer out
  of range). O `numeric` tem precisão arbitrária (nunca estoura), então checar a
  faixa NELE antes do `::int` garante que nenhum cast a inteiro roda fora de
  `[1,99]` — o item fora de faixa vira `null` e é IGNORADO. O CASE aninhado (guard
  de tipo no WHEN externo) garante que `(e->>'gols')::numeric` só roda em número
  (Postgres não garante short-circuit de `AND` num WHEN para evitar erro). Mesmo
  padrão em `aprovar_proposta_placar`, aplicado também ao `lado`
  (`(e->>'lado')::numeric in (1,2)` antes do `::int` — um lado gigante forjado
  também estouraria).
- `jogador := (jsonb_typeof(e->'jogador')='string') ? nullif(btrim(e->>'jogador'),'') : null`
  (o `nullif` transforma nome em branco em anônimo).
- **Filtro:** `gols between 1 and 99` **E** (`jogador` não-nulo e 1..60 **OU**
  `jogador` nulo e `contra = true`). Item malformado é **IGNORADO** — jamais lança
  `22P02` nem aborta a chamada.
- **Agrega** por `(contra, lower(coalesce(jogador,'')))`, `gols := sum`, `jogador
  := min(jogador)` (grafia estável do bucket; `min(null)=null` mantém o anônimo).

### Teto do lado conta normais + contra

O gol contra também é um gol que o lado FEZ (entra no placar), então o teto é a
SOMA de TODOS os buckets do lado (normais + contra) ≤ `placar[lado]`. Excedeu →
**`raise TETO_LADO`** (NÃO clampa). Diferente da `aprovar_proposta_placar`, que
clampa para não travar a aprovação inteira: aqui a RPC só escreve autores, então
um erro claro é melhor UX e o Zod do Server Action já pré-valida. O árbitro pode
atribuir MENOS que o placar (atribuição parcial tolerada, como no desenho atual).

### Encerrada é o ponto

A RPC roda com a partida **encerrada** — é justamente o caso de uso (completar
artilheiros DEPOIS do placar validado). A policy de INSERT/DELETE de `match_goals`
exige `status <> 'encerrada'`; a RPC `SECURITY DEFINER` ignora RLS e escreve
mesmo assim. Ela NÃO altera `status`/`placar` — só `match_goals` do lado.

## 3. Escrita POR-LADO nos escritores de ENTRADA + preload do modal

Os DOIS escritores de entrada faziam **delete-then-insert do MATCH INTEIRO**, e o
`MatchScoreModal` abria com autores VAZIOS (nunca carregava os `match_goals` já
gravados). Isso causa DUAS perdas silenciosas CONFIRMADAS:

1. **Reabrir → re-lançar / re-aprovar apaga a artilharia colaborativa.** Corrigir
   um placar (reabrir + re-lançar) ou aprovar uma re-proposta rodava o
   delete-do-match-inteiro sobre um modal vazio → APAGAVA toda a atribuição
   colaborativa + gols contra (o dado que a feature existe pra capturar).
2. **Aprovar uma proposta que traz autores de UM lado deletava o lado oposto**
   colaborativo (o adversário completou os gols dele; a aprovação do proponente os
   apagava).

Três mecanismos fecham isso:

### (a) Escrita SEMPRE por-lado — nunca deletar um lado ausente do payload

Nenhum write de `match_goals` pode deletar linhas de um `lado` que NÃO está no
payload submetido. Troca-se o `delete ... where match_id = X` (match inteiro) por
delete escopado aos **lados GOVERNADOS** (os presentes/válidos no payload):

- **`updateMatchScore` (direto):** o modal de lançamento direto do organizador é
  uma superfície REPLACE — ele PRÉ-CARREGA os autores dos DOIS lados
  (`autoresIniciais`) e submete a lista COMPLETA. Por isso, `autores` ENVIADO
  (mesmo `[]`) → delete+insert dos DOIS lados (um lado vindo VAZIO é ESVAZIADO —
  o organizador vê o estado atual pelo preload, então limpar é intencional).
  `autores` AUSENTE (`undefined`, não tocado) → preserva TUDO (retrocompat:
  reabrir + re-lançar sem tocar não apaga a artilharia colaborativa).
- **`aprovar_proposta_placar` (RPC):** o delete passa a ser escopado aos lados
  presentes no `sp.autores` (dentro do teto). `null` → PRESERVA tudo; uma proposta
  que cobre só o lado 1 substitui o lado 1 e deixa o lado 2 colaborativo intocado.

### (a.1) Invariante `soma(match_goals de um lado) ≤ placar[lado]` SEMPRE (R1)

A escrita por-lado (a) abre um furo quando o placar de um lado é REDUZIDO sem que
os autores daquele lado venham no payload: o delete-por-lado-presente preserva o
lado omitido, então os gols antigos SOBREVIVEM ACIMA do novo teto (`soma > placar`).
Esses órfãos seriam materializados na **FOTO durável do hall da fama**
(irreversível). Por isso os DOIS escritores de entrada, ao gravar o placar,
IMPÕEM a invariante: para CADA lado cujo (novo placar) < (soma de `match_goals` já
gravada daquele lado), **DELETAM os `match_goals` daquele lado no mesmo passo**
(força a re-atribuição sob o novo placar). O lado GOVERNADO pelo payload já foi
reescrito ≤ placar (o Zod/teto garante), então nunca cai nessa poda — ela só atinge
o lado OMITIDO cujo placar encolheu. Em `updateMatchScore` é um `select` dos
somatórios + `delete ... in (lados órfãos)`; em `aprovar_proposta_placar` é um
`delete` correlacionado (`placar[lado] < sum(gols do lado)`) após a materialização.

### (b) Preload × MODO — o preload NÃO PODE dobrar os artilheiros

O preload precisa ser reconciliado com o modo, ou o append DOBRA. **O perigo:** se
o editor `append` pré-carregar os autores existentes como LINHAS EDITÁVEIS e
submeter a lista renderizada (preload + novos) como payload append, a RPC faz
`existente ∪ payload` = `{Vini:2} ∪ {Vini:2, João:1}` = `Vini:4, João:1` — dobra o
Vini (e/ou dispara `TETO_LADO` espúrio). A reconciliação distingue as SUPERFÍCIES:

- **Superfícies REPLACE — preload EDITÁVEL, submete a lista COMPLETA:**
  - `MatchScoreModal` do lançamento DIRETO (organizador) — o writer é o
    delete-then-insert por-lado do `updateMatchScore` (substitui os lados
    submetidos). Preload editável dos dois lados; sem dobra.
  - Console do organizador (pós-validação) — RPC `modo='replace'` (base vazia).
    Preload editável; sem dobra.
  - Modo PROPOSTA do técnico — a partida ainda não tem placar/gols materializados
    (a materialização é na aprovação, por-lado/replace) → preload naturalmente
    vazio; sem dobra.
- **Superfície APPEND — existente SOMENTE-LEITURA, submete SÓ o delta:** o editor
  "Meus artilheiros" do técnico. Os autores já registrados do lado aparecem
  **read-only** (o técnico é append-only: não edita/remove — bate com a decisão de
  produto). A área de adicionar mostra o **orçamento restante** (`placar[lado] −
  soma já atribuída`) e, no save, submete **APENAS as entradas NOVAS** (o delta)
  com `modo='append'`. **NUNCA reenvia as linhas pré-carregadas no payload append**
  — a RPC já soma o EXISTENTE (que lê da tabela) ao delta. Ex.: técnico vê
  `Vini:2` (read-only, de 4), adiciona `João:1`, submete só `[João:1]` → RPC faz
  `{Vini:2} ∪ {João:1}` = `Vini:2, João:1` = 3/4. NÃO `Vini:4`.

O flag `autoresTocado` (nas superfícies replace) governa `undefined` (não mexeu →
preserva) vs a lista completa. Assim reabrir + re-lançar SEM tocar preserva os
`match_goals`, e nenhuma superfície dobra.

> **Superfícies replace governam os DOIS lados (fix pós-review):** como o modal
> direto e o console pré-carregam AMBOS os lados, mexer na captura submete a lista
> completa dos dois, e um lado enviado VAZIO ESVAZIA aquele lado (limpar é
> intencional, o organizador vê o estado atual). Não há mais "lado ausente =
> intocado" no `updateMatchScore` com `autores` enviado — isso fecha a perda
> silenciosa em que reabrir + editar apagava a artilharia sem o organizador ver, e
> em que esvaziar um lado não tinha efeito. A distinção que resta é `undefined`
> (não tocou → preserva) vs enviado (replace dos dois).

### (c) `contra` flui por ambos os escritores

O gol contra é capturável no lançamento/proposta (toggle no `AutoresLado`; decisão
de produto travada — o dono deu o exemplo do 4×2 já no lançamento), então `contra`
precisa fluir:

- **Direto (`updateMatchScore`):** `autorGolSchema` ganha `contra` (default
  false); `contra=false` → `jogador` obrigatório; `contra=true` → opcional.
  `agregarAutores`/`chaveAutor` chaveiam por `(lado, contra, nome normalizado)` (o
  anônimo por `(lado, true, '')`); o insert grava `contra`.
- **Proposta (`proporPlacar` + `aprovar_proposta_placar`):** o jsonb `autores` da
  proposta carrega `contra`; a RPC de aprovação parseia `contra`, agrega por
  `(lado, contra, nome)`, insere `contra` e conta contra no teto. Sem isso, um gol
  contra proposto viraria gol normal e **entraria no ranking** — regressão.

`checarAutores` (Zod compartilhado): soma por lado (normais + contra) ≤ placar;
duplicata por `(lado, contra, nome normalizado)` — um "Endrick" normal e um
"Endrick" contra no mesmo lado são válidos (buckets distintos); dois contras
anônimos no mesmo lado são duplicata (a UI soma num item, espelhando o índice
`coalesce('')`).

### (d) W.O. / 0×0 LIMPA os `match_goals` — via TRIGGER atômico

Reabrir → registrar W.O. força o placar 0×0, mas os `match_goals` antigos
sobreviveriam e continuariam poluindo ranking/carreira (que não filtram por `wo`).
Invariante: W.O./0×0 NÃO tem gols.

Em vez de 4 deletes app-layer (`marcarWO`/interno, `marcarWoDuplo`, auto-W.O. de
órfão em `fecharRodada`, `responderWO` no aceite) — 2 statements separados do client
de sessão, com **janela de corrida** (um `aprovar_proposta_placar` concorrente pode
fechar+materializar no gap) e a regra ESPALHADA por 4 lugares — um **trigger AFTER
UPDATE `matches_limpar_gols_wo`** deleta os `match_goals` no MESMO passo do UPDATE
que grava o W.O. e encerra:

```sql
after update on public.matches
when (new.wo = true and new.status = 'encerrada'
      and (old.wo is distinct from new.wo or old.status is distinct from new.status))
```

- **Atômico** com o encerramento por W.O.; **um lugar só** cobre TODOS os caminhos
  (simples, duplo, auto-órfão, aceite de solicitação).
- **`SECURITY DEFINER`** → ignora a policy de DELETE de `match_goals` (que exigiria
  `status <> 'encerrada'`, e a partida ACABOU de encerrar). É `revoke execute` de
  todos os papéis (trigger-only, sem superfície de RPC).
- **Só W.O.:** dispara quando a partida PASSA a `wo=true` + `status='encerrada'`. O
  encerramento NORMAL (`wo=false`) PRESERVA os gols — o cerne da feature.
- **Compatível com `matches_lock_lifecycle`** (BEFORE UPDATE): aquele lock só barra
  W.O. em `encerrada→encerrada`; um W.O. novo é `aberta→encerrada` e passa, então o
  AFTER roda depois do UPDATE válido. O `matches_limpar_gols_wo` não altera
  `matches` (só deleta em `match_goals`), sem reentrar no lock.

Assim `wo.ts` NÃO precisa mais deletar `match_goals` — o trigger é a única fonte da
limpeza.

## 4. TODO leitor de match_goals exclui gol contra (3 pontos de filtro)

Decisão de produto travada: gol contra NÃO entra no ranking, carreira, autocomplete
NEM no hall da fama. São TRÊS pontos de filtro — TODOS OBRIGATÓRIOS:

- **`getArtilharia`** (TS): `select ... contra` + ignora `contra = true`.
- **`golsPorNomeDoCompetidor`** (TS; base de `getArtilheirosDoCompetidor` E de
  `getScorerSuggestions`): filtra `contra = true` num ÚNICO ponto — carreira e
  autocomplete herdam. O autocomplete sugere só os PRÓPRIOS artilheiros do
  competidor; nome de adversário (gol contra) não deve poluí-lo.
- **`registrar_conquistas_temporada`** (SQL, `SECURITY DEFINER`): é o **ÚNICO outro
  leitor SQL de `match_goals`** e MATERIALIZA o troféu de Artilheiro numa **FOTO
  DURÁVEL** (persistida em PROD desde 2026-07-05, não recomputada a cada leitura). O
  bloco "(c) Artilheiro por divisão" faz `join public.match_goals g on g.match_id =
  m.id` sem filtrar `contra`. Sem `and g.contra = false` no join, um gol contra (e o
  anônimo, `jogador` null) **cravaria um artilheiro fictício/nulo no hall da fama —
  corrupção IRREVERSÍVEL** (a foto fica gravada). Por isso a change reproduz a RPC
  inteira em `ddl.sql`/`schema.sql` com essa única mudança no join.

O gol contra pode aparecer no DETALHE da partida ("3 gols + 1 contra"), fora do
ranking — é dado de exibição da partida, não de artilharia.

### `jogador` nullable é LOAD-BEARING no typecheck

Ao tornar `match_goals.jogador` nullable, os tipos gerados
(`src/lib/supabase/database.types.ts`) passam a expor `jogador: string | null`.
Isso FORÇA, no `getArtilharia`/`getArtilheirosDoCompetidor`, o filtro `contra =
false` (que garante `jogador` não-nulo) a PRECEDER qualquer `.trim()` — o
compilador barra `.trim()` sobre `string | null`. É uma rede de segurança de tipo:
sem atualizar os tipos (BLOQUEANTE 3), o `pnpm typecheck` do gate nem fecha
(`.rpc('registrar_autores_lado')`, `.select('...contra')`, `.insert({contra})` não
tipam) e o guard de null não seria exigido.

## 5. Server Action, superfícies e como o técnico chega ao editor

`registrarAutoresLado(matchId, lado, autores, modo)` embrulha a RPC + Zod do
payload por-lado (`{jogador?: string|null, gols: 1..99, contra: bool}[]`, regra
jogador-obrigatório-quando-normal, teto por lado; `modo` ∈ `{append, replace}`). É
ADITIVA: NÃO substitui a entrada inicial (`updateMatchScore`/`proporPlacar`). O mapa
de erros da RPC (`AUTH_REQUIRED`, `LADO_INVALIDO`, `MODO_INVALIDO`, `PARTIDA_INVALIDA`,
`LADO_SEM_VAGA`, `NAO_AUTORIZADO`, `TETO_LADO`) vira mensagem amigável.

### Duas superfícies (o `MatchScoreModal` não serve as encerradas)

O `MatchScoreModal` é do fluxo de ABERTAS (rejeita partida encerrada). A completação
pós-validação é uma superfície SEPARADA, em partida ENCERRADA:

- **Editor "Meus artilheiros" (técnico), `modo='append'`.** Aparece no card da
  partida (na lista de partidas do torneio / no detalhe da partida) quando:
  `status = 'encerrada'` **E** a partida é COMPETITIVA (tem vaga) **E** `auth.uid()`
  é o `slot.user_id` de UM dos lados. O editor identifica QUAL lado é o do técnico
  logado comparando `auth.uid()` a `vaga_1.user_id`/`vaga_2.user_id` (o mesmo
  `ehJogadorDaPartida`/`slot.user_id` que o resto do app usa) e trava a edição
  àquele lado. Os autores JÁ registrados do lado aparecem **SOMENTE-LEITURA** (o
  técnico não edita/remove); a área de adicionar mostra o **orçamento restante**
  ("X de Y gols atribuídos", Y=`placar[lado]`, X=soma já atribuída) e, no save,
  chama `registrarAutoresLado(matchId, ladoDoTecnico, **delta**, 'append')` —
  **apenas as entradas NOVAS**, nunca as pré-carregadas (a RPC já soma o existente;
  reenviar dobraria — §3b). Este editor NÃO reusa a captura EDITÁVEL do
  `MatchScoreModal` para as linhas existentes.
- **Console do organizador (árbitro), `modo='replace'`.** Em `OpenMatchesList`/
  `PropostasPendentes`, para quem arbitra: editor COMPLETO dos DOIS lados, cada lado
  chamando `registrarAutoresLado(matchId, lado, listaCompleta, 'replace')`.

Sem esse gate de exibição e a resolução do lado, o editor seria construído mas
ficaria INACESSÍVEL — por isso é especificado (não só o backend).

### Descoberta: badge de "gols por atribuir"

Para puxar a completação colaborativa (o problema que a change resolve —
"artilharia pela metade"), as partidas ENCERRADAS competitivas em que o LADO do
técnico logado tem gols por atribuir (`placar[lado] > soma atribuída daquele lado`)
SHALL exibir um badge/indicador discreto ("faltam N artilheiros"). Puxa o técnico
para o editor "Meus artilheiros". É a superfície de descoberta da feature.

## 6. DDL não aplicada

`supabase/schema.sql` (fonte de verdade) recebe o `contra`, os índices
reprojetados, a CHECK nova, a RPC `registrar_autores_lado` e as extensões de
`aprovar_proposta_placar` (por-lado + contra) e `registrar_conquistas_temporada`
(`and g.contra = false`); `ddl.sql` traz o recorte idempotente com pré-checagens. O
dono aplica manualmente (REGRA 4). Esta change NÃO toca o banco.
