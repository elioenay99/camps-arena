# Design — recolher rodadas (inversa da liberação)

## Contexto verificado

- `matches.liberada_em` (`schema.sql:329`): null = oculta; `<= now()` = liberada; `> now()` = agendada. RLS do não-dono só vê `liberada_em <= now()` (`matches_select` ~1293).
- `liberarRodadas` (`tournaments.ts:1477`): UPDATE `liberada_em = now()` WHERE tournament + alvo + `.is(liberada_em, null)`; auth por `podeArbitrar`; gate `status != 'encerrado'`; notifica os jogadores das partidas liberadas.
- **Owner pode setar `liberada_em` livremente**: policy `matches_update_tournament_owner` (`schema.sql`) = `using/with check pode_arbitrar_torneio(tournament_id)`, SEM trava de coluna.
- **NENHUM dos 4 before-update triggers de matches bloqueia `liberada_em`**: `set_updated_at` (só carimba), `lock_match_relations` (cols de relação: participante/vaga/tournament/rodada/posicao/perna/grupo — não `liberada_em`), `lock_match_lifecycle` (só `status` gated a `pode_arbitrar` + placar/time/wo quando CONTINUA encerrada), `valida_resultado_mata_mata` (só age em transição de `status`). Um UPDATE que toca SÓ `liberada_em` atravessa os 4 (placar/status/relações iguais).
- `rodadasLiberacao` (`getTournamentClassificacao.ts:703`): por rodada `{ rodada, total, liberada }`, `liberada = (liberadas === total)`. `proximaRodadaOculta` = menor não totalmente liberada.

## Decisões

### D1 — Action `recolherRodadas`, espelho de `liberarRodadas`
`recolherRodadas(tournamentId, alvo)`: auth `podeArbitrar` (pré-check) + gate `status != 'encerrado'`; UPDATE `liberada_em = null` WHERE `tournament_id = X` AND **`liberada_em <= now()`** (efetivamente liberadas — espelho real de "liberada", NÃO `is not null`: a coluna tem 3 estados — null=oculta, `<=now()`=liberada, `>now()`=agendada — e recolher não deve cancelar agendamento futuro) + filtro do alvo. Retorna `{ ok, recolhidas }` contando via `.select("id")`. `revalidatePath`. **Sem notificação** (recolher esconde).

**Nota de contagem (RLS):** após `liberada_em = null` a linha fica oculta, e o `RETURNING` do `.select` só a devolve pelo ramo `pode_ver_bastidores_torneio` de `matches_select_visivel`. Como `pode_arbitrar_torneio ⊆ pode_ver_bastidores_torneio` (subconjunto verificado no schema), quem recolhe sempre vê de volta → `recolhidas` é confiável. A validação ao vivo confirma `recolhidas == nº de liberadas no alvo` (não 0).

### D2 — Recolhe mesmo partidas JÁ JOGADAS (decisão do dono)
SEM filtro por `status`: o UPDATE toca qualquer partida liberada do alvo, inclusive `encerrada`. O placar permanece gravado (o trigger só travaria mudança de placar/status, que não ocorre); some apenas da visão do não-dono pela RLS, até religar. Justificativa: o dono pediu poder voltar tudo a oculto; é reversível (basta liberar de novo).

### D3 — Alvos: `tudo`, `rodada(N)`, `faseGrupos`
`alvoRecolhimentoSchema` (discriminated union em `src/schema/liberacaoSchema.ts`):
- `{ tipo: "tudo" }` — sem filtro extra (todas as liberadas do torneio);
- `{ tipo: "rodada", rodada: N }` — `.eq("rodada", N)` (base do "recolher última");
- `{ tipo: "faseGrupos" }` — `.not("grupo", "is", null)`.
Não há `aPartirDe`/`ate` (não pedidos). Unidade canônica = `rodada`/`grupo`, igual ao liberar; avulso (sem rodada) fica fora naturalmente.

### D4 — UI no mesmo console (`LiberarRodadasButtons`)
O componente passa a renderizar liberar E recolher:
- **Liberar** (atual): quando `proximaRodadaOculta !== null`.
- **Recolher** (novo): quando `rodadasLiberacao.some(r => r.liberada)`. Botões: **"Recolher última rodada"** (`rodada = maior r.rodada com r.liberada`), **"Recolher fase de grupos"** (se `ehGrupos`), **"Recolher tudo"** (com confirmação, espelha "Liberar tudo").
- Remover o early-return "Todas as rodadas estão liberadas" (que escondia os botões): nesse estado, mostrar os de recolher.
- A "última rodada liberada" é derivada do prop `rodadasLiberacao` — **sem novo fetch nem mudança no fetcher**.

### D5 — Toast e estado de confirmação (independente!)
`recolhidas > 0` → "N partida(s) recolhida(s)."; `=== 0` → fallback ("Nada a recolher."). `useTransition` + `sonner`, igual ao liberar.

**CRÍTICO (must_fix do gate):** "Liberar tudo" e "Recolher tudo" coexistem no estado MISTO (há rodada oculta E rodada liberada). O `confirmando` booleano único de hoje colocaria AMBOS em "Confirmar?" e o confirm de um dispararia o outro. Trocar por **`confirmando: null | "liberar" | "recolher"`** — cada bloco de confirmação testa o seu valor; só um fica ativo por vez.

## Pontos de mudança (mapa)

| Camada | Arquivo | Mudança |
|---|---|---|
| Schema | `src/schema/liberacaoSchema.ts` | +`alvoRecolhimentoSchema` (`tudo`/`rodada`/`faseGrupos`) + tipo |
| Action | `src/actions/tournaments.ts` | +`recolherRodadas` (espelha `liberarRodadas`, sem notificação) |
| UI | `src/features/match/components/LiberarRodadasButtons.tsx` | liberar + recolher; remove early-return; deriva última liberada |
| Testes | `tournaments` / schema tests | alvo recolher; auth; cada filtro; idempotência; gate encerrado |

## Edge cases

- Tudo liberado: mostra só os botões de recolher (sem liberar).
- Nada liberado: mostra só liberar (sem recolher).
- Misto: mostra ambos.
- Torneio encerrado: recusado (gate `status != 'encerrado'`), igual liberar.
- Não-dono/sem capacidade: recusado (`podeArbitrar` + RLS).
- Idempotente: recolher uma rodada já oculta não muda nada (`.not(liberada_em is null)` → `is not null`).
- Recolher última quando a maior liberada tem gaps: opera só na `rodada` exata (N), não em faixa.

## Testes

- `alvoRecolhimentoSchema`: aceita as 3 variantes; rejeita `ate`/desconhecido.
- `recolherRodadas`: id/alvo inválido → erro sem banco; sem sessão → recusa; sem capacidade → recusa; torneio encerrado → recusa; sucesso por alvo (`rodada`/`faseGrupos`/`tudo`) chama UPDATE com o filtro certo + `.is not null`; conta `recolhidas`; NÃO notifica.
- (Opcional) live: psql — torneio com rodadas liberadas (1 encerrada) → recolher tudo → todas `liberada_em=null` (placar intacto) → liberar de novo volta visível.
