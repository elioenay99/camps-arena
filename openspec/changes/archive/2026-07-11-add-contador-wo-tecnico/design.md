# Design — add-contador-wo-tecnico

## Princípio: a regra vive num módulo PURO em TS; o SQL só entrega eventos

A escada disciplinar é uma máquina de estados sobre uma sequência ordenada de
eventos por rodada. Para manter a regra testável, auditável e única, ela mora num
módulo puro (`src/features/standings/woStreak.ts`); o SQL apenas CLASSIFICA cada
partida encerrada do técnico e marca se ela foi perdoada. A RPC devolve os eventos
brutos, o fetcher chama `calcularStreakWo`, a UI consome o número.

```ts
export const LIMITE_WO_SEGUIDOS = 3

type EventoWo = { rodada: number; tipo: 'wo_loss' | 'wo_win' | 'jogou'; perdoado: boolean }

export function calcularStreakWo(eventos: EventoWo[]): number {
  // eventos JÁ ordenados por rodada asc
  let streak = 0
  for (const ev of eventos) {
    if (ev.tipo === 'wo_loss') {          // ausente
      if (ev.perdoado) streak = 0         // perdão zera (clean slate)
      else streak += 1
    } else {                              // 'wo_win' OU 'jogou' = PRESENTE
      if (streak < LIMITE_WO_SEGUIDOS) streak = 0   // perdão automático
      // else: travado em 3+, estar presente NÃO zera
    }
  }
  return streak
}
```

Semântica travada:
- **wo_loss não-perdoado** soma 1 (mais uma ausência consecutiva).
- **wo_loss perdoado** zera (o ADM perdoou aquele jogo: baseline limpo naquele ponto;
  wipe é o comportamento correto porque um perdão declara "conta zerada até aqui").
- **presente (jogou / wo_win)** com streak < 3 → zera (auto-perdão). Com streak ≥ 3 →
  NÃO zera (a trava disciplinar é o ponto da feature: acima do limite, só o ADM tira).

## Atribuição: reuso da máquina da carreira (janela meio-aberta)

Um jogo é do técnico pela janela de `coach_tenures`, o MESMO predicado de
`partidaNaJanela` (`src/features/standings/coachStats.ts:45-53`):
`(ini is null or rodada >= ini) and (fim is null or rodada < fim)`, com
`ini = rodada_inicio`, `fim = rodada_fim`. Isso herda de graça o escopo já
consolidado das tenures: **liga + mata-mata derivado + copa-por-clube**. Órfão /
técnico sem conta (`user_id null`) não tem streak (não há técnico a punir).

Classificação de cada partida ENCERRADA do técnico (por `matches`):
- **`wo_loss`** (W.O.-derrota, conta como ausente): `wo=true` e
  (`wo_duplo=true` OU (`wo_duplo=false` e `wo_vencedor` é a vaga OPOSTA à do técnico)).
- **`wo_win`** (W.O.-vitória, PRESENTE): `wo=true`, `wo_duplo=false`,
  `wo_vencedor` = a vaga DELE. Dispara auto-perdão igual a "jogou". NÃO é neutro.
- **`jogou`** (real, PRESENTE): `wo=false` e `status='encerrada'`.

O helper interno `wo_sofridos_do_tecnico` isola só os `wo_loss` (é o conjunto que o
perdão precisa materializar). A RPC `sequencia_disciplina_torneio` devolve TODOS os
eventos (loss/win/jogou + perdoado) porque o streak precisa dos PRESENTES para
decidir o auto-perdão.

## Modelo de dados: derivação gated + perdão persistido

### `public.wo_perdoes` (baseline de perdão)
Espelha o padrão de `coach_tenures` (`schema.sql:5763-5821`): RLS SELECT-only, sem
policy de escrita, REVOKE explícito (o Supabase AUTO-CONCEDE escrita a
anon/authenticated em tabela nova → fechar com `revoke insert,update,delete,...`).

- `id uuid pk`, `match_id → matches(id) on delete cascade`,
  `user_id → users(id) on delete cascade`,
  `tournament_id → tournaments(id) on delete cascade`,
  `perdoado_por → users(id) on delete set null`, `perdoado_em timestamptz`.
- UNIQUE `(match_id, user_id)` (idempotência do perdão). Índice `(tournament_id, user_id)`.
- SELECT gated: `pode_ver_bastidores_torneio(tournament_id) OR pode_gerir_torneio(tournament_id)`.
- Escrita SÓ via `perdoar_wo_tecnico` (`SECURITY DEFINER`).

