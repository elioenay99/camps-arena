# Design — add-group-stage-format

## Context

Liga e mata-mata deixaram motores puros prontos e padrões consolidados
(INSERT em lote atômico, idempotência por detecção, 23505 como barreira de
corrida, congelamento de participants quando há chave). Grupos+mata-mata e
fase de liga são COMPOSIÇÃO: round-robin POR GRUPO na primeira fase e a chave
existente na segunda. As novidades reais são (a) a coluna `grupo`, (b) a
transição grupos→chave (classificação + cruzamento) e (c) a generalização do
knockout para chave que não começa na rodada 1.

Decisões de produto (AskUserQuestion, 2026-06-07): G e K definidos AO INICIAR;
três modos de distribuição; sorteio automático na linha de corte com aviso;
fase de liga incluída como G=1 com identidade própria.

## Goals / Non-Goals

**Goals:**

- Copa (grupos) e Champions (fase de liga) de ponta a ponta, reusando os
  motores por composição — zero mudança em `gerarTabelaLiga`/`computeStandings`.
- Transição grupos→chave determinística, idempotente e à prova de corrida
  (mesmas garantias do Iniciar/Avançar existentes).

**Non-Goals:**

- Repescagem/playoff de entrada (Champions 2024 tem playoff entre 9º–24º;
  aqui os K melhores avançam direto).
- Ranking CRUZADO entre grupos (melhores terceiros da Euro) — o corte é por
  grupo.
- Editar grupos após o Iniciar; mover participante de grupo.

## Decisions

### D1 — Partida de grupo = `grupo`+`rodada`; partida de chave = `posicao`+`rodada` (mutuamente exclusivos)

Uma coluna nova (`matches.grupo` int, CHECK `>= 1`) distingue as fases sem
enum extra: CHECK `matches_grupo_ou_posicao` garante que `grupo` e `posicao`
não coexistem. Membership do grupo é derivável das partidas (todos os pares
do grupo se enfrentam — geração completa no Iniciar, como a liga); standings
por grupo = `computeStandings` sobre o subconjunto. `grupo` entra no
`lock_match_relations` (imutável após INSERT).

*Alternativa rejeitada — tabela `groups`/`stages`*: DDL+RLS novos para
persistir o que as partidas já determinam; reavaliável se um dia houver
edição de grupos.

### D2 — Rodada CONTÍNUA entre fases; knockout generalizado por rodada-base

A chave numera rodadas a partir de `max(rodada dos grupos) + 1`. Motivo
concreto: o índice `matches_liga_par_unico (tournament_id, rodada, p1, p2)`
colidiria na fase de liga (G=1) quando um confronto da chave repete um par
que jogou na mesma rodada do grupo. Com rodadas contínuas o par nunca repete
a coordenada. O motor knockout deixa de assumir "fase 1 = rodada 1":
`tamanhoChaveDasPartidas`/`gerarProximaFase`/`ehTerceiroLugar`/`BracketView`
derivam a rodada-base (menor rodada entre as partidas com `posicao`) e
trabalham com fases relativas. O mata-mata puro (base = 1) permanece um caso
particular — testes existentes seguem válidos.

### D3 — Restrições: G·K ∈ {2,4,8,16,32}; grupos equilibrados (±1); fase_liga ⇒ G=1

O total de classificados precisa ser potência de 2 para a chave nascer
completa (byes pós-grupos exigiriam ranking cruzado — non-goal). G·K potência
de 2 implica G ∈ {1,2,4,8} (≤ 32 participantes), o que fecha o pareamento de
grupos em pares no cruzamento. Tamanhos de grupo equilibrados (diferença
máxima 1, distribuição round-robin dos sorteados); K < tamanho do MENOR grupo
(classificar todos não é eliminatória).

### D4 — Cruzamento determinístico, testado contra os casos clássicos

- **G=1 (fase de liga)**: bracket seeding padrão — pares (seed i × seed
  K+1−i), posicionados na chave pela ordem de bracket (1 e 2 em metades
  opostas; ex.: K=8 → slots [1×8, 4×5, 2×7, 3×6]). Champions-like.
- **G≥2**: grupos em pares adjacentes (A,B), (C,D)…; dentro de cada par,
  confrontos i-ésimo de um × (K+1−i)-ésimo do outro, alternando o grupo
  "mandante" (A1×B2 e B1×A2 em metades opostas da chave — padrão Copa para
  K=2, generalizado para K=4 com o mesmo princípio). Separação de grupos:
  com K=2, mesmos grupos só se reencontram na final; com K≥4, dois
  classificados do MESMO grupo podem se cruzar a partir da 2ª fase —
  inerente a poucos grupos com muitos classificados (achado da validação:
  a promessa original era mais forte do que o matematicamente possível).
- Tudo função pura com testes pinando: Copa (G=4, K=2), Copa antiga (G=8,
  K=2), Champions (G=1, K=8/16), mínimo (G=2, K=1).

### D5 — Sorteio na linha de corte: critério FINAL, auditável, com aviso

