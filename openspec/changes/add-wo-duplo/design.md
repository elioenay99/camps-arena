# Design — Duplo W.O. (ambos ausentes)

Referências `arquivo:linha` são do HEAD. O duplo W.O. é o ESPELHO SIMÉTRICO do
W.O. simples: mesma representação (partida `encerrada`, `wo = true`, placar 0x0),
só que sem vencedor. Todas as decisões preservam o RSC-first e a autorização por
capacidade.

## 1. Como uma partida de CHAVE é distinguida (confirmado no schema)

Uma partida de mata-mata/chave é aquela com **`posicao is not null`**. Confirmado
em `supabase/schema.sql`:
- comentário do backstop de decisividade: "as regras de resultado se aplicam SÓ a
  partidas de CHAVE (posicao não nula)" (`schema.sql:612-614`);
- o próprio trigger `valida_resultado_mata_mata` gateia por `new.posicao is not
  null` (`schema.sql:665`);
- a action de W.O. gateia o guard de chave por `match.posicao != null`
  (`src/actions/wo.ts:140`);
- `grupo` e `posicao` são mutuamente exclusivos (CHECK `matches_grupo_ou_posicao`,
  `schema.sql:404-407`): partida de grupo tem `grupo` não-nulo e `posicao` nula, e
  empata/reabre livre como liga. Logo `posicao is null` cobre liga, fase de grupos
  e avulso — todos os contextos onde o duplo é permitido.

Portanto, em toda regra de proibição do duplo em chave, o predicado é `posicao is
null` (permitido) vs. `posicao is not null` (chave, proibido).

**Ida-e-volta e disputa de 3º lugar.** Ambas EM CHAVE têm `posicao` não-nula (cada
perna e o jogo de 3º lugar são partidas de mata-mata) → caem no ramo PROIBIDO: sem
duplo, coerente com "a chave exige um vencedor". Já ida-e-volta em LIGA/GRUPOS
(pontos corridos com turno e returno) tem `posicao` nula — cada perna é uma partida
de pontos independente — então o duplo é permitido POR PERNA, exatamente como
qualquer outra partida de pontos.

## 2. Coluna `wo_duplo` (DDL aditivo)

```sql
alter table public.matches
  add column if not exists wo_duplo boolean not null default false;
```

Aditivo, idempotente, sem backfill: todo registro legado nasce `wo_duplo = false`,
coerente com a CHECK (ramos 1 e 2 exigem `wo_duplo = false`). Sem coluna nova de
"empate por W.O." — não se cria um 4º contador; o efeito é DERROTA para os dois.

## 3. CHECK `matches_wo_coerente` relaxada em 3 ramos (DROP + ADD idempotente)

```sql
alter table public.matches drop constraint if exists matches_wo_coerente;
alter table public.matches
  add constraint matches_wo_coerente
  check (
    -- 1) fora de W.O.
    (wo = false and wo_vencedor is null and wo_duplo = false)
    -- 2) W.O. simples: um lado ausente, vencedor explícito entre as vagas
    or (wo = true and wo_duplo = false and status = 'encerrada'
        and wo_vencedor is not null and placar_1 = 0 and placar_2 = 0
        and (wo_vencedor = vaga_1 or wo_vencedor = vaga_2))
    -- 3) duplo W.O.: ambos ausentes, sem vencedor, NÃO é chave (posicao nula),
    --    os dois lados presentes (defesa em profundidade — não há duplo em bye)
    or (wo = true and wo_duplo = true and status = 'encerrada'
        and wo_vencedor is null and placar_1 = 0 and placar_2 = 0
        and posicao is null
        and vaga_1 is not null and vaga_2 is not null)
  );
```

O ramo 3 é o BACKSTOP no banco contra duplo em chave: `posicao is null` impede
gravar `wo_duplo = true` numa partida de mata-mata mesmo por POST direto. O
`vaga_1 is not null and vaga_2 is not null` é defesa em profundidade (simetria com
o ramo 2, cujo `wo_vencedor ∈ {vaga_1, vaga_2}` já implica ambos presentes): a
action de duplo exige os dois lados, e o banco recusa duplo numa vaga vazia/bye
mesmo por POST direto. Os ramos 1 e 2 preservam byte-a-byte a semântica atual (só
ganharam `wo_duplo = false`).

