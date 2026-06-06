# Tasks — add-league-format

## 1. Banco (fonte de verdade + pendências)

- [x] 1.1 `supabase/schema.sql`: enum `tournament_format` (`avulso`/`liga`),
      colunas `tournaments.formato` (default `'avulso'`) e
      `tournaments.ida_e_volta` (default false), `matches.rodada` integer
      anulável + CHECK `matches_rodada_positiva` (`rodada is null or rodada >= 1`)
      — tudo idempotente, comentários explicando o porquê
- [x] 1.2 `supabase/schema.sql`: policy `matches_insert_tournament_owner`
      reescrita com a cláusula de formato (`t.formato = 'avulso' or rodada is not null`)
- [x] 1.3 `supabase/schema.sql`: `lock_match_relations` passa a travar `rodada`;
      `aceitar_convite` rejeita liga iniciada; `info_convite` ganha `formato`
      no retorno (DROP + CREATE — mudança de RETURNS TABLE) + REVOKE/GRANT
      re-aplicados após cada recriação
- [x] 1.4 `docs/pendencias-manuais.md`: nova seção 9 com o SQL completo
      (aplicar tudo de uma vez), aviso "sem isto criar torneio FALHA",
      checagens opcionais e rollback

## 2. Motor de geração (puro)

- [x] 2.1 `src/features/league/gerarTabelaLiga.ts`: método do círculo —
      N par/ímpar (folga), ida simples e ida-e-volta (espelho com lados
      invertidos, rodada contínua), determinístico, zero IO; exporta também
      helper de prévia (nº de partidas/rodadas) e `LIGA_MAX_PARTICIPANTES = 20`
- [x] 2.2 `src/features/league/gerarTabelaLiga.test.ts`: N=2, N=4 (3 rodadas,
      6 confrontos únicos, ninguém repete na rodada), N=5 (folga única por
      rodada, 10 confrontos), ida-e-volta (espelho + numeração contínua),
      determinismo, cobertura de todas as combinações via set

## 3. Schema Zod e criação de torneio

- [x] 3.1 `tournamentSchema.ts`: `formato` (`z.enum(["avulso","liga"])`,
      default avulso) + `idaEVolta` boolean default false
- [x] 3.2 `tournaments.ts` — `createTournament`: envia `formato`/`ida_e_volta`;
      liga nasce `status: 'rascunho'` (avulso omite, default do banco); testes
      de action (liga → rascunho; avulso → sem status explícito; formato
      inválido rejeitado)
- [x] 3.3 `TournamentForm.tsx`: escolha de formato (radio nativo) + checkbox
      ida-e-volta visível só em liga (estado local), textos pt-BR explicando
      rascunho/iniciar

## 4. Action iniciarTorneio

- [x] 4.1 `tournaments.ts` — `iniciarTorneio(tournamentId)`: sessão; torneio
      por filtro (dono + liga + rascunho → erro único); participantes
      confirmados 2..20; detecção de tabela já gerada (partidas com `rodada`)
      → só promove status; ordena ids por code-point; INSERT em lote único;
      UPDATE status `ativo`; revalidatePath do dashboard e da página do torneio
- [x] 4.2 Testes da action: sucesso (insere N(N-1)/2 ou N(N-1) e ativa); sem
      sessão; não-dono/avulso/não-rascunho (erro único); <2 e >20
      participantes; retry idempotente (partidas existentes → só status);
      falha do INSERT e do UPDATE viram mensagem genérica

## 5. Bloqueio de partida manual em liga

- [x] 5.1 `match.ts` — `createMatch`: select do torneio ganha `formato`;
      rejeita liga com mensagem clara; testes
- [x] 5.2 Rota `/dashboard/torneios/[id]/partidas/nova`: 404 para liga;
      seletor `/dashboard/partidas/nova` e fetcher `getOwnTournaments` filtram
      `formato = 'avulso'`; página do torneio esconde "Nova partida" em liga;
      testes dos fetchers

## 6. Página do torneio (painel Iniciar + rodadas)

- [x] 6.1 `getTournamentClassificacao`: select ganha `formato`/`ida_e_volta`
      (torneio) e `rodada` (partidas, mesma consulta); `partidasAbertas`
      ordenadas por rodada quando liga; testes de select via regex topo
- [x] 6.2 Componente `IniciarTorneioPanel` (client, useActionState): contagem
      de participantes, prévia (mesmo motor), botão desabilitado com <2,
      orientação para convidar; renderizado só para dono+liga+rascunho
- [x] 6.3 Listas de partidas (abertas/histórico): rótulo "Rodada X" quando
      `rodada` não nula; avulso intocado; testes de render

## 7. Convite (banco já coberto em 1.3)

- [x] 7.1 Página `/convite/[codigo]`: usa `formato` do `info_convite` para
      explicar liga iniciada antes do clique (botão desabilitado + mensagem);
      tipos/fetcher atualizados; testes

## 8. Validação e portões

- [x] 8.1 Conferir boundaries: nenhuma rota nova (página do torneio já tem
      loading/error próprios) — checagem explícita antes do workflow
- [x] 8.2 Workflow adversarial multi-lente (RLS/integridade, motor/matemática,
      Next/Server Actions, UX/pt-BR) + juiz; aplicar must_fix/should_fix
- [x] 8.3 Gates: `pnpm typecheck` + `pnpm lint` + `pnpm test` + `pnpm build`
- [ ] 8.4 Commits (proposal / impl / archive), push, CI verde
- [ ] 8.5 `openspec archive add-league-format`; atualizar memória e validar
      que a seção 9 das pendências está completa
