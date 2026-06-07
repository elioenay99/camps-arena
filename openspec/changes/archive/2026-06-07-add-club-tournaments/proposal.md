# Proposal — add-club-tournaments

## Why

Virada de produto (decisões do usuário em 2026-06-07, via mensagens diretas e
AskUserQuestion): **o torneio é dos CLUBES, não das pessoas**. O dono cria o
torneio definindo a quantidade de times e QUAIS clubes; cada clube é uma VAGA
com convite próprio; uma pessoa assume a vaga como TÉCNICO daquele clube e é
SUBSTITUÍVEL a qualquer momento — desistência (sai sozinha) ou expulsão (o
adm remove) — com outra pessoa assumindo o MESMO clube e herdando o
histórico. Hoje o modelo é o inverso (pessoas em `participants`, clube
opcional por partida), o que nos obrigou a CONGELAR saídas após gerar a
disputa (a chave aponta para pessoas). Com a vaga sendo o clube, a disputa
fica estável por construção e a pessoa vira metadado trocável.

Decisões fechadas: substitui o modelo atual DE VEZ nos formatos competitivos
(app pré-produção; dados de teste descartáveis); clube órfão (vaga sem
técnico) é movimentado pelo adm; convite é um link ÚNICO POR CLUBE (o
genérico morre nos formatos competitivos); partida avulsa continua entre
PESSOAS como hoje (a inversão vale para os torneios de competição).

## What Changes

- **Tabela nova `tournament_slots`** (vaga = clube no torneio): tournament_id
  + team_id (obrigatório, único por torneio) + user_id ANULÁVEL (técnico
  atual; DELETE SET NULL — apagar a conta não derruba o torneio) + unique
  parcial (um user só comanda um clube por torneio).
- **Tabela nova `slot_invites`** (código por vaga, segredo do dono — 1:1,
  regenerável; padrão do `tournament_invites`).
- **`matches` ganha `vaga_1`/`vaga_2`** (FK slots): partidas de formatos
  competitivos referenciam VAGAS; `participante_1/2` (users) ficam SÓ para o
  formato avulso (CHECK de exclusão mútua). Troca de técnico NÃO toca
  partidas. Índice de par único da liga ganha versão por vaga.
- **RPCs**: `aceitar_convite_vaga(codigo)` (assume vaga VAZIA por UPDATE
  atômico filtrado — corrida de dois aceites tem um vencedor) e
  `info_convite_vaga(codigo)`; válidos com o torneio ATIVO (substituição no
  meio é o ponto). `eh_participante` passa a considerar vagas.
- **Ciclo da vaga**: dono esvazia (expulsão) ou o próprio técnico esvazia
  (desistência) — em QUALQUER status não-encerrado; ninguém se auto-atribui
  exceto via convite (consentimento) ou o DONO assumindo vaga vazia para si.
  Vagas (clubes) são editáveis SÓ em rascunho; depois ficam imutáveis (a
  disputa referencia).
- **Criação do torneio**: formulário ganha o passo de CLUBES (busca
  API-Football já existente); torneio competitivo nasce com as vagas e seus
  convites. O dono não entra automaticamente.
- **Iniciar formatos** (liga/mata-mata/grupos/fase de liga): motores recebem
  SLOT IDs (são agnósticos — zero mudança nos motores); não exige mais
  técnicos presentes (o torneio é dos clubes; pré-checagens de "semeados em
  participants" morrem).
- **Congelamento de participants MORRE** nos formatos competitivos
  (substituído pela imutabilidade das vagas pós-rascunho); `participants` /
  `tournament_invites` / RPCs antigos seguem APENAS para o formato avulso.
- **Display**: classificação/chave/cards mostram o CLUBE (escudo + nome) com
  o técnico atual como detalhe; convocação wa.me usa o celular do TÉCNICO da
  vaga adversária.
- **DDL manual**: seção 13 das pendências (tabela slots + slot_invites +
  colunas/CHECKs/índice em matches + RPCs + policies + trigger de lock de
  vaga + limpeza dos torneios de teste não-avulsos).

## Capabilities

### New Capabilities

- `club-slots`: vagas de clube no torneio — criação com clubes, convite por
  vaga, assumir/desistir/expulsar técnico, clube órfão gerido pelo adm,
  imutabilidade pós-rascunho.

### Modified Capabilities

- `data-model`: tabelas novas, colunas `vaga_1/2` em matches + CHECKs +
  índice de par por vaga.
- `row-level-security`: policies de slots/slot_invites; matches
  (visibilidade/INSERT/UPDATE por vaga); `eh_participante` com vagas; locks.
- `tournament-management`: criação com clubes (formatos competitivos);
  convite genérico restrito ao avulso.
- `tournament-participants`: escopo reduzido ao formato AVULSO (congelamento
  removido dos formatos competitivos — coberto por vagas imutáveis).
- `league-format`, `knockout-format`, `group-stage-format`: iniciar/avançar
  operam sobre vagas (sem exigência de técnicos).
- `standings-page`: lados exibidos como CLUBE + técnico; fetcher embeda
  vagas.
- `dashboard`: "minhas partidas" inclui partidas das MINHAS vagas.
- `match-engagement`: convocação usa o técnico da vaga adversária.
- `match-creation`: partida avulsa intocada (permanece entre pessoas).

## Impact

- **Banco**: 2 tabelas, 2 colunas em matches, 1 CHECK, 1 índice único, 2
  RPCs novos, ~8 policies, 1 trigger novo, `eh_participante` alterada.
  Torneios de teste não-avulsos existentes são LIMPOS (dados descartáveis,
  decisão do usuário).
- **Actions**: tournaments.ts (criação, iniciar×3, avançar, gerar
  mata-mata), slots.ts (novo: assumir/desistir/expulsar/regenerar convite da
  vaga), participants.ts (escopo avulso), match.ts (propriedade por vaga).
- **Fetchers/UI**: getTournamentClassificacao, getActiveMatches,
  getParticipantesDoTorneio→getVagasDoTorneio, página do torneio (seção de
  vagas com convite por clube), TournamentForm (passo de clubes), MatchCard/
  modal (clube como lado), BracketView/StandingsTable (clube).
- **Não muda**: motores puros (liga/knockout/grupos/standings), formato
  avulso de ponta a ponta, auth, lifecycle de encerrar/reabrir torneio.
- **Sequência**: este change é PRÉ-REQUISITO do change de rodadas + W.O.
  (vaga vazia → W.O. automático no fechamento da rodada).
