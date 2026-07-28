## 0. Baseline

- [x] 0.1 Baseline HEAD `ef2a95e`: 2 falhas PRÉ-EXISTENTES confirmadas via
  `git stash` (`src/app/dashboard/ligas/[id]/page.test.tsx`, `supabase.from is
  not a function` em `getCopasDaPiramide` — não relacionado a esta change).
  Verde final = mesmas 2 falhas, zero novas.

## 1. Schema / DDL (aditivo, idempotente) — `supabase/schema.sql`

- [x] 1.1 Adicionar `'adiada'` ao enum `public.match_status`: `alter type
  public.match_status add value if not exists 'adiada';` — TOP-LEVEL, fora do
  bloco `do $$ ... $$` e em statement isolado do resto (Postgres proíbe usar um
  valor de enum na MESMA transação em que foi criado). Seguir o padrão de
  comentário/formatação de `schema.sql:28-36` (`tournament_format`) e
  `:4045-4050` (`cup_origin_type`).
- [x] 1.2 Colunas novas em `matches` (design §3): `adiada_em timestamptz`,
  `adiada_por uuid references public.users (id) on delete set null`,
  `adiamento_motivo text` — todas nullable, `add column if not exists`.
- [x] 1.3 CHECK `matches_adiamento_coerente` (DROP + ADD idempotente, design §3):
  `check (status <> 'adiada' or (adiada_em is not null and adiada_por is not
  null))` — UNIDIRECIONAL (não exige os campos nulos fora de `'adiada'` —
  metadado histórico, ver design §3 para o porquê).
- [x] 1.4 Incluir `adiada_em`, `adiada_por`, `adiamento_motivo` na lista de
  colunas imutáveis do trigger `lock_match_lifecycle` no ramo `encerrada →
  encerrada` (`schema.sql:629-639`, design §4). Confirmar que a REABERTURA
  (status sai de encerrada) segue livre.
- [x] 1.5 RPC `public.adiar_partida(p_match_id uuid, p_motivo text default
  null) returns uuid` (design §5): `security definer`, `set search_path = ''`,
  autorização por `pode_arbitrar_torneio`, guard de chave (`posicao is not
  null` → `raise exception 'CHAVE_NAO_ADIA'`), UPDATE de `matches` guardado por
  `status <> 'encerrada'` com `get diagnostics`/`row_count`, seguido do
  cancelamento (`status = 'pendente'` → `'rejeitada'`/`'recusado'`) em
  `match_score_proposals` e `match_wo_requests` da mesma partida. `revoke` +
  `grant execute ... to authenticated` ao final (mesmo padrão de
  `aplicar_placar_direto`/`aprovar_proposta_placar`).
- [x] 1.6 Comentário explicando o novo status e por que a CHECK é unidirecional
  (design §3), ao lado do bloco de W.O. já comentado. `valida_resultado_mata_mata`
  NÃO foi tocada (confirmado: só age em `posicao not null`; a transição
  para/de `'adiada'` cai no early-return dele — validado também via pgTAP).
- [x] 1.7 SQL exato registrado em `supabase/schema.sql` (fonte de verdade) para
  o dono aplicar em produção (REGRA 4 — mostrar antes de aplicar); esta change
  NÃO aplicou DDL em nenhum banco (só local, efêmero, via `pnpm test:rls`).

## 2. Tipos TS

- [x] 2.1 `src/lib/supabase/database.types.ts`: `MatchStatus` ganha `'adiada'`;
  `matches.Row/Insert/Update` ganham `adiada_em`/`adiada_por`/`adiamento_motivo`;
  `Functions.adiar_partida` registrada (tipo espelhado manualmente, sem geração
  automática neste projeto).

## 3. Server Actions — `src/actions/postponement.ts` (novo arquivo)

