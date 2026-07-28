## Why

Hoje, numa partida em aberto (liga ou fase de grupos), o admin/árbitro só tem três
saídas: marcar W.O., editar/propor placar, ou encerrar. Não existe forma de **adiar**
um jogo que não vai rolar na data prevista sem forçar uma decisão (W.O.) nem travar a
rodada — o organizador ou marca um vencedor artificial, ou deixa a partida aberta
segurando o fechamento automático da rodada (`fecharRodada`/`varrerOrfaosDaRodada`,
que hoje trata TODA partida não-encerrada de uma rodada completa como candidata a
W.O. automático, inclusive uma que só está esperando reagendamento).

O adiamento cobre esse caso: a rodada segue em frente como se a partida tivesse
"terminado" (não bloqueia o fechamento nem a visão da rodada seguinte), mas o
resultado fica PENDENTE — não conta na classificação — até o admin ou os técnicos
envolvidos voltarem e resolverem normalmente (placar ou W.O.), exatamente como
qualquer partida aberta.

**Escopo confirmado pelo dono**: só liga e fase de grupos. Partidas de CHAVE
(`posicao is not null`) ficam de fora — o motor de próxima fase depende de
`status = 'encerrada'` para parear a fase seguinte (`decidirConfronto`,
`src/features/knockout/gerarChaveMataMata.ts:310-355`), e adiar quebraria essa
dependência estrutural. Mesmo filtro que já proíbe duplo W.O. em chave
(`src/actions/wo.ts:257-262`).

## What Changes

- **Schema (DDL aditivo).** Novo valor `'adiada'` no enum `public.match_status`
  (`ALTER TYPE ... ADD VALUE`, top-level, fora do bloco `do $$ ... $$`, seguindo o
  padrão já usado para `tournament_format`/`cup_origin_type`). Três colunas novas
  em `matches`, todas nullable: `adiada_em timestamptz`, `adiada_por uuid
  references public.users(id) on delete set null`, `adiamento_motivo text`. CHECK
  aditiva `matches_adiamento_coerente` (`status = 'adiada' ⇒ adiada_em/adiada_por
  não-nulos`, ver design §3 — só nessa direção, para não exigir que os caminhos
  EXISTENTES de placar/W.O. limpem os campos ao sair de `'adiada'`). O trigger
  `lock_match_lifecycle` passa a tratar as três colunas novas como imutáveis em
  `encerrada → encerrada` (mesmo motivo de `wo`/`wo_vencedor`/`wo_duplo` já
  estarem lá: fechar o furo de um participante alterá-las via a RLS
  `matches_update_participant`, que é só por linha).
- **RPC `adiar_partida`.** Nova função `security definer` que, numa única
  transação, muda a partida para `'adiada'` (com motivo opcional) E cancela
  (rejeita/recusa) qualquer proposta de placar ou solicitação de W.O. pendente
  daquela partida — evita que uma pendência antiga seja aprovada depois com um
  contexto desatualizado. Espelha o padrão já usado por `aprovar_proposta_placar`
  (`schema.sql:5227-5267`): autorização por `pode_arbitrar_torneio`, `for update`,
  UPDATE guardado por filtro de estado, `raise exception` com código curto.
- **Server Actions.** Novo arquivo `src/actions/postponement.ts`: `adiarPartida`
  (pré-checagem em TS no mesmo estilo de `marcarWoInterno` — capacidade ARBITRAR,
  torneio ativo, não-encerrada, fora de chave — seguida da chamada à RPC e, após
  sucesso, notificação best-effort aos dois técnicos do confronto, mesmo padrão
  de `responderWO`) e `desfazerAdiamento` (UPDATE único de volta a
  `'em_andamento'` limpando os três campos novos, sem RPC — não há efeito
  colateral em outra tabela para desfazer, espelha `reabrirPartida`).
- **Fechar rodada.** `varrerOrfaosDaRodada` (`src/features/match/closeRound.ts`)
  passa a EXCLUIR partidas `'adiada'` da varredura de órfãos — hoje usa `.neq
  ('status', 'encerrada')` para achar as "abertas", o que capturaria uma adiada e
  a resolveria como W.O. automático por engano (foi adiada por decisão humana, não
  por ausência de técnico).
- **Compartilhamento de rodada no WhatsApp.** `confrontosTextoDaRodada.ts`
  (adapter do botão "Compartilhar rodada no WhatsApp") passa a EXCLUIR partidas
  `'adiada'` da mensagem — hoje herda `partidasAbertas` de
  `getTournamentClassificacao.ts` (que filtra só `status !== "encerrada"`, sem
  excluir adiada) e geraria um convite `wa.me` para um jogo já adiado
  administrativamente. O `partidasAbertas` em si NÃO muda (o console do dono
  precisa continuar listando a adiada para agir sobre ela) — a exclusão é só no
  adapter do WhatsApp.
