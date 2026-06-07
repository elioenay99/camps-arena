# Design — add-rounds-walkover

## Princípio: caminho de menor mudança sobre os invariantes existentes

O modelo já tem `matches.rodada` (imutável), motores PUROS agnósticos a id,
triggers de lock e RLS por linha. O change adiciona W.O. e fechamento de
rodada sem criar tabela de rodadas nem 4º status — preservando todo o
lifecycle e a RLS atuais.

## 1. Representação do W.O. (D1)

`matches` ganha:
- `wo boolean not null default false`
- `wo_vencedor uuid null references public.tournament_slots (id) on delete restrict`

Um W.O. é uma partida `status = 'encerrada'`, `wo = true`, `placar_1 = 0`,
`placar_2 = 0`, `wo_vencedor` = o slot vencedor (sempre um dos lados da
partida). Placar `0x0` no banco respeita "ZERO gols" (decisão 9); o vencedor é
EXPLÍCITO (cobre órfão E não-comparecimento sem heurística de placar).

CHECK de coerência: `wo` ⇒ `wo_vencedor` não-nulo, placar 0x0, e `wo_vencedor`
∈ {vaga_1, vaga_2}. Fora de W.O. (`wo=false`), `wo_vencedor` é nulo. (a
partida competitiva usa vaga_*; o avulso nunca recebe W.O. — fora de escopo.)

```sql
constraint matches_wo_coerente check (
  (wo = false and wo_vencedor is null)
  or (wo = true and wo_vencedor is not null and placar_1 = 0 and placar_2 = 0
      and wo_vencedor in (vaga_1, vaga_2))
)
```

## 2. Rodada ativa e fechamento (D3)

**Rodada ativa = DERIVADA**, não persistida: `MIN(rodada)` entre partidas com
`status <> 'encerrada'` do torneio (alinha com a ordenação já existente em
`getTournamentClassificacao`). Sem tabela `tournament_rounds`, sem coluna
`rodada_atual`.

**Fechar rodada** não muda estado de rodada — é a action `fecharRodada(
tournamentId, rodada)` que:
1. valida dono + torneio ativo (filtro, padrão `mudarStatusComoDono`);
2. lê as partidas abertas (`status <> 'encerrada'`) daquela rodada com os
   `user_id` dos dois slots (join `tournament_slots`);
3. para cada partida aberta cujo ADVERSÁRIO de um lado COM técnico é ÓRFÃO
   (o outro slot `user_id IS NULL`): marca W.O. automático (vencedor = lado
   com técnico). Partida órfã×órfã: W.O. impossível (ninguém venceria) — fica
   aberta, registrada;
4. partidas abertas entre dois clubes COM técnico NÃO são tocadas (o resultado
   real ou um W.O. manual decide).

**Fechamento automático** (decisão 6): ao `updateMatchScore`/`encerrarPartida`
encerrar a ÚLTIMA partida não-órfã da rodada, dispara a mesma varredura de
órfãs. Implementado chamando a varredura (helper compartilhado) ao final do
encerramento, quando não resta nenhuma partida aberta entre clubes com técnico
naquela rodada.

Mata-mata: "rodada" = fase. O fechamento de fase já tem o `avancarFase`; W.O.
de órfão numa fase aberta segue o mesmo `fecharRodada` (a varredura é por
`rodada`, serve fase também). O bye já cobre o caso de geração; W.O. cobre o
caso de órfão que surge DEPOIS (desistência no meio).

## 3. Efeito nos motores (D5 + decisão 9)

### computeStandings
`PartidaClassificavel` ganha `woVencedor: string | null` (id opaco do slot
vencedor; null = jogo normal). No loop de acumulação:
- se `woVencedor !== null`: o vencedor recebe `regras.vitoria` + `vitorias++`;
  o perdedor `regras.derrota` + `derrotas++`; **golsPro/golsContra NÃO mudam**
  (zero gols/saldo — decisão 9). `jogos` conta (vit+der).
- senão: ramo atual por placar (intocado).

No confronto direto (`pontosConfronto`): se a partida entre os dois é W.O.,
soma `vitoria` ao `woVencedor` e `derrota` ao outro — NÃO empate pelo `0x0`
(senão o `0x0` contaria como empate e contradiria a vitória nos pontos, risco
4 do briefing).

`ehElegivel` permanece: W.O. de órfão tem os DOIS lados preenchidos (vaga_1 e
vaga_2 existem; o órfão só não tem técnico) → elegível. Não confundir com bye
de chave (`vaga_2` literalmente null), filtrado fora.

### decidirConfronto (chave)
`PartidaJogada` ganha `woVencedor: string | null`. Em `decidirConfronto`:
- jogo único: se `woVencedor`, retorna `{ vencedor: woVencedor, perdedor: o
  outro lado }` antes da comparação de placar (evita o `null` por `0x0`).
- ida-e-volta: se ALGUMA perna presente tem `woVencedor` encerrado, decide o
  confronto INTEIRO por ela (D5 + decisão 9: "decide o confronto inteiro") —
  sem exigir a outra perna nem agregado. Se nenhuma perna é W.O., agregado
  normal (intocado).

