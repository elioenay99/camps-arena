# Proposal — add-knockout-format

## Why

A fundação de formatos (`tournament_format`, `matches.rodada`, motor puro,
`iniciarTorneio`) entrou com a Liga; o roadmap do usuário sempre listou o
**mata-mata** como próximo formato. Hoje eliminatórias só são possíveis "na
mão" em torneio avulso — sem chave, sem fases, sem garantia de vencedor (o
placar empatado encerra normal). Este change adiciona o formato **Mata-mata**:
chaveamento gerado ao Iniciar (sorteio, potes ou montagem manual — decisão do
usuário via AskUserQuestion: **as três opções**), byes automáticos para
qualquer N de 2 a 32, avanço fase a fase pelo dono, empate bloqueado no
encerramento (jogo decisivo precisa de vencedor) e opção de ida-e-volta e
disputa de 3º lugar.

## What Changes

- Enum `tournament_format` ganha o valor `'mata_mata'` (aditivo).
- `tournaments` ganha `terceiro_lugar boolean` (só significativo em mata-mata;
  escolhido na criação). `ida_e_volta` é REUTILIZADA: em mata-mata significa
  confrontos em dois jogos — **exceto final e 3º lugar, sempre jogo único**
  (decisão do usuário).
- `matches` ganha `posicao integer` (slot do confronto dentro da fase — define
  o pareamento da fase seguinte: vencedor do slot 2i−1 × vencedor do slot 2i)
  e `perna smallint` (1|2, só em ida-e-volta), ambos anuláveis, com CHECKs e
  índice único por slot (`nulls not distinct` — barra dupla geração por slot).
- **Byes persistem como partidas**: `participante_2 IS NULL`, `status =
  'encerrada'`, placar 0×0, no slot sorteado/escolhido — é a memória de quem
  avança direto; o motor de classificação já as ignora (exige 2 participantes).
- Novo motor PURO `src/features/knockout/` (padrão `gerarTabelaLiga`):
  gerar a chave inicial (tamanho = próxima potência de 2, ≤1 bye por
  confronto), computar vencedores e gerar a fase seguinte, prévia de
  partidas/fases, rótulos de fase (Oitavas/Quartas/Semifinal/Final/3º lugar).
  Aleatoriedade INJETADA pelo chamador (motor determinístico, testável).
- `iniciarTorneio` vira dispatcher por formato; mata-mata aceita o **modo de
  chaveamento como parâmetro** (não persiste): `sorteio` (embaralha
  server-side), `potes` (cabeças de chave marcadas no form — exige 4/8/16/32,
  decisão do usuário), `manual` (dono monta os confrontos no form).
- Nova Server Action `avancarFase`: só o dono, torneio mata-mata ativo, todas
  as partidas decisivas da fase atual encerradas; gera a fase seguinte
  (semifinais encerradas + 3º lugar habilitado → gera final E 3º lugar).
- Encerramento com empate **bloqueado** em jogo decisivo de mata-mata: jogo
  único não encerra com placar igual; em ida-e-volta a volta não encerra com
  agregado empatado (placar embute prorrogação/pênaltis). Action + trigger.
- Reabertura **bloqueada** quando a fase seguinte já foi gerada (o vencedor já
  está semeado adiante). Action + trigger.
- Adesão tardia bloqueada: `aceitar_convite` rejeita mata-mata fora de
  `rascunho` (mesmo padrão da liga).
- Criação manual de partida: action passa a exigir `formato = 'avulso'`
  (generaliza o teste `=== 'liga'`); RLS já cobre (cláusula `rodada is not
  null`); UI já filtra por avulso.
- UI: `TournamentForm` ganha o radio Mata-mata + checkboxes ida-e-volta/3º
  lugar condicionais; página do torneio mata-mata mostra a **CHAVE** (bracket
  por fases) no lugar da classificação por pontos; painel de início ganha os
  três modos de chaveamento (potes/manual com form próprio).
- DDL manual: nova **seção 10** em `docs/pendencias-manuais.md`. **Sem ela,
  criar torneio pela app FALHA** (action envia `terceiro_lugar`).

## Capabilities

### New Capabilities

- `knockout-format`: formato Mata-mata — chaveamento em três modos (sorteio,
  potes, manual), byes, avanço fase a fase, bloqueio de empate em jogo
  decisivo, ida-e-volta opcional (final/3º lugar jogo único), disputa de 3º
  lugar opcional, visualização da chave.

### Modified Capabilities

- `tournament-management`: criação ganha formato mata-mata + 3º lugar;
  ida-e-volta vale para liga E mata-mata; mata-mata nasce em rascunho.
- `tournament-participants`: aceite de convite rejeita mata-mata já iniciado.
- `match-creation`: rejeição generalizada — qualquer formato ≠ avulso (era
  "liga").
- `match-lifecycle`: encerrar ganha validação de vencedor em mata-mata;
  reabrir ganha bloqueio quando a fase seguinte existe.
- `data-model`: enum `mata_mata`, `tournaments.terceiro_lugar`,
  `matches.posicao`/`matches.perna`, CHECKs, índice único por slot.
- `row-level-security`: `lock_match_relations` trava `posicao`/`perna`; novo
  trigger de resultado/reabertura de mata-mata; `aceitar_convite` atualizada.
- `standings-page`: a página do torneio varia por formato — mata-mata renderiza
  a chave (sem classificação por pontos nem classificação de clubes).

## Impact

- **Banco (DDL manual)**: `supabase/schema.sql` + seção 10 das pendências —
  1 valor de enum, 1 coluna em `tournaments`, 2 em `matches`, CHECKs, índice
  único, `lock_match_relations` estendida, trigger novo,
  `aceitar_convite` recriada.
- **Actions**: `tournaments.ts` (createTournament envia `terceiro_lugar`;
  `iniciarTorneio` dispatcher + modos; nova `avancarFase`), `match.ts`
  (createMatch ≠ avulso; `encerrarPartida` valida vencedor; `reabrirPartida`
  valida fase seguinte).
- **Schemas Zod**: `tournamentSchema.ts` (formato triplo, `terceiroLugar`,
  refines de coerência), schema do iniciar (modo + cabeças/confrontos).
- **Features**: novo `src/features/knockout/` (motor + testes); página do
  torneio + `IniciarTorneioPanel` (modos) + novo `BracketView`;
  `TournamentForm`.
- **Não muda**: `computeStandings` e `gerarTabelaLiga` (intocados), policy
  `matches_insert_tournament_owner` (cláusula `rodada is not null` já cobre as
  partidas geradas), fluxo de convite, dashboard.
- **Compat**: torneios existentes não mudam (`terceiro_lugar` default false;
  `posicao`/`perna` nulas em tudo que existe).