- [x] 3.1 `adiarPartida(matchId, motivo?)` (design §6): Zod (`z.uuid()` +
  motivo opcional com teto de tamanho), sessão válida, fetch da partida (`id,
  status, tournament_id, posicao`), capacidade ARBITRAR (`podeArbitrar`),
  torneio `ativo` por filtro, guard de chave (`posicao != null` → erro claro,
  ANTES da RPC), guard de encerrada (`status === 'encerrada'` → erro claro,
  ANTES da RPC), chamada a `supabase.rpc('adiar_partida', ...)` com mapeamento
  dos códigos de exceção para mensagens pt-BR, `revalidatePath` em
  `/dashboard` e `/dashboard/torneios/${tournamentId}`, e — depois do sucesso
  — notificação best-effort aos DOIS técnicos do confronto (embed
  `v1.user_id`/`v2.user_id` via `tournament_slots`, título do torneio,
  `enviarNotificacoes` excluindo o próprio caller, mesmo padrão de
  `responderWO`; envolvida em try/catch adicional — reforço de robustez além
  do precedente, garante que o adiamento NUNCA é derrubado pela notificação).
- [x] 3.2 `desfazerAdiamento(matchId)` (design §6): Zod, sessão, capacidade
  ARBITRAR, guard de torneio não-encerrado (mesmo padrão de `reabrirPartida`),
  guard `status === 'adiada'`, UPDATE único `{status: 'em_andamento',
  adiada_em: null, adiada_por: null, adiamento_motivo: null}` com
  `.eq('id', matchId).eq('status', 'adiada')`, `revalidatePath`.
- [x] 3.3 Validação Zod: `adiarPartidaSchema` novo em `src/schema/matchSchema.ts`
  (mesmo padrão de `rejeitarPropostaSchema`); `desfazerAdiamento` usa
  `z.uuid()` inline como o restante de `wo.ts`.

## 4. Fechar rodada — excluir `'adiada'` da varredura de órfãos

- [x] 4.1 `src/features/match/closeRound.ts` (`varrerOrfaosDaRodada`, design
  §7): o SELECT passa a excluir também `status = 'adiada'` (não só
  `'encerrada'`) na definição de "partidas abertas da rodada" — os dois laços
  internos (XOR órfão×técnico, duplo órfão×órfão) ficam com a lógica intacta.
- [x] 4.2 Confirmado (teste + pgTAP indireto): o gate `somenteSeRodadaCompleta`
  continua correto com o filtro novo — uma rodada com só uma partida `'adiada'`
  pendente e o resto encerrado "fecha sozinha" sem tentar resolver a adiada.
- [x] 4.3 `src/features/match/confrontosTextoDaRodada.ts` (design §8): o
  filtro de `deAbertas` ganha `&& p.status !== "adiada"` — a partida adiada
  NÃO entra na mensagem de "Compartilhar rodada no WhatsApp" (o
  `partidasAbertas` de `getTournamentClassificacao.ts` NÃO mudou; a exclusão é
  só neste adapter). `deEncerradas` ficou intocado.

## 5. UI

- [x] 5.1 `src/features/match/live/labels.ts` (`LABEL_STATUS`): `adiada: "adiada"`.
- [x] 5.2 `src/features/match/components/OpenMatchesList.tsx` (mapa duplicado
  `LABEL_STATUS`): mesma chave nova (TS forçou — `Record<MatchStatus, string>`).
- [x] 5.3 `src/features/match/live/LiveStatusBadge.tsx` E o pill inline de
  `OpenMatchesList.tsx`: cor âmbar distinta para `status === 'adiada'` (mesmo
  tom do badge de pendência em `MatchHistoryList.tsx`), diferente de
  `em_andamento` (primary) e do default (muted).
- [x] 5.4 Novo componente `src/features/match/components/PostponeButtons.tsx`
  (padrão de `WoButtons.tsx`: `ALVO_TOQUE`, `useTransition`, `toast`, sem
  `AlertDialog`): `AdiarButton` (fechado: "Adiar"; aberto: campo de motivo
  opcional + Confirmar/Cancelar) e `DesfazerAdiamentoButton`.
- [x] 5.5 `OpenMatchesList.tsx`: `podeAdiar`/`podeDesfazerAdiamento` montados
  no cluster de ações, reusando o sinal `posicao == null`/`ehCompetitivo` (o
  mesmo de `permiteDuplo`) — `podeAdiar` também exige `!temPropostaPendente`
  (mesmo gate de `podeMarcarWo`, mantém "Resultados pendentes" como único
  lugar de resolver pendência).
