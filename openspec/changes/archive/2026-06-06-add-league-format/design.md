# Design — add-league-format

## Context

Todo torneio hoje é um saco de partidas criadas manualmente pelo dono
(`createMatch`), classificadas pelo motor puro `computeStandings` (agnóstico a
como as partidas nasceram). O fluxo de participação por convite
(`add-tournament-participants`) já existe: dono cria → participantes entram pelo
link → dono cria partidas. O enum `tournament_status` já contém `'rascunho'`,
hoje sem uso real (todo torneio nasce `'ativo'`).

Decisões de produto (usuário, via AskUserQuestion, 2026-06-06):

1. Escopo: **só Liga** nesta entrega (grupos/mata-mata/potes depois).
2. A tabela empareia **participantes** (pessoas); clube segue opcional por partida.
3. Geração **ao iniciar**: liga nasce em rascunho, participantes aderem pelo
   convite, dono clica "Iniciar torneio" → tabela gerada → `'ativo'`.

Restrições herdadas: DDL manual (`supabase/schema.sql` é fonte de verdade;
pendências em `docs/pendencias-manuais.md`); RLS estrita + checagem nas actions
(defesa em profundidade); Zod espelha as CHECKs do banco; toda rota nova precisa
de `loading.tsx`/`error.tsx` próprios; funções SECURITY DEFINER precisam de
REVOKE/GRANT explícito.

## Goals / Non-Goals

**Goals:**

- Dono cria torneio formato Liga (ida simples ou ida-e-volta) e inicia quando o
  elenco estiver completo; a tabela inteira nasce de uma vez, com rodadas.
- Fundação reutilizável para formatos futuros: coluna `formato` extensível
  (enum) + `matches.rodada` + motor puro de emparelhamento.
- Integridade: liga não aceita partida manual nem adesão tardia; torneios
  avulsos existentes não mudam em nada.

**Non-Goals:**

- Grupos, mata-mata, potes, fase de liga (proposals futuras — o modelo
  `formato`/`rodada` foi pensado para recebê-los sem retrabalho).
- Agenda/datas de rodada, mando de campo real, sorteio manual de confrontos.
- Re-gerar tabela após iniciada (remoção de participante deixa as partidas
  como histórico — regra já estabelecida no change de participants).
- Standings por rodada/turno (o motor atual já classifica o conjunto).

## Decisions

### D1 — `formato` como enum Postgres `tournament_format`

`create type tournament_format as enum ('avulso','liga')`, coluna
`tournaments.formato not null default 'avulso'`. Consistente com
`tournament_status`/`match_status`; legados ficam `'avulso'` sem migração de
dados. Formatos futuros entram com `alter type ... add value` (aditivo).
*Alternativa rejeitada*: `text + CHECK` — quebraria o padrão do schema e perde
o tipo no PostgREST.

### D2 — Liga nasce `'rascunho'`; avulso continua nascendo `'ativo'`

`createTournament` envia `status: 'rascunho'` quando `formato === 'liga'` (e
omite no avulso, preservando o default do banco). O rascunho é o período de
adesão. Não há DDL de status: o valor já existe no enum. O índice
`/dashboard/torneios` e a página do torneio já exibem status.

### D3 — Motor puro `gerarTabelaLiga` (método do círculo) em `src/features/league/`

`gerarTabelaLiga(participantes: string[], idaEVolta: boolean): { rodada: number;
confrontos: [string, string][] }[]` — zero IO, mesmo padrão do
`computeStandings`. Round-robin pelo método do círculo: N par → N-1 rodadas com
N/2 jogos; N ímpar → fantasma (folga), N rodadas. Ida-e-volta = espelho dos
turnos com lados invertidos e rodadas continuando a numeração (turno 2 começa em
N(-1)+1). **Determinismo**: a action ordena os participantes por code-point do
id antes de chamar (mesma decisão do computeStandings — não `localeCompare`);
o motor não embaralha. Sorteio de confrontos não é objetivo (não há mando real).

### D4 — `iniciarTorneio` idempotente em duas escritas (sem transação PostgREST)

Action `iniciarTorneio(tournamentId)`: sessão exigida; carrega o torneio por
filtro `.eq("created_by", user.id).eq("formato", "liga").eq("status",
"rascunho")` (propriedade por FILTRO, padrão das actions); carrega participantes
confirmados; exige `2 <= N <= LIGA_MAX_PARTICIPANTES` (20).

Ordem das escritas e recuperação:

1. **INSERT em lote** de todas as partidas (um único request PostgREST = um
   statement = atômico): `tournament_id`, `participante_1/2`, `rodada`,
   status default `'agendada'`.
2. **UPDATE** `status = 'ativo'`.

Se (2) falhar, o torneio fica rascunho com tabela gerada; o retry detecta
partidas com `rodada is not null` no torneio e **pula a geração** (só promove o
status). Se (1) falhar, nada foi escrito — retry limpo. A ordem inversa (status
primeiro) criaria liga ativa sem partidas e sem caminho de retry — rejeitada.
A pré-checagem "já existe partida com rodada" bloqueia o caso comum de dupla
geração; a janela residual do check-then-act é fechada NO BANCO pelo índice
único parcial `matches_liga_par_unico` (tournament_id, rodada, participante_1,
participante_2 where rodada is not null): o INSERT em lote do perdedor da
corrida falha INTEIRO (23505, statement atômico, sem estado parcial) e a action
devolve mensagem orientando a recarregar (achado da validação adversarial —
promovido de "risco aceito" a barreira real).

### D5 — Liga não aceita partida manual: action + RLS

