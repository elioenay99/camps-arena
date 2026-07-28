# Design — Partida adiada

Referências `arquivo:linha` são do HEAD. O adiamento é um QUARTO estado do ciclo de
vida da partida (`'adiada'`), irmão de `'agendada'`/`'em_andamento'` — nunca
`'encerrada'`, então não pontua e não é imutável. Todas as decisões preservam
RSC-first e a autorização por capacidade (dono | admin | árbitro).

## 1. Por que os caminhos existentes NÃO mudam (confirmado no código)

O ponto central do design é que quase todo o sistema já trata partida "não-
encerrada" de forma NEGATIVA (`status <> 'encerrada'`), nunca por lista positiva
dos status abertos. Isso significa que introduzir um valor novo no enum é
absorvido de graça pelos caminhos abaixo — confirmado lendo cada um:

- **`ehElegivel`** (`src/features/standings/computeStandings.ts:267-276`): filtra
  POSITIVAMENTE `p.status === "encerrada"`. Uma partida `'adiada'` já cai fora —
  nenhuma mudança no motor.
- **`marcarWoInterno`** (`src/actions/wo.ts:127-132`) e **`marcarWoDuplo`**
  (`wo.ts:250-255`): guardam com `if (match.status === "encerrada") return erro`
  — negativo. `'adiada'` passa por esse guard como qualquer partida aberta.
- **`updateMatchScore`/RPC `aplicar_placar_direto`** e **`aprovar_proposta_placar`**
  (`schema.sql:5261-5267`): `update ... where id = v_match and status <>
  'encerrada'`. Mesma lógica.
- **`proporPlacar`** (`src/actions/scoreProposals.ts:121-123`): mesma checagem
  negativa.
- **`lock_match_lifecycle`** (`schema.sql:602-648`): só trava colunas quando
  `old.status = 'encerrada' and new.status = 'encerrada'`. Uma partida `'adiada'`
  nunca cai nesse ramo (nem entrando nem saindo).
- **`valida_resultado_mata_mata`** (`schema.sql:673-792`): só age quando
  `v_encerrando or v_reabrindo` (ambos comparam contra o literal `'encerrada'`,
  `:684-685`); transição para/de `'adiada'` cai no early-return (`:695-697`).
- **RLS `matches_update_tournament_owner`** (`schema.sql:1454-1458`,
  `pode_arbitrar_torneio`): já cobre qualquer escrita de `status` por quem
  arbitra — não precisa de policy nova.

Conclusão prática: **nenhum desses arquivos entra no Impact desta change.** O
trabalho real é (a) o novo valor de enum + colunas de rastreio, (b) a ação de
adiar/desfazer (que É nova lógica, não herdada), e (c) o UM lugar que hoje usa
`.neq('status','encerrada')` para decidir "partida órfã candidata a W.O.
automático" — `closeRound.ts` — que precisa de um filtro a mais.

## 2. Restrição de chave (mesmo predicado do duplo W.O.)

Confirmado em `openspec/changes/archive/2026-07-04-add-wo-duplo/design.md §1`
(ainda válido): partida de CHAVE é `posicao is not null`; `grupo` e `posicao` são
mutuamente exclusivos (CHECK `matches_grupo_ou_posicao`), então `posicao is null`
cobre liga, fase de grupos e avulso — todo o universo onde o adiamento é
permitido. O guard vive em DUAS camadas: a action (`posicao != null` → erro
claro, ANTES de chamar a RPC) e a própria RPC (mesmo predicado, backstop contra
POST direto ao RPC). Não há backstop de CHECK no banco (diferente do
`matches_wo_coerente`) porque o valor do enum por si só não força a chave — ver
§3 sobre por que a CHECK de coerência não trava chave.

Avulso (`tournaments.formato = 'avulso'`) tecnicamente também tem `posicao is
null`, então passaria pelo guard de chave. Não há necessidade de bloqueio
adicional: o avulso já não tem `rodada`/fechamento automático, então adiar lá é
inofensivo (a partida simplesmente fica com status `'adiada'` até alguém editar o
placar) — não faz parte do fluxo pedido pelo dono, mas não quebra nada por
existir. Não vale a pena um guard extra para um caminho que não causa dano.

