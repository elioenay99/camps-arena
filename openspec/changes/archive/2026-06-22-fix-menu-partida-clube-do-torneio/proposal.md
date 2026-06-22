## Why

No "Menu da Partida" (`MatchScoreModal`), cada lado mostra um campo **"Buscar clube…"**
(`TeamSearchInput`) para trocar o clube. Numa partida de TORNEIO (competitivo) o clube já vem
do torneio — é a `tournament_slot` (vaga) com o clube atribuído (ex.: Bahia × Flamengo). O campo
de busca ali é **redundante e confuso**: dá a impressão de que dá para trocar o clube de uma vaga
do campeonato pelo modal de placar (não dá; o clube é cosmético e a troca pelo modal não faz
sentido no competitivo). O dono pediu para remover essa busca no contexto de torneio.

## What Changes

- O `MatchScoreModalConnected` ganha o flag **`permitirEscolherClube`** (default `false`). Só quando
  `true` ele fia a busca/troca de clube (`onSelecionarClube`); caso contrário o clube é **apenas
  exibido** (escudo + nome).
- O `MatchCard` passa `permitirEscolherClube={!ehCompetitivo}`: em partida **competitiva** (tem vaga)
  o clube vem do torneio e a busca **some**; em partida **avulsa** (pessoas, clube cosmético por
  partida) a busca **permanece** como hoje.
- O `MatchScoreModal` (apresentacional) já renderiza a busca condicionada a `onSelecionarClube` — sem
  mudança de contrato; só deixa de recebê-la no competitivo.

## Capabilities

### Modified Capabilities

- **match-score-modal**: passa a especificar que a **busca de clube só aparece no avulso**; no
  competitivo o clube vem do torneio (vaga) e é apenas exibido.

## Impact

- **Sem DDL.** Mudança de UI em `MatchScoreModalConnected.tsx` (flag) + `MatchCard.tsx` (passa o flag)
  + teste em `MatchScoreModal.test.tsx`.
- **Avulso inalterado**: continua podendo escolher o clube de cada lado.
- **Competitivo**: o menu fica mais limpo; o clube do torneio segue exibido (escudo + nome), só sem o
  campo de busca. Nenhuma mudança em autorização, placar ou ações.