`createMatch` carrega `formato` no select do torneio e rejeita `'liga'` com
mensagem precisa. A policy `matches_insert_tournament_owner` ganha a cláusula
espelho `(t.formato = 'avulso' or matches.rodada is not null)` — a geração da
liga (rodada sempre preenchida) passa; POST direto manual sem rodada em liga é
barrado. *Risco aceito*: o dono pode forjar POST direto com `rodada` para
inserir partida extra na própria liga — auto-sabotagem sem vítima terceira
(participantes confirmados continuam exigidos pela mesma policy); um trigger
para isso seria custo sem ameaça.

### D6 — Adesão tardia bloqueada no banco: `aceitar_convite`/`info_convite`

`aceitar_convite` ganha: `formato = 'liga' AND status <> 'rascunho'` → exceção
("liga já iniciada"). `info_convite` passa a devolver também `formato` —
a página `/convite/[codigo]` explica o estado em vez de falhar no clique.
Mudança de tipo de retorno exige `DROP FUNCTION` antes do `CREATE` (PostgreSQL
não permite `CREATE OR REPLACE` mudando o RETURNS TABLE) — a seção 9 das
pendências faz drop+create+REVOKE/GRANT de novo (lição: CREATE FUNCTION dá
EXECUTE a PUBLIC; re-criar exige re-aplicar os grants).

### D7 — `matches.rodada integer` anulável + CHECK `rodada >= 1`

`null` = partida avulsa (todas as legadas). Não há CHECK cross-table
"rodada só em liga" (CHECK não referencia outra tabela); partida avulsa com
rodada forjada por POST direto do dono é inócua (a UI apenas exibe o badge).
`lock_match_relations`/`lock_match_lifecycle` não precisam travar `rodada`:
participante não consegue alterá-la?? — **precisa sim**: a RLS de UPDATE do
participante é por linha; `rodada` entra no `lock_match_relations` (junto de
participantes/torneio) para ninguém renumerar rodada via POST direto.

### D8 — UI mínima, RSC-first

- `TournamentForm` (client, já existente): radiogroup nativo avulso/liga +
  checkbox "ida e volta" exibido só quando liga (estado local; sem shadcn novo).
  Texto explica que liga nasce em rascunho e a tabela é gerada ao iniciar.
- Página do torneio: painel "Iniciar torneio" (dono + liga + rascunho) com
  contagem de participantes e prévia de nº de partidas/rodadas
  (calculado pelo mesmo motor — fonte única); botão com `useActionState`.
  Aviso quando N < 2. Botões de partida manual somem em liga.
- Listas de partidas (abertas e histórico): badge "Rodada X" quando houver;
  partidas em aberto de liga ordenadas por rodada (ordem natural de disputa).
- Sem rota nova — tudo na página do torneio existente (não há novo
  loading/error a criar; os da rota já existem).

### D9 — Dashboard intocado

`getActiveMatches` já mostra partidas `agendada/em_andamento` de torneios não
encerrados — as partidas da liga aparecem ao iniciar. Liga grande pode encher o
dashboard (risco pré-existente de qualquer torneio com muitas partidas);
mitigação futura (filtro "minhas partidas") fora de escopo.

## Risks / Trade-offs

- [Sem transação nas 2 escritas do iniciar] → ordem partidas→status + retry
  idempotente que detecta tabela já gerada (D4).
- [Corrida de dupla geração (duas abas)] → pré-checagem de partidas com rodada
  + índice único parcial `matches_liga_par_unico` no banco (perdedor falha
  atômico com 23505; mensagem orienta recarregar) (D4).
- [Liga pode passar de 20 participantes durante o rascunho] → `aceitar_convite`
  não impõe o cap; o bloqueio acontece no iniciar (mensagem clara) e o painel
  orienta remover gente. Feedback antecipado no aceite fica como melhoria
  futura (nit da validação).
- [Dono forja POST direto com rodada em liga] → aceito; sem vítima terceira (D5).
- [Liga com N ímpar] → folga pelo método do círculo; o participante de folga
  simplesmente não tem jogo na rodada (sem partida "bye" no banco).
- [Participante removido após iniciar] → partidas dele permanecem (histórico,
  regra herdada); a classificação o mantém — documentado na página? Não: regra
  já estabelecida no change de participants, sem UI nova.
- [Dashboard inundado por liga grande] → pré-existente, fora de escopo (D9).
- [`info_convite` muda tipo de retorno] → DROP+CREATE+grants na mesma seção de
  DDL; app antigo (deploy anterior) continua funcionando? O retorno GANHA
  coluna; o supabase-js seleciona por nome — compatível (D6).
- [Cap de 20 participantes] → ida-e-volta de 20 = 380 partidas num INSERT só;
  acima disso o produto não faz sentido hoje. Limite espelhado em mensagem
  clara na action e no painel.

## Migration Plan

1. `supabase/schema.sql` atualizado (fonte de verdade) + seção 9 em
   `docs/pendencias-manuais.md` com SQL idempotente: enum `tournament_format`,
   colunas `formato`/`ida_e_volta`/`rodada`, CHECK `matches_rodada_positiva`,
   policy de INSERT reescrita, `lock_match_relations` com rodada,
   `aceitar_convite` recriada, `info_convite` DROP+CREATE, REVOKE/GRANT.
2. **Sem a seção 9, criar torneio pela app FALHA** (action envia `formato`/
   `ida_e_volta` inexistentes) — mesma classe de pendência das seções 6/8.
3. Rollback: `drop` das colunas/enum/CHECK e recriar policy/funções nas versões
   da seção 8 (registrado na própria seção 9).

## Open Questions

Nenhuma — decisões de produto fechadas com o usuário em 2026-06-06.
