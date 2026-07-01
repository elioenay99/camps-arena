# Proposal — add-placar-arbitro-no-torneio

## Why

O dono/admin/árbitro de um campeonato **não tem como lançar o placar de uma partida** pela
página de gestão do torneio (`/dashboard/torneios/[id]`, aba **Partidas**). Nessa lista
(`OpenMatchesList`) o placar é **texto read-only** (`{p.placar_1} x {p.placar_2}`) e os únicos
controles por partida são **Chamar** (WhatsApp), **W.O.** e **Encerrar**. O botão **Encerrar**
apenas congela o placar ATUAL (0×0) — não pergunta o resultado.

O único editor de placar do app (`MatchScoreModal`, via "Menu da Partida") vive no `MatchCard`
do dashboard home ("Partidas ativas"), e a fonte desse card (`getActiveMatches`) filtra por
**participação**, não por posse: só retorna partidas onde o usuário é participante avulso OU
técnico de uma vaga. Um dono que NÃO joga a partida (o caso típico de uma liga de clubes como
o Brasileirão) **nunca vê o editor** e fica sem caminho de UI para lançar o placar.

O back-end já suporta o gesto: `updateMatchScore` (`src/actions/match.ts`) grava o placar DIRETO
para quem **arbitra** o torneio (dono/admin/árbitro, com herança liga→torneio via `podeArbitrar`);
a RLS é a segunda barreira — o UPDATE do árbitro passa pela policy
`matches_update_tournament_owner` (using/with check `pode_arbitrar_torneio(tournament_id)`, sem
gate de liberação), que combina por OR com a `matches_update_participant` (estreitada ao
participante/avulso, com gate de rodada liberada). É só uma **lacuna de UI** — falta expor
o editor que já existe na tela de gestão. Pedido do dono (chat 2026-06-30, com print da aba
Partidas de "Brasileirão Série A"): "eu como admin/árbitro/dono do campeonato colocar o placar de
qualquer partida quando eu quiser" (o outro modo — jogador propõe, dono aprova — já existe e
permanece).

## What Changes

- **Editor de placar do organizador na aba Partidas** — `OpenMatchesList` passa a renderizar,
  por partida EM ABERTO, um gatilho que abre o `MatchScoreModalConnected` em **modo `direto`**
  (grava via `updateMatchScore`), visível **somente para quem arbitra** (a lista já recebe
  `mostrarEncerrar = podeArbitrarPartidas`; reusamos essa flag). O botão fica junto de
  "Encerrar". Reaproveita o modal existente (steppers +/‑, apresentação da marca) — nenhum
  componente de placar novo.

- **Sem seleção de clube, sem convocação** — o modal abre com `permitirEscolherClube={false}`
  (o clube vem do torneio) e sem lado "convocável" (sem botão "Chamar" dentro do modal — o
  atalho de convocação continua sendo o botão "Chamar" da própria linha). Placar apenas.

- **Escopo: partidas EM ABERTO** (agendada + em_andamento). Encerrada é imutável no back-end
  (`updateMatchScore` recusa) — o caminho de correção continua sendo **Reabrir** (histórico) →
  a partida volta a "em aberto" e ganha o editor. Sem editor no `MatchHistoryList`.

## Impact

- **Specs**: `match-engagement` (ADDED — a listagem de partidas em aberto oferece, a quem
  organiza, o lançamento direto do placar reusando o Menu da Partida). O contrato de
  `match-score-modal` (modo direto/proposta) já cobre o modal e permanece inalterado.
- **Componentes**: refactor de `src/features/match/components/OpenMatchesList.tsx` (monta os
  lados a partir de `PartidaAberta` e renderiza o `MatchScoreModalConnected` quando
  `mostrarEncerrar`). Reuso de `MatchScoreModalConnected`/`MatchScoreModal` (sem mudança).
- **Server Actions / RLS / Banco**: **nenhuma mudança** — `updateMatchScore` e a policy
  `matches_update_tournament_owner` (via `pode_arbitrar_torneio`) já autorizam o árbitro. Sem DDL.
- **PII**: a lista deixa de ser RSC-puro nesta linha — passa a renderizar um CLIENT component
  (`MatchScoreModalConnected`) alimentado por dados de `PartidaAberta` (que carrega `celular`
  no participante). A contenção NÃO pode mais depender só da fronteira RSC: o helper `ladoModal`
  EXCLUI deliberadamente `celular`/`mensagemWhatsApp`/`convocavel`, então nenhum telefone cruza a
  fronteira por este modal (sem botão "Chamar" interno). Um **teste anti-PII** trava isso
  (assere ausência de celular/`wa.me`/`tel:` nos props do modal). O atalho de convocação segue
  no botão "Chamar" da própria linha, com a PII embutida no link montado no servidor.
- **Testes**: `OpenMatchesList` — o gatilho de placar aparece por partida em aberto quando
  `mostrarEncerrar` é true (organizador) e NÃO aparece quando false (jogador/visitante);
  competitivo e avulso; não altera os controles existentes (Chamar/W.O./Encerrar) nem o passador.
- **Compatibilidade**: puramente aditivo — nenhuma linha/ação existente muda; jogador e
  visitante veem a lista igual. Avulso e o passador por rodada intactos.
- **Fora de escopo**: editar placar de partida ENCERRADA sem reabrir (mantém a imutabilidade +
  fluxo Reabrir); transição automática agendada→em_andamento ao lançar placar (comportamento
  atual de `updateMatchScore` preservado); qualquer mudança no modo proposta/aprovação ou em W.O.
