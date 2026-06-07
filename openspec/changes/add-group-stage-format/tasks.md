# Tasks — add-group-stage-format

## 1. Banco (fonte de verdade + pendências)

- [ ] 1.1 `supabase/schema.sql`: enum ganha `'grupos_mata_mata'` e
      `'fase_liga'` (CREATE TYPE com os 5 valores p/ instalações novas +
      2 ALTER TYPE ADD VALUE em Run separado), coluna
      `tournaments.classificados_por_grupo` (CHECK >= 1), coluna
      `matches.grupo` (CHECK >= 1 + CHECK `matches_grupo_ou_posicao` de
      exclusão mútua com `posicao`)
- [ ] 1.2 `supabase/schema.sql`: `lock_match_relations` trava `grupo`;
      `valida_resultado_mata_mata` cobre os 3 formatos com chave (regras só
      em partidas com `posicao` — grupo empata livre); policy
      `participants_delete_self_or_owner` cobre os 3 formatos
- [ ] 1.3 `docs/pendencias-manuais.md`: seção 12 (Run A: 2 ALTER TYPE;
      Run B: resto), nota de que sem ela os formatos novos ficam
      indisponíveis (existentes não são afetados), rollback

## 2. Motor de grupos (puro)

- [ ] 2.1 `src/features/groups/gerarFaseDeGrupos.ts`: `montarGrupos`
      (sorteio/potes/manual, equilíbrio ±1), `gerarPartidasGrupos` (compõe
      gerarTabelaLiga por grupo; rodada = rodada interna do grupo),
      `classificarGrupos` (computeStandings por subconjunto + corte K +
      sorteio na linha de corte com flag), `cruzarClassificados` (G=1 bracket
      seeding; G>=2 padrão Copa; valida G·K ∈ {2,4,8,16,32} e G ∈ {1,2,4,8}),
      `previaGrupos`, `rotuloGrupo` (A, B, C…)
- [ ] 2.2 Testes do motor: equilíbrio p/ N não-múltiplo; potes 1 cabeça/grupo;
      manual partição exata; round-robin completo por grupo sem cruzar
      grupos; classificação+corte; sorteio de corte determinístico c/ flag;
      cruzamentos pinados (Copa G=4 K=2; G=8 K=2; Champions G=1 K=8; G=2
      K=1); geometrias inválidas; prévia × simulação

## 3. Knockout generalizado (rodada-base)

- [ ] 3.1 `gerarChaveMataMata.ts`: `tamanhoChaveDasPartidas`/
      `gerarProximaFase`/`ehTerceiroLugar` derivam rodada-base (menor rodada
      das partidas com posicao); `gerarFaseInicial` ganha rodadaBase opcional
      (default 1); BracketView idem
- [ ] 3.2 Testes: chave começando em rodada 5 se comporta como em rodada 1
      (avanço, 3º lugar, rótulos, campeão); regressão dos testes existentes
      (base 1) intactos

## 4. Schema Zod, criação e actions

- [ ] 4.1 `tournamentSchema.ts`: formato ganha os 2 valores; schema do
      iniciar grupos (G, K, modo, cabecas, atribuição manual);
      `createTournament` trata os novos como gerados (rascunho, opções)
- [ ] 4.2 `tournaments.ts` — `iniciarTorneioGrupos(prev, formData)`: filtros;
      G·K válido; monta grupos por modo (randIntCrypto); INSERT lote
      (grupo+rodada); promove + grava `classificados_por_grupo` no MESMO
      update; idempotente; 23505
- [ ] 4.3 `tournaments.ts` — `gerarMataMataDosGrupos(tournamentId)`: grupos
      completos; classifica (sorteio de corte → flag na resposta); cruza;
      INSERT da chave em rodadas contínuas; pré-checagem de semeados; 23505
- [ ] 4.4 `avancarFase`: aceita os 3 formatos com chave; opera nas partidas
      com posicao (rodada-base); rejeita grupos sem chave c/ orientação
- [ ] 4.5 `participants.ts` — `chaveEmAndamento`: cobre os 3 formatos
- [ ] 4.6 Testes das actions (frentes paralelas)

## 5. UI

- [ ] 5.1 `TournamentForm`: radios Grupos+mata-mata e Fase de liga (com
      ida-e-volta/3º lugar)
- [ ] 5.2 `getTournamentClassificacao`: select + projeções `grupos`
      (tabelas por grupo via computeStandings por subconjunto) e rótulo de
      grupo nas listas; tipos
- [ ] 5.3 Painel de início de grupos (G/K/modo, prévia, validação UX) +
      botão "Gerar mata-mata" (orientativo enquanto faltam jogos; toast de
      sorteio de corte)
- [ ] 5.4 `page.tsx`: render por formato (tabelas por grupo + chave);
      `listaCongelada` cobre os formatos novos; subtítulo
- [ ] 5.5 `database.types.ts`: enum + colunas novas
- [ ] 5.6 Testes de componentes e fetcher (frentes paralelas)

## 6. Validação e fechamento

- [ ] 6.1 Gates: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
- [ ] 6.2 Workflow adversarial (4 lentes + juiz); aplicar achados; re-gates
- [ ] 6.3 Commits (proposal/impl/archive) + push + CI verde
- [ ] 6.4 Archive + memória + lembrar o usuário da seção 12