- **Motor de classificação e ações existentes.** SEM MUDANÇA — confirmado no
  código (ver design §1): `ehElegivel` (`computeStandings.ts:267-276`) já filtra
  positivamente por `status === 'encerrada'`; `marcarWO`/`marcarWoDuplo`/
  `updateMatchScore`/`aplicar_placar_direto`/`proporPlacar`/
  `aprovar_proposta_placar` já guardam por checagem NEGATIVA (`status <>
  'encerrada'`), então aceitam uma partida `'adiada'` sem tocar em nenhum desses
  arquivos.
- **UI.** Rótulo "adiada" em `LABEL_STATUS` (`src/features/match/live/labels.ts` e
  o mapa duplicado em `OpenMatchesList.tsx`) — o TypeScript força a chave nova por
  ser `Record<MatchStatus, string>`. Pílula de status com cor distinta de
  Aberta/Encerrada. Novo componente `src/features/match/components/
  PostponeButtons.tsx` com o botão "Adiar" (motivo opcional, oculto em chave) e
  "Desfazer adiamento" (visível só quando `status === 'adiada'`), seguindo o
  padrão visual/de confirmação de `WoButtons.tsx`.

## Capabilities

### Modified Capabilities
- `round-management`: "Fechamento de rodada" passa a excluir partidas `'adiada'`
  da varredura de órfãos (não trata adiamento humano como ausência de técnico).
- `data-model`: novo valor de enum `'adiada'`, três colunas novas em `matches` e a
  CHECK `matches_adiamento_coerente`.

### New Capabilities
- `match-postponement`: adiar partida (liga/grupos, capacidade ARBITRAR, motivo
  opcional, cancela pendências), bloqueio em chave, reverter o adiamento, e a
  retomada normal (placar/W.O.) de uma partida adiada.

## Impact

- **Código de aplicação:**
  - `src/actions/postponement.ts` (novo): `adiarPartida` (inclui notificação
    best-effort aos dois técnicos), `desfazerAdiamento`.
  - `src/features/match/closeRound.ts` (`varrerOrfaosDaRodada` — exclui `'adiada'`
    do `.neq('status','encerrada')` que hoje define "abertas").
  - `src/features/match/confrontosTextoDaRodada.ts` (`deAbertas` exclui
    `status === 'adiada'` — não entra na mensagem de WhatsApp da rodada).
  - `src/lib/supabase/database.types.ts` (`MatchStatus` ganha `'adiada'`).
  - `src/features/match/live/labels.ts` e
    `src/features/match/components/OpenMatchesList.tsx` (`LABEL_STATUS` — TS
    força a chave nova nos dois mapas `Record<MatchStatus, string>`).
  - `src/features/match/live/LiveStatusBadge.tsx` (cor distinta para `'adiada'`).
  - `src/features/match/components/PostponeButtons.tsx` (novo componente) e o(s)
    call-site(s) que hoje montam `MarcarWoButton`/`SolicitarWoButton`
    (`OpenMatchesList.tsx` e afins) — passam a montar também os botões de
    adiamento, com o mesmo sinal `posicao == null` já usado por `permiteDuplo`.
  - SEM MUDANÇA (confirmado, ver design §1): `src/actions/wo.ts`,
    `src/actions/match.ts`, `src/actions/scoreProposals.ts`,
    `src/features/standings/computeStandings.ts`.
- **Banco de dados:** DDL ADITIVO em `supabase/schema.sql` (fonte de verdade) —
  valor de enum (ALTER TYPE isolado, fora de transação com uso), três colunas
  nullable, uma CHECK, uma coluna a mais na lista de imutáveis do
  `lock_match_lifecycle`, e a RPC `adiar_partida`. O SQL de produção é MOSTRADO ao
  dono antes de aplicar (REGRA 4) — esta change documenta, não aplica.
- **Segurança/autorização:** mesma capacidade ARBITRAR (dono, admin ou árbitro) já
  usada pelo W.O., verificada em duas camadas (pré-check em TS + `security
  definer`/RLS como backstop). Nenhuma policy nova — `matches_update_tournament_owner`
  já cobre a escrita de `status` por quem arbitra.
- **Dependências:** nenhuma nova.
- **Testes:** RPC/action (`adiarPartida` recusa em chave, exige ARBITRAR, exige
  torneio ativo e partida não-encerrada, cancela proposta/solicitação pendente,
  notifica os dois técnicos best-effort sem derrubar a action se a notificação
  falhar; `desfazerAdiamento` só a partir de `'adiada'`, limpa os três campos),
  `closeRound` (adiada NÃO é tratada como órfã), `computeStandings` (adiada não
  pontua — regressão), `confrontosTextoDaRodada` (adiada NÃO entra na mensagem de
  WhatsApp da rodada), `getActiveMatches`/UI (pílula e botões aparecem/somem
  corretamente). pgTAP para a CHECK nova e a coluna imutável em `encerrada→
  encerrada`. Toda a suíte atual permanece verde.