## 3. Colunas novas e a CHECK de coerência (DDL aditivo)

```sql
alter table public.matches add column if not exists adiada_em timestamptz;
alter table public.matches add column if not exists adiada_por uuid
  references public.users (id) on delete set null;
alter table public.matches add column if not exists adiamento_motivo text;
```

Nomeação segue o padrão já usado por `resolvido_por`/`perdoado_por`/
`tecnico_user_id` no schema — todos FK `public.users(id)`, nunca `auth.users`
diretamente (`public.users` é o perfil público 1:1, `schema.sql:39-40`). A
cláusula `on delete set null` especificamente segue `perdoado_por`
(`schema.sql:6387`) e `tecnico_user_id` (`:4234`) — `resolvido_por`
(`match_score_proposals`, `:5104`) é a EXCEÇÃO que NÃO tem essa cláusula (fica
`NO ACTION`/restrict). Para `adiada_por` a escolha é `on delete set null`,
coerente com o padrão majoritário: apagar a conta de quem adiou não deve travar
a exclusão nem apagar o rastro do adiamento em si.

```sql
alter table public.matches drop constraint if exists matches_adiamento_coerente;
alter table public.matches
  add constraint matches_adiamento_coerente
  check (status <> 'adiada' or (adiada_em is not null and adiada_por is not null));
```

**Por que a CHECK é UNIDIRECIONAL** (só exige os campos quando `status =
'adiada'`, NÃO exige que fiquem nulos fora de `'adiada'`): se a CHECK fosse
bidirecional (`status <> 'adiada' ⇒ campos nulos`), TODO caminho que move uma
partida de `'adiada'` direto para `'encerrada'` (placar normal, W.O., aprovação
de proposta) precisaria passar a limpar `adiada_em`/`adiada_por`/
`adiamento_motivo` no mesmo UPDATE — isso contradiria o §1 (nenhum desses
arquivos muda) e infla o escopo da change sem ganho real. A escolha de design é
deixar os três campos como **metadado histórico**: uma partida que foi adiada e
depois resolvida normalmente mantém o registro "isto foi adiado, motivo X, por
Y, em Z" — é informação, não um bug. Só `desfazerAdiamento` (reversão explícita
para ABERTA, não para encerrada) limpa os três campos, porque aí sim o objetivo é
"como se nunca tivesse sido adiada".

A CHECK unidirecional nunca é violada pelos caminhos existentes porque nenhum
deles ESCREVE `status = 'adiada'` — só a RPC nova o faz (sempre setando
`adiada_em`/`adiada_por` no mesmo UPDATE).

## 4. `lock_match_lifecycle` — as três colunas entram na lista de imutáveis

Em `schema.sql:629-639`, a lista de colunas travadas em `encerrada → encerrada`
ganha `adiada_em`, `adiada_por` e `adiamento_motivo`. Motivo: a RLS
`matches_update_participant` permite UPDATE da LINHA por um participante (RLS é
por linha, não por coluna) — sem o lock, um POST direto malicioso numa partida já
`'encerrada'` poderia reescrever esses três campos (ex.: forjar um "motivo" ou
"quem adiou" numa partida que nunca foi adiada, ou apagar o rastro de uma que
foi). É o MESMO raciocínio que já protege `wo`/`wo_vencedor`/`wo_duplo` nesse
trecho — extensão direta, não lógica nova. A REABERTURA (status sai de
`'encerrada'`) permanece livre, como hoje.

## 5. RPC `adiar_partida` — a única escrita multi-tabela

Decisão 2 do briefing (produto): ao adiar, CANCELAR automaticamente qualquer
proposta de placar (`match_score_proposals`) ou solicitação de W.O.
(`match_wo_requests`) pendente daquela partida. Isso é uma escrita em TRÊS
tabelas que precisa ser atômica — por isso, diferente de `desfazerAdiamento`
(uma tabela só, plain `.update()` como `reabrirPartida`), o adiamento em si
precisa de RPC `security definer`, espelhando `aprovar_proposta_placar`
(`schema.sql:5227-5267`, mesmo padrão de `auth.uid()`, `for update`, UPDATE
guardado por filtro de estado com `get diagnostics`/`row_count`, `raise
exception` com código curto).