`computeStandings` divide posição em empate persistente (ex.: dois "2º").
Quando a linha de corte cruza um empate dividido, os empatados na fronteira
são ordenados por sorteio (`randInt` injetado — determinístico em teste). A
action devolve `desempatePorSorteio: true` e a UI avisa em toast ("Grupo B:
classificação decidida por sorteio"). Não persiste — o resultado do sorteio
está materializado na própria chave gerada.

### D6 — Configuração AO INICIAR; só `classificados_por_grupo` persiste

G, K e modo chegam no form do painel de início. G é derivável das partidas
(`max(grupo)`); K NÃO é derivável e o "Gerar mata-mata" roda depois →
coluna `tournaments.classificados_por_grupo` (anulável), gravada na MESMA
promoção de status do Iniciar. O modo (sorteio/potes/manual) não persiste
(padrão do mata-mata). Potes: G cabeças, uma por grupo (checkboxes); manual:
um select de grupo por participante.

### D6b — Iniciar grupos é PROMOTE-FIRST (achado da validação adversarial)

Diferente da liga/mata-mata, o índice de par único NÃO barra dupla geração
de GRUPOS: sorteios concorrentes produzem partições diferentes → pares
diferentes que não colidem (≈43% das ordenações em N=8/G=2 escapam — provado
numericamente pelo juiz). A serialização é a PROMOÇÃO atômica ANTES do
INSERT: `update ... set status='ativo', classificados_por_grupo=K where
status='rascunho'` — 0 linhas = perdedor da corrida, aborta SEM inserir; só
o vencedor insere o lote. Recuperação de crash entre a promoção e o INSERT
("ativo" sem partidas): o re-run REBAIXA atomicamente para rascunho (UPDATE
filtrado por 'ativo' também serializa dois recuperadores) e refaz; a página
reexibe o painel de início nesse estado. Bônus: K fica atômico com a
geometria validada no mesmo run (fecha também o achado de retry divergente).

### D7 — Transição grupos→chave: action própria `gerarMataMataDosGrupos`

Espelha `avancarFase`: dono + formato com grupos + `ativo`; exige TODAS as
partidas de grupo encerradas; classifica (D5) e cruza (D4); INSERT da chave
em lote único (rodadas contínuas, byes nunca — chave completa por D3);
pré-checagem de semeados em `participants` (mensagem acionável); corrida →
índice de slot → 23505 → "já gerada". Depois da chave, o fluxo é o do
mata-mata (`avancarFase` generalizada).

### D8 — Congelamento de participants desde o ATIVO nos formatos com chave

Diferente da liga (todas as partidas nascem no Iniciar), aqui o INSERT da
chave acontece DEPOIS e a policy de INSERT exige cada semeado em
`participants` — sair durante os grupos travaria o "Gerar mata-mata"
(exatamente a lição do mata-mata/encerramento). `chaveEmAndamento` e a policy
de DELETE passam a cobrir os três formatos com chave: travado quando `status
= 'ativo'` OU quando existem partidas geradas (`rodada is not null`) fora do
rascunho. Rascunho segue livre; liga/avulso seguem livres.

### D9 — Trigger de resultado cobre os três formatos; jogo de grupo empata livre

`valida_resultado_mata_mata` troca o gate `formato = 'mata_mata'` por
`formato in ('mata_mata','grupos_mata_mata','fase_liga')`, mas as regras já
se aplicam SÓ a partidas com `posicao` (jogo único/pernas/reabertura na
chave). Partida de GRUPO (`grupo` não nulo, `posicao` nulo) pode empatar e
reabrir como na liga — a regra de reabertura pós-avanço ("existe rodada
posterior") vale também para grupo encerrado depois de a chave existir
(correto: a classificação já foi consumida pela chave).

### D10 — UI por composição

Página do torneio nos formatos novos: uma `StandingsTable` por grupo (rótulo
"Grupo A/B/…"; na fase de liga, "Classificação" única) calculada por
subconjunto; `BracketView` da chave quando gerada (rodada-base via D2);
painel de início próprio (G/K/modo, prévia via `previaGrupos` — mesma fonte
do motor); botão "Gerar mata-mata" (dono, grupos completos, com estado
orientativo enquanto faltam jogos). Rótulo de grupo nas listas de partidas
("G1 R2") segue o padrão leve de rodada/perna.

## Riscos / Trade-offs

- **[K não é editável depois do Iniciar]** → gravado na promoção; mudar K
  mudaria a chave prometida. Aceito: corrigir = cancelar (encerrar) e recriar.
- **[Sorteio de corte não fica registrado]** → o aviso é efêmero (toast); a
  evidência é a chave gerada. Auditoria persistente fica para feedback real.
- **[Grupos desiguais (±1)]** → nº de jogos difere entre grupos (4 vs 3) —
  inerente a N não-múltiplo; o corte é POR GRUPO, então não há injustiça de
  ranking cruzado.
- **[Empate de agregado na chave]**, **[reabertura pós-avanço]** etc. →
  herdados do knockout com as mesmas defesas (trigger generalizado).
- **[ALTER TYPE ×2 + policy usa literais novos]** → seção 12 em DOIS Runs
  (mesma mecânica da seção 10).

## Migration Plan

1. `supabase/schema.sql` atualizado (fonte de verdade).
2. Seção 12 das pendências: Run A (2 ALTER TYPE) + Run B (colunas, CHECKs,
   lock, trigger, policy), idempotente, rollback documentado.
3. Sem a seção 12 os formatos novos ficam indisponíveis (o form os oferece,
   mas o INSERT falha com enum inexistente) — avisar o usuário no fechamento;
   os formatos existentes não são afetados.

## Open Questions

Nenhuma — decisões de produto fechadas via AskUserQuestion em 2026-06-07.