### `wo_sofridos_do_tecnico(p_tournament_id, p_user_id) → table(match_id)`
`sql stable security definer set search_path=''`. Distinct dos `wo_loss` do técnico
em todas as tenures dele no torneio (janela meio-aberta). REVOKE total (`public,
anon, authenticated`) — só as DEFINER que precisam é que chamam. É o conjunto que o
perdão insere.

### `sequencia_disciplina_torneio(p_tournament_id) → table(user_id, slot_id, rodada, tipo, perdoado)`
`plpgsql stable security definer set search_path=''`. Gate INTERNO (DEFINER bypassa
RLS, então a autorização é explícita): `if not public.pode_gerir_torneio(...) then
raise exception 'NAO_AUTORIZADO'`. Para cada técnico com tenure ABERTA
(`encerrada_em is null`, `user_id not null`) no torneio, devolve todas as partidas
encerradas da JANELA ABERTA dele (`rodada >= rodada_inicio`, sem topo — tenure aberta
tem `rodada_fim` só como marcador de exibição, não vigência) classificadas em
`tipo` + `perdoado` (existe em `wo_perdoes`), com `slot_id` = o slot da tenure aberta
(para o botão Expulsar). Ordena por `user_id, rodada asc` (NULLS LAST). REVOKE
public/anon; GRANT execute a authenticated (o gate interno é a real defesa).

### `perdoar_wo_tecnico(p_tournament_id, p_user_id) → integer`
`plpgsql security definer set search_path=''`. Gate: `auth.uid()` não-nulo +
`pode_gerir_torneio`. Insere em `wo_perdoes` todos os `wo_sofridos_do_tecnico`
atuais (`on conflict (match_id, user_id) do nothing`), retorna `row_count` (perdões
NOVOS). NÃO toca `matches`/standings. REVOKE public/anon; GRANT execute a
authenticated.

## Tipo de `rodada`: integer, não smallint

`matches.rodada` é `integer` (`schema.sql:329`), enquanto `coach_tenures.rodada_inicio/
rodada_fim` são `smallint`. A RPC `sequencia_disciplina_torneio` devolve `rodada
integer` (o valor vem de `matches.rodada`) para evitar cast lossy; a comparação de
janela promove `smallint → integer` naturalmente. O tipo TS correspondente é `number | null`
(o tipo gerado de `matches.rodada`, nullable).

## Determinismo do streak: ORDER BY precisa ser ORDEM TOTAL

`calcularStreakWo` é um fold POSICIONAL — a ordem dos eventos muda o resultado. Ordenar
só por `(user_id, rodada)` NÃO é ordem total: num confronto de IDA-E-VOLTA as duas
pernas do técnico compartilham `rodada` E `posicao` (só diferem por `perna`), então
duas partidas ficam com chave de ordenação idêntica e o Postgres escolhe a ordem
arbitrariamente. Sobre o MESMO dado o streak final poderia sair 1 OU 3 — cruzando o
corte `LIMITE_WO_SEGUIDOS` e ligando/desligando os botões Perdoar/Expulsar. Por isso
`sequencia_disciplina_torneio` ordena por ORDEM TOTAL com colunas reais de `matches`:

```
order by ct.user_id,
         m.rodada  asc nulls last,
         m.posicao asc nulls last,
         m.perna   asc nulls first,   -- perna 1 antes da 2 no ida-e-volta
         m.id      asc                 -- desempate absoluto: ordem total sempre
```

`m.posicao` (`integer`, `schema.sql:378`) e `m.perna` (`smallint`, `schema.sql:380`)
existem; há índice único `(tournament_id, rodada, posicao, perna) where posicao is
not null` (`schema.sql:420`). `m.id` no fim garante determinismo TOTAL mesmo se todas
as outras chaves empatarem. Toda partida creditável tem `rodada` não-nula — a chave de
mata-mata grava `rodada = fase` (1-based; `gerarChaveMataMata.ts`, `coachStats.ts:41-43`)
—, então os `nulls last`/`nulls first` são apenas defensivos; o vetor real de empate é
o ida-e-volta (duas pernas, mesma rodada+posicao), resolvido por `perna` e `id`.

## EXPULSAR: RPC dedicada `expulsar_tecnico_wo`, gated por `pode_gerir_torneio`

