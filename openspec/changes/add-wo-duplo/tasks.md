## 0. Baseline

- [x] 0.1 Baseline HEAD `cbd7233`: typecheck ✓, lint ✓, test 1351/1351 ✓. Zero
  falhas pré-existentes (verde final = zero falhas).

## 1. Schema / DDL (aditivo, idempotente) — `supabase/schema.sql`

- [x] 1.1 Adicionar a coluna, junto ao bloco de W.O. (`schema.sql:~430`):
  `alter table public.matches add column if not exists wo_duplo boolean not null
  default false;`.
- [x] 1.2 Relaxar a CHECK `matches_wo_coerente` (`schema.sql:443-451`) via DROP +
  ADD para os TRÊS ramos (ver design §3): fora de W.O. (`wo_duplo = false`); W.O.
  simples (`wo_duplo = false`, vencedor entre as vagas); duplo (`wo_duplo = true`,
  `wo_vencedor` nulo, `posicao is null` E `vaga_1 is not null and vaga_2 is not
  null`). O `posicao is null` é o backstop contra duplo em chave; o `vaga_1/vaga_2
  is not null` é defesa em profundidade (simetria com o ramo simples; a action já
  exige os dois lados presentes — barra duplo em bye/vaga vazia por POST direto).
- [x] 1.3 Incluir `wo_duplo` na lista de imutáveis do trigger
  `lock_match_lifecycle` (`schema.sql:589-598`): `or new.wo_duplo is distinct from
  old.wo_duplo`. Confirmar que a REABERTURA (status sai de encerrada) segue livre.
- [x] 1.4 Atualizar o comentário do bloco de W.O. explicando as três formas e o
  `posicao is null` do ramo duplo. NÃO tocar `valida_resultado_mata_mata` (só age
  em `posicao not null`; o duplo nunca ocorre em chave).
- [x] 1.5 Registrar o SQL exato para o dono aplicar em produção (REGRA 4 — mostrar
  antes de aplicar); a change NÃO aplica DDL.

## 2. Server Action + Zod

- [x] 2.1 `src/actions/wo.ts`: nova action `marcarWoDuplo(matchId)` (dedicada,
  espelhando `marcarWoInterno`): Zod `z.uuid()`, sessão válida, capacidade
  ARBITRAR (`podeArbitrar`), torneio `ativo`, partida não-encerrada, **ambos os
  lados presentes** (`vaga_1` e `vaga_2` não nulos), e **RECUSA em chave**
  (`posicao != null`) com mensagem clara. UPDATE único `{wo: true, wo_duplo: true,
  wo_vencedor: null, placar_1: 0, placar_2: 0, status: 'encerrada'}` com
  `.neq('status','encerrada')` (idempotência) + `revalidatePath`.
- [x] 2.2 `src/schema/`: schema Zod da entrada do duplo (se houver módulo de
  schemas de W.O., estender; senão validar inline na action como o simples faz).
- [x] 2.3 NÃO estender `solicitarWO`/`responderWO` (não há "solicitar duplo" por
  técnico — decisão de produto 3).

## 3. Motor de classificação + propagação do flag

- [x] 3.1 `src/features/standings/computeStandings.ts` — tipo da partida elegível
  ganha `woDuplo?: boolean` (análogo a `woVencedor`).
- [x] 3.2 `aplicarPartida` (`:146-183`): NOVO ramo do duplo (mutuamente exclusivo
  com `woVencedor`): os DOIS levam `derrotas += 1` e `pontos += regras.derrota`,
  SEM tocar gols, e `return`. Deve vir de modo que o 0x0 do duplo NUNCA caia no
  ramo de placar (que o trataria como empate).
- [x] 3.3 `pontosConfronto` (`:327-347`, confronto direto): NOVO ramo simétrico —
  se `woDuplo`, `pontos += regras.derrota; continue` (nunca empate pelo 0x0).
### Propagação do flag — censo FECHADO (design §6.a). Todo site FORA de chave que
### mapeia `matches` → motor precisa de `wo_duplo` no SELECT + `woDuplo` no shape.
### `woDuplo` é BOOLEAN: só selecionar e repassar (sem re-key por slot). Fetchers de
### chave (getTournamentClassificacao projeção `chave` :638, avancarFase
### tournaments.ts:939, cups.partidasChave :1258, leaguePyramid, getGrandeFinal,
### getPlayoffs) são DISPENSADOS (duplo proibido em chave).

