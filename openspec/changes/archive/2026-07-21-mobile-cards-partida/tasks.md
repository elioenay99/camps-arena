## 1. Bloco de identidade compartilhado

- [x] 1.1 Criar `src/features/match/components/PartidaIdentidade.tsx` — RSC puro (sem
  `"use client"`), `aria-hidden="true"` no wrapper (o texto acessível vem do `sr-only` do
  consumidor). Props: `rodadaLabel?`, `nome1`, `nome2`, `escudo1?`, `escudo2?`,
  `destaque1?`, `destaque2?`, `children` (miolo central), `className?`.
- [x] 1.2 Estrutura: rótulo de rodada (`shrink-0`, `text-xs tabular-nums`) · `TeamCrest`
  lado 1 · nome 1 (`hidden min-w-0 truncate sm:inline`) · `children` · `TeamCrest` lado 2 ·
  nome 2 (`hidden min-w-0 truncate sm:inline`). Wrapper `flex min-w-0 items-center gap-2`.
- [x] 1.3 `destaqueN` aplica `font-semibold` (vencedor de W.O.), preservando o comportamento
  atual do histórico.
- [x] 1.4 Exportar helper `rotuloRodada({ rodada, grupo, perna })` — a string `G{n} R{n}
  ida|volta` é idêntica nas duas listas hoje; centralizar evita divergência. Retorna `null`
  quando `rodada === null`.

## 2. `MatchHistoryList` — linha compacta + `<details>`

- [x] 2.1 Trocar o `<li>` de `flex justify-between` por container do `<details className="group">`;
  o `<li>` mantém borda/fundo/hover atuais e perde o padding (que passa ao summary/corpo).
- [x] 2.2 `<summary>`: `flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2
  [&::-webkit-details-marker]:hidden`. Conteúdo: `PartidaIdentidade` (com o miolo =
  placar dominante OU badge de W.O./W.O. duplo), o bloco `sr-only` do resultado
  (preservado LITERALMENTE, incluindo W.O. duplo), a data (`hidden sm:inline`) e o chevron
  (`ml-auto`, `group-open:rotate-180`, `aria-hidden`).
- [x] 2.3 Placar dominante: `shrink-0 font-display text-base font-semibold tabular-nums
  sm:text-sm`, texto `{placar_1} x {placar_2}` inalterado. W.O. continua badge na linha
  principal.
- [x] 2.4 Corpo do details (`border-t px-4 py-3`, `max-sm:[&_[data-slot=button]]:min-h-11`):
  linha com os nomes completos dos dois lados e o placar, a data (`sm:hidden`), os gols
  contra, o badge "faltam N artilheiros" e o cluster de AÇÕES atual
  (`ArtilheirosEncerrada` técnico/árbitro, `CompartilharResultadoButton`,
  `MatchStatusButton` reabrir) — nenhum controle interativo dentro do `<summary>`.
- [x] 2.5 Não mudar NENHUM gate: `mostrarArtilheiros`, `ladoDoTecnico`, `faltamTecnico`,
  `ladosArbitro`, `ladoTecnicoEdit`, `tournamentId`, `mostrarReabrir` idênticos.
- [x] 2.6 Agrupamento por rodada e `RoundPager` intocados.

## 3. `OpenMatchesList` — mesma identidade, metade da altura

- [x] 3.1 Substituir o bloco de identidade por `PartidaIdentidade` (mesmo `rotuloRodada`),
  mantendo FORA dele o "(vaga aberta)" e a pill de status, e o `sr-only` intacto.
- [x] 3.2 Cluster de ações: `flex flex-wrap gap-2` com `flex-1` +
  `basis-[calc(50%-0.25rem)]` nos FILHOS DIRETOS (`max-sm:[&>*]:…`) — pareia duas por
  linha, e a ação ímpar sobra sozinha e é esticada por `flex-1`, sem buraco e sem contar
  ações. De `sm:` para cima, `sm:w-auto sm:items-center sm:gap-x-6 sm:gap-y-3` e os
  seletores de descendente atuais (o cluster já é `flex flex-wrap` na base).
- [x] 3.3 Mirar o filho DIRETO (e não `[&_[data-slot=button]]`) é o que faz o gatilho do
  modal esticar: `DialogTrigger asChild` NÃO carrega `data-slot="button"`, então o
  seletor de descendente nunca o alcançava (media 117px num container de 293px). O
  indicador "Aguardando aprovação" é texto corrido: `max-sm:basis-full`.
- [x] 3.4 `max-sm:[&_[data-slot=button]]:min-h-11` no cluster (alvo de toque ≥44px).
- [x] 3.5 NÃO tocar `mostrarEncerrar`, `temPropostaPendente`, `ehCompetitivo`,
  `podeMarcarWo`, `podeSolicitarWo`, `atalhoDe`/`jogaPartida` (PII) nem os props do
  `MatchScoreModalConnected` (gatilho por strings).

## 4. Testes

- [x] 4.1 Novo `PartidaIdentidade.test.tsx`: renderiza os dois nomes no DOM; escudo com
  `escudoUrl` (img) e sem (fallback de iniciais); `rotuloRodada` cobrindo
  `null`/`R1`/`G2 R3 ida`/`volta`.
- [x] 4.2 `MatchListsRodada.test.tsx` — histórico: com o details FECHADO as ações
  (`Artilheiros`, `Compartilhar resultado`, `Reabrir`) existem mas NÃO estão visíveis
  (`not.toBeVisible()`); com `open`, ficam visíveis.
- [x] 4.3 W.O. e W.O. duplo continuam com rótulo visível e `sr-only` correto (nunca
  "venceu" no duplo) — casos existentes preservados.
- [x] 4.4 `sr-only` do resultado íntegro (placar final e rodada) no summary.
- [x] 4.5 Estender o guard de "permanece Server Component" para `MatchHistoryList` e
  `PartidaIdentidade`.
- [x] 4.6 `OpenMatchesList`: gates por papel, proposta pendente, PII/WhatsApp e props do
  modal seguem passando sem alteração de asserção.

## 5. Gate mecânico

- [x] 5.1 `pnpm typecheck`
- [x] 5.2 `pnpm lint`
- [x] 5.3 `pnpm test`
- [x] 5.4 `pnpm build`
- [x] 5.5 Commit em pt-BR (Conventional Commits, sem coautoria de IA)