## 4. Trigger `lock_match_lifecycle` — `wo_duplo` imutável

Em `schema.sql:589-598`, a lista de colunas imutáveis em `encerrada → encerrada`
ganha `or new.wo_duplo is distinct from old.wo_duplo`, fechando o furo do técnico
do lado prejudicado tentar mexer no duplo já gravado (mesmo motivo de `wo`/
`wo_vencedor` já estarem lá). A REABERTURA (status sai de encerrada) segue livre
para limpar `wo_duplo` no mesmo UPDATE.

O trigger `valida_resultado_mata_mata` NÃO precisa mudar: ele só age em `posicao
not null` (`schema.sql:665`), e o duplo nunca ocorre em chave (proibido em três
camadas). Seu early-return em `new.wo` (`schema.sql:666-667`) permanece correto.

## 5. Action — declaração de duplo W.O.

Espelha `marcarWoInterno` (`wo.ts:89-172`). Preferência: **action dedicada
`marcarWoDuplo(matchId)`** (mais legível que sobrecarregar a assinatura de
`marcarWO`, que hoje EXIGE `vencedorSlotId`). Regras, na ordem:
1. Zod `z.uuid()` do `matchId`; sessão válida (`getUser`).
2. Fetch da partida (`id, status, tournament_id, posicao, vaga_1, vaga_2`).
3. Capacidade ARBITRAR via `podeArbitrar({tournamentId})` — pré-check + RLS
   backstop (igual ao simples, `wo.ts:108`).
4. Torneio `status = 'ativo'` por filtro (`wo.ts:114-125`).
5. Partida não-encerrada (`wo.ts:127-132`) — corrigir = reabrir antes.
6. **Partida JOGÁVEL**: os dois lados presentes (`vaga_1` e `vaga_2` não nulos).
   Duplo em bye (um lado nulo) não faz sentido.
7. **RECUSA em chave**: se `posicao != null` → erro claro, ex.: "A chave exige um
   vencedor; use W.O. a favor de um dos lados." (NÃO chamar `validarWoChave`, que é
   para o simples; o duplo simplesmente não existe em chave.)
8. UPDATE único `{wo: true, wo_duplo: true, wo_vencedor: null, placar_1: 0,
   placar_2: 0, status: 'encerrada'}` com `.eq(id).neq('status','encerrada')`
   (idempotência) e `revalidatePath`.

`solicitarWO`/`responderWO` NÃO ganham duplo: não há "solicitar duplo" por técnico
(decisão de produto 3) — o duplo é só declaração da organização + auto no fechar
rodada.

## 6. Motor de classificação — ramo simétrico do duplo

O motor recebe o sinal do duplo como um flag `woDuplo` na partida elegível
(análogo a `woVencedor`), exposto como `woDuplo = p.wo === true && p.wo_duplo ===
true`. Por ser BOOLEAN, `woDuplo` NÃO precisa de re-chaveamento por slot como o
`wo_vencedor` (que aponta um slot e é re-chaveado na Clausura em
`getDivisionClassificacaoCombinada`) — basta selecioná-lo e repassá-lo.

### 6.a Censo FECHADO da propagação (matches → motor, FORA de chave)

O duplo só ocorre onde `posicao is null` (liga, fase de grupos, avulso). Todo
call-site que mapeia partidas de `matches` para `computeStandings`/
`classificarGrupos` passando só `woVencedor` precisa passar TAMBÉM `woDuplo` e
incluir `wo_duplo` no SELECT correspondente — senão o 0x0 do duplo cai no ramo de
placar e vira EMPATE (bug silencioso). Lista fechada, verificada por grep
(`rg -n "computeStandings\(|classificarGrupos\(|woVencedor:|wo_vencedor" src/`):

