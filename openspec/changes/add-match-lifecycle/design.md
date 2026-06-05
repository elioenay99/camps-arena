# Design — add-match-lifecycle

## Contexto

Decisões de produto do usuário: **só o dono do torneio encerra** (árbitro) e **dono reabre** para correção (placar de encerrada é imutável até reabrir). Hoje a RLS de UPDATE de `matches` é por linha (participantes), sem restrição de coluna — participante pode mudar `status` e placar de encerrada por POST direto. A change fecha isso com trigger (mesma técnica do `lock_match_relations`).

## Decisões

### D1 — Policy OR + trigger para semântica de coluna

RLS não restringe colunas; a divisão de papéis fica:
- **Policy** `matches_update_tournament_owner` (nova): dono do torneio pode UPDATE nas partidas dele. OR com `matches_update_participant` — participante segue lançando placar.
- **Trigger** `lock_match_lifecycle` (novo): (a) `status` só muda quando `auth.uid()` é o dono do torneio; (b) com `old.status = 'encerrada'`, placar E CLUBE (`time_1/2`) não mudam para NINGUÉM (o fluxo é reabrir → corrigir → re-encerrar) — clube alimenta a classificação de clubes, então em encerrada é tão imutável quanto o placar. `service_role` isento (migrations/correções administrativas). Espelha o padrão `lock_match_relations` (security definer, search_path vazio, checagem de claims).

### D2 — Transições explícitas, duas actions

`encerrarPartida` (qualquer não-encerrada → `encerrada`) e `reabrirPartida` (`encerrada` → `em_andamento`). Sem action genérica de "setar status": transições nomeadas são auditáveis e impedem estados sem sentido (reabrir para `agendada` apagaria a história de que já foi jogada). Propriedade conferida por consulta ao torneio com filtro `created_by = user.id` (padrão D4 do match-creation — sem oráculo).

### D3 — `updateMatchScore` e `updateMatchTeams` rejeitam encerrada na action

O trigger é a barreira final, mas as actions devolvem mensagem precisa ("partida encerrada não aceita placar/clube") em vez do erro genérico de UPDATE 0 linhas. Os fetches de propriedade passam a selecionar `status` e `tournament_id` — e AMBAS revalidam também a página do torneio (`/dashboard/torneios/[id]`), que agora exibe placar ao vivo (partidas em aberto) e classificação de clubes.

### D4 — Quarta projeção: `partidasAbertas`

A página do torneio é o console do dono. A MESMA query (snapshot único) ganha a projeção das não-encerradas (id, nomes, placar, status) para a seção "Partidas em aberto". `torneio.created_by` entra no select — a página compara com `user.id` e só renderiza os botões de dono (a RLS continua sendo a barreira real; o botão é UX).

### D5 — `MatchStatusButton` client com toast

Botões Encerrar/Reabrir chamam as actions e exibem erro via sonner (padrão `MatchScoreModalConnected`); sucesso revalida via `revalidatePath` nas actions (dashboard + página do torneio). Sem confirmação nativa (`confirm()`) nem duplo estado de botão: a ação é reversível (reabrir existe), um clique basta.

### D6 — Torneio `encerrado` congela o lifecycle das partidas

Reabrir partida de torneio encerrado seria beco sem saída: ela sai da classificação/histórico e NÃO volta ao dashboard (`getActiveMatches` filtra torneio encerrado) — ficaria invisível e ineditável. Por isso o filtro de propriedade das actions inclui `.neq("status", "encerrado")` (mesma resposta única) e a página só mostra os botões com `torneio.status !== 'encerrado'`. Encerrar partida em torneio encerrado também é bloqueado (coerente com a policy de INSERT).

### D7 — `updated_at` agora é o momento real do encerramento

Fecha a precondição do D2 do match-history: com transições explícitas, o UPDATE de status dispara `set_updated_at` (alfabeticamente o ÚLTIMO dos três BEFORE UPDATE), então `encerradaEm` do histórico passa a refletir o instante do (re)encerramento. Mantém-se `updated_at` — coluna dedicada `encerrada_em` segue desnecessária.

## Riscos

- **Sem o DDL aplicado**: encerrar/reabrir falham com mensagem genérica (RLS nega UPDATE ao dono) — documentado na seção 7 das pendências; o app continua íntegro.
- **Dono também participante**: acumula os dois papéis — pode lançar placar E encerrar. Correto no modelo árbitro-jogador (comum em racha).
- **Corrida encerrar × placar**: participante salva placar no instante do encerramento — o UPDATE do placar chega depois do status: trigger bloqueia (old.status já é encerrada). Falha-segura.
- **Torneio sem dono (`created_by` NULL, semeados/legados)**: lifecycle congelado — ninguém encerra/reabre pela app (console não aparece, RLS nega); só `service_role` corrige. Coerente com o modelo de posse.
- **Cenários negativos do trigger não são unit-testáveis** (os testes mockam o client): a verificação fica no item 7.2 das pendências (checagem manual negativa via SQL).