- [x] 3.4 (A) `getTournamentClassificacao.ts`: incluir `wo_duplo` no SELECT único
  `:361` (alimenta motor + grupos + histórico de uma vez); criar helper
  `woDuplo(p) = p.wo === true && p.wo_duplo === true` ao lado de `woVencedor` (`:399`);
  aplicá-lo em `linhasMotor` (`:407`) E no mapa `grupos` (`:669`, esquecido na versão
  anterior da proposal).
- [x] 3.5 (B) `src/actions/tournaments.ts` `montarMataMataDosGrupos`: `wo_duplo` no
  SELECT (`:1299`) + `woDuplo` no literal (`:1318`); (E) `gerarFaseDeGrupos.ts` — o
  tipo `PartidaGrupoJogada` de `classificarGrupos` (`:209`) ganha `woDuplo?: boolean`
  para o flag fluir ao `computeStandings` (`:228`).
- [x] 3.6 (C) `src/actions/cups.ts` `computarEliminadosGrupos`: `wo_duplo` no SELECT
  (`:1240`) + no tipo do param (`:1327-1338`) + `woDuplo` no literal (`:1356`, feeds
  `computeStandings` `:1365`). NÃO tocar `partidasChave` (`:1258`, chave).
- [x] 3.7 (D) `getDivisionClassificacaoCombinada.ts` (base do sobe/desce): `wo_duplo`
  no SELECT (`:140`) + no tipo `PartidaRow` + `woDuplo` no `linhasMotor` (`:168`,
  feeds `computeStandings` `:179`). `woDuplo` boolean NÃO passa por `reKeyClausura`.
- [x] 3.8 Consumidores PUROS (nada a fazer, herdam via A/D): `getDivisionStandings.ts`
  e `promedios.ts` delegam a `getTournamentClassificacao`/`getDivisionClassificacao
  Combinada` (via `carregarLinhasBaseDivisao`) e leem `pontos`/`jogos` já computados
  — o promédio cai sozinho. Confirmar no diff que não há mapeamento próprio de
  partidas neles (senão vira site novo do censo).
- [x] 3.9 Histórico (correção de acessibilidade): expor `woDuplo` na projeção
  `PartidaEncerrada` (`getTournamentClassificacao.ts:552-553` → `woDuplo: p.wo ===
  true && p.wo_duplo === true`), reusando o `wo_duplo` do SELECT `:361` (sem SELECT
  novo). Em `src/features/match/components/MatchHistoryList.tsx`: ramificar o rótulo
  visível e o texto sr-only (`:45/:57/:62-63`) — quando `woDuplo` verdadeiro,
  exibir/anunciar "W.O. duplo — ambos ausentes" (sem negrito), senão manter o texto
  do W.O. simples. Sem isto, `woVencedorLado` nulo faz o sr-only afirmar
  falsamente "lado 2 venceu".

## 4. Fechar rodada — órfão × órfão vira duplo fora de chave

- [x] 4.1 `src/features/match/closeRound.ts`: incluir `posicao` no SELECT de
  `varrerOrfaosDaRodada` (`:42-45`) e no tipo `PartidaAbertaDaRodada` (`:10-16`).
- [x] 4.2 Após o laço XOR atual (`:73`), NOVO laço: para
  `comDoisLados.filter(m => orfao1(m) && orfao2(m) && m.posicao == null)`, UPDATE
  `{wo: true, wo_duplo: true, wo_vencedor: null, placar_1: 0, placar_2: 0, status:
  'encerrada'}` com `.neq('status','encerrada')` best-effort (mesmo padrão do XOR).
  Órfão × órfão em chave (`posicao != null`) segue INTOCADO.
- [x] 4.3 Confirmar que o gate `somenteSeRodadaCompleta` (`:68`) cobre o novo laço
  (fechamento automático não toca nada enquanto houver jogo real pendente).

## 5. Reabrir limpa `wo_duplo`

- [x] 5.1 `src/actions/match.ts` (`reabrirPartida`): incluir `wo_duplo: false` no
  UPDATE de reabertura, ao lado de `wo: false, wo_vencedor: null`. Sem isso a CHECK
  (ramo "fora de W.O.") barraria.

## 6. UI