```sql
create or replace function public.adiar_partida(p_match_id uuid, p_motivo text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_tid    uuid;
  v_pos    integer;
  v_linhas integer;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select tournament_id, posicao into v_tid, v_pos
    from public.matches
   where id = p_match_id
   for update;

  if v_tid is null then
    raise exception 'PARTIDA_INVALIDA';
  end if;
  if not public.pode_arbitrar_torneio(v_tid) then
    raise exception 'NAO_AUTORIZADO';
  end if;
  if v_pos is not null then
    raise exception 'CHAVE_NAO_ADIA';
  end if;

  update public.matches
     set status = 'adiada',
         adiada_em = now(),
         adiada_por = v_uid,
         adiamento_motivo = nullif(btrim(p_motivo), '')
   where id = p_match_id
     and status <> 'encerrada';
  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'PARTIDA_INDISPONIVEL';
  end if;

  update public.match_score_proposals
     set status = 'rejeitada', resolvido_em = now(), resolvido_por = v_uid
   where match_id = p_match_id and status = 'pendente';

  update public.match_wo_requests
     set status = 'recusado', resolved_at = now()
   where match_id = p_match_id and status = 'pendente';

  return p_match_id;
end;
$$;

revoke execute on function public.adiar_partida(uuid, text) from public, anon;
grant execute on function public.adiar_partida(uuid, text) to authenticated;
```

Notas de implementação:
- `nullif(btrim(p_motivo), '')` normaliza motivo vazio/só-espaço para `NULL`
  (motivo é OPCIONAL — decisão 1 do briefing), espelhando o tratamento de texto
  livre já usado em outras RPCs do schema.
- O guard de chave (`v_pos is not null`) roda ANTES do UPDATE — não deixa a
  action bypassar via POST direto ao RPC mesmo que o guard de TS falhe.
- `match_wo_requests` NÃO tem coluna `resolvido_por`/`resolved_by` (só
  `resolved_at`, confirmado no schema atual, `schema.sql:480-489`) — o UPDATE não
  inventa uma coluna nova para isso; a autoria do CANCELAMENTO já fica registrada
  em `matches.adiada_por`.
- Idempotência: reaplicar `adiar_partida` numa partida já `'adiada'` é permitido
  (`status <> 'encerrada'` inclui `'adiada'`) e apenas atualiza
  `adiada_em`/`adiada_por`/`adiamento_motivo` — útil se o admin quiser corrigir o
  motivo depois. Não há necessidade de bloquear reaplicação.

## 6. Server Actions — `src/actions/postponement.ts`

Arquivo NOVO (não em `wo.ts`, que já está grande — critério do próprio briefing).
Duas actions:

**`adiarPartida(matchId, motivo?)`** — mesma ARMADURA de `marcarWoInterno`
(`wo.ts:89-172`), na ordem:
1. Zod (`z.uuid()` do matchId; motivo `z.string().max(N).optional()` — limite de
   tamanho a definir na implementação, ex. 280 chars, mesma ordem de grandeza do
   motivo de W.O. se houver precedente, senão um teto razoável).
2. Sessão válida (`getUser`).
3. Fetch da partida (`id, status, tournament_id, posicao`).
4. Capacidade ARBITRAR via `podeArbitrar(supabase, { tournamentId })` — pré-check
   em TS (mensagem melhor que o erro genérico da RPC) + a RPC repete como
   backstop.
5. Torneio `status = 'ativo'` por filtro (mesmo padrão de `wo.ts:114-125`).
6. `posicao != null` → erro claro ("Partidas de chave não podem ser adiadas.")
   ANTES de chamar a RPC.
7. `status === 'encerrada'` → erro claro ("Partida já encerrada.") ANTES de
   chamar a RPC (mensagem melhor que deixar a RPC estourar `PARTIDA_INDISPONIVEL`).
8. Chama `supabase.rpc('adiar_partida', { p_match_id: matchId, p_motivo: motivo
   ?? null })`; mapeia os códigos de exceção (`NAO_AUTORIZADO`,
   `CHAVE_NAO_ADIA`, `PARTIDA_INDISPONIVEL`) para mensagens pt-BR se escaparem
   das pré-checagens de TS (corrida entre duas abas, por exemplo).