| # | Arquivo | SELECT (`+ wo_duplo`) | Literal(is) do mapa (`+ woDuplo`) | Consumo |
|---|---------|---------|-----------|---------|
| A | `getTournamentClassificacao.ts` | :361 | helper `woVencedor` :399 ganha par `woDuplo`; `linhasMotor` :407; mapa `grupos` :669 | `computeStandings` :456/:470 e :659 |
| B | `tournaments.ts` `montarMataMataDosGrupos` | :1299 | :1318 | `classificarGrupos` :1345 |
| C | `cups.ts` `computarEliminadosGrupos` | :1240 (+ tipo do param :1327-1338) | :1356 | `computeStandings` :1365 |
| D | `getDivisionClassificacaoCombinada.ts` | :140 (+ tipo `PartidaRow`) | :168 | `computeStandings` :179 |
| E | `gerarFaseDeGrupos.ts` `classificarGrupos` | — (pass-through) | tipo `PartidaGrupoJogada` ganha `woDuplo?: boolean` | `computeStandings` :228 |

**Um único SELECT em A (`:361`) alimenta TODAS as projeções** de
`getTournamentClassificacao` (motor, mapa de grupos, histórico) — incluir
`wo_duplo` lá uma vez cobre os três.

**Consumidores PUROS (herdam a correção, sem mapeamento próprio — nada a fazer):**
`getDivisionStandings.ts` e `promedios.ts` NÃO mapeiam partidas: delegam a
`getTournamentClassificacao` (anual) e `getDivisionClassificacaoCombinada` (split)
via `carregarLinhasBaseDivisao`, consumindo `pontos`/`jogos` já computados. Com A e
D corrigidos, o promédio (`pontos/jogos`) cai automaticamente no duplo.

**Fetchers DISPENSADOS (puramente de chave — duplo é PROIBIDO em chave, `posicao
is not null` ou alimentam decisor de bracket, nunca `computeStandings`):**
`getTournamentClassificacao.ts:638` (projeção `chave`, filtro `posicao is not null`
:616 → `decidirConfronto`/BracketView), `tournaments.ts:939` (`avancarFase` →
`gerarProximaFase`, filtro `posicao !== null` :918), `cups.ts:1258` (`partidasChave`,
filtro `grupo == null` → `lerClassificacaoFinalCopa`/bracket), `leaguePyramid.ts:733`
e `:808` (bracket da pirâmide), `getGrandeFinal.ts:72`, `getPlayoffs.ts:59`
(bracket). Nenhum precisa de `woDuplo`.

### 6.b Ramos do motor

- **`aplicarPartida`** (`computeStandings.ts:146-183`): NOVO ramo, ANTES do ramo
  de `woVencedor` (ou logo após, já que são mutuamente exclusivos — duplo tem
  `woVencedor` nulo). Se `p.woDuplo`:
  ```
  lado1.derrotas += 1; lado1.pontos += regras.derrota
  lado2.derrotas += 1; lado2.pontos += regras.derrota
  return  // não toca golsPro/golsContra — 0 gols
  ```
  Crucial: SEM esse ramo, o duplo (0x0, `woVencedor` nulo) cairia no ramo de
  placar e viraria EMPATE (`placar_1 === placar_2`), creditando ponto de empate —
  errado. `jogos = V+E+D` (`computeStandings.ts:382`) conta o duplo como jogo
  disputado (D+1 para os dois), mantendo a identidade sem 4º contador.
- **`pontosConfronto`** (`computeStandings.ts:327-347`, desempate por confronto
  direto): NOVO ramo simétrico. Se `p.woDuplo`, `pontos += regras.derrota;
  continue`. Sem ele, o 0x0 cairia em `meuPlacar === placarRival` e viraria
  `regras.empate` — o duplo NÃO pode virar empate no confronto direto (ambos
  perderam). Espelha o ramo já existente de `woVencedor` (`:336-339`).

## 7. Fechar rodada — órfão × órfão vira duplo fora de chave

Em `varrerOrfaosDaRodada` (`closeRound.ts:34-88`):
- O SELECT passa a incluir `posicao` e o tipo `PartidaAbertaDaRodada` ganha
  `posicao: number | null`.
- Além do laço XOR atual (`resolvivel = orfao1 !== orfao2`, `:66`), um NOVO laço
  resolve `orfao1(m) && orfao2(m) && m.posicao == null` como DUPLO:
  ```
  update { wo: true, wo_duplo: true, wo_vencedor: null,
           placar_1: 0, placar_2: 0, status: 'encerrada' }
  ```
  com o mesmo `.neq('status','encerrada')` best-effort/idempotente. Órfão × órfão
  em CHAVE (`posicao != null`) segue INTOCADO (a chave exige vencedor; byes já
  nascem encerrados na geração).