Decisão do dono: PERDOAR **e** EXPULSAR são liberados a quem `pode_gerir_torneio`
(dono + admins de torneio/liga). A expulsão disciplinar NÃO reusa
`expulsarTecnico(slotId)` (`src/actions/slots.ts:177`), que é **dono-only** por FILTRO
(`tournaments.created_by`) e permanece INTACTA para os outros fluxos que a usam. Em vez
disso, uma RPC nova dedicada `expulsar_tecnico_wo(p_tournament_id, p_slot_id)`
(`plpgsql security definer`) faz o gate INTERNO `pode_gerir_torneio` e o
`update tournament_slots set user_id = null where id = p_slot_id and tournament_id =
p_tournament_id and user_id is not null` (o `and tournament_id = ...` amarra o slot ao
torneio contra tamper; a DEFINER roda como owner e ignora a RLS de `tournament_slots`,
por isso o gate é OBRIGATÓRIO). Retorna `row_count` (1 = expulsou, 0 = vaga já vazia).

O `set user_id = null` dispara `fn_registrar_coach_tenure` (AFTER UPDATE OF user_id),
que FECHA a tenure — o próximo técnico que assumir começa fresh (streak 0, pois
`sequencia_disciplina_torneio` lê só tenures ABERTAS). NÃO é preciso perdoar nada: o
técnico expulso some do painel; um eventual retorno abre nova tenure (streak 0). O
fetcher devolve `slotId` da tenure aberta, que a action `expulsarTecnicoWo(tournamentId,
slotId)` passa à RPC (pré-check `podeGerir` + `revalidatePath`). Ambos os botões
(Perdoar + Expulsar) aparecem juntos com `streak >= LIMITE_WO_SEGUIDOS`, na seção
gated `podeGerir` — sem flag `ehDono`.

## Casos de borda e limitações (a documentar)

- **Streak por técnico (user_id) na tenure ABERTA.** Expulsar e o técnico voltar
  depois começa FRESH (nova tenure, streak 0 por construção — os W.O. antigos ficaram
  numa tenure fechada, fora da janela aberta).
- **Perdão por `(match_id, user_id)`:** se um jogo perdoado for reaberto e re-marcado
  W.O., ele segue PERDOADO (o registro em `wo_perdoes` persiste). Edge raro, aceito
  (o baseline é intencionalmente não-destrutivo/auditável).
- **W.O.-vitória na trava:** com streak ≥ 3, vencer por W.O. (adversário faltou) NÃO
  zera — é PRESENTE mas a trava disciplinar exige ação do ADM (decisão do dono #7).
- **Duplo W.O.:** conta `wo_loss` pros DOIS técnicos ausentes (ambos somam).
- **Ida-e-volta (ordem total):** o vetor real de empate de ordenação NÃO é
  rodada-nula (toda partida creditável tem `rodada` não-nula) e sim o confronto de
  IDA-E-VOLTA — as duas pernas compartilham `rodada`+`posicao`, diferindo só por
  `perna`. Resolvido pela ORDEM TOTAL da RPC (`rodada, posicao, perna, id`); os
  `nulls last`/`nulls first` são só defensivos. Sem isso o streak seria
  não-determinístico (ver seção "Determinismo do streak").
- **W.O. na fronteira de troca de técnico:** vai para o técnico que assumiu (topo
  exclusivo da janela meio-aberta: `rodada < rodada_fim`).
- **Visibilidade herda das tenures/competição:** a seção só aparece a quem
  `podeGerir` o torneio; a leitura da sequência é gated pela RPC. Copa-por-nome /
  avulso (sem tenure) fica fora, como no resto da carreira.

## Alternativas descartadas

- **Contagem ACUMULADA (total de W.O.)** em vez de streak: rejeitada pelo dono — a
  proporcionalidade disciplinar é sobre reincidência CONSECUTIVA, não histórico
  total.
- **Perdão destrutivo (reabrir a partida / apagar o W.O.):** rejeitado — perverteria
  standings e resultados. O perdão é um baseline paralelo, auditável, que só zera a
  contagem.
- **Coluna `streak` materializada em `coach_tenures`/`tournament_slots`:** rejeitada
  — exigiria recomputar a cada W.O./jogo e sincronizar com perdão; derivar sob demanda
  (RPC + módulo puro) é mais simples e sem risco de dessincronização.
- **Auto-expulsão ao estourar o limite:** rejeitada — expulsar é decisão humana do
  ADM; a máquina só sinaliza e trava o auto-perdão.
