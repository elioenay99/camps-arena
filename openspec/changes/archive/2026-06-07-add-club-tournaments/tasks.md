# Tasks — add-club-tournaments

## 1. Banco (fonte de verdade + pendências)

- [x] 1.1 `supabase/schema.sql`: tabela `tournament_slots` (+uniques) e
      `slot_invites`; colunas `vaga_1/vaga_2` em matches + CHECK
      `matches_lado_vaga_ou_user` + índice `matches_liga_par_unico_vaga`;
      `lock_match_relations` trava vagas; trigger `lock_slot_relations`
      (team_id/tournament_id fora do rascunho)
- [x] 1.2 `supabase/schema.sql`: RPCs `aceitar_convite_vaga`/
      `info_convite_vaga`; `eh_participante` considera vagas; policies de
      slots/slot_invites; matches SELECT/INSERT/UPDATE por vaga;
      participants_delete sem congelamento (escopo avulso)
- [x] 1.3 `docs/pendencias-manuais.md`: seção 13 (limpeza de torneios de
      teste não-avulsos + Run único com tudo + checagens + rollback)

## 2. Actions e dados

- [x] 2.1 `src/actions/slots.ts` (novo): desistirDaVaga, expulsarTecnico,
      regenerarConviteVaga, assumirVagaComoDono; `src/actions/participants.ts`
      reduz ao avulso (aceitarConvite genérico; chaveEmAndamento morre)
- [x] 2.2 `createTournament`: competitivos criam vagas+convites (lote, retry
      de colisão), sem dono automático; avulso intocado; schema Zod do form
      com clubes (team ids do cache)
- [x] 2.3 iniciar liga/mata-mata/grupos + avancarFase + gerarMataMataDosGrupos
      sobre SLOT IDs (motores intocados); pré-checagens de participants morrem
- [x] 2.4 `match.ts`: propriedade por vaga (updateMatchScore/selectTeam gate);
      lifecycle inalterado no resto
- [x] 2.5 Fetchers: getTournamentClassificacao (embeds de vaga, display
      clube+técnico), getActiveMatches (avulsas + minhas vagas, 2 queries),
      getVagasDoTorneio (novo; substitui getParticipantesDoTorneio nos
      competitivos)

## 3. UI

- [x] 3.1 `TournamentForm`: passo de CLUBES (TeamSearchInput + lista de vagas)
      para competitivos
- [x] 3.2 Página do torneio: seção VAGAS (clube, técnico/vaga aberta, convite
      por clube p/ dono, expulsar/desistir); remove congelamento de lista
- [x] 3.3 `/convite/[codigo]`: resolve vaga com fallback ao genérico; aceite
      de vaga (clube exibido)
- [x] 3.4 Cards/modal/standings/bracket: lado = clube (escudo+nome) + técnico
      detalhe; convocação wa.me pelo técnico adversário
- [x] 3.5 `database.types.ts`: tabelas/colunas novas

## 4. Testes

- [x] 4.1 Actions de slots (aceite atômico 0-linhas, desistir/expulsar
      filtrados, WITH CHECK de atribuição, regenerar)
- [x] 4.2 Criação com vagas; iniciar formatos sobre vagas (fixtures novas);
      propriedade de partida por vaga; fetchers (embeds/display); convite
      (página) e UI de vagas
- [x] 4.3 Atualizar suíte existente quebrada pela migração (fixtures
      participante_*→vaga_* nos formatos gerados)

## 5. Validação e fechamento

- [x] 5.1 Gates: typecheck/lint/test/build
- [x] 5.2 Adversarial (lentes: segurança RLS/corrida/consentimento +
      integridade da migração + produto) + fixes
- [x] 5.3 Screenshots (criação com clubes, página do torneio com vagas,
      convite de vaga)
- [x] 5.4 Commits + push + CI + archive + memória + AVISAR seção 13
