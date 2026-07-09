# Design — add-perfil-tecnico-carreira

## Contexto

O técnico é uma pessoa (`users.id`) que passa por VAGAS
(`tournament_slots.user_id`). Cada vaga aponta para um competidor persistente
(`competitor_id`) e é um dos lados de uma partida (`matches.vaga_1`/`vaga_2`), com
o placar oficial em `matches.placar_1`/`placar_2`. As PASSAGENS já estão gravadas
em `coach_tenures` (writer único = trigger em `tournament_slots.user_id`), com a
janela `rodada_inicio`/`rodada_fim` e o marcador de vigência `encerrada_em`.

O perfil hoje (`getTecnicoProfile` + `getConquistasDoTecnico`) agrega clubes,
temporadas e troféus HERDADOS. Esta change adiciona a CAMPANHA (números de sempre,
por clube e no total) e o CONFRONTO entre técnicos, sem tocar o banco.

## Escopo creditável (o que a atribuição alcança, zero-DDL)

A atribuição é 100% dirigida por `coach_tenures`, e o trigger writer só grava tenure
quando a vaga tem `competitor_id` (`schema.sql:5811`). Logo o universo creditável é
EXATAMENTE as vagas com `competitor_id` + técnico:

- **Temporada de divisão** (`montar_temporada`) — pontos corridos. ✓
- **Mata-mata derivado de liga** — `montar_playoff`, `montar_barragem`,
  `montar_grande_final`, que gravam `competitor_id` + `user_id` na vaga. ✓

Ficam de FORA, por construção do modelo de dados (NÃO é limitação do leitor):

- **Copas continentais** (`montar_copa`): a vaga nasce com `competitor_id` E
  `user_id` NULOS — "participante de copa não tem `league_competitor` nem técnico"
  (`schema.sql:4527`). A copa não modela quem é o técnico, então é estruturalmente
  inatribuível — nenhuma leitura resolve isso; exigiria uma feature/DDL nova que
  desse conceito de técnico à copa.
- **Torneios avulsos/standalone de clube** (vaga com `team_id` mas sem
  `competitor_id`) e o **avulso pessoa-vs-pessoa** (`participante_1/2`).

Isto realiza o critério do dono "tudo que tem vaga → competidor (`competitor_id`)".

## Decisão-chave: atribuição PESSOAL por janela de comando

Ao contrário dos troféus (herdados pelo técnico vigente na final), os stats são
PESSOAIS: contam só o que o técnico efetivamente dirigiu. A fonte da verdade das
janelas é `coach_tenures`.

### Predicado de atribuição (meio-aberto no topo)

Uma partida `M` (com `M.rodada = r`, possivelmente NULL) numa vaga `S` é creditada
à tenure `T` (mesma vaga `S`, `T.rodada_inicio = ini`, `T.rodada_fim = fim`) quando:

```
(ini IS NULL OR (r IS NOT NULL AND r >= ini))
AND
(fim IS NULL OR (r IS NOT NULL AND r <  fim))
```

Por que **meio-aberto** (`>= ini` e `< fim`): o trigger de tenures fecha o técnico
que sai e abre o que entra na MESMA rodada `v_rodada = fn_rodada_corrente` (=
`min(rodada)` das partidas ainda não encerradas), deixando `old.rodada_fim =
new.rodada_inicio` (fronteira compartilhada, `schema.sql:5844-5845`). Com o topo
EXCLUSIVO, a rodada da troca é creditada a QUEM ASSUMIU (a partida daquela rodada é
jogada depois da troca) e a QUEM SAIU não — janelas disjuntas, **sem duplicar nem
perder** a partida da fronteira. Casa com o exemplo do dono: assumiu na rodada 6 de
uma temporada de 10 → joga 6..10 = 5 jogos; o anterior joga 1..5.

`rodada` NULL — DEFENSIVO, não normativo: TODAS as partidas creditáveis (vagas com
`competitor_id`: temporada de divisão + mata-mata derivado) têm `rodada` não-nula,
então o predicado se aplica UNIFORMEMENTE a elas. `partidaNaJanela` ainda trata `r
NULL` conservadoramente — as duas cláusulas exigem `r NOT NULL` para bater qualquer
janela LIMITADA, logo uma (hipotética) partida sem `rodada` só seria creditada sob
tenure TOTALMENTE ABERTA (`ini` e `fim` nulos, sem troca) — mas isso não ocorre em
dado real creditável. É rede de segurança, não a via principal.