### Trigger valida_resultado_mata_mata
Early-return quando `v_encerrando and new.posicao is not null and new.wo`:
hoje `0x0` em jogo único seria rejeitado como empate (linha 518) e o agregado
empatado na volta (532). O W.O. é decisão explícita (`wo_vencedor`), não
precisa de validação de placar. Mesma natureza do bypass de bye (514-516).

### TODOS os consumidores dos motores projetam `wo`/`wo_vencedor`
Os motores leem `woVencedor` (id opaco do slot). QUALQUER leitura de `matches`
que alimente `computeStandings`/`classificarGrupos` ou `decidirConfronto`/
`gerarProximaFase` DEVE projetar `woVencedor: p.wo ? p.wo_vencedor : null` —
senão o `0x0` do W.O. vira empate (classificação) ou jogo sem vencedor (chave).
Consumidores: o fetcher `getTournamentClassificacao` (exibição/chave) **e** as
actions `avancarFase` (avanço de fase da chave) e `gerarMataMataDosGrupos`
(promoção dos grupos → corte de classificação). Os três projetam o W.O.

## 4. Fluxo de solicitação de W.O. (D2 + D4)

Dois caminhos da decisão 8:

**Adm marca direto** — `marcarWO(matchId, vencedorSlotId)`:
- valida dono via filtro (padrão `mudarStatusComoDono`); partida ABERTA
  (`status <> 'encerrada'`) do torneio ATIVO;
- `vencedorSlotId` ∈ {vaga_1, vaga_2} da partida (D2: o adm aponta);
- UPDATE `wo=true, wo_vencedor, placar 0x0, status='encerrada'` num único
  statement (não bate no lock de imutabilidade — `old.status <> 'encerrada'`);
- RLS `matches_update_tournament_owner` já cobre.

**Adversário solicita** — tabela `match_wo_requests`:
```
id uuid pk, match_id uuid fk matches, solicitante_slot uuid fk tournament_slots,
motivo text null, status text ('pendente'|'aceito'|'recusado') default 'pendente',
created_at, resolved_at timestamptz null
unique (match_id) where status = 'pendente'   -- uma solicitação viva por partida
```
- `solicitarWO(matchId)`: o técnico de um lado da partida ABERTA registra a
  solicitação (o vencedor pretendido é o PRÓPRIO slot — ele diz "o adversário
  não veio, eu ganho"). RLS INSERT: o solicitante é técnico de um dos slots da
  partida (via função SECURITY DEFINER, espelha `eh_participante`).
- `responderWO(requestId, aceito)`: o DONO resolve. Aceito → reusa `marcarWO`
  com `vencedorSlotId = solicitante_slot` (D2: o vencedor no fluxo de
  solicitação é quem pediu) + marca request `aceito`. Recusado → só marca
  `recusado`.
- RLS SELECT: técnico do próprio slot vê a própria; o dono vê todas do torneio.

## 5. Reabrir W.O.

`reabrirPartida` (existente) volta a partida W.O. para aberta. O UPDATE de
reabertura deve LIMPAR `wo=false, wo_vencedor=null` (senão o CHECK
`matches_wo_coerente` rejeitaria `wo=true` com status não-encerrado). Na chave,
o trigger de congelamento de fase já barra reabrir se a fase seguinte existe.

## 6. Riscos e mitigações (do briefing)

1. **Trigger de decisividade** rejeitaria W.O. `0x0` na chave → early-return
   `if new.wo`. CRÍTICO, sem ele W.O. em mata-mata é impossível.
2. **decidirConfronto retorna null em empate** → ramo `woVencedor` antes da
   comparação de placar.
3. **Lock de imutabilidade**: W.O. só sobre partida ABERTA (encerra junto);
   correção = reabrir→marcar (não converter encerrada normal direto).
4. **computeStandings somaria gols do 0x0** → ramo W.O. pula gols E trata o
   confronto direto.
5. **ehElegivel exige dois lados**: órfão É elegível (slot preenchido, técnico
   null); bye (vaga null) continua filtrado.
6. **Índices de par**: W.O. NÃO cria linha — só atualiza a existente. Sem
   risco de duplicata.
7. **Congelamento de fase**: não marcar W.O. em partida de fase congelada. O
   trigger faz early-return em `wo` (não barra), então a ACTION é a barreira:
   `marcarWoInterno` valida, para partida de CHAVE, que não há fase posterior
   gerada E que a OUTRA perna do confronto não foi decidida por W.O. (W.O.
   decide o confronto inteiro — um 2º W.O. seria contraditório). Cobre o adm
   direto e o aceite de solicitação (ambos reusam `marcarWoInterno`).
8. **Torneio encerrado**: action de W.O., fechar rodada e a tabela de requests
   exigem torneio ATIVO (espelham as checagens existentes).
9. **Vaga imutável**: W.O. NÃO toca slots — só decide a partida.
10. **Promote-first dos grupos**: fechar rodada restrito a torneio `ativo`.

## 7. Decisões assumidas (defaults, fora das 4 perguntas)

- **D1**: `wo boolean` + `wo_vencedor uuid` (vencedor explícito).
- **D5**: W.O. decide o confronto inteiro em ida-e-volta.
- **D7**: W.O. conta como semifinal válida; o perdedor por W.O. vai ao 3º
  lugar (consistente com "W.O. decide o confronto"). `decidirConfronto` já
  devolve `perdedor` no W.O., então `gerarProximaFase` gera o 3º lugar normal.
