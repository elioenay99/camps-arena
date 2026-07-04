## Why

Hoje o W.O. do Goliseu cobre só UM lado ausente: a organização (ou o aceite de
uma solicitação) aponta um `wo_vencedor` e a partida encerra 0x0 a favor dele. Não
há caminho para o caso real de **ambos os competidores não comparecerem** ("duplo
W.O."). Quando isso acontece numa liga/grupos, o organizador fica sem opção
correta: marcar vencedor seria injusto, e a partida trava a rodada. A CHECK
`matches_wo_coerente` (`supabase/schema.sql:443-451`) hoje EXIGE `wo_vencedor`
não-nulo em todo W.O., então "duplo sem vencedor" é abortado no banco.

Além disso, a varredura de "Fechar rodada" (`varrerOrfaosDaRodada`) resolve por
W.O. automático apenas **órfão × técnico** (XOR): a partida **órfão × órfão**
(as duas vagas sem técnico) é hoje IGNORADA (`closeRound.ts:66`) e permanece
aberta indefinidamente, segurando a rodada sem desfecho possível.

## What Changes

- **Schema (DDL aditivo).** Nova coluna `matches.wo_duplo boolean not null
  default false`. A CHECK `matches_wo_coerente` passa a admitir TRÊS formas
  coerentes (fora de W.O.; W.O. simples com vencedor; duplo W.O. sem vencedor,
  proibido em chave via `posicao is null`). O trigger `lock_match_lifecycle`
  passa a tratar `wo_duplo` como imutável em `encerrada → encerrada`.
- **Server Action.** Novo caminho de DUPLO W.O. (declaração pela organização —
  capacidade ARBITRAR) numa partida ABERTA e JOGÁVEL de torneio ATIVO, com o
  mesmo padrão de `marcarWoInterno` (UPDATE único `{wo, wo_duplo, wo_vencedor:
  null, placar 0x0, encerrada}`, idempotente por `.neq('status','encerrada')`).
  A action **RECUSA** duplo em partida de chave (mata-mata: `posicao` não nula)
  com mensagem clara; o banco é o backstop (CHECK). Validação Zod em `src/schema`.
- **Motor de classificação.** O duplo W.O. credita DUPLA DERROTA aos dois lados
  (D+1 + pontos de derrota, 0 gols/saldo, conta como jogo disputado —
  `jogos = V+E+D`), espelho simétrico do W.O. simples. O critério de confronto
  direto credita DERROTA a ambos (nunca empate pelo 0x0), inclusive dentro da
  mini-tabela de desempate. O sinal `wo_duplo` é propagado do banco ao motor em
  TODOS os call-sites fora de chave (censo fechado); o histórico deixa de afirmar
  falsamente que um lado venceu num duplo.
- **Fechar rodada.** `varrerOrfaosDaRodada` passa a resolver **órfão × órfão como
  duplo W.O. automático**, mas SÓ fora de chave (`posicao is null`); em chave
  segue intocada.
- **Reabrir.** `reabrirPartida` passa a limpar também `wo_duplo` (além de `wo`/
  `wo_vencedor`), satisfazendo a CHECK ao voltar a aberta.
- **UI.** O painel do `MarcarWoButton` ganha a opção "Ambos ausentes" (duplo),
  OCULTA em partida de chave; o W.O. simples com escolha de vencedor permanece.

## Capabilities

### Modified Capabilities
- `match-walkover`: nova representação com duplo W.O. (sem vencedor), a
  declaração pela organização, a proibição em chave e a limpeza do `wo_duplo` ao
  reabrir.
- `standings-engine`: efeito do duplo W.O. na classificação (dupla derrota, 0
  gols, confronto direto simétrico).
- `round-management`: "Fechar rodada" resolve órfão × órfão como duplo W.O. fora
  de chave (antes ficava em aberto).
- `data-model`: coluna `wo_duplo` e a CHECK `matches_wo_coerente` relaxada em
  três ramos.
- `match-lifecycle`: reabrir limpa também `wo_duplo`.

### New Capabilities
<!-- Nenhuma. -->

## Impact

- **Código de aplicação:**
  - `src/actions/wo.ts` (novo caminho de duplo; reuso de `marcarWoInterno` ou
    action dedicada `marcarWoDuplo`).
  - `src/schema/` (Zod da entrada do duplo).
  - `src/features/match/closeRound.ts` (`varrerOrfaosDaRodada` — órfão × órfão
    fora de chave).
  - `src/features/standings/computeStandings.ts` (`aplicarPartida` e
    `pontosConfronto` ganham o ramo do duplo).
  - Propagação do `wo_duplo` (censo FECHADO, design §6.a): `getTournamentClassificacao.ts`
    (`linhasMotor` + mapa `grupos` + histórico), `src/actions/tournaments.ts`
    (`montarMataMataDosGrupos`), `src/actions/cups.ts` (`computarEliminadosGrupos`),
    `src/features/league/data/getDivisionClassificacaoCombinada.ts`,
    `src/features/groups/gerarFaseDeGrupos.ts` (tipo de `classificarGrupos`).
  - `src/actions/match.ts` (`reabrirPartida` limpa `wo_duplo`).
  - `src/features/match/components/WoButtons.tsx` (opção "Ambos ausentes",
    oculta em chave) e `src/features/match/components/MatchHistoryList.tsx` (rótulo
    "W.O. duplo — ambos ausentes"; não afirmar vencedor no duplo).
- **Banco de dados:** DDL ADITIVO (coluna + CHECK + trigger) em
  `supabase/schema.sql` (fonte de verdade). Migração idempotente
  (DROP+ADD da CHECK, `add column if not exists`). O SQL de produção é MOSTRADO ao
  dono antes de aplicar (REGRA 4) — esta change documenta, não aplica.
- **Segurança/autorização:** o duplo herda a MESMA autorização do W.O. simples
  (capacidade ARBITRAR + RLS backstop). Nenhuma policy nova; a proibição em chave
  é reforçada em três camadas (UI oculta, action recusa, CHECK barra).
- **Dependências:** nenhuma nova.
- **Testes:** motor (ramo duplo: dupla derrota/0 gols/jogos+1; confronto direto
  simétrico), action (recusa em chave, exige ARBITRAR, idempotência), `closeRound`
  (órfão × órfão vira duplo fora de chave; em chave não), reabrir limpa `wo_duplo`,
  componente (opção aparece fora de chave e some em chave). Toda a suíte atual
  permanece verde.