- O gate `somenteSeRodadaCompleta` (`:68`, fechamento AUTOMÁTICO) continua valendo
  para os dois laços: enquanto houver jogo real pendente, nada é tocado; quando a
  rodada "fecha sozinha", órfão × órfão fora de chave também é resolvido como
  duplo. No botão manual "Fechar rodada" (sem o flag), varre incondicionalmente.

## 8. Reabrir limpa `wo_duplo`

`reabrirPartida` (`src/actions/match.ts`) já limpa `wo = false, wo_vencedor =
null` ao voltar a aberta; passa a incluir `wo_duplo = false` no mesmo UPDATE. Sem
isso, a CHECK barraria (o ramo "fora de W.O." exige `wo_duplo = false`). O trigger
permite a limpeza porque o status sai de `encerrada` (reabertura gated ao dono).

## 9. UI — opção "Ambos ausentes", oculta em chave

`WoButtons.tsx` `MarcarWoButton` (`:27`): o painel inline que hoje mostra
"Vitória de:" + os dois nomes ganha uma terceira opção "Ambos ausentes" (chama
`marcarWoDuplo`). Ela é RENDERIZADA apenas quando a partida NÃO é de chave
(`posicao == null`) — o componente recebe/deriva esse sinal do call-site
(`OpenMatchesList.tsx`). Considerar reenquadrar o rótulo do passo (ex.: "Resultado
do W.O.:") para acomodar as opções vencedor-1 / vencedor-2 / ambos-ausentes. O
cluster já empilha full-width no mobile (overhaul recente).

## 10. Histórico de partidas — não afirmar falsamente "lado 2 venceu"

Bug de acessibilidade latente no duplo: em `getTournamentClassificacao.ts` o helper
`woLado(p)` (`:513-520`) devolve `1|2|null` comparando `wo_vencedor` com o id cru de
cada lado. No duplo `wo_vencedor` é NULO → `woLado` retorna `null` →
`woVencedorLado: woLado(p)` (`:553`) é null. Em `MatchHistoryList.tsx` o texto
sr-only (`:62-63`) faz `p.wo ? '... W.O. — ${p.woVencedorLado === 1 ? p.nome_1 :
p.nome_2} venceu'`: com `woVencedorLado` null, `=== 1` é falso e o ternário cai em
`p.nome_2`, **afirmando que o lado 2 venceu** — acessibilidade FALSA num jogo em que
ninguém venceu.

Correção:
- Expor `woDuplo` na projeção `PartidaEncerrada` (`:552-553` ganha `woDuplo: p.wo ===
  true && p.wo_duplo === true`), reusando o `wo_duplo` já incluído no SELECT único
  `:361` (§6.a) — nenhum SELECT novo.
- `MatchHistoryList.tsx`: ramificar o rótulo visível e o sr-only — quando
  `woDuplo === true`, exibir/anunciar "W.O. duplo — ambos ausentes" (sem negrito em
  nenhum lado); senão, manter o texto atual do W.O. simples.

## Riscos / pontos de atenção

- **Confronto direto**: sem o ramo do duplo em `pontosConfronto`, o desempate
  entre dois que se enfrentaram num duplo viraria empate — cobrir por teste.
- **Propagação do flag**: qualquer site do censo FECHADO §6.a (A–E) que não exponha
  `wo_duplo` faz o motor tratar o 0x0 como empate. Ligar a ponta a ponta os cinco e
  testar a propagação POR FORMATO (§7.9), como já se faz com `desempate_criterio`.
- **CHECK em produção**: registros W.O. legados têm `wo_duplo = false` (default);
  o DROP+ADD não falha. Conferir que nenhum registro tem `wo = true` com
  `wo_vencedor` nulo antes de aplicar (não deveria existir, dado a CHECK atual).
- **Auto no fechar rodada**: garantir que o novo laço só toca `posicao is null`
  (não resolver duplo em chave por engano).
