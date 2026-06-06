# Tasks — add-knockout-format

## 1. Banco (fonte de verdade + pendências)

- [ ] 1.1 `supabase/schema.sql`: enum ganha `'mata_mata'` (nota: ALTER TYPE em
      bloco separado), coluna `tournaments.terceiro_lugar` (default false),
      colunas `matches.posicao` integer e `matches.perna` smallint anuláveis
      + CHECKs (`posicao >= 1`, `perna in (1,2)`) — idempotente, comentários
      explicando o porquê
- [ ] 1.2 `supabase/schema.sql`: índice único parcial
      `matches_mata_mata_slot_unico` em `(tournament_id, rodada, posicao,
      perna)` `NULLS NOT DISTINCT where posicao is not null`
- [ ] 1.3 `supabase/schema.sql`: `lock_match_relations` passa a travar
      `posicao`/`perna`; novo trigger `valida_resultado_mata_mata` (empate em
      jogo decisivo; volta exige ida encerrada + agregado desempatado;
      reabertura bloqueada com fase posterior ou em bye; `service_role`
      isento); `aceitar_convite` rejeita formato gerado fora de rascunho
      (REVOKE/GRANT re-aplicados)
- [ ] 1.4 `docs/pendencias-manuais.md`: nova seção 10 — bloco A (ALTER TYPE)
      separado do bloco B (resto), aviso "sem isto criar torneio FALHA",
      checagens recomendadas e rollback documentado

## 2. Motor de chaveamento (puro)

- [ ] 2.1 `src/features/knockout/gerarChaveMataMata.ts`: tamanho da chave
      (próxima potência de 2), montagem de slots por modo (`sorteio` com
      Fisher-Yates e `randInt` injetado; `potes` cruzando cabeças × demais;
      `manual` validando partição exata), ≤1 bye por confronto, geração da
      fase 1 (pernas em ida-e-volta, byes já encerrados), vencedor de
      confronto (bye/placar/agregado), geração da fase seguinte (pareamento
      2i−1 × 2i; semifinal → final + 3º lugar quando aplicável; final/3º
      sempre jogo único), `previaMataMata` (fórmulas fechadas), rótulos de
      fase, `MATA_MATA_MAX_PARTICIPANTES = 32`
- [ ] 2.2 `src/features/knockout/gerarChaveMataMata.test.ts`: N potência e
      não-potência (byes ≤1 por confronto, contagem N−1 de confrontos reais),
      determinismo com randInt fixo, potes (todo confronto tem 1 cabeça;
      tamanhos inválidos rejeitados), manual (partição exata; repetido/faltando
      rejeitado), ida-e-volta (2 pernas espelhadas; final/3º jogo único),
      vencedores (placar, agregado, bye), semifinal-bye não gera 3º lugar
      (N=3), prévia bate com simulação para todos os N de 2 a 32

## 3. Schema Zod e criação de torneio

- [ ] 3.1 `tournamentSchema.ts`: `formato` ganha `"mata_mata"`,
      `terceiroLugar` boolean default false; schema novo do iniciar mata-mata
      (modo + cabeças/confrontos)
- [ ] 3.2 `tournaments.ts` — `createTournament`: mata-mata nasce `rascunho`,
      envia `terceiro_lugar`; normalização server-side (opções zeradas fora
      do formato); testes (mata-mata → rascunho + opções; terceiro_lugar
      zerado fora de mata-mata)
- [ ] 3.3 `TournamentForm.tsx`: radio Mata-mata + checkboxes ida-e-volta
      (liga e mata-mata) e 3º lugar (só mata-mata), textos pt-BR

## 4. Actions de início e avanço

- [ ] 4.1 `tournaments.ts` — `iniciarMataMata(prev, formData)`: sessão;
      torneio por filtro (dono + mata_mata + rascunho → erro único);
      participantes 2..32 (potes: 4/8/16/32 + N/2 cabeças; manual: partição
      exata); monta slots (randInt de crypto sem viés de módulo); INSERT em
      lote único (fase 1 + byes encerrados) → promove `ativo`; retry
      idempotente; 23505 → "recarregue"; revalidatePath
- [ ] 4.2 `tournaments.ts` — `avancarFase(tournamentId)`: dono + mata_mata +
      ativo por filtro; fase atual = max(rodada); todas encerradas (pernas
      inclusive); vencedores por slot; semifinal → final (+3º lugar quando
      ambos os perdedores são reais); final encerrada → "torneio decidido";
      INSERT em lote; 23505 → "fase já avançada"; revalidatePath
- [ ] 4.3 Testes das duas actions: caminhos felizes por modo, validações,
      idempotência, 23505, sem sessão, erro único de propriedade

## 5. Lifecycle (encerrar/reabrir) com regras de mata-mata

- [ ] 5.1 `match.ts` — `encerrarPartida`: em mata-mata, jogo único rejeita
      empate; perna 2 exige perna 1 encerrada e agregado desempatado
      (mensagens pt-BR); `reabrirPartida`: rejeita bye e fase posterior
      existente; `createMatch`: gate `formato !== 'avulso'`
- [ ] 5.2 Testes: empate bloqueado, perna 1 empatada ok, volta antes da ida,
      agregado empatado, reabrir pós-avanço, reabrir bye, createMatch
      mata-mata rejeitado

## 6. UI — página do torneio e painel de início

- [ ] 6.1 `getTournamentClassificacao`: select ganha `posicao`/`perna` e
      `terceiro_lugar`; tipos atualizados
- [ ] 6.2 `src/features/knockout/components/BracketView.tsx` (RSC puro):
      colunas por fase com rótulos, confrontos com nomes/placar (agregado em
      ida-e-volta), bye rotulado, fases futuras "a definir", campeão
      destacado, overflow-x
- [ ] 6.3 Painel de início do mata-mata (modos sorteio/potes/manual com
      prévia via `previaMataMata`; forms com inputs nativos) + botão
      "Avançar fase" para o dono (fase completa)
- [ ] 6.4 `page.tsx` do torneio: mata-mata renderiza BracketView no lugar de
      StandingsTable/clubes; mantém partidas em aberto + histórico (byes
      rotulados); painel de início por formato
- [ ] 6.5 `database.types.ts`: `TournamentFormat` ganha `"mata_mata"`,
      `tournaments.terceiro_lugar`, `matches.posicao`/`perna`
- [ ] 6.6 Boundaries: conferir loading/error das rotas tocadas (lição
      recorrente — toda rota nova/alterada precisa dos próprios boundaries)

## 7. Validação e fechamento

- [ ] 7.1 Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] 7.2 Workflow adversarial multi-agente (4 lentes + juiz); aplicar
      must_fix/should_fix procedentes e re-rodar gates
- [ ] 7.3 Commits (proposal/impl/archive) + push + CI verde
- [ ] 7.4 `openspec archive add-knockout-format` + atualizar memória e
      lembrar o usuário da seção 10