9. `revalidatePath("/dashboard")` e `revalidatePath('/dashboard/torneios/
   ${tournamentId}')`.
10. **Notifica os dois TÉCNICOS do confronto** (best-effort, mesmo padrão de
    `responderWO`, `src/actions/wo.ts:546-579`, que notifica os dois mesmo ao
    RECUSAR um pedido — o precedente do projeto é "toda ação que resolve/
    cancela uma pendência de um técnico notifica ele"): buscar `v1.user_id`/
    `v2.user_id` via embed de `tournament_slots` (`matches_vaga_1_fkey`/
    `matches_vaga_2_fkey`) + o título do torneio, chamar `enviarNotificacoes`
    excluindo o próprio caller (`user.id`). Título/corpo sugeridos: "Partida
    adiada" / `Uma partida foi adiada em ${titulo}${motivo ? ": " + motivo :
    ""}.`. Falha no envio NÃO SHALL derrubar a action (mesmo best-effort do
    precedente — o `await enviarNotificacoes` não é envolto em try/catch
    porque o próprio helper absorve erro por design, mesma suposição já feita
    por `responderWO`).

**`desfazerAdiamento(matchId)`** — SEM RPC (uma tabela só, sem side-effect em
`match_score_proposals`/`match_wo_requests`: uma proposta pendente CRIADA
enquanto a partida estava `'adiada'` — decisão 3 permite isso, é o fluxo normal
de "resolver como qualquer aberta" — não deve ser cancelada por reverter o
adiamento; reverter só desfaz o PRÓPRIO adiamento):
1. Zod + sessão + capacidade ARBITRAR (mesmo padrão).
2. `status === 'adiada'` → senão, erro ("Esta partida não está adiada.").
3. UPDATE único: `{ status: 'em_andamento', adiada_em: null, adiada_por: null,
   adiamento_motivo: null }` com `.eq('id', matchId).eq('status', 'adiada')`
   (idempotente/sem-corrida, espelha o `.neq('status','encerrada')` do W.O.).
   Destino `'em_andamento'` (não `'agendada'`) por consistência com
   `reabrirPartida` (`src/actions/match.ts`, `mudarStatusComoDono` com
   `novoStatus: "em_andamento"`), que já é o precedente de "volta pro estado
   aberto normal" no projeto.
4. `revalidatePath` nos dois caminhos de `adiarPartida`.

Validação Zod nova em `src/schema/` se o projeto já tiver um módulo dedicado a
schemas de W.O./partida (confirmar na implementação); senão, inline na action
como o restante de `wo.ts` já faz.

## 7. Fechar rodada — excluir `'adiada'` da varredura de órfãos

Em `varrerOrfaosDaRodada` (`src/features/match/closeRound.ts:41-50`), o SELECT
usa `.neq("status", "encerrada")` para definir "partidas abertas da rodada". Uma
partida `'adiada'` cai nesse filtro hoje e poderia ser "resolvida" por engano
como órfã (se um dos lados for clube sem técnico) — mas foi adiada por decisão
humana, não por ausência de técnico, e NÃO deve virar W.O. automático.

Correção: trocar o filtro para excluir explicitamente `'adiada'` também —
`.neq("status", "encerrada").neq("status", "adiada")` (ou `.not("status", "in",
"(encerrada,adiada)")`, o que for mais idiomático no Supabase client já usado no
arquivo). Os dois laços existentes (XOR órfão×técnico e duplo órfão×órfão) ficam
intocados na lógica interna — só o SELECT de entrada muda. O gate
`somenteSeRodadaCompleta` (`:69-71`, fechamento automático) também se beneficia:
uma rodada com uma partida `'adiada'` pendente e o resto encerrado passa a
"fechar sozinha" (a adiada não é "jogo real pendente" nem "órfã resolvível" — só
fica de fora, aguardando resolução manual depois).

## 8. WhatsApp da rodada exclui partida adiada

Confirmado no código: `getTournamentClassificacao.ts:615-616` monta
`partidasAbertas` filtrando POSITIVAMENTE só `p.status !== "encerrada"` (sem
excluir `'adiada'` — comentário do próprio arquivo assume isso como
"falha-segura": status novo aparece como "em aberto" em vez de sumir, o que é
correto para o CONSOLE do dono, mas não para o convite via WhatsApp).
`confrontosTextoDaRodada.ts:25-38` (adapter que alimenta o botão "Compartilhar
rodada no WhatsApp", `src/app/dashboard/torneios/[id]/page.tsx:717-736` →
`mensagemRodada`, `src/lib/whatsapp.ts:74-96`) recebe esse array como `abertas`
e não filtra `status` de novo — logo uma partida adiada hoje entraria na
mensagem como confronto a combinar, com link `wa.me` convocando os dois
técnicos para um jogo que já foi adiado administrativamente.

Correção, cirúrgica e local ao adapter (NÃO em `partidasAbertas`, que outros
consumidores — o console do dono — precisam continuar enxergando normalmente):
em `confrontosTextoDaRodada.ts`, o filtro de `deAbertas` (`:26`, hoje `(p) =>
p.rodada === rodada && p.perna !== 2`) ganha mais uma cláusula: `&&
p.status !== "adiada"`. `PartidaAberta` já expõe `status` (usado no mapa de
`partidasAbertas` original), então nenhum SELECT novo é necessário. `deEncerradas`
não precisa de mudança (encerrada nunca é adiada).

## Riscos / pontos de atenção

- **CHECK unidirecional (§3)**: se no futuro alguém adicionar um caminho que
  ESCREVE `status = 'adiada'` fora da RPC nova, ele precisa setar
  `adiada_em`/`adiada_por` também (senão a CHECK rejeita) — documentar isso no
  comentário da CHECK no schema.
- **`closeRound` é best-effort**: como os laços existentes, erros no UPDATE só
  logam e não derrubam o fluxo — manter esse padrão para o filtro novo.
- **Corrida adiar × ação concorrente**: se dois arbitradores tentam
  simultaneamente adiar e marcar W.O. na mesma partida, o `for update`/UPDATE com
  filtro de estado em ambos os caminhos decide por ordem de chegada — o perdedor
  recebe erro claro (a RPC de adiar falha com `PARTIDA_INDISPONIVEL` se já
  `'encerrada'`; o W.O. simplesmente não encontra a linha com
  `.neq('status','encerrada')` se já foi adiada — mas adiada AINDA passa nesse
  filtro, então o W.O. venceria a corrida sobre uma adiada, o que é o
  comportamento correto e esperado: W.O. numa partida adiada é a retomada
  normal, não um conflito).

  Sub-caso via `responderWO` (aceite de solicitação, não achado pela primeira
  passada, registrado aqui para o futuro — não bloqueia esta change): um
  técnico solicita W.O.; o dono clica "Aceitar" e `responderWO`
  (`src/actions/wo.ts`) já leu a solicitação como `pendente` e está em voo
  chamando `marcarWoInterno`; CONCORRENTEMENTE um admin adia a mesma partida —
  a RPC `adiar_partida` cancela essa MESMA solicitação para `'recusado'`. O
  `marcarWoInterno` em voo ainda sucede (seu guard é `status <> 'encerrada'`,
  e `'adiada'` passa nele), então a partida fecha por W.O. com o vencedor da
  solicitação que acabou de ser cancelada — comportamento aceito ("W.O. vence
  sobre adiada" já é a regra para o caso direto). O efeito colateral é que o
  UPDATE final de `match_wo_requests` dentro de `responderWO` (que tenta
  marcar a MESMA solicitação como `'aceito'`) acha 0 linhas (já está
  `'recusado'` pela RPC de adiar) e devolve "A solicitação pode ter sido
  resolvida. Recarregue." — uma mensagem enganosa, já que o W.O. FOI aplicado
  com sucesso (só a atualização da solicitação em si perdeu a corrida). Janela
  rara (dois arbitradores agindo ao mesmo tempo na mesma partida); não exige
  mudança de código nesta change, mas fica documentado para uma revisão futura
  de UX de erro em `responderWO`.
