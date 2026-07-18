## Why

Duas fontes de latência/ruído no salvar-placar e no tempo real:

- **Push no caminho crítico.** `updateMatchScore` (`src/actions/match.ts`) faz
  `await enviarNotificacoes(...)` ANTES do `return { ok: true }`.
  `enviarNotificacoes` (`src/features/notifications/enviar.ts`) faz uma RPC
  (`subscriptions_de`) + `Promise.allSettled` de POSTs webpush EXTERNOS. Toda essa
  latência de rede é somada ao tempo que o organizador espera o placar salvar,
  embora o push seja best-effort e irrelevante para o resultado da mutação.
- **Canal realtime não escopado.** `LiveMatchesProvider` assina `UPDATE` de
  `matches` SEM `filter:` e descarta ids no cliente. No dashboard multi-torneio
  isso é deliberado (vê partidas de vários torneios). Mas o provider é
  parametrizável para uma futura página de torneio único escopar por
  `tournament_id` na origem — e o nome do canal fixo (`dashboard-matches`) faria
  dois providers colidirem.

## What Changes

Duas mudanças independentes, ambas preservando o comportamento observável.

- **Parte A — push via `after()`.** Envolver a chamada de `enviarNotificacoes` em
  `updateMatchScore` com `after(() => ...)` (Next 16, `next/server`). O `return {
  ok: true }` passa a devolver imediato; o push roda DEPOIS do flush da resposta,
  mantido vivo pela plataforma (`waitUntil`). NÃO é fire-and-forget puro: uma
  promessa solta seria CORTADA em serverless (documentado em `enviar.ts:41-42`).
  A notificação continua saindo; só deixou de somar latência ao salvar-placar.
  **Escopo**: só `updateMatchScore`. As demais actions que dão `await` em push no
  caminho crítico (aprovar/rejeitar proposta, W.O., liberar rodada, aceitar
  convite, encerrar temporada) ficam como **follow-up** — várias fazem `redirect`
  logo após e merecem análise própria; alinhá-las agora ampliaria o escopo e o
  risco desta change de latência.
- **Parte B — canal realtime escopável.** `LiveMatchesProvider` ganha um prop
  OPCIONAL `tournamentId?: string`. Quando presente, aplica `filter:
  'tournament_id=eq.<id>'` no `.on(...)` (o Postgres filtra na origem) e escopa o
  nome do canal (`matches-torneio-<id>`), para dois providers de páginas distintas
  nunca colidirem. O dashboard NÃO passa nada e continua idêntico (canal
  `dashboard-matches`, sem filtro, filtragem client-side deliberada). Hoje não há
  consumidor que passe o id (a página do torneio renderiza partidas via
  `OpenMatchesList`, que não consome `useLiveMatch`); o prop deixa o provider
  pronto para essa adoção sem regredir o dashboard.

## Impact

- **SEM DDL, SEM mudança de dados.** Comportamento observável preservado: o push
  ainda sai; o realtime do dashboard é idêntico.
- Arquivos: `src/actions/match.ts` (`after()` no push), `src/actions/match.test.ts`
  (mock de `next/server`), `src/features/match/live/LiveMatchesProvider.tsx` (prop
  `tournamentId` + filtro + nome do canal), `src/features/match/live/live.test.tsx`
  (testes do canal escopado vs global).
- **Ganho**: salvar-placar retorna sem esperar a rede de push; o provider fica
  apto a escopar o realtime por torneio sem colisão de canal.