### Sem duplo-crédito dentro de uma partida

Num torneio, um usuário comanda no máximo UMA vaga (índice único
`slots_um_clube_por_tecnico`). Uma partida pertence a um torneio. Logo, num único
jogo o técnico está em NO MÁXIMO um lado — nunca crédito dos dois lados. Entre
tenures do mesmo técnico na MESMA vaga (saiu e voltou), as janelas são disjuntas
por construção; o predicado credita o jogo a no máximo uma delas.

## Fluxo de dados

### 1. Campanha (RSC, server-side no `page.tsx`)

`getTecnicoCampanha(supabase, { userId })`:

1. `coach_tenures` do técnico (`user_id = userId`) → linhas `{ slot_id,
   competitor_id, rodada_inicio, rodada_fim }`. (As tenures LOCAIS por-nome têm
   `user_id` nulo e não entram — igual ao perfil atual.)
2. `matches` de qualquer vaga dele: `.or("vaga_1.in.(slotIds),vaga_2.in.(slotIds)")`,
   `status = 'encerrada'`, selecionando `id, vaga_1, vaga_2, placar_1, placar_2,
   rodada, wo, wo_vencedor, wo_duplo`.
3. Para cada partida, resolve o LADO do técnico: o lado cuja vaga ∈ tenures dele; e
   confirma a JANELA (predicado acima) contra a tenure daquela vaga. Se nenhuma
   tenure-vaga do técnico satisfaz a janela, a partida é DESCARTADA (foi jogada por
   outro técnico daquela vaga). Produz `PartidaCreditada { competitorId, lado,
   placar_1, placar_2, wo, woVencedorLado, woDuplo }`.
4. `agregarCampanhaTecnico(creditadas)` (puro) → `{ total, porClube: Map<competitorId,
   Campanha> }`.
5. Adversários enfrentados: para cada partida creditada, resolve o técnico do lado
   OPOSTO — a vaga oposta + a tenure daquela vaga cuja janela contém `M.rodada`
   (mesmo predicado). Coleta `user_id` distintos (≠ userId, ≠ nulo). Busca
   nome/avatar em `users_public`. Retorna `adversarios: { userId, nome, avatar,
   jogos }[]` ordenado por jogos desc. (Requer ler `coach_tenures` das vagas
   opostas — uma query `.in("slot_id", vagasOpostas)`.)

`Campanha = { jogos, vitorias, empates, derrotas, golsPro, golsContra, saldo,
aproveitamento }`. `aproveitamento = round((3*vitorias + empates) / (3*jogos) *
100)` (0 quando `jogos = 0`).

### 2. Confronto entre técnicos (Server Action POST, sob demanda)

`carregarConfrontoTecnicos(userAId, userBId)` → `getConfrontoTecnicos`:

1. Tenures de A e de B (vagas + janelas).
2. `matches` das vagas de A, `status='encerrada'`, com os campos de placar/W.O. +
   `rodada`; filtra as em que o lado OPOSTO é uma vaga de B.
3. Mantém a partida só se `M.rodada` cai NA JANELA de A (vaga de A) E NA JANELA de B
   (vaga de B) — os dois estavam no comando naquele jogo.
4. Re-chaveia os lados como `A`/`B` (respeitando `wo_vencedor`) e chama a pura
   `confrontoDireto("A", "B", partidas, ordenarPorData)`.

O painel espelha `ConfrontoDiretoPanel`: seletor com os `adversarios` (vindos da
campanha), botão que chama a Server Action, render do agregado + lista de jogos.

## Fronteiras de módulo

- **Puro (sem IO, testável isolado):** `src/features/standings/coachStats.ts` —
  `partidaNaJanela(rodada, ini, fim): boolean` e `agregarCampanhaTecnico(partidas):
  { total, porClube }`. Reusa `resultadoDoLado` de `insights.ts` (V/E/D + gols de um
  lado, já tratando W.O.). NÃO reimplementa regra de W.O. **`resultadoDoLado` (e o
  tipo `ResultadoLado`) são hoje PRIVADOS de `insights.ts`; a change adiciona
  `export` a eles** (mudança trivial de código, não DDL) — sem isso o reuso não
  compila. Alternativa descartada: re-chavear para `calcularDestaquesCompetidor`
  (exportada), que dá jogos/V/E/D/GP/GC prontos, mas acopla a uma API mais pesada.