- [x] 5.6 `adiamentoMotivo` propagado (`PartidaAberta` + SELECT único de
  `getTournamentClassificacao.ts`) e exibido como `title` (tooltip nativo) no
  pill de status quando presente.

## 6. Testes (vitest, hermético com `vi.mock` do Supabase; pgTAP em
`supabase/tests/`)

- [x] 6.1 Action `adiarPartida` — recusa em CHAVE, recusa em `'encerrada'`,
  exige ARBITRAR, exige torneio ativo, sucesso grava
  `status`/`adiada_em`/`adiada_por`/`adiamento_motivo` (`postponement.test.ts`).
- [x] 6.2 RPC/action `adiarPartida` cancela pendências — proposta pendente vira
  `'rejeitada'`, solicitação de W.O. pendente vira `'recusado'`, MESMA partida
  (`postponement.test.ts` + pgTAP `rls_partida_adiada.sql`).
- [x] 6.2b Notificação best-effort — os dois técnicos, excluindo o caller;
  falha na notificação NÃO derruba o sucesso (`postponement.test.ts`).
- [x] 6.3 Action `desfazerAdiamento` — só a partir de `'adiada'`; sucesso limpa
  os três campos (`postponement.test.ts`).
- [x] 6.4 `closeRound` — SELECT exclui `'encerrada'` E `'adiada'`;
  `somenteSeRodadaCompleta` fecha com uma adiada pendente (`closeRound.test.ts`).
- [x] 6.5 `computeStandings`/`ehElegivel` — regressão: `'adiada'` não pontua
  (`computeStandings.test.ts`).
- [x] 6.5b `confrontosTextoDaRodada` — `'adiada'` fora da mensagem de WhatsApp
  (`confrontosTextoDaRodada.test.ts`).
- [x] 6.6 Retomada normal — confirmado por LEITURA de código (design §1) que
  `marcarWO`/`marcarWoDuplo`/`aplicar_placar_direto`/`aprovar_proposta_placar`
  usam guarda negativa (`status <> 'encerrada'`), sem tocar nesses arquivos;
  reforçado pelo pgTAP (partida adiada aceita `pode_arbitrar_torneio` e os
  mesmos triggers/CHECKs das demais).
- [x] 6.7 pgTAP `supabase/tests/rls_partida_adiada.sql` (11 asserções): CHECK
  `matches_adiamento_coerente` rejeita `'adiada'` sem metadado (23514); coluna
  de adiamento imutável em `encerrada → encerrada` (POST direto simulando o
  participante); autorização (terceiro recusado), guard de chave, sucesso
  (status/metadado/cancelamento das duas pendências). RODADO localmente
  (Postgres 17 efêmero via docker): **116/116 ok** na suíte inteira
  (`pnpm test:rls`).
- [x] 6.8 Componente `PostponeButtons.test.tsx` (7 testes): `AdiarButton`
  abre/fecha, motivo com trim, erro mantém aberto, cancelar limpa;
  `DesfazerAdiamentoButton` sucesso/erro.
- [x] 6.9 Suíte atual: 1962 passam; as MESMAS 2 falhas pré-existentes do
  baseline (0.1), zero novas.

## 7. Qualidade e validação

- [x] 7.1 Gate mecânico: `pnpm typecheck` (limpo) + `pnpm lint` (limpo) +
  `pnpm test` (1962 ok / 2 pré-existentes iguais ao baseline) + `pnpm build`
  ("Compiled successfully", todas as rotas geradas) — verde.
- [ ] 7.2 Revisão adversarial por workflow do diff. (ORQUESTRADOR)
- [ ] 7.3 Validação visual ao vivo (390px): adiar uma partida de liga com
  motivo (pílula "adiada" some da classificação, rodada segue), adiar sem
  motivo, desfazer o adiamento, tentar adiar uma partida de chave (botão
  ausente), colocar placar/W.O. numa partida adiada, fechar rodada com uma
  adiada pendente. (ORQUESTRADOR)
- [x] 7.4 `openspec validate add-partida-adiada --strict` = valid.