- [x] 6.1 `src/features/match/components/WoButtons.tsx` (`MarcarWoButton`, `:27`):
  adicionar a opção "Ambos ausentes" (duplo) no painel inline, ao lado das opções
  de vencedor; chama `marcarWoDuplo(matchId)`. RENDERIZAR a opção apenas quando a
  partida NÃO é de chave (derivar `posicao == null` do call-site). Reenquadrar o
  rótulo do passo se ficar melhor (ex.: "Resultado do W.O.:"). A 390px, com o painel
  JÁ EXPANDIDO, as TRÊS opções (vencedor-1 / vencedor-2 / ambos-ausentes) devem
  empilhar full-width sem estouro (o cluster já aplica `[&_[data-slot=button]]:w-full`).
- [x] 6.2 `src/features/match/components/OpenMatchesList.tsx`: passar ao
  `MarcarWoButton` o sinal de "é chave" (ou `permiteDuplo`) para ocultar a opção em
  mata-mata. O cluster já empilha full-width no mobile.

## 7. Testes (vitest, hermético com `vi.mock` do Supabase)

- [x] 7.1 Motor — duplo é DUPLA DERROTA 0x0: os dois lados ganham D+1 +
  `regras.derrota`, saldo/gols intocados, `jogos = V+E+D` conta o duplo.
- [x] 7.2 Motor — confronto direto SIMÉTRICO: dois que se enfrentaram num duplo NÃO
  empatam pelo 0x0 (ambos levam derrota nos pontos do confronto).
- [x] 7.2b Motor — mini-tabela de desempate (`resolverMiniTabela`, presets
  espanhol/fifa): dois empatados que se enfrentaram num duplo levam DERROTA DENTRO da
  mini-tabela (reuso de `aplicarPartida`), nunca empate pelo 0x0.
- [x] 7.3 Action `marcarWoDuplo` — recusa em CHAVE (`posicao != null`) com mensagem
  clara; exige capacidade ARBITRAR; exige torneio ativo e partida aberta;
  idempotência (`.neq('status','encerrada')`); ambos os lados presentes.
- [x] 7.4 `closeRound` — órfão × órfão FORA de chave vira duplo W.O.; órfão ×
  órfão EM chave permanece aberto; XOR (órfão × técnico) segue como W.O. simples.
- [x] 7.5 Reabrir — parte de um duplo e volta a aberta com `wo`/`wo_vencedor`/
  `wo_duplo` limpos.
- [x] 7.6 Componente — a opção "Ambos ausentes" aparece fora de chave e SOME em
  partida de chave.
- [x] 7.7 Coerência conceitual da CHECK (unit sobre o shape esperado): duplo sem
  vencedor com `posicao is null` é válido; duplo com `posicao is not null` é
  inválido.
- [x] 7.8 Toda a suíte atual permanece VERDE (W.O. simples intacto).
- [x] 7.9 Propagação por FORMATO (ponta a ponta, mock de Supabase): (a) duplo numa
  divisão de liga com `ranking_base = 'promedios'` BAIXA o promédio (`pontos/jogos`)
  dos dois e altera a posição de corte (sobe/desce) — via `getDivisionClassificacao
  Combinada`/`getTournamentClassificacao`; (b) duplo numa FASE DE GRUPOS credita
  DERROTA aos dois e NÃO inverte a ordem como um empate faria — cobrir os caminhos
  `getDivisionClassificacaoCombinada`, `computarEliminadosGrupos` e o mapa `grupos` de
  `getTournamentClassificacao`.
- [x] 7.10 Histórico — `MatchHistoryList` de um duplo W.O. rotula/anuncia (sr-only)
  "W.O. duplo — ambos ausentes" e NÃO afirma que nenhum lado venceu (regressão do
  bug em que `woVencedorLado` nulo caía em "lado 2 venceu").

## 8. Qualidade e validação

- [x] 8.1 Gate mecânico: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
  — verde (ou igual ao baseline 0.1).
- [ ] 8.2 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 8.3 Validação visual ao vivo (390px): painel de W.O. JÁ EXPANDIDO com as TRÊS
  opções (vencedor-1 / vencedor-2 / ambos-ausentes) empilhadas full-width sem
  estouro; declarar duplo numa liga (dupla derrota na classificação); histórico
  mostra "W.O. duplo — ambos ausentes"; opção oculta numa partida de chave; fechar
  rodada com órfão × órfão. (ORQUESTRADOR)
- [x] 8.4 `openspec validate add-wo-duplo --strict` = valid.
