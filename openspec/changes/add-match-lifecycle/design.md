# Design — add-match-lifecycle

## Contexto

Decisões de produto do usuário: **só o dono do torneio encerra** (árbitro) e **dono reabre** para correção (placar de encerrada é imutável até reabrir). Hoje a RLS de UPDATE de `matches` é por linha (participantes), sem restrição de coluna — participante pode mudar `status` e placar de encerrada por POST direto. A change fecha isso com trigger (mesma técnica do `lock_match_relations`).

## Decisões

### D1 — Policy OR + trigger para semântica de coluna

RLS não restringe colunas; a divisão de papéis fica:
- **Policy** `matches_update_tournament_owner` (nova): dono do torneio pode UPDATE nas partidas dele. OR com `matches_update_participant` — participante segue lançando placar.
- **Trigger** `lock_match_lifecycle` (novo): (a) `status` só muda quando `auth.uid()` é o dono do torneio; (b) com `old.status = 'encerrada'`, placar não muda para NINGUÉM (o fluxo é reabrir → corrigir → re-encerrar). `service_role` isento (migrations/correções administrativas). Espelha o padrão `lock_match_relations` (security definer, search_path vazio, checagem de claims).

### D2 — Transições explícitas, duas actions

`encerrarPartida` (qualquer não-encerrada → `encerrada`) e `reabrirPartida` (`encerrada` → `em_andamento`). Sem action genérica de "setar status": transições nomeadas são auditáveis e impedem estados sem sentido (reabrir para `agendada` apagaria a história de que já foi jogada). Propriedade conferida por consulta ao torneio com filtro `created_by = user.id` (padrão D4 do match-creation — sem oráculo).

### D3 — `updateMatchScore` rejeita encerrada na action

O trigger é a barreira final, mas a action devolve mensagem precisa ("partida encerrada não aceita placar") em vez do erro genérico de UPDATE 0 linhas. O fetch de propriedade que a action já faz passa a selecionar `status`.

### D4 — Quarta projeção: `partidasAbertas`

A página do torneio é o console do dono. A MESMA query (snapshot único) ganha a projeção das não-encerradas (id, nomes, placar, status) para a seção "Partidas em aberto". `torneio.created_by` entra no select — a página compara com `user.id` e só renderiza os botões de dono (a RLS continua sendo a barreira real; o botão é UX).

### D5 — `MatchStatusButton` client com toast

Botões Encerrar/Reabrir chamam as actions e exibem erro via sonner (padrão `MatchScoreModalConnected`); sucesso revalida via `revalidatePath` nas actions (dashboard + página do torneio). Confirmação nativa (`confirm()`) NÃO — usa-se o padrão de duplo estado do botão? Não: ação é reversível (reabrir existe), um clique basta.

## Riscos

- **Sem o DDL aplicado**: encerrar/reabrir falham com mensagem genérica (RLS nega UPDATE ao dono) — documentado na seção 7 das pendências; o app continua íntegro.
- **Dono também participante**: acumula os dois papéis — pode lançar placar E encerrar. Correto no modelo árbitro-jogador (comum em racha).
- **Corrida encerrar × placar**: participante salva placar no instante do encerramento — o UPDATE do placar chega depois do status: trigger bloqueia (old.status já é encerrada). Falha-segura.
