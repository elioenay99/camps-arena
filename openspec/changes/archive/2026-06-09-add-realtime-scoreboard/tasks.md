# Tasks — add-realtime-scoreboard

## 1. Config manual (fonte de verdade + pendências)

- [ ] 1.1 `supabase/schema.sql`: registrar (comentado/seção Realtime) que
      `public.matches` é publicada em `supabase_realtime`; RLS reusada.
- [ ] 1.2 `docs/pendencias-manuais.md`: nova seção 16 — Run único
      (`alter publication supabase_realtime add table public.matches`) + checagem
      (dois navegadores: placar muda sozinho) + rollback (`drop table` da publication).

## 2. Camada de tempo real (cliente)

- [ ] 2.1 `src/features/match/live/LiveMatchesProvider.tsx` (client): assina UM
      canal `postgres_changes` UPDATE de `matches` via `@/lib/supabase/client`;
      estado `Map<id, {placar_1, placar_2, status}>` semeado por `initial`;
      ignora ids fora do mapa; `removeChannel` no cleanup. Context + hook
      `useLiveMatch(id)`.
- [ ] 2.2 `src/features/match/live/LiveScore.tsx` (client): lê `useLiveMatch` e
      mostra `placar_field` vivo (fallback no `initial`). `tabular-nums`,
      mesmas classes do número atual.
- [ ] 2.3 `src/features/match/live/LiveStatusBadge.tsx` (client): cápsula de
      status viva (fallback no `initial`); reusa os estilos/rotulos de
      `LABEL_STATUS` do card (extrair o necessário para um módulo compartilhado
      se preciso, sem duplicar a tabela de rótulos).

## 3. Integração no painel

- [ ] 3.1 `MatchCard`: trocar os dois números crus por `<LiveScore>` e a cápsula
      crua por `<LiveStatusBadge>`; o `sr-only` do placar passa a refletir os
      valores vivos (sem divergir do visível). Card permanece RSC.
- [ ] 3.2 `dashboard/page.tsx`: envolver a `<ul>` no `LiveMatchesProvider`
      passando `initial` (id/placar_1/placar_2/status de cada partida).

## 4. Testes e validação

- [ ] 4.1 `LiveMatchesProvider.test`: semeia mapa; aplica UPDATE de id presente
      (atualiza) e de id ausente (ignora); cleanup chama `removeChannel`
      (mock do browser client/canal).
- [ ] 4.2 `LiveScore`/`LiveStatusBadge`: render com valor inicial; re-render ao
      mudar o context (placar e status, inclusive →encerrada).
- [ ] 4.3 `MatchCard`: guard de regressão — o card NÃO ganha `"use client"`
      (PII no servidor); o número e a cápsula vêm das folhas live.
- [ ] 4.4 Gates: typecheck/lint/test/build.
- [ ] 4.5 Validação ao vivo (2 sessões/navegadores): A altera placar pelo modal,
      B vê o número e o status mudarem sozinhos no painel. Screenshots.
- [ ] 4.6 Workflow adversarial (lentes + juiz) → aplicar fixes.
- [ ] 4.7 Commit(s) + push + CI verde + archive + AVISAR a seção 16 de DDL manual.
