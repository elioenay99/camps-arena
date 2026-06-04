## Why

Último item do Tier 2 e gap funcional descoberto no mapeamento: **nenhuma tela encerra uma partida** — `updateMatchScore` só mexe no placar, e o status `encerrada` (que alimenta classificação e histórico) só muda direto no banco. Pior: a RLS de UPDATE é por LINHA, então um participante hoje conseguiria encerrar (ou reabrir!) a própria partida por POST direto, e alterar o placar de partida já encerrada — last-write-wins sem rastro. Decisões de produto do usuário (2026-06-04): **só o dono do torneio encerra** (modelo árbitro) e **o dono pode reabrir** uma encerrada para correção.

## What Changes

- **DDL — policy nova**: `matches_update_tournament_owner` — o dono do torneio ganha UPDATE nas partidas dele (policies são OR: participantes seguem lançando placar).
- **DDL — trigger `lock_match_lifecycle`** (defesa em profundidade, espelhando `lock_match_relations`):
  - `status` só muda pelo DONO do torneio (`t.created_by = auth.uid()`); `service_role` livre.
  - Partida `encerrada` não aceita mudança de placar (nem por participante, nem pelo dono — o fluxo é reabrir → corrigir → re-encerrar).
- **Server Actions** (`src/actions/match.ts`): `encerrarPartida(matchId)` e `reabrirPartida(matchId)` — sessão + propriedade do TORNEIO conferida no servidor; transições válidas (`não-encerrada → encerrada`; `encerrada → em_andamento`); `revalidatePath` do dashboard e da página do torneio.
- **`updateMatchScore` endurecida**: rejeita placar em partida `encerrada` (espelho do trigger, com mensagem precisa).
- **Fetcher** (`getTournamentClassificacao`): `torneio` ganha `created_by` (a página decide se o usuário é o dono); retorno ganha `partidasAbertas` (quarta projeção — não-encerradas, com nomes/placar/status/id).
- **UI — página do torneio**: seção "Partidas em aberto" (visível a todos; botão **Encerrar** só para o dono) e botão **Reabrir** nas linhas do histórico (só dono). Folha client `MatchStatusButton` (action + toast, padrão do `MatchScoreModalConnected`).
- **Testes**: actions novas (propriedade, transições, erros), endurecimento do score, projeção nova do fetcher.

## Capabilities

### New Capabilities
- `match-lifecycle`: encerramento e reabertura de partida pelo dono do torneio.

### Modified Capabilities
- `match-mutations`: placar bloqueado em partida encerrada.
- `row-level-security`: dono do torneio ganha UPDATE; status/placar-pós-encerrada travados por trigger.
- `standings-page`: fetcher devolve `partidasAbertas` + `created_by`.

## Impact

- **Código**: `src/actions/match.ts` (+2 actions, +guard no score, +testes), `getTournamentClassificacao.ts` (+projeção, +teste), `src/features/match/components/MatchStatusButton.tsx` (novo, client), página do torneio (+seção/botões).
- **Banco (DDL manual)**: 1 policy + 1 trigger/função. **needs_db = true** — seção 7 do `docs/pendencias-manuais.md`. **Sem o DDL**: encerrar/reabrir pela app falha com mensagem genérica (RLS nega UPDATE ao dono); o trigger fecha o buraco de participante encerrando por POST direto.
- **Fecha vulnerabilidade latente**: participante alterando status/placar-de-encerrada por POST direto (hoje possível — a RLS de UPDATE não restringe colunas).
- **Fora de escopo**: notificação ao participante quando encerra/reabre (Tier 3, re-engajamento); confirmação dupla (decidido contra); edição de placar pelo dono via UI (ele reabre e o participante corrige; arbitragem direta fica para depois).
