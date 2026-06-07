# Tasks — add-rounds-walkover

## 1. Banco (fonte de verdade + pendências)

- [x] 1.1 `supabase/schema.sql`: `matches.wo boolean default false` +
      `wo_vencedor uuid` (FK slots, on delete restrict) + CHECK
      `matches_wo_coerente`; tabela `match_wo_requests` (+ índice único parcial
      de pendente por partida)
- [x] 1.2 `supabase/schema.sql`: early-return W.O. em `valida_resultado_mata_mata`
      (encerrando chave com `wo`); `reabrirPartida` limpa wo/wo_vencedor (via
      action — o lock não barra pois encerra→aberta); policies de
      `match_wo_requests` (INSERT técnico do lado / SELECT solicitante+dono /
      UPDATE dono / DELETE negado) + função SECURITY DEFINER `eh_tecnico_da_partida`
- [x] 1.3 `docs/pendencias-manuais.md`: seção 14 (Run único + checagens + rollback)

## 2. Motores (puros)

- [x] 2.1 `computeStandings`: `PartidaClassificavel.woVencedor`; ramo W.O.
      (vitória/derrota nos pontos, zero gols); confronto direto por W.O.
- [x] 2.2 `gerarChaveMataMata` (`decidirConfronto`): `PartidaJogada.woVencedor`;
      W.O. decide jogo único e o ida-e-volta inteiro (qualquer perna)

## 3. Actions e dados

- [x] 3.1 `src/actions/wo.ts` (novo): `marcarWO(matchId, vencedorSlotId)`,
      `solicitarWO(matchId)`, `responderWO(requestId, aceito)` (RPC/filtro);
      `fecharRodada(tournamentId, rodada)` com varredura de órfãs
- [x] 3.2 `match.ts`: encerramento dispara varredura de órfãs da rodada quando
      não resta partida aberta entre clubes com técnico (fechamento automático);
      `reabrirPartida` limpa wo/wo_vencedor
- [x] 3.3 `getTournamentClassificacao`: embeda `wo`/`wo_vencedor` (motor +
      projeções); identifica órfão por lado; rodada ativa derivada; carrega
      solicitações pendentes (dono); `database.types.ts` atualizado

## 4. UI

- [x] 4.1 `OpenMatchesList` → agrupado por rodada (`RodadaSection`): cabeçalho +
      botão "Fechar rodada N" (dono, rodada ativa); avulso mantém lista plana
- [x] 4.2 Ação W.O. na partida: adm marca (escolhe vencedor); adversário
      "Solicitar W.O."; folhas client + toast + revalidate
- [x] 4.3 Console de solicitações pendentes do dono (aceitar/recusar);
      rótulo "W.O." no histórico e na chave (BracketView/MatchHistoryList)

## 5. Testes

- [x] 5.1 `computeStandings` W.O. (pontos sem gols; confronto direto; órfão
      elegível); `decidirConfronto` W.O. (jogo único e ida-e-volta)
- [x] 5.2 Actions: marcarWO (gate dono/aberta/vencedor∈lados), fecharRodada
      (varredura de órfãs, disputável intacta, órfão×órfão), solicitar/responder
      (RLS/atomicidade/uma pendente)
- [x] 5.3 Fetcher (embeds wo + rodada ativa + solicitações); UI (agrupamento por
      rodada, botões por papel, rótulo W.O.)

## 6. Validação e fechamento

- [x] 6.1 Gates: typecheck/lint/test/build
- [x] 6.2 Adversarial (lentes: RLS/solicitação, corrida do fechamento, motor
      W.O. + chave, produto/UX, integridade) + fixes
- [x] 6.2.1 Revisão adversarial em workflow (6 lentes + verificação cética +
      crítico de completude). Achou e corrigiu 3 defeitos reais (mesma raiz: um
      consumidor dos motores sem projetar `wo`/`wo_vencedor`):
      `avancarFase` (chave travava/avançava errado) e `gerarMataMataDosGrupos`
      (W.O. contava como empate na promoção → classificava o clube errado);
      mais o guard de fase congelada / 2º W.O. contraditório em `marcarWoInterno`
      (risco 7). +5 testes de regressão (provados falhar sem o fix).
- [ ] 6.3 Screenshots (rodadas agrupadas, marcar/solicitar W.O., histórico W.O.)
      — validação visual manual do usuário (pendente).
- [x] 6.4 Commits + push + CI + archive + memória + AVISAR seção 14