- **IO fino:** `getTecnicoCampanha` e `getConfrontoTecnicos` — só montam queries e
  chamam o puro. Espelham `getCompetidorInsights`/`getConfrontoDireto`.
- **UI (folhas client só onde há interação):** `ConfrontoTecnicosPanel` é
  `"use client"` (seletor + fetch sob demanda); `CampanhaDeSempre` e a fatia por
  clube são RSC (dados já resolvidos no server).

## Casos de borda

- **Sem campanha:** técnico com tenures mas nenhuma partida encerrada na janela →
  bloco de campanha some ou mostra estado vazio; perfil não quebra.
- **W.O. simples:** vencedor (por `wo_vencedor` = vaga) leva V, perdedor D, 0 gols.
  **Duplo W.O.:** os dois levam D, 0 gols. Ambos via `resultadoDoLado`.
- **Gol contra:** já embutido em `placar_1`/`placar_2`; como GP/GC saem do placar,
  o gol contra é contado sem ler `match_goals` (coerente com a decisão do dono).
- **Split (Apertura/Clausura):** duas tenures do mesmo `competitor_id` em turnos
  diferentes; as partidas de cada turno caem na janela do turno certo e somam na
  MESMA fatia por `competitor_id`. Sem dupla contagem (predicado + janelas
  disjuntas).
- **Adversário sem conta (por-nome):** a vaga oposta tem tenure `user_id` nulo →
  não vira adversário selecionável (não há perfil global). O jogo AINDA conta na
  campanha do técnico (é uma partida real dele) — só não gera item de confronto.
- **`userId` inválido:** rota e Server Action validam uuid antes de qualquer query
  → 404 / retorno vazio, nunca erro Postgres.
- **Auto-confronto (A == B):** a Server Action rejeita cedo (retorno vazio); o
  seletor nunca lista o próprio técnico.

## Limitações conhecidas (aceitas)

A atribuição por janela é fiel ao modelo, mas herda duas limitações do writer de
tenures — documentadas, não "consertadas" (o conserto exigiria DDL no trigger, fora
do escopo read-only):

1. **Troca com a temporada já toda encerrada (fronteira pós-temporada).** Quando um
   `user_id` de vaga muda depois que TODAS as partidas já estão encerradas, o trigger
   usa o fallback `v_rodada = max(rodada)` (`schema.sql:5846-5851`), gravando
   `old.rodada_fim = new.rodada_inicio = max`. O predicado meio-aberto credita a
   partida da rodada `max` a QUEM ASSUMIU (que não disputou jogo nenhum), tirando-a de
   quem realmente a jogou. O leitor NÃO consegue distinguir essa fronteira de uma
   troca "corrente" só por `rodada_inicio`/`rodada_fim` — os dois casos são idênticos
   nos dados. É um erro de 1 rodada, num cenário raro (reatribuição de vaga
   pós-temporada). **Aceito e documentado.** A justificativa "a partida da fronteira é
   jogada depois da troca" vale para a troca CORRENTE (o caso que importa ao dono),
   não para esse fallback.

2. **Trocas históricas anteriores a esta feature (backfill = herança).** O backfill
   do trigger (`schema.sql:5886-5893`) gravou UMA tenure aberta por vaga a partir do
   técnico ATUAL (`rodada_inicio` nulo, sem `rodada_fim`). Para temporadas encerradas
   ANTES do trigger existir, as trocas intermediárias nunca foram registradas — logo a
   janela degenera em HERANÇA: a temporada inteira é creditada ao técnico FINAL da
   vaga (exatamente o oposto do "registro pessoal" para esses dados). É inerente à
   ausência do dado histórico; nenhuma leitura recupera trocas que não existem na
   tabela. **Aceito**; a atribuição pessoal por janela é integralmente fiel apenas das
   trocas capturadas pelo trigger em diante.

## Alternativas descartadas

- **Herança total (igual troféus):** contar toda a história do clube enquanto o
  técnico o detém. Rejeitada pelo dono — um técnico interino de 1 rodada absorveria
  os números de todos. A escolha é o registro PESSOAL por janela.
- **Nova RPC/coluna materializada de stats:** desnecessária. A agregação é barata
  (bounded pelas partidas do técnico) e roda no server em duas queries. Zero DDL
  reduz risco e dispensa aprovação de SQL em produção.
- **Confronto contra QUALQUER usuário (busca global):** o seletor lista só quem ele
  ENFRENTOU (o "histórico contra" só existe com quem já jogou); um usuário nunca
  enfrentado daria retrospecto vazio, sem valor.
